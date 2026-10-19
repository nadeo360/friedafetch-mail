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

from custom_components.friedafetch.const import CONF_ENABLE_MAIL, CONF_READ_ONLY, DEFAULT_ENABLE_MAIL, DEFAULT_READ_ONLY
from custom_components.friedafetch.mail import MailError
from custom_components.friedafetch.schema import vol

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
from .live import SIGNAL_PANEL
from .rules import RuleError, RuleNotFound
from .timeline import build_timeline

_LOGGER = logging.getLogger(__name__)

PANEL_URL_PATH = "frieda-postfach"
STATIC_URL = f"/{DOMAIN}_static"
WEBCOMPONENT = "friedafetch-mail-panel"
DATA_FRONTEND: HassKey[bool] = HassKey(f"{DOMAIN}_frontend")
DATA_VERSION: HassKey[str] = HassKey(f"{DOMAIN}_frontend_version")


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
    ):
        websocket_api.async_register_command(hass, command)
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
        except (RuleError, AiSortError, MailError, ValueError) as err:
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
    """Delete a rule."""
    rules = _entry(hass, msg.get("entry_id")).runtime_data.rules
    await rules.async_delete(msg["rule_id"])
    connection.send_result(msg["id"], {"deleted": True})


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
    }
)
@websocket_api.require_admin
@websocket_api.async_response
@_ws_errors
async def ws_ai_correct(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Correct a rating; the correction becomes an example for later ratings."""
    sorter = _sorter(hass, msg.get("entry_id"))
    connection.send_result(msg["id"], {"rating": await sorter.async_correct(msg["rating_id"], msg["category"])})


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
    connection.send_result(
        msg["id"],
        build_timeline(
            link.rules.history(limit=10_000),
            ratings,
            usage,
            message_id=msg.get("message_id") or None,
            subject=msg.get("subject") or None,
            sender=msg.get("sender") or None,
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
