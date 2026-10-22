"""Is Frieda Postfach working? One place that looks at push, the look, the AI, the passes and iCloud's throttling.

Shown as the problem sensor of the account (with the reasons as attributes). A problem that lasts an hour becomes a
repair in Home Assistant; it goes away by itself once everything works again.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers import issue_registry as ir
from homeassistant.util import dt as dt_util

from .const import DOMAIN

PUSH_GRACE = timedelta(minutes=15)  # push may reconnect for a while (a restart of iCloud's servers, a router)
SLOW_PASS = timedelta(minutes=10)  # a pass of new mail should be done by then, even with a slow local AI
REPAIR_AFTER = timedelta(hours=1)


def _since(value: Any) -> datetime | None:
    parsed = dt_util.parse_datetime(str(value or ""))
    return dt_util.as_local(parsed) if parsed is not None else None


class Health:
    """The problems of one account, as they are now."""

    def __init__(self, hass: HomeAssistant, entry_id: str, link: Any, throttle: Any) -> None:
        self._hass = hass
        self._entry_id = entry_id
        self._link = link
        self._throttle = throttle
        self._first: dict[str, datetime] = {}  # since when each kind of problem is seen

    def problems(self) -> list[dict[str, Any]]:
        now = dt_util.now()
        link = self._link
        out: list[dict[str, Any]] = []
        watcher = getattr(link, "watcher", None)
        if watcher is not None:
            status = watcher.status()
            since = _since(status.get("since"))
            if status.get("state") != "listening" and (since is None or now - since > PUSH_GRACE):
                out.append({"kind": "push", "detail": status.get("error") or status.get("state")})
        state = getattr(link, "state", None)
        if state is not None and state.error:
            out.append({"kind": "look", "detail": state.error})
        sorter = getattr(link, "ai", None)
        if sorter is not None and sorter.settings["active"] and sorter.last_error:
            out.append({"kind": "ai", "detail": sorter.last_error})
        current = getattr(link.rules, "current", None)
        started = _since((current or {}).get("started"))
        if started is not None and now - started > SLOW_PASS:
            out.append({"kind": "pass_slow", "detail": f"running since {started.isoformat(timespec='minutes')}"})
        if self._throttle.active():
            out.append({"kind": "throttled", "detail": self._throttle.last, "until": self._throttle.until()})
        insights = getattr(link, "insights", None)
        if insights is not None and insights.error:
            out.append({"kind": "for_you", "detail": insights.error})
        seen = {p["kind"] for p in out}
        self._first = {k: v for k, v in self._first.items() if k in seen}
        for problem in out:
            first = self._first.setdefault(problem["kind"], now)
            problem["since"] = first.isoformat(timespec="seconds")
            problem["detail"] = str(problem.get("detail") or "")[:200]
        return out

    def check(self) -> list[dict[str, Any]]:
        """The problems now; one that lasts an hour is a repair (gone once all works again)."""
        problems = self.problems()
        issue = f"health_{self._entry_id}"
        lasting = [p for p in problems if dt_util.now() - (_since(p["since"]) or dt_util.now()) >= REPAIR_AFTER]
        if lasting:
            ir.async_create_issue(
                self._hass,
                DOMAIN,
                issue,
                is_fixable=False,
                severity=ir.IssueSeverity.WARNING,
                translation_key="health",
                translation_placeholders={
                    "account": self._link.label,
                    "problems": "; ".join(f"{p['kind']}: {p['detail']}" for p in lasting),
                },
            )
        else:
            ir.async_delete_issue(self._hass, DOMAIN, issue)
        return problems
