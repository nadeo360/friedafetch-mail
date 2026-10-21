"""Activity list, the real place of a message, and the category assistant with its test run."""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from homeassistant.core import HomeAssistant

from custom_components.friedafetch_mail.activity import TRASH, folder_of, kind_of, summarize
from custom_components.friedafetch_mail.ai import AiSortError
from custom_components.friedafetch_mail.locate import async_locate

from .conftest import setup_core, setup_postfach


def dt_now_iso() -> str:
    from homeassistant.util import dt as dt_util

    return dt_util.now().isoformat(timespec="seconds")


AI_ENTITY = "ai_task.test_ai"
MAIL = "custom_components.friedafetch.mail.ICloudMail"
GENERATE = "custom_components.friedafetch_mail.ai._generate"


def _mail(uid: int, **extra: Any) -> dict[str, Any]:
    return {
        "subject": f"Mail {uid}",
        "from": f"sender{uid}@example.com",
        "name": f"Sender {uid}",
        "mailbox": "INBOX",
        "uid": uid,
        "message_id": f"<{uid}@example.com>",
        "date": None,
        "rules": [],
        "move_to": None,
        "delete": False,
        "seen": None,
        "flag": None,
        **extra,
    }


async def _setup(hass: HomeAssistant, **options: Any):
    core = await setup_core(hass)
    hass.config.components.add("ai_task")
    hass.states.async_set(AI_ENTITY, "unknown")
    return await setup_postfach(hass, core, rules_auto=False, **options)


def test_kind_and_folder() -> None:
    assert kind_of(_mail(1, rules=["News"])) == "rule"
    assert kind_of(_mail(1, ai={"held": ["term"]})) == "held"
    assert kind_of(_mail(1, ai={"category": "Bills"})) == "ai"
    assert kind_of(_mail(1)) == "none"
    assert folder_of(_mail(1, delete=True)) == TRASH
    assert folder_of(_mail(1, move_to="Archive")) == "Archive"
    assert folder_of(_mail(1, ai={"applied": ["flagged", "moved:Deleted Messages"]})) == TRASH  # iCloud's trash
    assert folder_of(_mail(1, ai={"applied": ["moved:Belege"]})) == "Belege"
    assert folder_of(_mail(1, mailbox="Company")) == "Company"


async def test_passes_fill_the_activity(hass: HomeAssistant, hass_ws_client) -> None:
    """Each pass adds its mails; a later pass (the AI after the rules, a re-rating) updates the same line."""
    entry = await _setup(hass, ai_enabled=True, ai_entity=AI_ENTITY)
    link = entry.runtime_data
    log = link.activity
    from datetime import timedelta

    from homeassistant.util import dt as dt_util

    start = dt_util.start_of_local_day()  # times of today, so the 30 days of the list never cut them off
    t9, t9b, t10 = ((start + timedelta(hours=h)).isoformat(timespec="seconds") for h in (9, 9 + 5 / 3600, 10))
    today = start.date().isoformat()
    log.add_pass("push", t9, [_mail(1), _mail(2, rules=["News"], delete=True)])
    log.add_pass("push", t9b, [_mail(1, ai={"category": "Bills", "importance": 3, "applied": []})])
    log.add_pass("auto", t10, [_mail(3, message_id=None, ai={"held": ["term"]})])
    assert len(log.items) == 3
    first = next(i for i in log.items if i["uid"] == 1)
    assert first["time"] == t9 and first["ai"]["category"] == "Bills"

    # the current rating wins: a correction since the pass
    link.ai.ratings = [
        {
            "id": "r1",
            "message_id": "<1@example.com>",
            "mailbox": "INBOX",
            "uid": 1,
            "category": "Bills",
            "corrected": "Personal",
            "importance": 4,
        }
    ]
    ws = await hass_ws_client(hass)
    await ws.send_json({"id": 1, "type": "friedafetch_mail/activity/list", "entry_id": entry.entry_id})
    res = (await ws.receive_json())["result"]
    assert res["total"] == 3 and res["counts"]["kinds"] == {"ai": 1, "rule": 1, "held": 1, "none": 0}
    assert res["counts"]["folders"] == {"INBOX": 2, TRASH: 1}
    newest, rated, deleted = res["items"]
    assert newest["kind"] == "held" and newest["selectable"] is False  # no Message-ID: cannot be found again
    assert rated["ai"]["category"] == "Personal" and rated["corrected"] and rated["rating_id"] == "r1"
    assert rated["selectable"] is True and rated["name"] == "Sender 1"
    assert deleted["kind"] == "rule" and deleted["folder"] == TRASH and deleted["selectable"] is False

    await ws.send_json(
        {
            "id": 2,
            "type": "friedafetch_mail/activity/list",
            "entry_id": entry.entry_id,
            "view": "k:ai",
            "query": "mail 1",
        }
    )
    res = (await ws.receive_json())["result"]
    assert [i["uid"] for i in res["items"]] == [1] and res["days"] == [{"day": today, "total": 1, "selectable": 1}]

    await ws.send_json({"id": 3, "type": "friedafetch_mail/activity/select", "entry_id": entry.entry_id, "day": today})
    picked = (await ws.receive_json())["result"]["messages"]
    assert picked == [{"key": "<1@example.com>", "message_id": "<1@example.com>", "mailbox": "INBOX"}]

    await ws.send_json({"id": 4, "type": "friedafetch_mail/activity/list", "view": "bogus"})
    assert (await ws.receive_json())["success"] is False

    await ws.send_json({"id": 5, "type": "friedafetch_mail/activity/clear", "entry_id": entry.entry_id})
    assert (await ws.receive_json())["success"]
    assert log.items == []


async def test_rule_runs_write_the_activity(hass: HomeAssistant) -> None:
    """The run history and the activity are written by the same pass."""
    entry = await _setup(hass)
    rules = entry.runtime_data.rules
    await rules.async_record_ai(
        "push",
        {
            "rated": 1,
            "items": [
                {
                    "mailbox": "INBOX",
                    "uid": 9,
                    "subject": "Hi",
                    "from": "a@example.com",
                    "name": "A",
                    "message_id": "<9@x>",
                    "category": "Personal",
                    "importance": 4,
                    "applied": [],
                }
            ],
        },
    )
    item = entry.runtime_data.activity.items[0]
    assert item["message_id"] == "<9@x>" and item["name"] == "A" and item["ai"]["category"] == "Personal"


def test_summarize_pages_and_days() -> None:
    rows = [
        {
            "kind": "ai",
            "folder": "INBOX",
            "day": "2026-10-19",
            "selectable": True,
            "subject": f"S{i}",
            "rules": [],
            "ai": {},
        }
        for i in range(120)
    ] + [
        {
            "kind": "rule",
            "folder": TRASH,
            "day": "2026-10-18",
            "selectable": False,
            "subject": "x",
            "rules": ["CI"],
            "ai": None,
        }
    ]
    page = summarize(rows, "all", "", 50, 50)
    assert len(page["items"]) == 50 and page["total"] == 121 and page["selectable"] == 120
    assert page["days"] == [
        {"day": "2026-10-19", "total": 120, "selectable": 120},
        {"day": "2026-10-18", "total": 1, "selectable": 0},
    ]
    assert summarize(rows, f"f:{TRASH}", "", 0, 50)["total"] == 1
    assert summarize(rows, "all", "ci", 0, 50)["total"] == 1  # rule names are searched too


async def test_locate_searches_the_hint_first_and_the_trash_last() -> None:
    mail = MagicMock()
    mail.async_mailboxes = AsyncMock(
        return_value=[
            {"name": "INBOX", "special_use": None},
            {"name": "Archive", "special_use": "archive"},
            {"name": "Deleted Messages", "special_use": "trash"},
            {"name": "Private", "special_use": None},
        ]
    )
    searched: list[str] = []

    async def search(box: str, criteria: list[str]) -> list[int]:
        searched.append(box)
        return [5] if box == "Deleted Messages" else []

    mail.async_search_uids = AsyncMock(side_effect=search)
    guard = MagicMock()
    guard.check_mailbox_visible = MagicMock(
        side_effect=lambda n: (_ for _ in ()).throw(ValueError("hidden")) if n == "Private" else None
    )
    res = await async_locate(mail, guard, '<a"b@x>', ["Archive"])
    assert res["found"] and res["mailbox"] == "Deleted Messages" and res["trash"] and res["uid"] == 5
    assert searched == ["Archive", "INBOX", "Deleted Messages"]  # Private is hidden, the trash comes last
    assert mail.async_search_uids.await_args_list[0].args[1] == ["HEADER", "Message-ID", '"<a\\"b@x>"']

    mail.async_search_uids = AsyncMock(return_value=[])
    res = await async_locate(mail, None, "<gone@x>", [TRASH])
    assert res == {"found": False, "mailbox": None, "uid": None, "trash": False, "checked": res["checked"]}


async def test_locate_websocket(hass: HomeAssistant, hass_ws_client) -> None:
    entry = await _setup(hass)
    ws = await hass_ws_client(hass)
    with (
        patch(f"{MAIL}.async_mailboxes", AsyncMock(return_value=[{"name": "INBOX", "special_use": None}])),
        patch(f"{MAIL}.async_search_uids", AsyncMock(return_value=[3])),
    ):
        await ws.send_json(
            {"id": 1, "type": "friedafetch_mail/mail/locate", "entry_id": entry.entry_id, "message_id": "<3@x>"}
        )
        res = await ws.receive_json()
    assert res["success"] and res["result"]["mailbox"] == "INBOX"


async def test_assistant_turns_words_into_a_checked_proposal(hass: HomeAssistant, hass_ws_client) -> None:
    """Only the conversation, categories and folders go to the AI; the answer is checked and nothing is saved."""
    entry = await _setup(hass, ai_enabled=True, ai_entity=AI_ENTITY)
    sorter = entry.runtime_data.ai
    await sorter.async_load()
    before = [dict(c) for c in sorter.categories]
    existing = sorter.categories[1]["name"]
    answer = SimpleNamespace(
        data={
            "reply": "Mein Vorschlag: „Steuer“.",
            "name": "Steuer & Finanzamt – eine viel zu lange Bezeichnung für das Feld",
            "description": "Mails vom Steuerberater und Finanzamt. " * 20,
            "move_to": "Archive",
            "mark_seen": False,
            "flag": True,
            "overlap": existing,
        }
    )
    ws = await hass_ws_client(hass)
    boxes = [{"name": "INBOX"}, {"name": "Archive"}, {"name": "Junk"}]
    with (
        patch(f"{MAIL}.async_mailboxes", AsyncMock(return_value=boxes)),
        patch(GENERATE, AsyncMock(return_value=answer)) as generate,
    ):
        await ws.send_json(
            {
                "id": 1,
                "type": "friedafetch_mail/ai/assist",
                "entry_id": entry.entry_id,
                "conversation": [{"role": "user", "text": "Alles vom Steuerberater, ins Archiv und markieren"}],
            }
        )
        msg = await ws.receive_json()
    assert msg["success"], msg
    res = msg["result"]
    prop = res["proposal"]
    assert len(prop["name"]) <= 40 and len(prop["description"]) <= 300
    assert prop["move_to"] == "Archive" and prop["flag"] is True and prop["mark_seen"] is False
    assert res["overlap"] == existing and res["reply"]
    kwargs = generate.await_args.kwargs
    assert "Steuerberater" in kwargs["instructions"] and "Archive, Junk" in kwargs["instructions"]
    assert "INBOX" not in kwargs["instructions"].split("Folders the mails may be moved to:")[1].split("\n")[0]
    assert sorter.categories == before  # nothing saved
    log = sorter.usage_log[-1]
    assert log["kind"] == "assist" and log["sent"] and log["fields"] == ["conversation", "categories", "folders"]
    assert sorter.usage_summary()["today"]["assist"] == 1 and sorter.status()["used_this_hour"] == 1

    # unknown folders and categories from the AI are dropped
    odd = SimpleNamespace(
        data={
            "reply": "x",
            "name": "Y",
            "description": "z",
            "move_to": "Nope",
            "overlap": "Nope",
            "mark_seen": True,
            "flag": False,
        }
    )
    with patch(f"{MAIL}.async_mailboxes", AsyncMock(return_value=boxes)), patch(GENERATE, AsyncMock(return_value=odd)):
        res = await sorter.async_assist([{"role": "user", "text": "Y"}], None, ["Archive"])
    assert res["proposal"]["move_to"] is None and res["overlap"] is None
    with pytest.raises(AiSortError):
        await sorter.async_assist([{"role": "assistant", "text": "Hallo"}], None, [])


async def test_assistant_needs_ai_sorting(hass: HomeAssistant) -> None:
    entry = await _setup(hass, ai_entity=AI_ENTITY)  # not switched on
    with patch(GENERATE, AsyncMock()) as generate, pytest.raises(AiSortError):
        await entry.runtime_data.ai.async_assist([{"role": "user", "text": "x"}], None, [])
    generate.assert_not_awaited()


async def test_try_category_rates_recent_mails_without_saving(hass: HomeAssistant, hass_ws_client) -> None:
    entry = await _setup(hass, ai_enabled=True, ai_entity=AI_ENTITY, ai_mode="act")
    sorter = entry.runtime_data.ai
    await sorter.async_load()
    sorter.ratings = [
        {
            "id": f"r{u}",
            "message_id": f"<{u}@x>",
            "mailbox": "INBOX",
            "uid": u,
            "category": "Rechnungen & Belege",
            "from": "Amt",
            "applied": [],
        }
        for u in (1, 2, 3)
    ]
    ratings_before = [dict(r) for r in sorter.ratings]

    def summary(box: str, uids: list[int]) -> list[dict[str, Any]]:
        u = uids[0]
        return [
            {
                "uid": u,
                "subject": f"Steuerbescheid {u}",
                "from": [{"name": "Amt", "email": "amt@example.com"}],
                "message_id": f"<{u}@x>",
            }
        ]

    answers = [
        SimpleNamespace(data={"category": c, "importance": 3, "reason": "r"})
        for c in ("Steuer", "Rechnungen & Belege", "Steuer")
    ]
    ws = await hass_ws_client(hass)
    with (
        patch(f"{MAIL}.async_summaries", AsyncMock(side_effect=summary)),
        patch(f"{MAIL}.async_move", AsyncMock()) as move,
        patch(GENERATE, AsyncMock(side_effect=answers)) as generate,
    ):
        await ws.send_json(
            {
                "id": 1,
                "type": "friedafetch_mail/ai/assist/test",
                "entry_id": entry.entry_id,
                "proposal": {"name": "Steuer", "description": "Finanzamt"},
            }
        )
        msg = await ws.receive_json()
    assert msg["success"], msg
    res = msg["result"]
    assert res["tested"] == 3 and res["hits"] == 2 and res["results"][0]["before"] == "Rechnungen & Belege"
    assert "- Steuer: Finanzamt" in generate.await_args_list[0].kwargs["instructions"]
    move.assert_not_awaited()
    assert sorter.ratings == ratings_before  # nothing stored
    assert all(e["trigger"] == "test" for e in sorter.usage_log[-3:])
    with pytest.raises(AiSortError):
        await sorter.async_try_category({"name": sorter.categories[0]["name"].upper()})  # exists already


async def test_backfill_once_from_what_was_kept(hass: HomeAssistant) -> None:
    """After the update the list starts with the runs, ratings and holds kept before – once, merged by message."""
    from custom_components.friedafetch_mail.activity import ActivityLog

    def ago(hours: float) -> str:
        from datetime import timedelta

        from homeassistant.util import dt as dt_util

        return (dt_util.now() - timedelta(hours=hours)).isoformat(timespec="seconds")

    log = ActivityLog(hass, "core-x")
    await log.async_load()
    log.add_pass("push", ago(1), [_mail(9)])  # a pass right after the update
    history = [
        {"started": ago(5), "trigger": "push", "mails": [_mail(1, rules=["News"], delete=True)]},
        {"started": ago(4), "trigger": "auto", "mails": [_mail(2, message_id=None)]},
    ]
    ratings = [
        {
            "id": "r2",
            "message_id": "<2@example.com>",
            "mailbox": "INBOX",
            "uid": 2,
            "subject": "Mail 2",
            "from": "Sender 2",
            "category": "Bills",
            "importance": 3,
            "applied": [],
            "time": ago(3.99),
        },
        {
            "id": "r3",
            "message_id": "<3@example.com>",
            "mailbox": "INBOX",
            "uid": 3,
            "subject": "Mail 3",
            "from": "Shop",
            "category": "Ads",
            "importance": 1,
            "applied": ["moved:Deleted Messages"],
            "time": ago(3),
        },
    ]
    usage = [
        {
            "kind": "sort",
            "sent": False,
            "message_id": "<4@example.com>",
            "subject": "Befund",
            "sender": "praxis@example.com",
            "held_back": [{"type": "term", "value": "x"}],
            "time": ago(2),
            "trigger": "push",
        },
        {"kind": "sort", "sent": True, "message_id": "<3@example.com>", "time": ago(3)},
        {"kind": "assist", "sent": True, "time": ago(1.5)},
    ]
    assert log.backfill(history, ratings, usage) is True
    rows = {r["uid"] or r["message_id"]: r for r in log.view([], ai_active=True)}
    assert len(rows) == 5  # 1, 2 (run without Message-ID + its rating = one line), 3, the hold, 9
    assert rows[1]["kind"] == "rule" and rows[1]["folder"] == "trash"
    assert (
        rows[2]["message_id"] == "<2@example.com>"
        and rows[2]["kind"] == "ai"
        and rows[2]["time"] == history[1]["started"]
    )
    assert rows[3]["name"] == "Shop" and rows[3]["folder"] == "trash"
    assert rows["<4@example.com>"]["kind"] == "held"
    assert log.items[-1]["uid"] == 9  # passes since the update stay the newest
    assert log.backfill(history, ratings, usage) is False  # only once

    cleared = ActivityLog(hass, "core-y")
    await cleared.async_load()
    await cleared.async_clear()
    assert cleared.backfill(history, ratings, usage) is False  # cleared on purpose stays empty


async def test_setup_backfills_the_activity(hass: HomeAssistant) -> None:
    """Setting up the entry fills a new activity list from the run history."""
    core = await setup_core(hass)
    with patch(
        "custom_components.friedafetch_mail.rules.RuleEngine.history",
        return_value=[{"started": dt_now_iso(), "trigger": "push", "mails": [_mail(7)]}],
    ):
        entry = await setup_postfach(hass, core, rules_auto=False)
    assert [i["uid"] for i in entry.runtime_data.activity.items] == [7]


async def test_steps_wait_for_their_line_and_merge_quiet_passes(hass: HomeAssistant) -> None:
    entry = await _setup(hass)
    log = entry.runtime_data.activity
    log.add_event({"message_id": "<1@example.com>"}, {"time": "2026-10-20T10:00:01+02:00", "kind": "ai_sent"})
    assert log.items == []  # no line yet: the step waits
    log.add_pass("push", "2026-10-20T10:00:00+02:00", [_mail(1)])
    log.add_pass("auto", "2026-10-20T11:00:00+02:00", [_mail(1)])
    log.add_pass("auto", "2026-10-20T12:00:00+02:00", [_mail(1, rules=["Bank"], move_to="Bank")])
    log.add_pass("auto", "2026-10-20T12:00:00+02:00", [_mail(1, rules=["Bank"], move_to="Bank")])  # twice: once
    events = log.items[0]["events"]
    assert [(e["kind"], e.get("count")) for e in events] == [("ai_sent", None), ("checked", 2), ("checked", 1)]
    assert events[2]["rules"] == ["Bank"]
