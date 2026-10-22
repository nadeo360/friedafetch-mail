"""Health: the problem sensor and its repair; iCloud's throttling pauses the background work."""

from __future__ import annotations

from datetime import timedelta
from types import SimpleNamespace
from typing import Any
from unittest.mock import patch

from freezegun.api import FrozenDateTimeFactory
from homeassistant.core import HomeAssistant
from homeassistant.helpers import issue_registry as ir
from homeassistant.util import dt as dt_util

from custom_components.friedafetch_mail.const import DOMAIN
from custom_components.friedafetch_mail.throttle import FIRST_PAUSE, MAX_PAUSE, Throttle

from .conftest import setup_core, setup_postfach


def test_throttle_pauses_and_backs_off() -> None:
    throttle = Throttle()
    assert not throttle.note("IMAP operation failed: Mailbox not found") and not throttle.active()
    clock = [1000.0]
    with patch("custom_components.friedafetch_mail.throttle.time.monotonic", lambda: clock[0]):
        assert throttle.note("IMAP operation failed: [b'NO [THROTTLED] Too many requests']")
        assert throttle.active() and throttle.count == 1
        assert throttle.note_all(["fine", "BYE too many simultaneous connections"])
        clock[0] += FIRST_PAUSE * 2 - 1
        assert throttle.active()  # the second answer doubled the pause
        clock[0] += 2
        assert not throttle.active()
        throttle.ok()  # a pass went through: the next pause starts short again
        assert throttle.count == 0
        for _ in range(10):
            throttle.note("[LIMIT] rate limited")
        clock[0] += MAX_PAUSE - 1
        assert throttle.active()
        clock[0] += 2
        assert not throttle.active()  # never longer than an hour


async def test_problem_sensor_and_repair(hass: HomeAssistant, freezer: FrozenDateTimeFactory) -> None:
    core = await setup_core(hass)
    entry = await setup_postfach(hass, core, rules_auto=False)
    link = entry.runtime_data
    sensor = "binary_sensor.frieda_postfach_test_problem"
    assert hass.states.get(sensor).state == "off"

    link.state.error = "IMAP operation failed: no answer from the server in time"
    link.throttle.note("NO [THROTTLED]")
    link.rules.current = {"trigger": "push", "started": (dt_util.now() - timedelta(minutes=12)).isoformat(), "ai": True}
    link.watcher = _watcher("error", (dt_util.now() - timedelta(minutes=20)).isoformat(), "x")
    await _refresh(hass, sensor)
    state = hass.states.get(sensor)
    kinds = {p["kind"] for p in state.attributes["problems"]}
    assert state.state == "on" and kinds == {"look", "throttled", "pass_slow", "push"}
    assert state.attributes["throttle"]["active"] is True
    assert ir.async_get(hass).async_get_issue(DOMAIN, f"health_{link.health._entry_id}") is None  # noqa: SLF001

    freezer.tick(timedelta(minutes=61))
    link.throttle.note("NO [THROTTLED]")  # still throttled after an hour
    problems = link.health.check()
    issue = ir.async_get(hass).async_get_issue(DOMAIN, f"health_{link.health._entry_id}")  # noqa: SLF001
    assert issue is not None and "look" in issue.translation_placeholders["problems"]
    assert {p["kind"] for p in problems} >= {"look", "push"}

    link.state.error = None
    link.rules.current = None
    link.watcher = _watcher("listening")
    with patch("custom_components.friedafetch_mail.throttle.time.monotonic", lambda: 1e12):
        assert link.health.check() == []
    assert ir.async_get(hass).async_get_issue(DOMAIN, f"health_{link.health._entry_id}") is None  # noqa: SLF001


def _watcher(state: str, since: str | None = None, error: str | None = None) -> SimpleNamespace:
    """A push watcher as the problem sensor and the push sensor read it."""
    return SimpleNamespace(state=state, status=lambda: {"state": state, "since": since, "error": error})


async def _refresh(hass: HomeAssistant, entity_id: str) -> None:
    from homeassistant.helpers.dispatcher import async_dispatcher_send  # noqa: PLC0415

    from custom_components.friedafetch_mail.const import SIGNAL_UPDATED  # noqa: PLC0415

    entry = hass.config_entries.async_entries(DOMAIN)[0]
    async_dispatcher_send(hass, SIGNAL_UPDATED.format(entry.runtime_data.core_entry_id))
    await hass.async_block_till_done()


async def test_throttled_passes_wait(hass: HomeAssistant) -> None:
    """While iCloud asks to slow down, the timer does not run a pass (it notes why)."""
    core = await setup_core(hass)
    entry = await setup_postfach(hass, core, rules_interval=1)
    link = entry.runtime_data
    link.throttle.note("NO [THROTTLED]")
    runs: list[Any] = []
    with patch.object(link.rules, "async_run", side_effect=lambda **kw: runs.append(kw)):
        from pytest_homeassistant_custom_component.common import async_fire_time_changed  # noqa: PLC0415

        async_fire_time_changed(hass, dt_util.utcnow() + timedelta(minutes=2))
        await hass.async_block_till_done()
    assert runs == [] and link.rules.last_check["result"] == "throttled"
