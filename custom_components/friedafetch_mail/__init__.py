"""Frieda Postfach: inbox rules, push delivery and the daily overview on top of a Frieda account."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Any

from homeassistant.config_entries import ConfigEntry, ConfigEntryState
from homeassistant.const import Platform
from homeassistant.core import Event, HomeAssistant, ServiceCall, ServiceResponse, SupportsResponse, callback
from homeassistant.exceptions import ConfigEntryError, ConfigEntryNotReady, HomeAssistantError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers import issue_registry as ir
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.event import async_call_later, async_track_time_change, async_track_time_interval
from homeassistant.helpers.typing import ConfigType
from homeassistant.loader import async_get_integration
from homeassistant.util import dt as dt_util
from homeassistant.util.ssl import client_context

from .const import (
    CONF_ACCOUNT,
    CONF_DIGEST_NOTIFY,
    CONF_DIGEST_TIME,
    CONF_RULES_AUTO,
    CONF_RULES_INTERVAL,
    CONF_RULES_PUSH,
    CORE_DOMAIN,
    DEFAULT_RULES_AUTO,
    DEFAULT_RULES_INTERVAL,
    DEFAULT_RULES_PUSH,
    DOMAIN,
    EXTENSION_NAME,
    MAX_RULES_INTERVAL,
    MIN_FRIEDA_VERSION,
    MIN_RULES_INTERVAL,
    SERVICE_SEND_DIGEST,
)

_LOGGER = logging.getLogger(__name__)
NOTIFY_ACTION = "FRIEDA_POSTFACH_"  # prefix of the notification buttons: FRIEDA_POSTFACH_<seen|archive>_<rating id>
STATE_INTERVAL = timedelta(minutes=10)  # read/flagged of the activity's inbox mails, besides pushes

PLATFORMS = [Platform.SENSOR]
CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)

type PostfachConfigEntry = ConfigEntry[Any]


def _core_entry(hass: HomeAssistant, entry: ConfigEntry) -> ConfigEntry | None:
    return hass.config_entries.async_get_entry(entry.data[CONF_ACCOUNT])


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Register the overview action and follow reloads of the Frieda accounts."""
    try:
        from custom_components.friedafetch import SIGNAL_ACCOUNT_READY, SIGNAL_ACCOUNT_UNLOADED  # noqa: PLC0415
        from custom_components.friedafetch.schema import vol  # noqa: PLC0415
    except ImportError:
        _LOGGER.error("Frieda Postfach needs the Frieda integration (friedafetch) version 2.0 or newer")
        return False

    from .digest import async_send_digest  # noqa: PLC0415

    @callback
    def _account_changed(core_entry_id: str) -> None:
        # Frieda (re)loaded or unloaded an account: re-attach so we never hold stale connections.
        for entry in hass.config_entries.async_entries(DOMAIN):
            if entry.data.get(CONF_ACCOUNT) != core_entry_id:
                continue
            link = getattr(entry, "runtime_data", None) if entry.state is ConfigEntryState.LOADED else None
            core = hass.config_entries.async_get_entry(core_entry_id)
            current = getattr(core, "runtime_data", None) if core else None
            if link is None or link.clients is not current:
                hass.config_entries.async_schedule_reload(entry.entry_id)

    async_dispatcher_connect(hass, SIGNAL_ACCOUNT_READY, _account_changed)
    async_dispatcher_connect(hass, SIGNAL_ACCOUNT_UNLOADED, _account_changed)

    async def _send_digest(call: ServiceCall) -> ServiceResponse:
        wanted = (call.data.get("account") or "").strip().lower()
        entries = hass.config_entries.async_loaded_entries(DOMAIN)
        results = []
        for entry in entries:
            link = entry.runtime_data
            if wanted and wanted not in (link.label.lower(), link.apple_id.lower(), entry.entry_id):
                continue
            result = await async_send_digest(
                hass,
                link.clients,
                dict(entry.options),
                link.rules,
                link.label if len(entries) > 1 else "",
                ledger=getattr(link, "ai", None),
            )
            results.append({"account": link.label, "sent_to": result["sent_to"], "message": result["message"]})
        if not results:
            raise HomeAssistantError(f"No Frieda Postfach account matches '{wanted}'")
        return {"results": results}

    hass.services.async_register(
        DOMAIN,
        SERVICE_SEND_DIGEST,
        _send_digest,
        schema=vol.Schema({vol.Optional("account"): cv.string}),
        supports_response=SupportsResponse.OPTIONAL,
    )
    return True


async def async_setup_entry(hass: HomeAssistant, entry: PostfachConfigEntry) -> bool:
    """Attach to the Frieda account and start rules, push and the daily overview."""
    from custom_components.friedafetch.accounts import account_label  # noqa: PLC0415
    from custom_components.friedafetch.const import (  # noqa: PLC0415
        CONF_ALLOW_DELETE,
        CONF_APP_PASSWORD,
        CONF_APPLE_ID,
        CONF_ENABLE_MAIL,
        CONF_READ_ONLY,
        DEFAULT_ALLOW_DELETE,
        DEFAULT_ENABLE_MAIL,
        DEFAULT_READ_ONLY,
        IMAP_HOST,
        IMAP_PORT,
        REQUEST_TIMEOUT,
    )
    from custom_components.friedafetch.util import clamp  # noqa: PLC0415

    from .activity import ActivityLog  # noqa: PLC0415
    from .ai import AiSorter  # noqa: PLC0415
    from .digest import async_send_digest  # noqa: PLC0415
    from .frontend import async_setup_frontend  # noqa: PLC0415
    from .idle import MailWatcher  # noqa: PLC0415
    from .link import AccountLink, MailExtension  # noqa: PLC0415
    from .rules import RuleEngine  # noqa: PLC0415

    await _check_frieda_version(hass)
    core = _core_entry(hass, entry)
    if core is None:
        raise ConfigEntryError("The Frieda account of this entry no longer exists; remove and re-add Frieda Postfach")
    clients = getattr(core, "runtime_data", None)
    # Frieda announces a ready account at the very end of its setup, before the state switches to LOADED
    ready = core.state is ConfigEntryState.LOADED or (
        core.state is ConfigEntryState.SETUP_IN_PROGRESS and getattr(clients, "entry_id", None) == core.entry_id
    )
    if not ready or clients is None:
        raise ConfigEntryNotReady("Waiting for the Frieda account to load")
    core_opts = core.options
    opts = entry.options

    # own IMAP connection for rules and AI sorting, so background work and AI clients never wait for each other
    factory = getattr(clients, "mail_factory", None)
    auto_mail = factory() if callable(factory) else clients.mail
    if auto_mail is not clients.mail:
        entry.async_on_unload(auto_mail.async_close)

    rules = RuleEngine(
        hass,
        core.entry_id,
        auto_mail,
        allow_delete=core_opts.get(CONF_ALLOW_DELETE, DEFAULT_ALLOW_DELETE),
        guard=clients.guard,
        audit=clients.audit,
        attachment_saver=clients.attachments.async_save if clients.attachments is not None else None,
    )
    await rules.async_load()
    activity = ActivityLog(hass, core.entry_id)
    await activity.async_load()
    rules.activity = activity
    extension = MailExtension(rules)
    link = AccountLink(
        core_entry_id=core.entry_id,
        clients=clients,
        label=account_label(core),
        apple_id=core.data[CONF_APPLE_ID],
        rules=rules,
        extension=extension,
        mail=auto_mail,
        activity=activity,
    )
    entry.runtime_data = link
    rules.account = link.label
    from .mailstate import MailState  # noqa: PLC0415

    state: MailState | None = None
    if core_opts.get(CONF_ENABLE_MAIL, DEFAULT_ENABLE_MAIL) and hasattr(auto_mail, "async_flags"):
        # (Frieda before 2.0.18 cannot read flags); folders hidden from AI clients are not searched
        state = link.state = MailState(auto_mail, activity, clients.guard)

    @callback
    def _sync_state(*_: Any) -> None:
        """Read / flagged of the activity's inbox mails, in the background (after passes, pushes, and regularly)."""
        if state is not None:
            entry.async_create_background_task(hass, state.async_sync(), "frieda_postfach_mail_state")

    if state is not None:
        state.on_request = _sync_state
        entry.async_on_unload(async_track_time_interval(hass, _sync_state, STATE_INTERVAL))
        entry.async_on_unload(async_call_later(hass, 20, _sync_state))
    clients.extensions[EXTENSION_NAME] = extension

    async def _notify_important(rating: dict[str, Any]) -> None:
        title = f"Frieda Postfach: {rating['category']} ({rating['importance']}/5)"
        message = f"{rating.get('from') or ''}: {rating.get('subject') or ''}\n{rating.get('reason') or ''}".strip()
        service = str(opts.get(CONF_DIGEST_NOTIFY) or "").removeprefix("notify.")
        if service and hass.services.has_service("notify", service):
            data: dict[str, Any] = {"title": title, "message": message}
            if service.startswith("mobile_app_") and rating.get("id") and rating.get("message_id"):
                # buttons in the Companion app: the same actions as in the panel (mobile_app_notification_action)
                de = (hass.config.language or "en").startswith("de")
                data["data"] = {
                    "tag": f"frieda_postfach_{rating['id']}",
                    "actions": [
                        {"action": f"{NOTIFY_ACTION}seen_{rating['id']}", "title": "Gelesen" if de else "Read"},
                        {
                            "action": f"{NOTIFY_ACTION}archive_{rating['id']}",
                            "title": "Archivieren" if de else "Archive",
                        },
                    ],
                }
            await hass.services.async_call("notify", service, data, blocking=True)
        else:
            await hass.services.async_call(
                "persistent_notification", "create", {"title": title, "message": message}, blocking=True
            )

    # AI sorting exists only when it was switched on deliberately and an AI entity is chosen
    sorter = AiSorter(
        hass,
        core.entry_id,
        clients,
        dict(opts),
        notify=_notify_important,
        language=hass.config.language or "en",
        mail=auto_mail,
    )
    await sorter.async_load()
    sorter.account = link.label
    link.ai = sorter
    # the activity list came with 1.0.20: once, it starts with the runs, ratings and holds kept before
    activity.backfill(rules.history(limit=10_000), list(sorter.ratings), list(sorter.usage_log))
    # the steps of each message came with 1.0.24: once, the older lines get theirs from what is still kept
    activity.fill_events(rules.history(limit=10_000), list(sorter.ratings), list(sorter.usage_log))
    sorter.activity = activity

    async def _rerated(report: dict[str, Any]) -> None:
        await rules.async_record_ai("rerate", report)  # the re-rating shows up under Runs as well

    sorter.on_batch_done = _rerated
    entry.async_on_unload(sorter.cancel_rerate)

    async def _ai_after_rules(trigger: str) -> dict[str, Any] | None:
        if not sorter.settings["active"]:
            return None
        try:
            return await sorter.async_process(trigger)
        except Exception as err:  # noqa: BLE001 - never break the rule automation
            _LOGGER.warning("AI sorting failed: %s", err)
            return None

    @callback
    def _detach() -> None:
        if clients.extensions.get(EXTENSION_NAME) is extension:
            clients.extensions.pop(EXTENSION_NAME)

    entry.async_on_unload(_detach)

    async def _notification_action(event: Event) -> None:
        """A button of an important-mail notification was tapped in the Companion app."""
        name = str(event.data.get("action") or "")
        if not name.startswith(NOTIFY_ACTION):
            return
        verb, _, rating_id = name.removeprefix(NOTIFY_ACTION).partition("_")
        rating = next((r for r in sorter.ratings if r.get("id") == rating_id), None)
        line = activity.find({"message_id": rating.get("message_id")}) if rating else None
        if line is None or verb not in ("seen", "archive"):
            return
        from .actions import async_act  # noqa: PLC0415

        try:
            await async_act(
                link,
                [line["key"]],
                verb,
                read_only=bool(core_opts.get(CONF_READ_ONLY, DEFAULT_READ_ONLY)),
                allow_delete=False,
            )
        except Exception as err:  # noqa: BLE001 - a tap must not raise in the event bus
            _LOGGER.warning("Action from the notification failed: %s", err)

    entry.async_on_unload(hass.bus.async_listen("mobile_app_notification_action", _notification_action))

    mail_ok = core_opts.get(CONF_ENABLE_MAIL, DEFAULT_ENABLE_MAIL) and not core_opts.get(
        CONF_READ_ONLY, DEFAULT_READ_ONLY
    )
    if mail_ok and opts.get(CONF_RULES_AUTO, DEFAULT_RULES_AUTO):
        minutes = max(
            MIN_RULES_INTERVAL, clamp(opts.get(CONF_RULES_INTERVAL), DEFAULT_RULES_INTERVAL, MAX_RULES_INTERVAL)
        )
        interval = timedelta(minutes=minutes)
        rules.set_automation(True, minutes, dt_util.now() + interval)

        async def _apply_rules(now: datetime) -> None:
            next_run = dt_util.as_local(now) + interval
            if not rules.has_enabled_rules:
                rules.note_check("no_enabled_rules", next_run)
                await rules.async_record_ai("auto", await _ai_after_rules("auto"))
                return
            try:
                # one history entry per pass: rules first, then the AI sorting (recorded together below)
                report = await rules.async_run(scope="new", trigger="auto", record=False)
            except Exception as err:  # noqa: BLE001 - keep the timer alive
                _LOGGER.warning("Automatic inbox rules failed: %s", err)
                rules.note_check("error", next_run, str(err))
                return
            rules.note_check("error" if report["errors"] else "ran", next_run)
            await rules.async_record(report, await _ai_after_rules("auto"))
            _sync_state()
            if report["matched"]:
                _LOGGER.info("Inbox rules: %s messages checked, %s matched", report["checked"], report["matched"])

        entry.async_on_unload(async_track_time_interval(hass, _apply_rules, interval))

        if opts.get(CONF_RULES_PUSH, DEFAULT_RULES_PUSH):

            async def _on_new_mail() -> None:
                # the panel shows the pass right away; rules and the AI rating may take a few seconds
                rules.begin_pass("push", ai=bool(sorter.settings["active"]))
                try:
                    report = None
                    if any(r.mailbox == "INBOX" for r in rules.enabled_rules()):
                        report = await rules.async_run(scope="new", trigger="push", mailbox="INBOX", record=False)
                        rules.note_check("error" if report["errors"] else "ran", None)
                    ai = await _ai_after_rules("push")
                    if report is not None:
                        await rules.async_record(report, ai)
                    else:
                        await rules.async_record_ai("push", ai)
                finally:
                    rules.end_pass()
                    _sync_state()

            async def _on_change() -> None:
                # a mail read, flagged or moved on another device
                if state is not None:
                    await state.async_sync()

            watcher = MailWatcher(
                username=core.data[CONF_APPLE_ID],
                password=core.data[CONF_APP_PASSWORD],
                host=IMAP_HOST,
                port=IMAP_PORT,
                on_new_mail=_on_new_mail,
                on_change=_on_change,
                ssl_context=client_context(),
                timeout=REQUEST_TIMEOUT,
            )
            link.watcher = watcher
            rules.push = watcher
            watcher.start(lambda coro, name: entry.async_create_background_task(hass, coro, name))
            entry.async_on_unload(watcher.async_stop)
    else:
        rules.set_automation(False, None, None)

    if digest_time := _parse_clock(opts.get(CONF_DIGEST_TIME)):

        async def _digest(now: datetime) -> None:
            several = len(hass.config_entries.async_loaded_entries(DOMAIN)) > 1
            try:
                await async_send_digest(
                    hass, clients, dict(entry.options), rules, link.label if several else "", ledger=link.ai
                )
            except Exception as err:  # noqa: BLE001 - keep the schedule alive
                _LOGGER.warning("Daily overview failed: %s", err)

        entry.async_on_unload(
            async_track_time_change(hass, _digest, hour=digest_time[0], minute=digest_time[1], second=0)
        )

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    entry.async_on_unload(entry.add_update_listener(_async_update_listener))
    ir.async_delete_issue(hass, CORE_DOMAIN, f"rules_moved_{core.entry_id}")
    try:
        # the panel uses Frieda's design library: its version is part of the cache key as well
        own = (await async_get_integration(hass, DOMAIN)).version or "0"
        core_version = (await async_get_integration(hass, CORE_DOMAIN)).version or "0"
        await async_setup_frontend(hass, f"{own}-{core_version}")
    except Exception as err:  # noqa: BLE001 - the panel is optional
        _LOGGER.warning("Could not register the Frieda Postfach panel: %s", err)
    _LOGGER.info("Frieda Postfach attached to account %s", link.label)
    return True


async def _async_update_listener(hass: HomeAssistant, entry: ConfigEntry) -> None:
    hass.config_entries.async_schedule_reload(entry.entry_id)


async def async_unload_entry(hass: HomeAssistant, entry: PostfachConfigEntry) -> bool:
    from .frontend import async_remove_frontend  # noqa: PLC0415

    unloaded = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if not [e for e in hass.config_entries.async_loaded_entries(DOMAIN) if e.entry_id != entry.entry_id]:
        async_remove_frontend(hass)
    return unloaded


async def _check_frieda_version(hass: HomeAssistant) -> None:
    """A repair while Frieda is older than what this version needs (the panel then lacks some of its parts)."""
    from awesomeversion import AwesomeVersion  # noqa: PLC0415

    try:
        version = (await async_get_integration(hass, CORE_DOMAIN)).version
    except Exception:  # noqa: BLE001 - no Frieda at all is reported by the setup itself
        return
    if version and AwesomeVersion(str(version)) < AwesomeVersion(MIN_FRIEDA_VERSION):
        ir.async_create_issue(
            hass,
            DOMAIN,
            "frieda_too_old",
            is_fixable=False,
            severity=ir.IssueSeverity.WARNING,
            translation_key="frieda_too_old",
            translation_placeholders={"installed": str(version), "required": MIN_FRIEDA_VERSION},
            learn_more_url="https://github.com/nadeo360/friedafetch/releases",
        )
    else:
        ir.async_delete_issue(hass, DOMAIN, "frieda_too_old")


def _parse_clock(value: Any) -> tuple[int, int] | None:
    """'07:30' -> (7, 30); empty or invalid -> None."""
    text = str(value or "").strip()
    if not text:
        return None
    try:
        hour, minute = (int(x) for x in text.split(":")[:2])
    except ValueError:
        _LOGGER.warning("Invalid time for the daily overview: %s (expected HH:MM)", text)
        return None
    if not (0 <= hour <= 23 and 0 <= minute <= 59):
        return None
    return hour, minute
