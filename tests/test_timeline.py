"""Timeline of one message: rules, AI and corrections linked by Message-ID."""

from homeassistant.core import HomeAssistant

from custom_components.friedafetch_mail.timeline import build_timeline

from .conftest import setup_core, setup_postfach

MID = "<abc@bank.example>"

HISTORY = [
    {
        "started": "2026-10-18T16:45:02+02:00",
        "trigger": "push",
        "mails": [
            {
                "subject": "Letzte Rate",
                "from": "ines@bank.example",
                "mailbox": "INBOX",
                "uid": 7,
                "message_id": MID,
                "date": "2026-10-18T14:44:50+00:00",
                "rules": [],
                "move_to": None,
                "delete": False,
                "seen": None,
                "flag": None,
            },
            {
                "subject": "Anderes",
                "from": "x@y.example",
                "mailbox": "INBOX",
                "uid": 8,
                "message_id": "<other@y>",
                "date": None,
                "rules": ["Spam"],
                "move_to": None,
                "delete": True,
                "seen": None,
                "flag": None,
            },
        ],
    },
    {
        "started": "2026-10-18T17:00:00+02:00",
        "trigger": "manual",
        "mails": [
            {
                "subject": "Letzte Rate",
                "from": "ines@bank.example",
                "mailbox": "INBOX",
                "uid": 7,
                "message_id": MID,
                "date": None,
                "rules": [],
                "move_to": None,
                "delete": False,
                "seen": None,
                "flag": None,
            },
        ],
    },
]
USAGE = [
    {
        "time": "2026-10-18T16:45:05+02:00",
        "kind": "sort",
        "sent": True,
        "entity": "ai_task.google",
        "ok": True,
        "fields": ["from", "subject"],
        "chars": 1350,
        "sender": "ines@bank.example",
        "subject": "Letzte Rate",
        "message_id": MID,
    },
    {"time": "2026-10-18T16:45:06+02:00", "kind": "digest", "sent": True, "subject": "", "sender": ""},
]
RATINGS = [
    {
        "time": "2026-10-18T16:45:08+02:00",
        "mailbox": "INBOX",
        "uid": 7,
        "message_id": MID,
        "subject": "Letzte Rate",
        "from": "Ines",
        "from_domain": "bank.example",
        "category": "Rechnungen",
        "importance": 4,
        "reason": "Finanzen",
        "applied": ["moved:Belege"],
        "corrected": "Persönlich",
        "corrected_at": "2026-10-18T17:02:00+02:00",
    },
]


def test_timeline_links_rules_ai_and_correction_by_message_id() -> None:
    tl = build_timeline(HISTORY, RATINGS, USAGE, message_id=MID)
    kinds = [e["kind"] for e in tl["events"]]
    assert kinds == ["received", "checked", "ai_sent", "rated", "ai_applied", "corrected"]
    checked = tl["events"][1]
    assert checked["trigger"] == "push" and checked["count"] == 2  # checked twice without a match: one step
    assert tl["subject"] == "Letzte Rate" and tl["location"] == "Belege"
    assert tl["category"] == "Persönlich" and tl["corrected"] is True and tl["found"] is True
    assert tl["events"][-1] == {
        "time": "2026-10-18T17:02:00+02:00",
        "kind": "corrected",
        "before": "Rechnungen",
        "after": "Persönlich",
    }


def test_timeline_matches_older_entries_by_subject_and_sender() -> None:
    usage = [{**USAGE[0], "message_id": None}]
    tl = build_timeline([], [], usage, message_id=MID, subject="Letzte Rate", sender="ines@bank.example")
    assert [e["kind"] for e in tl["events"]] == ["ai_sent"]
    # another sender with the same subject is a different message
    assert build_timeline([], [], usage, subject="Letzte Rate", sender="someone@else.example")["found"] is False


def test_timeline_kill_switch_and_rule_actions() -> None:
    held = [
        {
            "time": "2026-10-18T08:10:00+02:00",
            "kind": "sort",
            "sent": False,
            "subject": "Befund",
            "sender": "praxis@weber.example",
            "message_id": "<b@w>",
            "held_back": [{"type": "term", "value": "Befund", "where": ["subject"]}],
        }
    ]
    tl = build_timeline([], [], held, message_id="<b@w>")
    assert tl["held"] is True and tl["events"][0]["reasons"][0]["value"] == "Befund"
    spam = build_timeline(HISTORY, [], [], message_id="<other@y>")
    assert spam["events"][0]["rules"] == ["Spam"] and spam["location"] == "trash"


async def test_timeline_websocket(hass: HomeAssistant, hass_ws_client) -> None:
    core = await setup_core(hass)
    entry = await setup_postfach(hass, core, rules_auto=False)
    entry.runtime_data.rules._history = list(HISTORY)  # noqa: SLF001
    ws = await hass_ws_client(hass)
    await ws.send_json(
        {"id": 1, "type": "friedafetch_mail/mail/timeline", "entry_id": entry.entry_id, "message_id": MID}
    )
    msg = await ws.receive_json()
    assert msg["success"], msg
    assert [e["kind"] for e in msg["result"]["events"]] == ["received", "checked"]
    await ws.send_json(
        {"id": 2, "type": "friedafetch_mail/mail/timeline", "entry_id": entry.entry_id, "message_id": "<none@x>"}
    )
    assert (await ws.receive_json())["result"]["found"] is False
