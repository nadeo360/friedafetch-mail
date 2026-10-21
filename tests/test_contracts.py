"""The shapes of the panel's websocket answers, with realistic data (tests/contract.py explains why).

After an intended change: UPDATE_CONTRACTS=1 pytest tests/test_contracts.py, then bring the dev preview's mock
(tools/preview/mock-postfach.js in nadeo360/friedafetch) in line – its browser tests check it against this file.
"""

from __future__ import annotations

from datetime import date, timedelta
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
from homeassistant.core import HomeAssistant

from custom_components.friedafetch_mail import ai as _ai  # noqa: F401 - loaded, so the AI call can be patched

from .conftest import setup_core, setup_postfach
from .contract import assert_contract

AI_ENTITY = "ai_task.test_ai"
MAIL = "custom_components.friedafetch.mail.ICloudMail"
GENERATE = "custom_components.friedafetch_mail.ai._generate"
CALDAV = "custom_components.friedafetch.caldav_client.ICloudCalDav"
BOXES = [
    {"name": "INBOX", "special_use": None},
    {"name": "Archive", "special_use": "archive"},
    {"name": "Deleted Messages", "special_use": "trash"},
]


def _summary(uid: int, subject: str, sender: str = "anna@example.com") -> dict[str, Any]:
    return {
        "uid": uid,
        "subject": subject,
        "from": [{"name": "Anna", "email": sender}],
        "to": [{"name": "", "email": "me@icloud.com"}],
        "date": "2026-10-20T09:00:00+02:00",
        "newsletter": False,
        "message_id": f"<{uid}@example.com>",
    }


@pytest.mark.real_mail_state
async def test_panel_answers_keep_their_shape(hass: HomeAssistant, hass_ws_client) -> None:
    core = await setup_core(hass)
    hass.config.components.add("ai_task")
    hass.states.async_set(AI_ENTITY, "unknown")
    entry = await setup_postfach(
        hass, core, rules_auto=False, ai_enabled=True, ai_entity=AI_ENTITY, ai_mode="act", ai_block_terms="Diagnose"
    )
    link = entry.runtime_data
    sorter = link.ai
    ws = await hass_ws_client(hass)
    msg_id = 0

    async def call(command: str, *, account: bool = True, **extra: Any) -> Any:
        nonlocal msg_id
        msg_id += 1
        await ws.send_json(
            {"id": msg_id, "type": command, **({"entry_id": entry.entry_id} if account else {}), **extra}
        )
        msg = await ws.receive_json()
        assert msg["success"], (command, msg)
        return msg["result"]

    # a rule, two rated mails and one held back by the kill switch, a correction: a pass of everything
    with patch(f"{MAIL}.async_mailboxes", AsyncMock(return_value=BOXES)):
        await call(
            "friedafetch_mail/rules/create",
            rule={
                "name": "CI",
                "conditions": [{"field": "subject", "op": "contains", "value": "CI"}],
                "actions": {"delete": True},
            },
        )
    mails = [
        _summary(3, "Rechnung Oktober"),
        _summary(4, "Treffen morgen?"),
        _summary(5, "Befund: Diagnose", "praxis@example.com"),
    ]
    tomorrow = (date.today() + timedelta(days=1)).isoformat()
    answer = SimpleNamespace(
        data={
            "category": sorter.categories[1]["name"],
            "importance": 3,
            "confidence": "low",
            "reason": "invoice",
            "event_kind": "appointment",
            "event_title": "Treffen",
            "event_start": f"{tomorrow}T15:00",
            "event_end": f"{tomorrow}T16:00",
        }
    )
    with (
        patch(f"{MAIL}.async_search_uids", AsyncMock(side_effect=[[1, 2], [1, 2, 3, 4, 5]])),
        patch(f"{MAIL}.async_summaries", AsyncMock(return_value=mails)),
        patch(
            f"{MAIL}.async_get_message",
            AsyncMock(side_effect=lambda box, uid, **kw: {"body": "Ihre Diagnose" if uid == 5 else "Hallo"}),
        ),
        patch(f"{MAIL}.async_move", AsyncMock()),
        patch(f"{MAIL}.async_set_flags", AsyncMock()),
        patch(GENERATE, AsyncMock(return_value=answer)),
    ):
        await sorter.async_process()
        report = await sorter.async_process("push")
    await link.rules.async_record_ai("push", report)
    await sorter.async_correct(sorter.ratings[-1]["id"], sorter.categories[0]["name"])
    # read / flagged as the mailbox has it: 3 read, 4 flagged, 5 moved away meanwhile
    with (
        patch(f"{MAIL}.async_flags", AsyncMock(return_value={3: ["\\Seen"], 4: ["\\Flagged"]})),
        patch(f"{MAIL}.async_mailboxes", AsyncMock(return_value=BOXES)),
        patch(f"{MAIL}.async_search_uids", AsyncMock(return_value=[])),  # 5 is nowhere any more
    ):
        await link.state.async_sync()
    link.state = None  # no further looks in the background (they would go to a real server)

    shapes: dict[str, Any] = {}
    with patch(f"{MAIL}.async_mailboxes", AsyncMock(return_value=BOXES)):
        shapes["friedafetch_mail/mailboxes"] = await call("friedafetch_mail/mailboxes")
    shapes["friedafetch_mail/accounts"] = await call("friedafetch_mail/accounts", account=False)
    shapes["friedafetch_mail/rules/list"] = await call("friedafetch_mail/rules/list")
    shapes["friedafetch_mail/rules/history"] = await call("friedafetch_mail/rules/history")
    shapes["friedafetch_mail/ai"] = await call("friedafetch_mail/ai")
    shapes["friedafetch_mail/activity/list"] = await call("friedafetch_mail/activity/list")
    shapes["friedafetch_mail/activity/select"] = await call("friedafetch_mail/activity/select")
    with (
        patch(f"{MAIL}.async_special_mailbox", AsyncMock(return_value="Deleted Messages")),
        patch(f"{MAIL}.async_set_flags", AsyncMock()),
    ):
        shapes["friedafetch_mail/mail/act"] = await call(
            "friedafetch_mail/mail/act", keys=["<3@example.com>"], action="flag"
        )
    with patch(
        f"{MAIL}.async_get_message",
        AsyncMock(return_value={"body": "Hallo", "body_truncated": False, "attachments": [{"filename": "a.pdf"}]}),
    ):
        shapes["friedafetch_mail/mail/text"] = await call("friedafetch_mail/mail/text", message_id="<3@example.com>")
    shapes["friedafetch_mail/mail/timeline"] = await call(
        "friedafetch_mail/mail/timeline", message_id="<4@example.com>"
    )
    with (
        patch(f"{MAIL}.async_mailboxes", AsyncMock(return_value=BOXES)),
        patch(f"{MAIL}.async_search_uids", AsyncMock(side_effect=lambda box, crit: [7] if box == "Archive" else [])),
    ):
        shapes["friedafetch_mail/mail/locate"] = await call(
            "friedafetch_mail/mail/locate", message_id="<4@example.com>"
        )
    proposal = SimpleNamespace(
        data={
            "reply": "Vorschlag",
            "name": "Steuer",
            "description": "Finanzamt",
            "move_to": "Archive",
            "mark_seen": False,
            "flag": True,
            "overlap": "",
        }
    )
    with (
        patch(f"{MAIL}.async_mailboxes", AsyncMock(return_value=BOXES)),
        patch(GENERATE, AsyncMock(return_value=proposal)),
    ):
        shapes["friedafetch_mail/ai/assist"] = await call(
            "friedafetch_mail/ai/assist", conversation=[{"role": "user", "text": "Alles vom Finanzamt"}]
        )
    with (
        patch(
            f"{MAIL}.async_summaries", AsyncMock(side_effect=lambda box, uids: [_summary(uids[0], "Steuerbescheid")])
        ),
        patch(f"{MAIL}.async_get_message", AsyncMock(return_value={"body": "Hallo"})),
        patch(
            GENERATE,
            AsyncMock(return_value=SimpleNamespace(data={"category": "Steuer", "importance": 3, "reason": "x"})),
        ),
    ):
        shapes["friedafetch_mail/ai/assist/test"] = await call(
            "friedafetch_mail/ai/assist/test", proposal={"name": "Steuer", "description": "Finanzamt"}
        )
    with (
        patch(f"{MAIL}.async_summaries", AsyncMock(side_effect=lambda box, uids: [_summary(uids[0], "Treffen")])),
        patch(f"{MAIL}.async_get_message", AsyncMock(return_value={"body": "Hallo"})),
        patch(GENERATE, AsyncMock(return_value=answer)),
    ):
        shapes["friedafetch_mail/ai/check"] = await call("friedafetch_mail/ai/check")
    with (
        patch(f"{MAIL}.async_mailboxes", AsyncMock(return_value=BOXES)),
        patch(f"{MAIL}.async_search_uids", AsyncMock(return_value=[8])),
        patch(f"{MAIL}.async_summaries", AsyncMock(return_value=[_summary(8, "CI failed")])),
    ):
        shapes["friedafetch_mail/rules/run"] = await call("friedafetch_mail/rules/run", scope="all", dry_run=True)

    # For you: a sent mail without an answer, a newsletter, the calendars, a proposal put into the calendar
    sent = _summary(9, "Angebot für Samstag?", "me@icloud.com") | {
        "to": [{"name": "Bob", "email": "bob@example.com"}],
        "cc": [],
        "date": (date.today() - timedelta(days=5)).isoformat() + "T10:00:00+02:00",
    }
    news = _summary(10, "Unsere Angebote", "news@shop.example") | {"newsletter": True, "seen": False}

    async def search(box: str, criteria: list[str]) -> list[int]:
        if criteria[0] != "SINCE":
            return []  # no answer anywhere
        return [9] if box == "Sent Messages" else [10] if box == "INBOX" else []

    with (
        patch(
            f"{MAIL}.async_special_mailbox",
            AsyncMock(side_effect=lambda kind: {"sent": "Sent Messages", "archive": "Archive"}.get(kind)),
        ),
        patch(f"{MAIL}.async_search_uids", AsyncMock(side_effect=search)),
        patch(
            f"{MAIL}.async_summaries",
            AsyncMock(side_effect=lambda box, uids: [sent] if box == "Sent Messages" else [news]),
        ),
    ):
        await link.insights.async_followups(force=True)
        await link.insights.async_subscriptions(force=True)
    shapes["friedafetch_mail/insights"] = await call("friedafetch_mail/insights")
    calendar = SimpleNamespace(id="home", name="Zuhause", color="#34c759", supports_events=True)
    with patch(f"{CALDAV}.async_calendars", AsyncMock(return_value=[calendar])):
        shapes["friedafetch_mail/insights/calendars"] = await call("friedafetch_mail/insights/calendars")
        with patch(f"{CALDAV}.async_create_event", AsyncMock(return_value={"uid": "EV1"})):
            shapes["friedafetch_mail/insights/event"] = await call(
                "friedafetch_mail/insights/event", proposal_id=link.insights.open_proposals()[0]["id"]
            )

    for command, result in shapes.items():
        assert_contract(command, result)
