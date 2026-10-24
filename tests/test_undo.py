"""Undo instead of asking first: mail actions name their reverse, rules come back, "For you" takes a step back."""

from __future__ import annotations

from datetime import timedelta
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util

from custom_components.friedafetch_mail.actions import ActionError
from custom_components.friedafetch_mail.rules import RuleEngine, RuleError

from .test_activity import MAIL, _mail, _setup, dt_now_iso
from .test_insights import _activity, _insights, _line
from .test_rules import _mail as _rule_mail


async def test_mail_actions_name_their_undo(hass: HomeAssistant, hass_ws_client) -> None:
    entry = await _setup(hass)
    link = entry.runtime_data
    link.activity.add_pass("push", dt_now_iso(), [_mail(1), _mail(2)])
    link.activity.set_state("INBOX", {1: [], 2: ["\\Seen"]}, set(), dt_now_iso())  # 2 is read already
    ws = await hass_ws_client(hass)
    msg_id = 0

    async def act(keys: list[int], action: str, **extra: Any) -> dict[str, Any]:
        nonlocal msg_id
        msg_id += 1
        await ws.send_json(
            {
                "id": msg_id,
                "type": "friedafetch_mail/mail/act",
                "entry_id": entry.entry_id,
                "keys": [f"<{k}@example.com>" for k in keys],
                "action": action,
                **extra,
            }
        )
        msg = await ws.receive_json()
        assert msg["success"], msg
        return msg["result"]

    boxes = {"trash": "Deleted Messages", "archive": "Archive"}
    found = {"mailbox": "Archive", "uid": 77, "searched": ["Archive"]}
    with (
        patch(f"{MAIL}.async_special_mailbox", AsyncMock(side_effect=boxes.get)),
        patch(f"{MAIL}.async_set_flags", AsyncMock()) as flags,
        patch(f"{MAIL}.async_move", AsyncMock()) as move,
        patch("custom_components.friedafetch_mail.actions.async_locate", AsyncMock(return_value=found)) as locate,
    ):
        res = await act([1, 2], "seen")
        assert res["done"] == 2
        flags.assert_awaited_once_with("INBOX", [1, 2], seen=True)  # both are marked, as before
        assert res["undo"] == {"action": "unseen", "keys": ["<1@example.com>"]}  # only the one that changed

        res = await act([1], "archive")
        assert res["undo"] == {"action": "return", "keys": ["<1@example.com>"], "to": {"<1@example.com>": "INBOX"}}

        res = await act([1], "return", to=res["undo"]["to"])
        assert res["done"] == 1
        assert locate.await_args.args[3] == ["Archive", "INBOX"]  # looked for where Frieda put it first
        move.assert_awaited_with("Archive", [77], "INBOX")
        steps = [e for e in link.activity.items[0]["events"] if e["kind"] == "acted"]
        assert [e["action"] for e in steps] == ["seen", "archive", "return"]

    await ws.send_json({"id": 99, "type": "friedafetch_mail/mail/act", "keys": ["<1@example.com>"], "action": "return"})
    assert (await ws.receive_json())["error"]["message"] == "No folders to return the mails to"


async def test_a_deleted_rule_comes_back_as_it_was(hass: HomeAssistant) -> None:
    engine = RuleEngine(hass, "entry1", _rule_mail([], []))
    made = [
        await engine.async_create(
            {
                "name": name,
                "conditions": [{"field": "subject", "op": "contains", "value": name}],
                "actions": {"flag": True},
            }
        )
        for name in ("A", "B", "C")
    ]
    await engine.async_delete(made[1]["id"])
    with pytest.raises(RuleError):
        await engine.async_restore(made[0]["id"])  # not the one deleted last
    back = await engine.async_restore(made[1]["id"])
    assert back == made[1]
    assert [r["id"] for r in await engine.async_list()] == [r["id"] for r in made]  # at its place
    with pytest.raises(RuleError):
        await engine.async_restore(made[1]["id"])  # once


async def test_for_you_takes_one_step_back(hass: HomeAssistant) -> None:
    log = await _activity(hass, [_line(1, "a@example.com")])
    insights = _insights(hass, log)
    await insights.async_load()
    insights.packages = [
        {"id": "p1", "keys": ["dhl:1"], "mails": [], "status": "in_transit", "sources": [], "updated": dt_now_iso()},
        {"id": "p2", "keys": ["dhl:2"], "mails": [], "status": "in_transit", "sources": [], "updated": dt_now_iso()},
    ]
    start = (dt_util.now() + timedelta(days=2)).date().isoformat()
    insights.proposals = [
        {
            "id": "e1",
            "status": "open",
            "message_id": "<1@example.com>",
            "title": "Grillen",
            "start": start,
            "end": None,
            "all_day": True,
        }
    ]
    await insights.async_dismiss("package", "p1")
    token = (await insights.async_get())["undo"]
    assert [p["id"] for p in insights.packages] == ["p2"]
    with pytest.raises(ActionError):
        await insights.async_undo("other")
    await insights.async_undo(token)
    assert [p["id"] for p in insights.packages] == ["p1", "p2"]
    assert (await insights.async_get())["undo"] is None

    # a proposal comes back open, and its timeline says so
    await insights.async_dismiss("proposal", "e1")
    await insights.async_undo(insights._undo["token"])  # noqa: SLF001
    assert insights.proposals[0]["status"] == "open"
    kinds = [e["kind"] for e in log.items[0]["events"]]
    assert kinds[-2:] == ["event_dismissed", "event_restored"]

    # something else changed the lists meanwhile: no undo over it
    await insights.async_dismiss("package", "p2")
    token = insights._undo["token"]  # noqa: SLF001
    insights.packages.append(
        {"id": "p3", "keys": [], "mails": [], "status": "in_transit", "sources": [], "updated": dt_now_iso()}
    )
    with pytest.raises(ActionError, match="changed since"):
        await insights.async_undo(token)


async def test_the_trend_keeps_completed_weeks(hass: HomeAssistant) -> None:
    now = dt_util.now()
    monday = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    days_back = (now - monday).total_seconds() / 86400
    lines = [
        _line(1, "a@example.com", days=days_back + 3, rules=["CI"]),
        _line(2, "b@example.com", days=days_back + 10),
    ]
    # the first mail Frieda saw: a Tuesday, so that week is not complete
    lines += [_line(3, "c@example.com", days=0.1), _line(4, "d@example.com", days=days_back + 19)]
    log = await _activity(hass, lines)
    insights = _insights(hass, log)
    await insights.async_load()
    trend = insights.week()["trend"]
    assert trend[-1]["week"] == "now"
    weeks = {p["week"]: p for p in trend[:-1]}
    last = "{}-W{:02d}".format(*(monday - timedelta(weeks=1)).isocalendar()[:2])
    assert weeks[last]["mails"] == 1 and weeks[last]["rules"] == 1
    oldest = "{}-W{:02d}".format(*(monday - timedelta(weeks=3)).isocalendar()[:2])
    assert oldest not in weeks  # the week of the first mail Frieda saw is not complete: left out
    # kept when the activity has forgotten them
    log.items.clear()
    assert insights.trend(now)[:-1] == trend[:-1]
