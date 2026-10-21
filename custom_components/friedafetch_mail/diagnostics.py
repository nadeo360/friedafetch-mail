"""Diagnostics support for Frieda Postfach: what helps to find a fault, without the content of anybody's mail.

Left out: subjects, senders, names, Message-IDs, the values of rule conditions, the kill-switch lists, the notify
service (it often carries a person's name) and the Apple ID. Error lists are counted, since a message may quote a mail.
Kept: versions, options, the rules' structure, automation and push, run summaries, the AI status and counts.
"""

from __future__ import annotations

from typing import Any

from homeassistant.components.diagnostics import async_redact_data
from homeassistant.const import __version__ as HA_VERSION
from homeassistant.core import HomeAssistant
from homeassistant.loader import async_get_integration

from .const import CONF_AI_BLOCK_TERMS, CONF_AI_EXCLUDE, CONF_DIGEST_NOTIFY, CORE_DOMAIN, DOMAIN

TO_REDACT = {CONF_AI_EXCLUDE, CONF_AI_BLOCK_TERMS, CONF_DIGEST_NOTIFY}
RUN_KEYS = ("started", "finished", "trigger", "scope", "checked", "matched", "actions", "idle", "runs")


def _count(value: Any) -> int:
    return len(value) if isinstance(value, list | dict) else int(bool(value))


def _run(run: dict[str, Any] | None) -> dict[str, Any] | None:
    """A run by its numbers: no mails, no rule names, no error texts."""
    if not run:
        return None
    out = {k: run[k] if not isinstance(run[k], list | dict) else _count(run[k]) for k in RUN_KEYS if k in run}
    out |= {
        "mails": _count(run.get("mails")),
        "errors": _count(run.get("errors")),
        "skipped": _count(run.get("skipped")),
    }
    if isinstance(run.get("ai"), dict):
        out["ai"] = {k: v if not isinstance(v, list | dict) else _count(v) for k, v in run["ai"].items()}
    return out


async def _version(hass: HomeAssistant, domain: str) -> str | None:
    try:
        return str((await async_get_integration(hass, domain)).version)
    except Exception:  # noqa: BLE001 - diagnostics must not fail
        return None


async def async_get_config_entry_diagnostics(hass: HomeAssistant, entry: Any) -> dict[str, Any]:
    """Return diagnostics for a config entry."""
    link = entry.runtime_data
    rules = link.rules
    await rules.async_load()
    sorter = link.ai
    activity = link.activity
    out: dict[str, Any] = {
        "versions": {
            "frieda_postfach": await _version(hass, DOMAIN),
            "frieda": await _version(hass, CORE_DOMAIN),
            "home_assistant": HA_VERSION,
        },
        "options": async_redact_data(dict(entry.options), TO_REDACT),
        "rules": [
            {
                "id": r["id"],
                "enabled": r.get("enabled"),
                "mailbox": r.get("mailbox"),
                "match": r.get("match"),
                "conditions": [{"field": c.get("field"), "op": c.get("op")} for c in r.get("conditions") or []],
                "actions": {k: v for k, v in (r.get("actions") or {}).items() if v not in (None, False)},
                "hits": r.get("hits"),
            }
            for r in await rules.async_list()
        ],
        "automation": rules.automation_status(),
        "last_run": _run(rules.last_run),
        "runs": [_run(run) for run in rules.history(20)],
    }
    if sorter is not None:
        await sorter.async_load()
        usage = sorter.usage_summary(limit=0)
        status = sorter.status()
        batch = sorter.batch_status()
        out["ai"] = {
            "status": status | {"last_error": bool(status.get("last_error"))},
            "categories": len(sorter.categories),
            "ratings": len(sorter.ratings),
            "examples": len(sorter.examples),
            "usage": {k: usage[k] for k in ("today", "week", "month")},
            "batch": batch and batch | {"errors": _count(batch.get("errors"))},
        }
    if link.state is not None:
        # CONDSTORE: whether the server reports only changes; mode: what the last look used
        out["mail_state"] = link.state.status()
    if activity is not None:
        await activity.async_load()
        kinds: dict[str, int] = {}
        for row in activity.view([], ai_active=False):
            kinds[row["kind"]] = kinds.get(row["kind"], 0) + 1
        out["activity"] = {
            "mails": len(activity.items),
            "kinds": kinds,
            "oldest": min((i.get("time") or "" for i in activity.items), default=None),
        }
    insights = getattr(link, "insights", None)
    if insights is not None:
        # For you: only counts and switches (no addresses, subjects or dates)
        await insights.async_load()
        out["for_you"] = {
            "vip_groups": len(insights.opts.get("vip_groups") or []),
            "vip_known": len(insights._vips),  # noqa: SLF001
            "proposals_open": len(insights.open_proposals()),
            "proposals_added": sum(1 for p in insights.proposals if p.get("status") == "added"),
            "followups": len(insights.followups),
            "followups_checked": insights.followups_checked,
            "subscriptions": len(insights.subscriptions),
            "dismissed": {k: len(v) for k, v in insights.dismissed.items()},
            "weekly_day": insights.opts.get("weekly_day") or None,
            "error": bool(insights.error),
        }
    return out
