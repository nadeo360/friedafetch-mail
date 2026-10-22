"""Updating from older versions: what they stored still loads, and the panel gets complete answers.

The stored data below has the shapes older releases wrote (from their code in git): runs without mails or AI part
(1.0.0), AI ratings and the AI log of the first AI sorting (1.0.4, the kill-switch reason still a plain string), runs
with mails but without UID or Message-ID (1.0.12), the activity list of 1.0.20 that started empty, lines of 1.0.23
without their steps, and the tab "For you" of 1.0.30 and 1.0.33 (parcels without the mails they came from). After the update every answer of the panel must still have the shape of
tests/contracts/ws.json.
"""

from __future__ import annotations

import json
from typing import Any

from homeassistant.core import HomeAssistant

from custom_components.friedafetch_mail import activity as _activity  # noqa: F401 - loaded before the fixtures patch it

from .conftest import setup_core, setup_postfach
from .contract import CONTRACTS, check

AI_ENTITY = "ai_task.test_ai"


def _stored(key: str, data: dict[str, Any]) -> dict[str, Any]:
    return {"version": 1, "minor_version": 1, "key": key, "data": data}


RULES_1_0 = [
    {
        "id": "r1",
        "name": "CI",
        "conditions": [{"field": "subject", "op": "contains", "value": "CI"}],
        "actions": {"move_to": None, "mark_seen": None, "flag": None, "delete": True, "stop": True},
        "match": "all",
        "enabled": True,
        "mailbox": "INBOX",
        "hits": 4,
    }
]
RUN_1_0 = {  # 1.0.0: no mails, no AI part
    "id": 1,
    "started": "2026-10-10T08:00:00+02:00",
    "finished": "2026-10-10T08:00:01+02:00",
    "trigger": "auto",
    "scope": "new",
    "mailboxes": ["INBOX"],
    "checked": 2,
    "matched": 1,
    "actions": 1,
    "rules": {"CI": 1},
    "errors": [],
    "skipped": 0,
    "saved_files": 0,
    "idle": False,
    "runs": 1,
}
RUN_1_0_12 = {  # 1.0.12: the handled mails, but without UID or Message-ID
    **RUN_1_0,
    "id": 2,
    "started": "2026-10-12T08:00:00+02:00",
    "finished": "2026-10-12T08:00:01+02:00",
    "ai": {"rated": 0, "applied": 0, "held": 0, "errors": []},
    "mails": [
        {
            "subject": "Run failed: CI",
            "from": "ci@code.example",
            "mailbox": "INBOX",
            "rules": ["CI"],
            "move_to": None,
            "delete": True,
            "seen": None,
            "flag": None,
        }
    ],
    "mails_more": 0,
}
RATING_1_0_4 = {
    "id": "a1b2c3d4e5",
    "time": "2026-10-11T09:00:00+02:00",
    "mailbox": "INBOX",
    "uid": 7,
    "message_id": "<7@example.com>",
    "subject": "Rechnung Oktober",
    "from": "Stadtwerke",
    "from_domain": "stadtwerke.example",
    "date": "2026-10-11T08:59:00+02:00",
    "mode": "observe",
    "applied": [],
    "corrected": None,
    "category": "Bills & receipts",
    "importance": 3,
    "reason": "An invoice.",
    "suspicious": False,
}
USAGE_1_0_4 = [
    {
        "time": "2026-10-11T09:00:00+02:00",
        "kind": "sort",
        "entity": AI_ENTITY,
        "trigger": "auto",
        "sent": True,
        "held_back": None,
        "fields": ["from", "to", "subject", "date"],
        "chars": 1200,
        "ok": True,
        "error": None,
        "sender": "rechnung@stadtwerke.example",
        "subject": "Rechnung Oktober",
        "items": None,
    },
    {  # the kill-switch reason as a plain string, before the list of hits
        "time": "2026-10-11T10:00:00+02:00",
        "kind": "sort",
        "entity": AI_ENTITY,
        "trigger": "auto",
        "sent": False,
        "held_back": "term:diagnose",
        "fields": [],
        "chars": 0,
        "ok": True,
        "error": None,
        "sender": "praxis@example.com",
        "subject": "Befund",
        "items": None,
    },
]


async def _upgrade(hass: HomeAssistant, hass_storage: dict[str, Any], *, activity: dict[str, Any] | None = None):
    core = await setup_core(hass)
    hass.config.components.add("ai_task")
    hass.states.async_set(AI_ENTITY, "unknown")
    key = core.entry_id
    hass_storage[f"friedafetch.rules.{key}"] = _stored(
        f"friedafetch.rules.{key}",
        {"rules": RULES_1_0, "last_uid": {"INBOX": 10}, "history": [RUN_1_0, RUN_1_0_12], "history_seq": 2},
    )
    hass_storage[f"friedafetch_mail.ai.{key}"] = _stored(
        f"friedafetch_mail.ai.{key}",
        {
            "categories": [
                {
                    "id": "c1",
                    "name": "Bills & receipts",
                    "description": "invoices",
                    "move_to": None,
                    "mark_seen": False,
                    "flag": False,
                }
            ],
            "ratings": [RATING_1_0_4],
            "examples": [],
            "last_uid": {"INBOX": 10},
            "usage_log": USAGE_1_0_4,
            "usage_days": {"2026-10-11": {"calls": 1, "chars": 1200, "sort": 1, "held_back": 1}},
        },
    )
    if activity is not None:
        hass_storage[f"friedafetch.activity.{key}"] = _stored(f"friedafetch.activity.{key}", activity)
    return await setup_postfach(hass, core, rules_auto=False, ai_enabled=True, ai_entity=AI_ENTITY)


async def _answers(hass: HomeAssistant, hass_ws_client, entry) -> dict[str, Any]:
    ws = await hass_ws_client(hass)
    out = {}
    for i, (command, extra) in enumerate(
        [
            ("friedafetch_mail/rules/list", {}),
            ("friedafetch_mail/rules/history", {}),
            ("friedafetch_mail/ai", {}),
            ("friedafetch_mail/activity/list", {}),
            ("friedafetch_mail/mail/timeline", {"message_id": "<7@example.com>"}),
        ],
        start=1,
    ):
        await ws.send_json({"id": i, "type": command, "entry_id": entry.entry_id, **extra})
        msg = await ws.receive_json()
        assert msg["success"], (command, msg)
        out[command] = msg["result"]
    return out


def _contract_problems(answers: dict[str, Any]) -> list[str]:
    contracts = json.loads(CONTRACTS.read_text())
    return [f"{cmd}: {p}" for cmd, answer in answers.items() for p in check(contracts[cmd], answer)]


async def test_update_from_the_first_versions(hass: HomeAssistant, hass_storage, hass_ws_client) -> None:
    """Rules, runs, ratings and the AI log of 1.0.x load; the activity starts with them; the answers are complete."""
    entry = await _upgrade(hass, hass_storage)
    link = entry.runtime_data
    assert [r["name"] for r in await link.rules.async_list()] == ["CI"]
    items = link.activity.items
    # the rating (with its Message-ID) is in the list; mails of runs without UID and Message-ID cannot be keyed
    assert [i["message_id"] for i in items] == ["<7@example.com>"]
    assert [e["kind"] for e in items[0]["events"]] == ["rated"]  # its steps, from the rating kept
    answers = await _answers(hass, hass_ws_client, entry)
    assert _contract_problems(answers) == []
    assert answers["friedafetch_mail/activity/list"]["items"][0]["ai"]["category"] == "Bills & receipts"
    assert answers["friedafetch_mail/mail/timeline"]["found"] is True


async def test_update_from_1_0_20_fills_the_empty_activity(hass: HomeAssistant, hass_storage, hass_ws_client) -> None:
    """1.0.20 started the list without the earlier mails: the next start adds them, keeping what came since."""
    since = {
        "key": "<9@example.com>",
        "message_id": "<9@example.com>",
        "mailbox": "INBOX",
        "uid": 9,
        "subject": "Neu",
        "from": "anna@example.com",
        "name": "Anna",
        "date": None,
        "time": "2026-10-19T12:00:00+02:00",
        "updated": "2026-10-19T12:00:00+02:00",
        "trigger": "push",
        "rules": [],
        "move_to": None,
        "delete": False,
        "seen": None,
        "flag": None,
        "ai": None,
    }
    entry = await _upgrade(hass, hass_storage, activity={"items": [since]})
    keys = [i["key"] for i in entry.runtime_data.activity.items]
    assert keys == ["<7@example.com>", "<9@example.com>"]
    assert _contract_problems(await _answers(hass, hass_ws_client, entry)) == []


async def test_no_second_fill_after_1_0_21(hass: HomeAssistant, hass_storage) -> None:
    entry = await _upgrade(hass, hass_storage, activity={"items": [], "backfilled": True})
    assert entry.runtime_data.activity.items == []  # filled once already (or cleared on purpose)


async def test_update_from_1_0_23_gives_the_lines_their_steps(
    hass: HomeAssistant, hass_storage, hass_ws_client
) -> None:
    line = {
        "key": "<7@example.com>",
        "message_id": "<7@example.com>",
        "mailbox": "INBOX",
        "uid": 7,
        "subject": "Rechnung Oktober",
        "from": "",
        "name": "Stadtwerke",
        "date": "2026-10-11T08:59:00+02:00",
        "time": "2026-10-11T09:00:00+02:00",
        "updated": "2026-10-11T09:00:00+02:00",
        "trigger": "auto",
        "rules": [],
        "move_to": None,
        "delete": False,
        "seen": None,
        "flag": None,
        "ai": {"category": "Bills & receipts", "importance": 3, "applied": [], "held": None},
    }
    entry = await _upgrade(hass, hass_storage, activity={"items": [line], "backfilled": True})
    assert [e["kind"] for e in entry.runtime_data.activity.items[0]["events"]] == ["rated"]
    answers = await _answers(hass, hass_ws_client, entry)
    assert _contract_problems(answers) == []
    assert [e["kind"] for e in answers["friedafetch_mail/mail/timeline"]["events"]] == ["received", "rated"]


async def test_update_from_1_0_30_and_1_0_33(hass: HomeAssistant, hass_storage, hass_ws_client) -> None:
    """For you of 1.0.30 (no parcels) and 1.0.33 (parcels without their mails), a line without its conversation."""
    from unittest.mock import AsyncMock, patch  # noqa: PLC0415

    line = {
        "key": "<7@example.com>",
        "message_id": "<7@example.com>",
        "mailbox": "INBOX",
        "uid": 7,
        "subject": "Rechnung Oktober",
        "from": "rechnung@stadtwerke.example",
        "name": "Stadtwerke",
        "date": "2026-10-11T08:59:00+02:00",
        "time": "2026-10-11T09:00:00+02:00",
        "updated": "2026-10-11T09:00:00+02:00",
        "trigger": "auto",
        "rules": [],
        "move_to": None,
        "delete": False,
        "seen": None,
        "flag": None,
        "ai": {"category": "Bills & receipts", "importance": 3, "applied": [], "held": None},
        "state": {
            "seen": True,
            "flagged": False,
            "gone": False,
            "mailbox": "INBOX",
            "uid": 7,
            "searched": None,
            "checked": "2026-10-20T10:00:00+02:00",
        },
        "events": [],
    }
    for stored in (
        # 1.0.30
        {"dismissed": {"rule": ["abc"]}, "proposals": [], "followups": [], "replied": [], "weekly_sent": None},
        # 1.0.33: parcels without their mails, read with the first patterns
        {
            "packages": [
                {
                    "id": "k1",
                    "keys": ["dhl:00340434161094000001"],
                    "carrier": "dhl",
                    "number": "00340434161094000001",
                    "shop": None,
                    "order": None,
                    "status": "in_transit",
                    "eta": None,
                    "window": None,
                    "subject": "Ihre Sendung",
                    "updated": "2026-10-20T10:00:00+02:00",
                    "mails": ["<p1@x>"],
                }
            ],
            "parsed": ["<p1@x>"],
        },
    ):
        hass.data.pop("friedafetch_mail_frontend", None)
        core_key = None
        entry = await _upgrade(
            hass, hass_storage, activity={"items": [line], "backfilled": True, "events_filled": True}
        )
        core_key = entry.runtime_data.core_entry_id
        hass_storage[f"friedafetch_mail.insights.{core_key}"] = _stored(f"friedafetch_mail.insights.{core_key}", stored)
        assert await hass.config_entries.async_reload(entry.entry_id)
        await hass.async_block_till_done()
        insights = entry.runtime_data.insights
        assert insights.packages == []  # read again with the current patterns
        with patch("custom_components.friedafetch.mail.ICloudMail.async_special_mailbox", AsyncMock(return_value=None)):
            answers = await _answers(hass, hass_ws_client, entry)
            ws = await hass_ws_client(hass)
            for n, (command, extra) in enumerate(
                [
                    ("friedafetch_mail/insights", {}),
                    ("friedafetch_mail/mail/thread", {"message_id": "<7@example.com>"}),
                ],
                start=50,
            ):
                await ws.send_json({"id": n, "type": command, "entry_id": entry.entry_id, **extra})
                msg = await ws.receive_json()
                assert msg["success"], (command, msg)
                answers[command] = msg["result"]
        assert _contract_problems(answers) == []
        assert answers["friedafetch_mail/activity/list"]["items"][0]["thread_count"] == 1
        await hass.config_entries.async_unload(entry.entry_id)
        await hass.config_entries.async_remove(entry.entry_id)
        await hass.config_entries.async_remove(core_key)
        await hass.async_block_till_done()
