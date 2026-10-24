"""For you: rule suggestions, waiting for a reply, calendar proposals, important senders, newsletters, the week."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from email.message import EmailMessage
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType
from homeassistant.util import dt as dt_util

from custom_components.friedafetch.vcard import VCard
from custom_components.friedafetch_mail.actions import ActionError
from custom_components.friedafetch_mail.activity import ActivityLog
from custom_components.friedafetch_mail.insights import WEEKDAYS, Insights, email_of, parse_when

from .conftest import setup_core, setup_postfach

GENERATE = "custom_components.friedafetch_mail.ai._generate"
MAIL = "custom_components.friedafetch.mail.ICloudMail"


def _now(days: float = 0) -> str:
    return (dt_util.now() - timedelta(days=days)).isoformat(timespec="seconds")


def _line(n: int, sender: str, *, days: float = 1, **extra: Any) -> dict[str, Any]:
    return {
        "subject": f"Mail {n}",
        "from": sender,
        "name": "Shop",
        "mailbox": "INBOX",
        "uid": n,
        "message_id": f"<{n}@example.com>",
        "rules": [],
        "move_to": None,
        "delete": False,
        "seen": None,
        "flag": None,
        "_days": days,
        **extra,
    }


async def _activity(hass: HomeAssistant, lines: list[dict[str, Any]]) -> ActivityLog:
    log = ActivityLog(hass, "fy")
    await log.async_load()
    for line in lines:
        log.add_pass("push", _now(line.pop("_days")), [line])
    return log


def _where(log: ActivityLog, n: int, mailbox: str | None, **state: Any) -> None:
    item = next(i for i in log.items if i["message_id"] == f"<{n}@example.com>")
    item["state"] = {
        "seen": True,
        "flagged": False,
        "gone": mailbox is None,
        "mailbox": mailbox,
        "uid": 100 + n,
        **state,
    }


def _insights(hass: HomeAssistant, log: ActivityLog, mail: Any = None, **opts: Any) -> Insights:
    clients = SimpleNamespace(guard=None, audit=None, caldav=None, carddav=None, mail=mail)
    return Insights(hass, "fy", clients, mail or MagicMock(), log, opts, notify=AsyncMock(), language="de")


# ------------------------------------------------------------------ rule suggestions
async def test_rule_suggestion_from_what_the_user_does(hass: HomeAssistant) -> None:
    log = await _activity(hass, [_line(n, "Shop <versand@shop.example>") for n in range(1, 5)])
    for n in range(1, 5):
        _where(log, n, "Belege")
    insights = _insights(hass, log)
    [suggestion] = insights.rule_suggestions()
    assert suggestion["sender"] == "versand@shop.example" and suggestion["folder"] == "Belege"
    assert (suggestion["count"], suggestion["total"]) == (4, 4)

    # a rule that already handles the sender: nothing to suggest
    rule = MagicMock()
    rule.matches = MagicMock(return_value=True)
    insights.rules = SimpleNamespace(enabled_rules=lambda: [rule])
    assert insights.rule_suggestions() == []
    insights.rules = None

    await insights.async_dismiss("rule", suggestion["id"])
    assert insights.rule_suggestions() == []


async def test_no_suggestion_for_what_frieda_did_or_a_mixed_habit(hass: HomeAssistant) -> None:
    lines = [_line(n, "news@shop.example", move_to="Werbung") for n in range(1, 5)]  # moved by a rule
    lines += [_line(n, "ai@shop.example", ai={"category": "Belege", "applied": ["moved:Belege"]}) for n in range(5, 9)]
    lines += [_line(n, "mixed@shop.example") for n in range(9, 13)]
    log = await _activity(hass, lines)
    for n in range(1, 5):
        _where(log, n, "Werbung")
    for n in range(5, 9):
        _where(log, n, "Belege")
    for n in range(9, 12):
        _where(log, n, "Archive")
    _where(log, 12, "INBOX")  # 3 of 4: below the share
    assert _insights(hass, log).rule_suggestions() == []


async def test_deleted_mails_suggest_the_trash(hass: HomeAssistant) -> None:
    log = await _activity(hass, [_line(n, "promo@ads.example") for n in range(1, 4)])
    for n in range(1, 4):
        _where(log, n, None, searched=_now(), last_mailbox="Deleted Messages")
    [suggestion] = _insights(hass, log).rule_suggestions()
    assert suggestion["folder"] == "trash"


# ------------------------------------------------------------------ waiting for a reply
def _sent(uid: int, to: str, days: float, subject: str = "Frage") -> dict[str, Any]:
    return {
        "uid": uid,
        "subject": subject,
        "to": [{"name": to.split("@")[0].title(), "email": to}],
        "cc": [],
        "date": _now(days),
        "message_id": f"<s{uid}@icloud.com>",
    }


async def test_waiting_for_a_reply(hass: HomeAssistant) -> None:
    log = await _activity(hass, [])
    mail = MagicMock(from_address="me@icloud.com")
    mail.async_special_mailbox = AsyncMock(side_effect=lambda kind: {"sent": "Sent Messages"}.get(kind))
    sent = [
        _sent(1, "bob@example.com", 5),  # no answer
        _sent(2, "noreply@shop.example", 5),  # not a person
        _sent(3, "anna@example.com", 1),  # too new
        _sent(4, "erika@example.com", 6),  # answered (threaded)
        _sent(5, "me@icloud.com", 6),  # to myself
    ]
    mail.async_summaries = AsyncMock(return_value=sent)

    async def search(box: str, criteria: list[str]) -> list[int]:
        if box == "Sent Messages":
            return [1, 2, 3, 4, 5]
        return [9] if '"<s4@icloud.com>"' in criteria else []

    mail.async_search_uids = AsyncMock(side_effect=search)
    insights = _insights(hass, log, mail)
    [waiting] = await insights.async_followups(force=True)
    assert waiting["subject"] == "Frage" and waiting["to"] == [{"name": "Bob", "email": "bob@example.com"}]
    assert waiting["days"] == 5 and "<s4@icloud.com>" in insights.replied

    await insights.async_dismiss("followup", waiting["id"])
    assert insights.followups == [] and await insights.async_followups(force=True) == []

    insights.opts["followup_days"] = 0  # switched off
    assert await insights.async_followups(force=True) == []


async def test_an_answer_without_threading_counts(hass: HomeAssistant) -> None:
    log = await _activity(hass, [])
    mail = MagicMock(from_address="me@icloud.com")
    mail.async_special_mailbox = AsyncMock(side_effect=lambda kind: {"sent": "Sent", "archive": "Archive"}.get(kind))
    mail.async_summaries = AsyncMock(return_value=[_sent(1, "bob@example.com", 5)])
    searched: list[tuple[str, str]] = []

    async def search(box: str, criteria: list[str]) -> list[int]:
        searched.append((box, criteria[0]))
        if box == "Sent":
            return [1]
        return [3] if box == "Archive" and criteria[0] == "FROM" else []

    mail.async_search_uids = AsyncMock(side_effect=search)
    assert await _insights(hass, log, mail).async_followups(force=True) == []
    assert ("Archive", "FROM") in searched


# ------------------------------------------------------------------ calendar proposals
def test_dates_as_the_ai_names_them() -> None:
    tz = dt_util.get_default_time_zone()
    assert parse_when("2026-10-24", tz) == date(2026, 10, 24)
    moment = parse_when("2026-10-24T15:30", tz)
    assert isinstance(moment, datetime) and moment.hour == 15 and moment.tzinfo is not None
    assert parse_when("morgen", tz) is None and parse_when("", tz) is None
    assert email_of("Anna <ANNA@example.com>") == "anna@example.com" and email_of("Anna") == ""


async def test_proposal_into_the_calendar(hass: HomeAssistant) -> None:
    log = await _activity(hass, [_line(1, "erika@example.com")])
    insights = _insights(hass, log)
    tomorrow = (dt_util.now().date() + timedelta(days=1)).isoformat()
    rating = {"id": "r1", "message_id": "<1@example.com>", "subject": "Grillen?", "from": "Erika"}
    assert insights.add_proposal(rating, {"kind": "appointment", "start": "2020-01-01"}) is None  # past
    assert insights.add_proposal(rating, {"kind": "appointment", "start": "bald"}) is None
    proposal = insights.add_proposal(
        rating, {"kind": "appointment", "title": "Grillen", "start": f"{tomorrow}T18:00", "end": f"{tomorrow}T17:00"}
    )
    assert proposal is not None and proposal["end"] is None  # an end before the start is dropped
    assert insights.add_proposal(rating, {"kind": "appointment", "start": f"{tomorrow}T18:00"}) is None  # known
    assert [p["id"] for p in insights.open_proposals()] == [proposal["id"]]

    calendars = [
        SimpleNamespace(id="work", name="Arbeit", color=None, supports_events=True),
        SimpleNamespace(id="home", name="Zuhause", color=None, supports_events=True),
        SimpleNamespace(id="tasks", name="Erinnerungen", color=None, supports_events=False),
    ]
    guard = MagicMock()
    guard.check_calendar_writable = MagicMock(
        side_effect=lambda cid, name: (_ for _ in ()).throw(ValueError("protected")) if cid == "work" else None
    )
    caldav = MagicMock()
    caldav.async_calendars = AsyncMock(return_value=calendars)
    caldav.async_create_event = AsyncMock(return_value={"uid": "EV1"})
    insights._clients = SimpleNamespace(guard=guard, audit=None, caldav=caldav)  # noqa: SLF001
    assert [c["id"] for c in await insights.async_calendars()] == ["home"]

    with pytest.raises(ActionError, match="read-only"):
        await insights.async_add_event(proposal["id"], read_only=True, calendar_on=True)
    with pytest.raises(ActionError, match="switched off"):
        await insights.async_add_event(proposal["id"], read_only=False, calendar_on=False)
    with pytest.raises(ActionError, match="No calendar"):
        await insights.async_add_event(proposal["id"], calendar_id="work", read_only=False, calendar_on=True)
    added = await insights.async_add_event(proposal["id"], title="Grillen bei Erika", read_only=False, calendar_on=True)
    cal_id, title, start, end = caldav.async_create_event.await_args.args
    assert (cal_id, title, end) == ("home", "Grillen bei Erika", None) and start.hour == 18
    assert "Grillen?" in caldav.async_create_event.await_args.kwargs["description"]
    assert added["status"] == "added" and added["calendar"] == "Zuhause" and insights.open_proposals() == []
    kinds = [e["kind"] for e in log.items[0]["events"]]
    assert "event_proposed" in kinds and "event_added" in kinds
    with pytest.raises(ActionError, match="no longer open"):
        await insights.async_add_event(proposal["id"], read_only=False, calendar_on=True)


async def test_a_deadline_is_a_whole_day(hass: HomeAssistant) -> None:
    insights = _insights(hass, await _activity(hass, []))
    day = (dt_util.now().date() + timedelta(days=10)).isoformat()
    proposal = insights.add_proposal({"id": "r2", "message_id": "<2@x>"}, {"kind": "deadline", "start": day})
    assert proposal is not None and proposal["all_day"] and proposal["kind"] == "deadline"
    await insights.async_dismiss("proposal", proposal["id"])
    assert insights.open_proposals() == []


# ------------------------------------------------------------------ important senders
GROUP = """BEGIN:VCARD
VERSION:3.0
UID:g1
FN:Familie
X-ADDRESSBOOKSERVER-KIND:group
X-ADDRESSBOOKSERVER-MEMBER:urn:uuid:c1
END:VCARD"""


def _contact(uid: str, email: str) -> SimpleNamespace:
    card = VCard.parse(f"BEGIN:VCARD\nVERSION:3.0\nUID:{uid}\nFN:{uid}\nEMAIL:{email}\nEND:VCARD")
    return SimpleNamespace(uid=uid, vcard=card, to_dict=card.to_dict)


async def test_important_senders_from_a_contact_group(hass: HomeAssistant) -> None:
    group = VCard.parse(GROUP)
    records = [SimpleNamespace(uid="g1", vcard=group, to_dict=group.to_dict), _contact("c1", "Oma@Example.com")]
    records.append(_contact("c2", "fremd@example.com"))
    carddav = MagicMock()
    carddav.async_sync = AsyncMock(return_value=records)
    insights = _insights(
        hass, await _activity(hass, []), vip_groups=["Familie"], vip_senders="chef@firma.example\nbank.example"
    )
    insights._clients = SimpleNamespace(carddav=carddav, guard=None)  # noqa: SLF001
    assert await insights.async_groups() == ["Familie"]
    vips = await insights.async_vips()
    assert vips == {"oma@example.com", "chef@firma.example", "bank.example"}
    assert insights.vip_now("Oma <oma@example.com>") and insights.vip_now("info@bank.example")
    assert not insights.vip_now("fremd@example.com")
    insights.opts["vip_groups"] = ["*"]
    assert "fremd@example.com" in await insights.async_vips(force=True)


async def test_new_mail_from_an_important_sender_is_announced(hass: HomeAssistant) -> None:
    log = await _activity(hass, [])
    mail = MagicMock()
    mail.uidvalidity = MagicMock(return_value=7)
    mail.async_last_uid = AsyncMock(return_value=10)
    mail.async_new_uids = AsyncMock(return_value=[11, 12])
    mail.async_summaries = AsyncMock(
        return_value=[
            {
                "uid": 11,
                "from": [{"name": "Oma", "email": "oma@example.com"}],
                "subject": "Sonntag?",
                "message_id": "<o@x>",
            },
            {
                "uid": 12,
                "from": [{"name": "Shop", "email": "news@shop.example"}],
                "subject": "Angebot",
                "message_id": "<n@x>",
            },
        ]
    )
    insights = _insights(hass, log, mail, vip_senders="oma@example.com")
    assert await insights.async_new_mail() == []  # the first look notes where the inbox stands
    found = await insights.async_new_mail()
    assert [s["uid"] for s in found] == [11]
    insights._notify.assert_awaited_once()  # noqa: SLF001
    assert "Oma" in insights._notify.await_args.args[0]  # noqa: SLF001

    # the AI announced it already: no second notification
    insights._notify.reset_mock()  # noqa: SLF001
    mail.async_new_uids = AsyncMock(return_value=[13])
    mail.async_summaries = AsyncMock(
        return_value=[{"uid": 13, "from": [{"email": "oma@example.com"}], "subject": "Hi", "message_id": "<o2@x>"}]
    )
    insights.sorter = SimpleNamespace(ratings=[{"message_id": "<o2@x>", "applied": ["notified"]}])
    assert len(await insights.async_new_mail()) == 1
    insights._notify.assert_not_awaited()  # noqa: SLF001


# ------------------------------------------------------------------ newsletters
async def test_subscriptions_and_unsubscribing(hass: HomeAssistant) -> None:
    mail = MagicMock()
    mail.async_special_mailbox = AsyncMock(return_value=None)
    mail.async_search_uids = AsyncMock(return_value=[1, 2, 3])
    news = {"from": [{"name": "Möbelhaus", "email": "news@moebel.example"}], "newsletter": True}
    mail.async_summaries = AsyncMock(
        return_value=[
            {"uid": 1, "seen": False, "date": "2026-10-01T08:00:00+02:00", "subject": "A", **news},
            {"uid": 2, "seen": False, "date": "2026-10-08T08:00:00+02:00", "subject": "B", **news},
            {"uid": 3, "seen": True, "from": [{"email": "anna@example.com"}], "newsletter": False},
        ]
    )
    insights = _insights(hass, await _activity(hass, []), mail)
    [sub] = await insights.async_subscriptions(force=True)
    assert (sub["sender"], sub["count"], sub["unread"], sub["never_opened"]) == ("news@moebel.example", 2, 2, True)
    assert (sub["uid"], sub["subject"]) == (2, "B")  # the newest

    msg = EmailMessage()
    msg["List-Unsubscribe"] = "<https://moebel.example/u?x=1>"
    msg["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"
    mail.async_fetch_raw = AsyncMock(return_value=(None, msg))
    with pytest.raises(ActionError, match="read-only"):
        await insights.async_unsubscribe("news@moebel.example", read_only=True, allow_send=True)
    with patch(
        "custom_components.friedafetch.unsubscribe.async_one_click",
        AsyncMock(return_value={"method": "one_click", "status": 200}),
    ) as click:
        result = await insights.async_unsubscribe("news@moebel.example", read_only=False, allow_send=False)
    assert result["method"] == "one_click" and click.await_args.args[0] == "https://moebel.example/u?x=1"
    assert insights.subscriptions[0]["unsubscribed"]

    msg.replace_header("List-Unsubscribe", "<https://moebel.example/page>")
    del msg["List-Unsubscribe-Post"]
    result = await insights.async_unsubscribe("news@moebel.example", read_only=False, allow_send=False)
    assert result == {"method": "manual", "url": "https://moebel.example/page"}  # a page for the user to open


async def test_newsletters_per_site_hidden_at_once_and_unsubscribed_apart(hass: HomeAssistant) -> None:
    """shop@ and support@ of one site are one newsletter; hiding it takes it off the list at once; once unsubscribed
    it stays apart – unless it keeps sending after a few days."""
    now = dt_util.now()
    day = lambda n: (now - timedelta(days=n)).isoformat(timespec="seconds")  # noqa: E731
    mail = MagicMock()
    mail.async_special_mailbox = AsyncMock(return_value=None)
    mail.async_search_uids = AsyncMock(return_value=[1, 2, 3, 4])
    shop = {"from": [{"name": "NUDIENT", "email": "shop@nudient.com"}], "newsletter": True}
    support = {"from": [{"name": "NUDIENT", "email": "support@nudient.com"}], "newsletter": True}
    other = {"from": [{"name": "Netflix", "email": "info@account.netflix.com"}], "newsletter": True}
    mail.async_summaries = AsyncMock(
        return_value=[
            {"uid": 1, "seen": False, "date": day(9), "subject": "A", **shop},
            {"uid": 2, "seen": True, "date": day(5), "subject": "B", **support},
            {"uid": 3, "seen": True, "date": day(1), "subject": "C", **other},
            {"uid": 4, "seen": False, "date": day(0.5), "subject": "D", **other},
        ]
    )
    insights = _insights(hass, await _activity(hass, []), mail)
    await insights.async_load()
    insights.unsubscribed = {"shop@nudient.com": day(6)}  # marked by an older version: per address
    subs = {s["site"]: s for s in await insights.async_subscriptions(force=True)}
    assert set(subs) == {"nudient.com", "netflix.com"}
    nudient = subs["nudient.com"]
    assert (nudient["count"], sorted(nudient["senders"]), nudient["sender"]) == (
        2,
        ["shop@nudient.com", "support@nudient.com"],
        "support@nudient.com",  # the newest mail, to unsubscribe with
    )
    assert nudient["unsubscribed"] == day(6) and nudient["after"] == 0  # support@ wrote 1 day later: within grace

    # still sending well after unsubscribing: counted, so the panel shows it again
    insights.unsubscribed = {"netflix.com": day(10)}
    subs = {s["site"]: s for s in await insights.async_subscriptions(force=True)}
    assert subs["netflix.com"]["after"] == 2

    # hiding takes it off the list at once, and undo brings it back
    await insights.async_dismiss("subscription", subs["netflix.com"]["id"])
    assert [s["site"] for s in insights.subscriptions] == ["nudient.com"]
    await insights.async_undo(insights._undo["token"])  # noqa: SLF001
    assert {s["site"] for s in insights.subscriptions} == {"nudient.com", "netflix.com"}

    # hidden before 1.0.38 by the address' id: still hidden
    from custom_components.friedafetch_mail.insights import _id  # noqa: PLC0415

    insights.dismissed["subscription"] = [_id("sub", "support@nudient.com")]
    assert [s["site"] for s in await insights.async_subscriptions(force=True)] == ["netflix.com"]

    # unsubscribed on the newsletter's page: only noted
    insights.dismissed = {}
    await insights.async_subscriptions(force=True)
    res = await insights.async_unsubscribe("info@account.netflix.com", read_only=False, allow_send=False, done=True)
    assert res["method"] == "done"
    sub = next(s for s in insights.subscriptions if s["site"] == "netflix.com")
    assert sub["unsubscribed"] and sub["after"] == 0
    assert "netflix.com" in insights.unsubscribed and "info@account.netflix.com" in insights.unsubscribed


# ------------------------------------------------------------------ the week
async def test_the_week_and_its_review(hass: HomeAssistant) -> None:
    lines = [_line(n, "a@example.com", rules=["CI"] if n == 1 else []) for n in range(1, 4)]
    lines.append(_line(9, "old@example.com", days=10))
    log = await _activity(hass, lines)
    _where(log, 2, "INBOX", seen=False)
    now = dt_util.now()
    insights = _insights(hass, log, weekly_day=WEEKDAYS[now.weekday()], followup_days=0)
    insights.sorter = SimpleNamespace(
        ratings=[
            {"time": _now(1), "category": "A", "corrected": None},
            {"time": _now(1), "category": "A", "corrected": "B"},
        ]
    )
    week = insights.week()
    assert (week["mails"], week["mails_before"], week["by_rules"], week["unread"]) == (3, 1, 1, 1)
    assert (week["rated"], week["corrected"], week["accuracy"]) == (2, 1, 50)
    assert await insights.async_weekly(now + timedelta(days=1)) is False  # not the day
    assert await insights.async_weekly(now) is True
    assert await insights.async_weekly(now) is False  # once a week
    title, message = insights._notify.await_args.args  # noqa: SLF001
    assert "Wochenrückblick" in title and "3 Mails" in message and "50 %" in message


# ------------------------------------------------------------------ in the integration
async def test_ai_reads_a_date_and_important_senders_count(hass: HomeAssistant) -> None:
    core = await setup_core(hass)
    hass.config.components.add("ai_task")
    hass.states.async_set("ai_task.test", "unknown")
    entry = await setup_postfach(
        hass, core, rules_auto=False, ai_enabled=True, ai_entity="ai_task.test", vip_senders="oma@example.com"
    )
    link = entry.runtime_data
    sorter = link.ai
    day = (dt_util.now().date() + timedelta(days=2)).isoformat()
    answer = SimpleNamespace(
        data={
            "category": sorter.categories[0]["name"],
            "importance": 2,
            "confidence": "low",
            "reason": "x",
            "event_kind": "appointment",
            "event_title": "Kaffee",
            "event_start": f"{day}T15:00",
        }
    )
    summary = {
        "uid": 5,
        "subject": "Kaffee am Sonntag?",
        "from": [{"name": "Oma", "email": "oma@example.com"}],
        "to": [],
        "date": _now(),
        "message_id": "<oma@example.com>",
    }
    sorter._last_uid["INBOX"] = 4  # noqa: SLF001
    with (
        patch(f"{MAIL}.async_new_uids", AsyncMock(return_value=[5])),
        patch(f"{MAIL}.uidvalidity", MagicMock(return_value=None)),
        patch(f"{MAIL}.async_summaries", AsyncMock(return_value=[summary])),
        patch(GENERATE, AsyncMock(return_value=answer)) as generate,
    ):
        await sorter.async_process()
    rating = sorter.ratings[-1]
    assert rating["importance"] == sorter.important_from and rating["vip"]  # raised for an important sender
    assert "event_start" in str(generate.await_args.kwargs["structure"].schema)
    assert "Resolve relative dates" in generate.await_args.kwargs["instructions"]
    [proposal] = link.insights.open_proposals()
    assert proposal["title"] == "Kaffee" and proposal["message_id"] == "<oma@example.com>"

    # off in the options: no dates in the prompt
    sorter.settings["events"] = False
    assert "Resolve relative dates" not in sorter._instructions("x")  # noqa: SLF001


async def test_moving_a_mail_to_another_category_corrects_the_ai(hass: HomeAssistant) -> None:
    core = await setup_core(hass)
    entry = await setup_postfach(hass, core, rules_auto=False)
    link = entry.runtime_data
    sorter = link.ai
    sorter.categories[1]["move_to"] = "Belege"
    sorter.ratings.append(
        {"id": "r1", "message_id": "<1@example.com>", "category": sorter.categories[0]["name"], "corrected": None}
    )
    link.activity.add_pass("push", _now(), [_line(1, "shop@example.com") | {"_days": 0}])
    line = link.activity.items[-1]
    line.pop("_days", None)
    await link.state.on_moved(line["key"], "Archive")  # no category's folder: nothing learned
    assert sorter.ratings[-1]["corrected"] is None
    await link.state.on_moved(line["key"], "Belege")
    assert sorter.ratings[-1]["corrected"] == sorter.categories[1]["name"]
    assert (
        sorter.ratings[-1]["corrected_by"] == "move" and sorter.examples[-1]["category"] == sorter.categories[1]["name"]
    )


async def test_options_for_you(hass: HomeAssistant) -> None:
    core = await setup_core(hass)
    entry = await setup_postfach(hass, core)
    result = await hass.config_entries.options.async_init(entry.entry_id)
    result = await hass.config_entries.options.async_configure(result["flow_id"], {"next_step_id": "foryou"})
    assert result["type"] is FlowResultType.FORM and result["step_id"] == "foryou"
    result = await hass.config_entries.options.async_configure(
        result["flow_id"],
        {
            "vip_groups": ["*"],
            "vip_senders": " chef@firma.example ",
            "vip_notify": True,
            "ai_events": False,
            "followup_days": 5,
            "weekly_day": "sun",
        },
    )
    await hass.async_block_till_done()
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert entry.options["vip_senders"] == "chef@firma.example" and entry.options["followup_days"] == 5
    assert entry.runtime_data.insights.opts["weekly_day"] == "sun"  # reloaded with the new options
    assert entry.runtime_data.ai.settings["events"] is False


# ------------------------------------------------------------------ as tools for assistants
async def test_for_you_as_tools(hass: HomeAssistant) -> None:
    """Assist and Claude ask what is important; a proposal goes into the calendar when the user asks for it."""
    from homeassistant.core import Context  # noqa: PLC0415
    from homeassistant.helpers import llm  # noqa: PLC0415

    from custom_components.friedafetch.const import LLM_API_ID  # noqa: PLC0415

    core = await setup_core(hass)
    entry = await setup_postfach(hass, core, rules_auto=False, vip_senders="oma@example.com", followup_days=0)
    link = entry.runtime_data
    insights = link.insights
    link.activity.add_pass(
        "push",
        _now(0),
        [
            {**_line(1, "oma@example.com"), "name": "Oma"},
            {**_line(2, "news@shop.example"), "ai": {"category": "Werbung", "importance": 1}},
        ],
    )
    for item in link.activity.items:
        item.pop("_days", None)
        item["state"] = {"seen": False, "flagged": False, "gone": False, "mailbox": "INBOX", "uid": item["uid"]}
    day = (dt_util.now().date() + timedelta(days=3)).isoformat()
    proposal = insights.add_proposal(
        {"id": "r1", "message_id": "<1@example.com>", "subject": "Sonntag?", "from": "Oma"},
        {"kind": "appointment", "title": "Kaffee bei Oma", "start": f"{day}T15:00"},
    )
    ctx = llm.LLMContext(platform="test", context=Context(), language="de", assistant=None, device_id=None)
    api = await llm.async_get_api(hass, LLM_API_ID, ctx)
    assert {"icloud_mail_for_you", "icloud_add_proposed_event"} <= {t.name for t in api.tools}

    result = await api.async_call_tool(llm.ToolInput(tool_name="icloud_mail_for_you", tool_args={}))
    data = result.data if hasattr(result, "data") else result
    assert [m["from"] for m in data["important_unread"]] == ["Oma"]  # the newsletter is not important
    assert data["important_unread"][0]["important_sender"] is True
    assert data["calendar_proposals"][0]["id"] == proposal["id"] and data["content_notice"]

    calendar = SimpleNamespace(id="home", name="Zuhause", color=None, supports_events=True)
    with (
        patch(
            "custom_components.friedafetch.caldav_client.ICloudCalDav.async_calendars",
            AsyncMock(return_value=[calendar]),
        ),
        patch(
            "custom_components.friedafetch.caldav_client.ICloudCalDav.async_create_event",
            AsyncMock(return_value={"uid": "EV1"}),
        ) as create,
    ):
        result = await api.async_call_tool(
            llm.ToolInput(
                tool_name="icloud_add_proposed_event",
                tool_args={"proposal_id": proposal["id"], "calendar": "Zuhause", "title": "Kaffee"},
            )
        )
    data = result.data if hasattr(result, "data") else result
    assert data["status"] == "added" and data["calendar"] == "Zuhause" and data["title"] == "Kaffee"
    assert create.await_args.args[1] == "Kaffee"
    logged = [e.get("tool") for e in core.runtime_data.audit.entries()]
    assert logged.count("icloud_add_proposed_event") == 1 and "icloud_create_event" not in logged  # one entry


async def test_the_calendar_tool_is_not_offered_read_only(hass: HomeAssistant) -> None:
    from homeassistant.core import Context  # noqa: PLC0415
    from homeassistant.helpers import llm  # noqa: PLC0415

    from custom_components.friedafetch.const import LLM_API_ID  # noqa: PLC0415

    core = await setup_core(hass, read_only=True)
    await setup_postfach(hass, core, rules_auto=False)
    ctx = llm.LLMContext(platform="test", context=Context(), language="de", assistant=None, device_id=None)
    names = {t.name for t in (await llm.async_get_api(hass, LLM_API_ID, ctx)).tools}
    assert "icloud_mail_for_you" in names and "icloud_add_proposed_event" not in names
