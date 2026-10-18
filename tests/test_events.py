"""Events for automations and the status sensors of Frieda Postfach."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er
from pytest_homeassistant_custom_component.common import async_capture_events

from custom_components.friedafetch_mail.const import EVENT_IMPORTANT, EVENT_RATED, EVENT_RULE_MATCHED
from custom_components.friedafetch_mail.rules import RuleEngine

from .conftest import setup_core, setup_postfach
from .test_ai import AI_ENTITY, GENERATE, MAIL, _ai_available, _summary
from .test_rules import BOSS, NEWSLETTER, SPAM, _mail


def _state(hass: HomeAssistant, entry_id: str, key: str):
    entity_id = er.async_get(hass).async_get_entity_id("sensor", "friedafetch_mail", f"{entry_id}_{key}")
    return hass.states.get(entity_id) if entity_id else None


async def _engine(hass: HomeAssistant) -> tuple[RuleEngine, object]:
    mail = _mail([11, 12, 13], [NEWSLETTER, BOSS, SPAM])
    engine = RuleEngine(hass, "entry-ev", mail)
    engine.account = "privat"
    await engine.async_create(
        {
            "name": "Newsletter",
            "conditions": [{"field": "from", "op": "domain", "value": "shop.example.com"}],
            "actions": {"move_to": "Archive", "mark_seen": True},
        }
    )
    await engine.async_create(
        {
            "name": "Chef",
            "conditions": [{"field": "from", "op": "contains", "value": "chef@firma"}],
            "actions": {"flag": True},
        }
    )
    return engine, mail


async def test_rule_events_only_for_executed_runs(hass: HomeAssistant) -> None:
    engine, _mail_fake = await _engine(hass)
    events = async_capture_events(hass, EVENT_RULE_MATCHED)
    await engine.async_run(scope="all", dry_run=True)
    await hass.async_block_till_done()
    assert events == []  # previews tell nobody

    await engine.async_run(scope="all", trigger="push")
    await hass.async_block_till_done()
    by_rule = {e.data["rule"]: e.data for e in events}
    assert set(by_rule) == {"Newsletter", "Chef"}
    news = by_rule["Newsletter"]
    assert news["account"] == "privat" and news["trigger"] == "push" and news["mailbox"] == "INBOX"
    assert news["uid"] == 11 and news["move_to"] == "Archive" and news["mark_seen"] is True
    assert by_rule["Chef"]["from"] == "chef@firma.example" and by_rule["Chef"]["subject"] == "Wichtig: Budget"
    assert engine.history_today() == {"runs": 1, "matched": 2}


async def test_rule_events_are_capped(hass: HomeAssistant) -> None:
    engine, _mail_fake = await _engine(hass)
    events = async_capture_events(hass, EVENT_RULE_MATCHED)
    with patch("custom_components.friedafetch_mail.rules.MAX_EVENTS_PER_RUN", 1):
        await engine.async_run(scope="all")
    await hass.async_block_till_done()
    assert len(events) == 1


async def test_ai_events_and_sensors(hass: HomeAssistant) -> None:
    core = await setup_core(hass)
    _ai_available(hass)
    with patch(f"{MAIL}.async_search_uids", AsyncMock(return_value=[5, 6, 7])):
        entry = await setup_postfach(hass, core, rules_auto=False, ai_enabled=True, ai_entity=AI_ENTITY)
    assert _state(hass, entry.entry_id, "unread_inbox").state == "3"
    assert _state(hass, entry.entry_id, "important_today").state == "0"
    assert _state(hass, entry.entry_id, "ai_ratings_hour").state == "0"

    sorter = entry.runtime_data.ai
    rated = async_capture_events(hass, EVENT_RATED)
    important = async_capture_events(hass, EVENT_IMPORTANT)
    answers = [
        SimpleNamespace(data={"category": "Personal & important", "importance": 5, "reason": "Frage"}),
        SimpleNamespace(data={"category": "Newsletter", "importance": 2, "reason": "Werbung"}),
    ]
    with (
        patch(f"{MAIL}.async_search_uids", AsyncMock(side_effect=[[1], [1, 2, 3], []])),
        patch(f"{MAIL}.async_summaries", AsyncMock(return_value=[_summary(2), _summary(3, "news@shop.example")])),
        patch(GENERATE, AsyncMock(side_effect=answers)),
    ):
        await sorter.async_process()  # baseline
        await sorter.async_process("push")
        await hass.async_block_till_done()

    assert [e.data["importance"] for e in rated] == [5, 2]
    assert len(important) == 1
    data = important[0].data
    assert data["account"] == entry.runtime_data.label and data["category"] == "Personal & important"
    assert data["uid"] == 2 and data["mode"] == "observe" and data["reason"] == "Frage"

    state = _state(hass, entry.entry_id, "important_today")
    assert state.state == "1" and state.attributes["threshold"] == 4
    assert state.attributes["mails"][0]["importance"] == 5
    assert _state(hass, entry.entry_id, "ai_ratings_hour").state == "2"


async def test_status_sensors_without_ai(hass: HomeAssistant) -> None:
    core = await setup_core(hass)
    entry = await setup_postfach(hass, core)
    assert _state(hass, entry.entry_id, "important_today") is None  # AI sorting off: no AI sensors
    assert _state(hass, entry.entry_id, "ai_ratings_hour") is None
    assert _state(hass, entry.entry_id, "rule_matches_today").state == "0"
    push = _state(hass, entry.entry_id, "push")
    assert push.state == "stopped" and "listening" in push.attributes["options"]

    entry.runtime_data.watcher.state = "listening"
    entry.runtime_data.rules._fire_events({"actions": [], "trigger": "auto"})  # noqa: SLF001 - as after a run
    await hass.async_block_till_done()
    assert _state(hass, entry.entry_id, "push").state == "listening"


async def test_no_mail_sensors_when_mail_is_off(hass: HomeAssistant) -> None:
    core = await setup_core(hass, enable_mail=False)
    entry = await setup_postfach(hass, core)
    for key in ("unread_inbox", "rule_matches_today", "push"):
        assert _state(hass, entry.entry_id, key) is None
