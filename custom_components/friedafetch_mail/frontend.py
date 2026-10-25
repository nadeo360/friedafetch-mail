"""Sidebar panel "Frieda Postfach" and its WebSocket API (rules, runs, history)."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from homeassistant.components import frontend, panel_custom, websocket_api
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.util.hass_dict import HassKey

from custom_components.friedafetch.const import (
    CONF_ALLOW_DELETE,
    CONF_ALLOW_SEND_MAIL,
    CONF_ENABLE_CALENDAR,
    CONF_ENABLE_MAIL,
    CONF_READ_ONLY,
    DEFAULT_ALLOW_DELETE,
    DEFAULT_ALLOW_SEND_MAIL,
    DEFAULT_ENABLE_CALENDAR,
    DEFAULT_ENABLE_MAIL,
    DEFAULT_READ_ONLY,
)
from custom_components.friedafetch.guard import PolicyError
from custom_components.friedafetch.mail import MailError
from custom_components.friedafetch.schema import vol

from .actions import ACTIONS, ActionError, async_act
from .activity import summarize
from .ai import AiSortError
from .const import (
    CONF_DIGEST_TIME,
    CONF_RULES_AUTO,
    CONF_RULES_INTERVAL,
    CONF_RULES_PUSH,
    DEFAULT_RULES_AUTO,
    DEFAULT_RULES_INTERVAL,
    DEFAULT_RULES_PUSH,
    DOMAIN,
)
from .insights import _site
from .live import SIGNAL_PANEL
from .locate import async_locate
from .rules import Condition, RuleError, RuleNotFound
from .timeline import build_timeline

_LOGGER = logging.getLogger(__name__)

PANEL_URL_PATH = "frieda-postfach"
TEXT_CHARS = 4000  # of a mail's text in the reading pane
PREVIEW_MAILS = 300  # newest mails of the activity a rule draft is tried on
PREVIEW_LISTED = 8
STATIC_URL = f"/{DOMAIN}_static"
WEBCOMPONENT = "friedafetch-mail-panel"
DATA_FRONTEND: HassKey[bool] = HassKey(f"{DOMAIN}_frontend")
DATA_VERSION: HassKey[str] = HassKey(f"{DOMAIN}_frontend_version")
DATA_CARD: HassKey[str] = HassKey(f"{DOMAIN}_card")  # the URL of the dashboard card's script


async def async_setup_frontend(hass: HomeAssistant, version: str) -> None:
    """Register static files, the sidebar panel and the websocket commands (once)."""
    hass.data[DATA_VERSION] = version  # open panels compare it with the code they loaded
    if hass.data.get(DATA_FRONTEND):
        return
    hass.data[DATA_FRONTEND] = True
    static_dir = Path(__file__).parent / "frontend"
    await hass.http.async_register_static_paths([StaticPathConfig(STATIC_URL, str(static_dir), cache_headers=False)])
    for command in (
        ws_accounts,
        ws_subscribe,
        ws_mail_timeline,
        ws_mailboxes,
        ws_rules_list,
        ws_rules_create,
        ws_rules_update,
        ws_rules_delete,
        ws_rules_restore,
        ws_rules_preview,
        ws_sender,
        ws_rules_run,
        ws_rules_history,
        ws_rules_history_clear,
        ws_ai_get,
        ws_ai_categories,
        ws_ai_correct,
        ws_ai_run,
        ws_ai_clear,
        ws_ai_usage_clear,
        ws_ai_rerate,
        ws_ai_rerate_cancel,
        ws_ai_assist,
        ws_ai_assist_test,
        ws_ai_check,
        ws_activity_list,
        ws_activity_select,
        ws_activity_clear,
        ws_mail_locate,
        ws_mail_act,
        ws_mail_text,
        ws_mail_thread,
        ws_ai_apply,
        ws_insights_get,
        ws_insights_refresh,
        ws_insights_dismiss,
        ws_insights_restore,
        ws_insights_undo,
        ws_insights_calendars,
        ws_insights_event,
        ws_insights_unsubscribe,
        ws_insights_parcel,
    ):
        websocket_api.async_register_command(hass, command)
    # the dashboard card (parcels today, important mail, problems) for every dashboard of the user
    hass.data[DATA_CARD] = f"{STATIC_URL}/card.js?v={version}"
    frontend.add_extra_js_url(hass, hass.data[DATA_CARD])
    await panel_custom.async_register_panel(
        hass,
        frontend_url_path=PANEL_URL_PATH,
        webcomponent_name=WEBCOMPONENT,
        sidebar_title="Frieda Postfach",
        sidebar_icon="mdi:email-fast-outline",
        module_url=f"{STATIC_URL}/panel.js?v={version}",
        embed_iframe=False,
        require_admin=True,
    )


@callback
def async_remove_frontend(hass: HomeAssistant) -> None:
    """Remove the panel when the last entry is unloaded."""
    if not hass.data.get(DATA_FRONTEND):
        return
    hass.data[DATA_FRONTEND] = False
    frontend.async_remove_panel(hass, PANEL_URL_PATH, warn_if_unknown=False)
    if card := hass.data.pop(DATA_CARD, None):
        frontend.remove_extra_js_url(hass, card)


def _entries(hass: HomeAssistant) -> list[ConfigEntry]:
    return list(hass.config_entries.async_loaded_entries(DOMAIN))


def _entry(hass: HomeAssistant, entry_id: str | None) -> ConfigEntry:
    entries = _entries(hass)
    if not entries:
        raise RuleError("Frieda Postfach is not set up for any account")
    return next((e for e in entries if e.entry_id == entry_id), entries[0]) if entry_id else entries[0]


def _ws_errors(func):
    async def wrapper(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
        try:
            await func(hass, connection, msg)
        except RuleNotFound as err:
            connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, str(err))
        except (RuleError, AiSortError, MailError, ActionError, PolicyError, ValueError) as err:
            connection.send_error(msg["id"], "rule_error", str(err))

    wrapper.__name__ = func.__name__
    wrapper.__doc__ = func.__doc__
    return wrapper


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/subscribe"})
@websocket_api.require_admin
@callback
def ws_subscribe(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Live updates: sends {entry_id, topic} whenever rules, runs or the AI sorting of an account change."""

    @callback
    def forward(core_entry_id: str, topic: str) -> None:
        # the engines speak of the Frieda account; the panel knows the Frieda Postfach entry
        for entry in _entries(hass):
            if entry.runtime_data.core_entry_id == core_entry_id:
                event = {"entry_id": entry.entry_id, "topic": topic}
                connection.send_message(websocket_api.event_message(msg["id"], event))

    connection.subscriptions[msg["id"]] = async_dispatcher_connect(hass, SIGNAL_PANEL, forward)
    connection.send_result(msg["id"])


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/accounts"})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_accounts(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Accounts with Frieda Postfach and their rule statistics."""
    accounts = []
    for entry in _entries(hass):
        link = entry.runtime_data
        rule_list = await link.rules.async_list()
        core_opts = link.clients.options
        opts = entry.options
        accounts.append(
            {
                "entry_id": entry.entry_id,
                "core_entry_id": link.core_entry_id,  # Frieda's account (links from its change log)
                "label": link.label,
                "apple_id": link.apple_id,
                "title": link.apple_id,
                "mail_enabled": bool(core_opts.get(CONF_ENABLE_MAIL, DEFAULT_ENABLE_MAIL)),
                "read_only": bool(core_opts.get(CONF_READ_ONLY, DEFAULT_READ_ONLY)),
                "allow_delete": bool(core_opts.get(CONF_ALLOW_DELETE, DEFAULT_ALLOW_DELETE)),  # the trash action
                "rules_auto": bool(opts.get(CONF_RULES_AUTO, DEFAULT_RULES_AUTO)),
                "rules_interval": int(opts.get(CONF_RULES_INTERVAL, DEFAULT_RULES_INTERVAL)),
                "rules_push": bool(opts.get(CONF_RULES_PUSH, DEFAULT_RULES_PUSH)),
                "digest_time": opts.get(CONF_DIGEST_TIME) or None,
                "rules_total": len(rule_list),
                "rules_enabled": sum(1 for r in rule_list if r.get("enabled")),
                "hits": sum(int(r.get("hits") or 0) for r in rule_list),
                "last_run": link.rules.last_run,
                "automation": link.rules.automation_status(),
                "attachments": link.clients.attachments is not None,
            }
        )
    connection.send_result(msg["id"], {"accounts": accounts, "version": hass.data.get(DATA_VERSION)})


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/mailboxes", vol.Optional("entry_id"): str})
@websocket_api.require_admin
@websocket_api.async_response
@_ws_errors
async def ws_mailboxes(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Mailbox names of an account."""
    link = _entry(hass, msg.get("entry_id")).runtime_data
    # the background connection of the automation is usually open already; the list is shared anyway
    boxes = await (link.mail or link.clients.mail).async_mailboxes()
    connection.send_result(msg["id"], {"mailboxes": [b["name"] for b in boxes]})


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/rules/list", vol.Optional("entry_id"): str})
@websocket_api.require_admin
@websocket_api.async_response
@_ws_errors
async def ws_rules_list(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """List rules."""
    entry = _entry(hass, msg.get("entry_id"))
    rules = entry.runtime_data.rules
    connection.send_result(
        msg["id"],
        {
            "entry_id": entry.entry_id,
            "rules": await rules.async_list(),
            "last_run": rules.last_run,
            "daily_since": rules.daily_since,
            "automation": rules.automation_status(),
        },
    )


@websocket_api.websocket_command(
    {vol.Required("type"): f"{DOMAIN}/rules/create", vol.Optional("entry_id"): str, vol.Required("rule"): dict}
)
@websocket_api.require_admin
@websocket_api.async_response
@_ws_errors
async def ws_rules_create(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Create a rule."""
    rules = _entry(hass, msg.get("entry_id")).runtime_data.rules
    connection.send_result(msg["id"], {"rule": await rules.async_create(msg["rule"])})


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/rules/update",
        vol.Optional("entry_id"): str,
        vol.Required("rule_id"): str,
        vol.Required("changes"): dict,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
@_ws_errors
async def ws_rules_update(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Update a rule."""
    rules = _entry(hass, msg.get("entry_id")).runtime_data.rules
    connection.send_result(msg["id"], {"rule": await rules.async_update(msg["rule_id"], msg["changes"])})


@websocket_api.websocket_command(
    {vol.Required("type"): f"{DOMAIN}/rules/delete", vol.Optional("entry_id"): str, vol.Required("rule_id"): str}
)
@websocket_api.require_admin
@websocket_api.async_response
@_ws_errors
async def ws_rules_delete(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Delete a rule (the last one deleted can be restored)."""
    rules = _entry(hass, msg.get("entry_id")).runtime_data.rules
    await rules.async_delete(msg["rule_id"])
    connection.send_result(msg["id"], {"deleted": True})


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/sender",
        vol.Optional("entry_id"): str,
        vol.Required("email"): vol.All(str, vol.Length(min=3, max=200)),
    }
)
@websocket_api.require_admin
@websocket_api.async_response
@_ws_errors
async def ws_sender(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Everything about one sender in one place: its mails of the activity, read or not, what rules and the AI did,
    its newsletter and its parcels."""
    link = _entry(hass, msg.get("entry_id")).runtime_data
    email = msg["email"].strip().lower()
    rows = [r for r in await _activity_rows(link) if str(r.get("from") or "").lower() == email]
    insights = getattr(link, "insights", None)
    site = _site(email)
    categories: dict[str, int] = {}
    rule_hits: dict[str, int] = {}
    for row in rows:
        ai = row.get("ai") or {}
        if row.get("kind") == "ai" and ai.get("category"):
            categories[ai["category"]] = categories.get(ai["category"], 0) + 1
        for name in row.get("rules") or []:
            rule_hits[name] = rule_hits.get(name, 0) + 1
    known = [r for r in rows if (r.get("state") or {}).get("seen") is not None]
    subscription = None
    parcels: list[dict[str, Any]] = []
    if insights is not None:
        sub = next((x for x in insights.subscriptions if x.get("site") == site), None)
        if sub is not None:
            subscription = {k: sub.get(k) for k in ("id", "sender", "name", "count", "unread", "unsubscribed", "after")}
        parcels = [
            {k: p[k] for k in ("id", "shop", "status", "eta")} | {"items": [i["name"] for i in p["items"][:3]]}
            for p in insights.parcels()
            if any(_site(f"x@{d}") == site for d in p.get("senders") or [])
        ]
    connection.send_result(
        msg["id"],
        {
            "email": email,
            "site": site,
            "name": next((r.get("name") for r in rows if r.get("name")), None),
            "count": len(rows),
            "unread": sum(1 for r in known if r["state"]["seen"] is False),
            "read_share": round(100 * sum(1 for r in known if r["state"]["seen"]) / len(known)) if known else None,
            "flagged": sum(1 for r in rows if (r.get("state") or {}).get("flagged")),
            "kinds": {k: sum(1 for r in rows if r.get("kind") == k) for k in ("ai", "rule", "held", "none")},
            "categories": [{"name": k, "count": v} for k, v in sorted(categories.items(), key=lambda x: -x[1])],
            "corrected": sum(1 for r in rows if r.get("corrected")),
            "rules": [{"name": k, "count": v} for k, v in sorted(rule_hits.items(), key=lambda x: -x[1])],
            "vip": bool(insights is not None and insights.vip_now(email)),
            "first": min((str(r["time"]) for r in rows if r.get("time")), default=None),
            "last": [
                {k: r.get(k) for k in ("key", "subject", "time", "kind", "folder")}
                for r in sorted(rows, key=lambda r: str(r.get("time") or ""), reverse=True)[:5]
            ],
            "subscription": subscription,
            "parcels": parcels,
        },
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/rules/preview",
        vol.Optional("entry_id"): str,
        vol.Required("conditions"): vol.All(
            [
                {
                    vol.Required("field"): str,
                    vol.Required("op"): str,
                    vol.Required("value"): vol.All(str, vol.Length(max=500)),
                }
            ],
            vol.Length(min=1, max=20),
        ),
        vol.Optional("match", default="all"): vol.In(("all", "any")),
    }
)
@websocket_api.require_admin
@websocket_api.async_response
@_ws_errors
async def ws_rules_preview(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Which of the newest mails of the activity a rule draft would catch (while it is being written).

    The activity knows sender and subject, not the recipients: conditions on To/Cc are not tried here ("unknown").
    """
    conditions = [Condition(c["field"], c["op"], c["value"]) for c in msg["conditions"]]
    for condition in conditions:
        condition.validate()  # also the regex safety check of real rules
    link = _entry(hass, msg.get("entry_id")).runtime_data
    await link.activity.async_load()
    lines = list(reversed(link.activity.items))[:PREVIEW_MAILS]
    unknown = any(c.field in ("to", "cc") for c in conditions)
    hits = []
    for line in lines:
        summary = {
            "subject": line.get("subject") or "",
            "from": [{"name": line.get("name") or "", "email": line.get("from") or ""}],
            "to": [],
            "cc": [],
        }
        results = (c.matches(summary) for c in conditions)
        if all(results) if msg["match"] == "all" else any(results):
            hits.append(line)
    connection.send_result(
        msg["id"],
        {
            "checked": len(lines),
            "total": len(hits),
            "unknown": unknown,
            "matches": [
                {k: h.get(k) for k in ("key", "subject", "from", "name", "time")} for h in hits[:PREVIEW_LISTED]
            ],
        },
    )


@websocket_api.websocket_command(
    {vol.Required("type"): f"{DOMAIN}/rules/restore", vol.Optional("entry_id"): str, vol.Required("rule_id"): str}
)
@websocket_api.require_admin
@websocket_api.async_response
@_ws_errors
async def ws_rules_restore(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Undo the last deletion: the rule comes back as it was, at its place."""
    rules = _entry(hass, msg.get("entry_id")).runtime_data.rules
    connection.send_result(msg["id"], {"rule": await rules.async_restore(msg["rule_id"])})


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/rules/run",
        vol.Optional("entry_id"): str,
        vol.Optional("scope"): vol.In(["new", "all"]),
        vol.Optional("dry_run"): bool,
        vol.Optional("mailbox"): str,
        vol.Optional("rule_ids"): [str],
    }
)
@websocket_api.require_admin
@websocket_api.async_response
@_ws_errors
async def ws_rules_run(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Run rules now (read-only accounts may only dry-run)."""
    link = _entry(hass, msg.get("entry_id")).runtime_data
    if not msg.get("dry_run") and link.clients.options.get(CONF_READ_ONLY, DEFAULT_READ_ONLY):
        raise RuleError("This account is in read-only mode; only dry runs are allowed")
    report = await link.rules.async_run(
        scope=msg.get("scope") or "all",
        dry_run=bool(msg.get("dry_run")),
        mailbox=msg.get("mailbox"),
        rule_ids=msg.get("rule_ids"),
    )
    connection.send_result(msg["id"], report)


@websocket_api.websocket_command(
    {vol.Required("type"): f"{DOMAIN}/rules/history", vol.Optional("entry_id"): str, vol.Optional("limit"): int}
)
@websocket_api.require_admin
@websocket_api.async_response
@_ws_errors
async def ws_rules_history(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Return the latest rule runs (manual, automatic, push), newest first."""
    rules = _entry(hass, msg.get("entry_id")).runtime_data.rules
    await rules.async_load()
    limit = max(1, min(int(msg.get("limit") or 50), 200))
    connection.send_result(
        msg["id"], {"runs": rules.history(limit), "total": len(rules.history(200)), "current": rules.current}
    )


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/rules/history/clear", vol.Optional("entry_id"): str})
@websocket_api.require_admin
@websocket_api.async_response
@_ws_errors
async def ws_rules_history_clear(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Clear the run history of an account."""
    rules = _entry(hass, msg.get("entry_id")).runtime_data.rules
    await rules.async_clear_history()
    connection.send_result(msg["id"], {"cleared": True})


# ------------------------------------------------------------------ AI sorting
def _sorter(hass: HomeAssistant, entry_id: str | None) -> Any:
    sorter = getattr(_entry(hass, entry_id).runtime_data, "ai", None)
    if sorter is None:
        raise AiSortError("AI sorting is not available for this account")
    return sorter


def _ai_payload(sorter: Any, limit: int = 200) -> dict[str, Any]:  # all kept ratings; the panel pages them
    return {
        "status": sorter.status(),
        "categories": sorter.categories,
        "ratings": list(reversed(sorter.ratings[-limit:])),
        "examples": len(sorter.examples),
        "corrected": sum(1 for r in sorter.ratings if r.get("corrected")),  # mails for the accuracy check
        "usage": sorter.usage_summary(limit=300),  # the whole log; the panel pages it
        "batch": sorter.batch_status(),
    }


@websocket_api.websocket_command(
    {vol.Required("type"): f"{DOMAIN}/ai", vol.Optional("entry_id"): str, vol.Optional("limit"): int}
)
@websocket_api.require_admin
@websocket_api.async_response
@_ws_errors
async def ws_ai_get(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Status, categories and latest ratings of the AI sorting."""
    sorter = _sorter(hass, msg.get("entry_id"))
    await sorter.async_load()
    connection.send_result(msg["id"], _ai_payload(sorter, max(1, min(int(msg.get("limit") or 50), 200))))


@websocket_api.websocket_command(
    {vol.Required("type"): f"{DOMAIN}/ai/categories", vol.Optional("entry_id"): str, vol.Required("categories"): list}
)
@websocket_api.require_admin
@websocket_api.async_response
@_ws_errors
async def ws_ai_categories(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Replace the categories."""
    sorter = _sorter(hass, msg.get("entry_id"))
    await sorter.async_set_categories([c for c in msg["categories"] if isinstance(c, dict)])
    connection.send_result(msg["id"], _ai_payload(sorter))


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/ai/correct",
        vol.Optional("entry_id"): str,
        vol.Required("rating_id"): str,
        vol.Required("category"): str,
        vol.Optional("apply", default=False): bool,
        vol.Optional("by"): vol.In(("confirm",)),  # the AI's category was right (the quick check): "confirmed"
    }
)
@websocket_api.require_admin
@websocket_api.async_response
@_ws_errors
async def ws_ai_correct(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Correct a rating; the correction becomes an example for later ratings."""
    sorter = _sorter(hass, msg.get("entry_id"))
    link = _entry(hass, msg.get("entry_id")).runtime_data
    if msg["apply"] and link.clients.options.get(CONF_READ_ONLY, DEFAULT_READ_ONLY):
        raise ActionError("Frieda is in read-only mode (options of Frieda)")
    rating = await sorter.async_correct(msg["rating_id"], msg["category"], apply=msg["apply"], by=msg.get("by"))
    if msg["apply"] and link.state is not None:
        link.state.request()  # follows the mail if the category moved it
    connection.send_result(msg["id"], {"rating": rating})


@websocket_api.websocket_command(
    {vol.Required("type"): f"{DOMAIN}/ai/apply", vol.Optional("entry_id"): str, vol.Required("rating_id"): str}
)
@websocket_api.require_admin
@websocket_api.async_response
@_ws_errors
async def ws_ai_apply(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Run the actions of a rating's (corrected) category where the mail is now – asked after a correction."""
    link = _entry(hass, msg.get("entry_id")).runtime_data
    if link.clients.options.get(CONF_READ_ONLY, DEFAULT_READ_ONLY):
        raise ActionError("Frieda is in read-only mode (options of Frieda)")
    rating = await _sorter(hass, msg.get("entry_id")).async_apply_category(msg["rating_id"])
    if link.state is not None:
        link.state.request()
    connection.send_result(msg["id"], {"rating": rating})


@websocket_api.websocket_command(
    {vol.Required("type"): f"{DOMAIN}/ai/run", vol.Optional("entry_id"): str, vol.Optional("count"): int}
)
@websocket_api.require_admin
@websocket_api.async_response
@_ws_errors
async def ws_ai_run(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Rate the newest unrated inbox mails now (only when AI sorting is switched on)."""
    sorter = _sorter(hass, msg.get("entry_id"))
    report = await sorter.async_rate_latest(int(msg.get("count") or 10))
    entry = _entry(hass, msg.get("entry_id"))
    await entry.runtime_data.rules.async_record_ai("manual", report)  # shows up under Runs as well
    connection.send_result(msg["id"], {"report": report, **_ai_payload(sorter)})


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/ai/rerate",
        vol.Optional("entry_id"): str,
        vol.Optional("rating_ids"): [str],
        vol.Optional("messages"): [
            {vol.Required("message_id"): str, vol.Optional("mailbox"): str, vol.Optional("uid"): vol.Any(int, None)}
        ],
        vol.Optional("apply", default=False): bool,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
@_ws_errors
async def ws_ai_rerate(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Rate chosen messages again (ratings by id, or messages by Message-ID); runs in the background."""
    sorter = _sorter(hass, msg.get("entry_id"))
    await sorter.async_load()
    wanted = set(msg.get("rating_ids") or [])
    items = [
        {k: r.get(k) for k in ("message_id", "mailbox", "uid", "applied")}
        for r in sorter.ratings
        if r.get("id") in wanted
    ]
    items += [dict(m) for m in msg.get("messages") or []]
    await sorter.async_start_rerate(items, apply=msg["apply"])
    connection.send_result(msg["id"], _ai_payload(sorter))


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/ai/rerate/cancel", vol.Optional("entry_id"): str})
@websocket_api.require_admin
@websocket_api.async_response
@_ws_errors
async def ws_ai_rerate_cancel(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Stop the re-rating after the message in progress."""
    sorter = _sorter(hass, msg.get("entry_id"))
    sorter.cancel_rerate()
    connection.send_result(msg["id"], _ai_payload(sorter))


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/ai/clear", vol.Optional("entry_id"): str})
@websocket_api.require_admin
@websocket_api.async_response
@_ws_errors
async def ws_ai_clear(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Forget the stored ratings (categories and corrections stay)."""
    sorter = _sorter(hass, msg.get("entry_id"))
    await sorter.async_clear_ratings()
    connection.send_result(msg["id"], _ai_payload(sorter))


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/mail/timeline",
        vol.Optional("entry_id"): str,
        vol.Optional("message_id"): vol.Any(str, None),
        vol.Optional("subject"): vol.Any(str, None),
        vol.Optional("sender"): vol.Any(str, None),
    }
)
@websocket_api.require_admin
@websocket_api.async_response
@_ws_errors
async def ws_mail_timeline(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """The steps of one message (rules, AI, your correction), found by Message-ID or by subject and sender."""
    link = _entry(hass, msg.get("entry_id")).runtime_data
    await link.rules.async_load()
    sorter = link.ai
    ratings: list[dict[str, Any]] = []
    usage: list[dict[str, Any]] = []
    if sorter is not None:
        await sorter.async_load()
        ratings, usage = list(sorter.ratings), list(sorter.usage_log)
    line = None
    if msg.get("message_id"):
        await link.activity.async_load()
        line = link.activity.find({"message_id": msg["message_id"]})
    connection.send_result(
        msg["id"],
        build_timeline(
            link.rules.history(limit=10_000),
            ratings,
            usage,
            message_id=msg.get("message_id") or None,
            subject=msg.get("subject") or None,
            sender=msg.get("sender") or None,
            stored=(line or {}).get("events"),
        ),
    )


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/ai/usage/clear", vol.Optional("entry_id"): str})
@websocket_api.require_admin
@websocket_api.async_response
@_ws_errors
async def ws_ai_usage_clear(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Clear the log of what was sent to an AI."""
    sorter = _sorter(hass, msg.get("entry_id"))
    await sorter.async_clear_usage()
    connection.send_result(msg["id"], _ai_payload(sorter))


# ------------------------------------------------------------------ activity (one line per checked message)
async def _activity_rows(link: Any) -> list[dict[str, Any]]:
    await link.activity.async_load()
    sorter = link.ai
    ratings: list[dict[str, Any]] = []
    if sorter is not None:
        await sorter.async_load()
        ratings = list(sorter.ratings)
    rows = link.activity.view(ratings, ai_active=bool(sorter is not None and sorter.settings["active"]))
    insights = getattr(link, "insights", None)
    for row in rows:
        row["vip"] = bool(insights is not None and insights.vip_now(row.get("from")))  # important sender
    return rows


VIEW = vol.All(str, vol.Match(r"^(all|k:(ai|rule|held|none)|f:.{1,200})$"))


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/activity/list",
        vol.Optional("entry_id"): str,
        vol.Optional("view", default="all"): VIEW,
        vol.Optional("query", default=""): vol.All(str, vol.Length(max=200)),
        vol.Optional("offset", default=0): vol.All(int, vol.Range(min=0)),
        vol.Optional("limit", default=50): vol.All(int, vol.Range(min=1, max=500)),
        vol.Optional("threads", default=False): bool,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
@_ws_errors
async def ws_activity_list(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """One page of the checked messages (newest first), the days in the view, and the counts of all views."""
    link = _entry(hass, msg.get("entry_id")).runtime_data
    rows = await _activity_rows(link)
    result = summarize(rows, msg["view"], msg["query"].strip(), msg["offset"], msg["limit"], grouped=msg["threads"])
    connection.send_result(msg["id"], result)


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/activity/select",
        vol.Optional("entry_id"): str,
        vol.Optional("view", default="all"): VIEW,
        vol.Optional("query", default=""): vol.All(str, vol.Length(max=200)),
        vol.Optional("day"): vol.All(str, vol.Match(r"^\d{4}-\d{2}-\d{2}$")),
    }
)
@websocket_api.require_admin
@websocket_api.async_response
@_ws_errors
async def ws_activity_select(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """The messages that "select all" or "select the day" picks: those of the view the AI can rate again."""
    link = _entry(hass, msg.get("entry_id")).runtime_data
    hits = summarize(await _activity_rows(link), msg["view"], msg["query"].strip(), 0, 10_000)["items"]
    picked = [
        {"key": r["key"], "message_id": r["message_id"], "mailbox": r["mailbox"]}
        for r in hits
        if r["selectable"] and (not msg.get("day") or r["day"] == msg["day"])
    ]
    connection.send_result(msg["id"], {"messages": picked})


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/activity/clear", vol.Optional("entry_id"): str})
@websocket_api.require_admin
@websocket_api.async_response
@_ws_errors
async def ws_activity_clear(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Forget the activity list (rules, runs and AI ratings stay)."""
    await _entry(hass, msg.get("entry_id")).runtime_data.activity.async_clear()
    connection.send_result(msg["id"], {"cleared": True})


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/mail/locate",
        vol.Optional("entry_id"): str,
        vol.Required("message_id"): vol.All(str, vol.Length(min=3, max=300)),
        vol.Optional("hints", default=list): [vol.All(str, vol.Length(max=200))],
    }
)
@websocket_api.require_admin
@websocket_api.async_response
@_ws_errors
async def ws_mail_locate(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Where a message is now (searched by Message-ID), for the activity's detail view."""
    link = _entry(hass, msg.get("entry_id")).runtime_data
    mail = link.mail or link.clients.mail
    found = await async_locate(mail, link.clients.guard, msg["message_id"], msg["hints"][:5])
    connection.send_result(msg["id"], found)
    if link.activity is not None and link.state is not None:
        # the read / flagged look follows the message there from now on
        line = link.activity.find({"message_id": msg["message_id"]})
        if found["found"]:
            link.state.note_validity(found["mailbox"])
        if line is not None and link.activity.set_location(
            line["key"], found["mailbox"], found["uid"], found["checked"]
        ):
            hass.async_create_background_task(link.state.async_sync(), "frieda_postfach_mail_state")


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/mail/act",
        vol.Optional("entry_id"): str,
        vol.Required("keys"): vol.All([str], vol.Length(min=1, max=100)),
        vol.Required("action"): vol.In(ACTIONS),
        # "return": the folder each mail goes back to (the undo of a move)
        vol.Optional("to"): vol.All(
            {vol.All(str, vol.Length(max=200)): vol.All(str, vol.Length(min=1, max=200))}, vol.Length(max=100)
        ),
    }
)
@websocket_api.require_admin
@websocket_api.async_response
@_ws_errors
async def ws_mail_act(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Read / unread / flag / unflag / archive / back to the inbox / trash for mails of the activity."""
    link = _entry(hass, msg.get("entry_id")).runtime_data
    options = link.clients.options
    connection.send_result(
        msg["id"],
        await async_act(
            link,
            msg["keys"],
            msg["action"],
            read_only=bool(options.get(CONF_READ_ONLY, DEFAULT_READ_ONLY)),
            allow_delete=bool(options.get(CONF_ALLOW_DELETE, DEFAULT_ALLOW_DELETE)),
            to=msg.get("to"),
        ),
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/mail/text",
        vol.Optional("entry_id"): str,
        vol.Required("message_id"): vol.All(str, vol.Length(min=3, max=300)),
    }
)
@websocket_api.require_admin
@websocket_api.async_response
@_ws_errors
async def ws_mail_text(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """The text of a mail, on request in the reading pane: plain text, cleaned, read without marking it read."""
    link = _entry(hass, msg.get("entry_id")).runtime_data
    mail = link.mail or link.clients.mail
    guard = link.clients.guard
    line = link.activity.find({"message_id": msg["message_id"]}) if link.activity is not None else None
    place = link.activity.where(line) if line is not None else None
    if place is None:
        found = await async_locate(mail, guard, msg["message_id"], [line.get("mailbox")] if line else [])
        place = (found["mailbox"], found["uid"]) if found["found"] else None
    if place is None:
        connection.send_result(msg["id"], {"found": False})
        return
    if guard is not None:
        guard.check_mailbox_visible(place[0])
    message = await mail.async_get_message(place[0], int(place[1]), max_chars=TEXT_CHARS)
    connection.send_result(
        msg["id"],
        {
            "found": True,
            "mailbox": place[0],
            "text": message.get("body") or "",
            "truncated": bool(message.get("body_truncated")),
            "attachments": [str(a.get("filename") or a.get("name") or "") for a in message.get("attachments") or []],
            "suspicious": bool(message.get("suspicious")),
        },
    )


THREAD_REPLIES = 10  # mails of a conversation whose answers are looked for in the sent mail


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/mail/thread",
        vol.Optional("entry_id"): str,
        vol.Required("message_id"): vol.All(str, vol.Length(min=3, max=300)),
    }
)
@websocket_api.require_admin
@websocket_api.async_response
@_ws_errors
async def ws_mail_thread(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """The conversation of a mail: the mails of it in the activity and the user's own answers from the sent mail."""
    link = _entry(hass, msg.get("entry_id")).runtime_data
    rows = await _activity_rows(link)
    mine = next((r for r in rows if r.get("message_id") == msg["message_id"]), None)
    members = [r for r in rows if mine is not None and r["thread"] == mine["thread"]]
    items = [
        {
            "key": r["key"],
            "message_id": r.get("message_id"),
            "from": r.get("from"),
            "name": r.get("name"),
            "subject": r.get("subject"),
            "date": r.get("date") or r.get("time"),
            "mine": False,
            "seen": (r.get("state") or {}).get("seen"),
        }
        for r in members
    ]
    sent: list[dict[str, Any]] = []
    mail = link.mail or link.clients.mail
    ids = [r["message_id"] for r in members if r.get("message_id")][:THREAD_REPLIES]
    try:
        box = await mail.async_special_mailbox("sent") if ids and hasattr(mail, "async_special_mailbox") else None
    except MailError as err:  # without the sent mail the conversation shows the mails of the activity
        _LOGGER.debug("Conversation: the folders could not be listed: %s", err)
        box = None
    if box:
        try:
            uids: set[int] = set()
            for mid in ids:
                quoted = '"' + mid.replace("\\", "\\\\").replace('"', '\\"') + '"'
                uids.update(await mail.async_search_uids(box, ["HEADER", "In-Reply-To", quoted]))
            sent = await mail.async_summaries(box, sorted(uids)[-THREAD_REPLIES:]) if uids else []
        except MailError as err:
            _LOGGER.debug("Conversation: the sent mail could not be searched: %s", err)
    for s in sent:
        to = (s.get("to") or [{}])[0]
        items.append(
            {
                "key": None,
                "message_id": s.get("message_id"),
                "from": to.get("email"),
                "name": to.get("name"),
                "subject": s.get("subject"),
                "date": s.get("date"),
                "mine": True,
                "seen": True,
            }
        )
    items.sort(key=lambda i: str(i.get("date") or ""))
    connection.send_result(msg["id"], {"items": items})


async def _target_folders(link: Any) -> list[str]:
    """Folders a category may move mails to: every folder the AI may see, except the inbox."""
    boxes = await (link.mail or link.clients.mail).async_mailboxes()
    guard = link.clients.guard
    out = []
    for box in boxes:
        name = box["name"]
        if name == "INBOX":
            continue
        if guard is not None:
            try:
                guard.check_mailbox_visible(name)
            except Exception:  # noqa: BLE001, S112 - hidden from AI clients: not offered
                continue
        out.append(name)
    return out


PROPOSAL = vol.Schema(
    {
        vol.Optional("name"): vol.Any(str, None),
        vol.Optional("description"): vol.Any(str, None),
        vol.Optional("move_to"): vol.Any(str, None),
        vol.Optional("mark_seen"): bool,
        vol.Optional("flag"): bool,
    },
    extra=vol.REMOVE_EXTRA,
)


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/ai/assist",
        vol.Optional("entry_id"): str,
        vol.Required("conversation"): vol.All(
            [
                {
                    vol.Required("role"): vol.In(["user", "assistant"]),
                    vol.Required("text"): vol.All(str, vol.Length(max=2000)),
                }
            ],
            vol.Length(min=1, max=40),
        ),
        vol.Optional("proposal"): vol.Any(PROPOSAL, None),
    }
)
@websocket_api.require_admin
@websocket_api.async_response
@_ws_errors
async def ws_ai_assist(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """One round of the category assistant (the chosen AI entity turns the user's words into a proposal)."""
    link = _entry(hass, msg.get("entry_id")).runtime_data
    sorter = _sorter(hass, msg.get("entry_id"))
    folders = await _target_folders(link)
    connection.send_result(msg["id"], await sorter.async_assist(msg["conversation"], msg.get("proposal"), folders))


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/ai/assist/test",
        vol.Optional("entry_id"): str,
        vol.Required("proposal"): PROPOSAL,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
@_ws_errors
async def ws_ai_assist_test(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Test run of a proposed category with the last rated mails (nothing is stored or changed)."""
    sorter = _sorter(hass, msg.get("entry_id"))
    connection.send_result(msg["id"], await sorter.async_try_category(msg["proposal"]))


@websocket_api.websocket_command(
    {vol.Required("type"): f"{DOMAIN}/ai/check", vol.Optional("entry_id"): str, vol.Optional("entity"): str}
)
@websocket_api.require_admin
@websocket_api.async_response
@_ws_errors
async def ws_ai_check(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Accuracy check with the mails you corrected, optionally with another AI entity (nothing is stored)."""
    sorter = _sorter(hass, msg.get("entry_id"))
    connection.send_result(msg["id"], await sorter.async_check(msg.get("entity") or None))


# ---------------------------------------------------------------- For you
def _insights(hass: HomeAssistant, entry_id: str | None) -> Any:
    link = _entry(hass, entry_id).runtime_data
    if getattr(link, "insights", None) is None:
        raise RuleError("Not ready yet")
    return link.insights


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/insights", vol.Optional("entry_id"): str})
@websocket_api.require_admin
@websocket_api.async_response
@_ws_errors
async def ws_insights_get(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """The tab "For you" as it is known now (the looks at the mailbox run every few hours, or on refresh)."""
    connection.send_result(msg["id"], await _insights(hass, msg.get("entry_id")).async_get())


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/insights/refresh", vol.Optional("entry_id"): str})
@websocket_api.require_admin
@websocket_api.async_response
@_ws_errors
async def ws_insights_refresh(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Look again now: sent mail without an answer, newsletters, the important senders of the contacts."""
    insights = _insights(hass, msg.get("entry_id"))
    await insights.async_vips(force=True)
    await insights.async_followups(force=True)
    await insights.async_subscriptions(force=True)
    connection.send_result(msg["id"], await insights.async_get())


INSIGHT_KINDS = ("rule", "followup", "subscription", "proposal", "package")


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/insights/dismiss",
        vol.Optional("entry_id"): str,
        vol.Required("kind"): vol.In(INSIGHT_KINDS),
        vol.Required("item_id"): vol.All(str, vol.Length(min=1, max=40)),
    }
)
@websocket_api.require_admin
@websocket_api.async_response
@_ws_errors
async def ws_insights_dismiss(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Not shown again: a rule suggestion, a reply that is not expected, a newsletter, a calendar proposal."""
    insights = _insights(hass, msg.get("entry_id"))
    await insights.async_dismiss(msg["kind"], msg["item_id"])
    connection.send_result(msg["id"], await insights.async_get())


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/insights/restore",
        vol.Optional("entry_id"): str,
        vol.Required("kind"): vol.In((*INSIGHT_KINDS[:3], "parcel", "silent")),
    }
)
@websocket_api.require_admin
@websocket_api.async_response
@_ws_errors
async def ws_insights_restore(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Show the dismissed ones of a kind again."""
    insights = _insights(hass, msg.get("entry_id"))
    await insights.async_restore(msg["kind"])
    connection.send_result(msg["id"], await insights.async_get())


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/insights/undo",
        vol.Optional("entry_id"): str,
        vol.Required("token"): vol.All(str, vol.Length(min=1, max=40)),
    }
)
@websocket_api.require_admin
@websocket_api.async_response
@_ws_errors
async def ws_insights_undo(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Undo the last dismissal or parcel correction (while nothing else changed the lists)."""
    insights = _insights(hass, msg.get("entry_id"))
    await insights.async_undo(msg["token"])
    connection.send_result(msg["id"], await insights.async_get())


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/insights/calendars", vol.Optional("entry_id"): str})
@websocket_api.require_admin
@websocket_api.async_response
@_ws_errors
async def ws_insights_calendars(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Calendars a proposal may go to (not the ones Frieda protects)."""
    insights = _insights(hass, msg.get("entry_id"))
    try:
        calendars = await insights.async_calendars()
    except Exception as err:  # noqa: BLE001 - CalendarError lives in Frieda's caldav_client.py
        raise RuleError(f"The calendars could not be read: {err}") from err
    connection.send_result(msg["id"], {"calendars": calendars, "default": insights.opts.get("events_calendar") or None})


WHEN = vol.All(str, vol.Match(r"^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$"))


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/insights/event",
        vol.Optional("entry_id"): str,
        vol.Required("proposal_id"): vol.All(str, vol.Length(min=1, max=40)),
        vol.Optional("calendar_id"): vol.All(str, vol.Length(max=300)),
        vol.Optional("title"): vol.All(str, vol.Length(min=1, max=120)),
        vol.Optional("start"): WHEN,
        vol.Optional("end"): WHEN,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
@_ws_errors
async def ws_insights_event(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Put a calendar proposal into the calendar (title and times as the user left them in the panel)."""
    link = _entry(hass, msg.get("entry_id")).runtime_data
    options = link.clients.options
    insights = _insights(hass, msg.get("entry_id"))
    try:
        proposal = await insights.async_add_event(
            msg["proposal_id"],
            calendar_id=msg.get("calendar_id"),
            title=msg.get("title"),
            start=msg.get("start"),
            end=msg.get("end"),
            read_only=bool(options.get(CONF_READ_ONLY, DEFAULT_READ_ONLY)),
            calendar_on=bool(options.get(CONF_ENABLE_CALENDAR, DEFAULT_ENABLE_CALENDAR)),
        )
    except (ActionError, PolicyError):
        raise
    except Exception as err:  # noqa: BLE001 - CalendarError lives in Frieda's caldav_client.py
        raise RuleError(f"The calendar entry failed: {err}") from err
    connection.send_result(msg["id"], {"proposal": proposal})


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/insights/unsubscribe",
        vol.Optional("entry_id"): str,
        vol.Required("sender"): vol.All(str, vol.Length(min=3, max=300)),
        vol.Optional("done", default=False): bool,  # unsubscribed on the newsletter's page: only note it
    }
)
@websocket_api.require_admin
@websocket_api.async_response
@_ws_errors
async def ws_insights_unsubscribe(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Unsubscribe from a newsletter (one-click link, else an e-mail, else the page to open)."""
    link = _entry(hass, msg.get("entry_id")).runtime_data
    options = link.clients.options
    insights = _insights(hass, msg.get("entry_id"))
    try:
        result = await insights.async_unsubscribe(
            msg["sender"],
            read_only=bool(options.get(CONF_READ_ONLY, DEFAULT_READ_ONLY)),
            allow_send=bool(options.get(CONF_ALLOW_SEND_MAIL, DEFAULT_ALLOW_SEND_MAIL)),
            done=msg["done"],
        )
    except (ActionError, PolicyError, MailError):
        raise
    except Exception as err:  # noqa: BLE001 - UnsubscribeError lives in Frieda's unsubscribe.py
        raise RuleError(f"Unsubscribing failed: {err}") from err
    connection.send_result(msg["id"], result)


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/insights/parcel",
        vol.Optional("entry_id"): str,
        vol.Required("parcel_id"): vol.All(str, vol.Length(min=1, max=40)),
        vol.Required("action"): vol.In(("merge", "split", "ignore", "arrived", "waiting")),
        vol.Optional("into"): vol.All(str, vol.Length(min=1, max=40)),
        vol.Optional("message_id"): vol.All(str, vol.Length(min=1, max=300)),
        vol.Optional("sender", default=False): bool,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
@_ws_errors
async def ws_insights_parcel(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """A parcel corrected by hand: merged into another, a mail split off, not a parcel (also never from a sender), or
    arrived / still missing (for shops that never write on delivery)."""
    insights = _insights(hass, msg.get("entry_id"))
    if msg["action"] == "merge":
        if not msg.get("into"):
            raise ActionError("Which parcel should it join?")
        await insights.async_parcel_merge(msg["parcel_id"], msg["into"])
    elif msg["action"] == "split":
        if not msg.get("message_id"):
            raise ActionError("Which mail should be split off?")
        await insights.async_parcel_split(msg["parcel_id"], msg["message_id"])
    elif msg["action"] == "arrived":
        await insights.async_parcel_arrived(msg["parcel_id"])
    elif msg["action"] == "waiting":
        await insights.async_parcel_waiting(msg["parcel_id"])
    else:
        await insights.async_parcel_ignore(msg["parcel_id"], sender=msg["sender"])
    connection.send_result(msg["id"], await insights.async_get())
