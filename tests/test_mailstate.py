"""Read / flagged and the folder of the activity's mails: CONDSTORE (changes only) or one FETCH per folder, and
messages followed by their Message-ID when they leave a folder."""

from __future__ import annotations

import asyncio
from typing import Any
from unittest.mock import patch

import pytest
from homeassistant.core import HomeAssistant

from custom_components.friedafetch.mail import MailboxNotFound, MailError
from custom_components.friedafetch_mail import mailstate
from custom_components.friedafetch_mail.mailstate import MailState

from .conftest import setup_core, setup_postfach

SEEN, FLAGGED = "\\Seen", "\\Flagged"


class FakeImap:
    """Folders of messages {uid: (message_id, flags)}, with a change counter per folder like a CONDSTORE server."""

    def __init__(self, *, condstore: bool) -> None:
        self.condstore = condstore
        self.boxes: dict[str, dict[int, tuple[str, list[str]]]] = {"INBOX": {}, "Archive": {}, "Deleted Messages": {}}
        self.modseq: dict[str, int] = dict.fromkeys(self.boxes, 1)
        self.changed_at: dict[tuple[str, int], int] = {}
        self.calls: list[tuple] = []
        self.drop_from_fetch: set[int] = set()  # an incomplete FETCH answer
        self.status_error: Exception | None = None
        self.fetch_error: Exception | None = None
        self.gate: asyncio.Event | None = None

    def put(self, box: str, uid: int, mid: str, flags: list[str] | None = None) -> None:
        self.boxes[box][uid] = (mid, list(flags or []))
        self.modseq[box] += 1
        self.changed_at[(box, uid)] = self.modseq[box]

    def flag(self, box: str, uid: int, flags: list[str]) -> None:
        self.put(box, uid, self.boxes[box][uid][0], flags)

    def move(self, box: str, uid: int, target: str, new_uid: int) -> None:
        mid, flags = self.boxes[box].pop(uid)
        self.modseq[box] += 1
        self.put(target, new_uid, mid, flags)

    async def async_mailboxes(self, force: bool = False) -> list[dict[str, Any]]:
        return [{"name": n, "special_use": "trash" if n == "Deleted Messages" else None} for n in self.boxes]

    async def async_status(self, box: str) -> dict[str, int]:
        self.calls.append(("status", box))
        if self.status_error:
            raise self.status_error
        return {"uidvalidity": 1, "highestmodseq": self.modseq[box]}

    async def async_flags(self, box: str, uids: list[int] | None = None, *, changed_since: int | None = None):
        self.calls.append(("flags", box, tuple(uids or ()), changed_since))
        if self.gate is not None:
            await self.gate.wait()
        if self.fetch_error:
            raise self.fetch_error
        if changed_since is not None:
            assert self.condstore
            return {u: f for u, (_, f) in self.boxes[box].items() if self.changed_at[(box, u)] > changed_since}
        return {u: self.boxes[box][u][1] for u in uids or [] if u in self.boxes[box] and u not in self.drop_from_fetch}

    async def async_search_uids(self, box: str, criteria: list[str]) -> list[int]:
        self.calls.append(("search", box, criteria[0]))
        if criteria[0] == "UID":
            wanted = {int(x) for x in criteria[1].split(",")}
            return sorted(u for u in self.boxes[box] if u in wanted)
        mid = criteria[2].strip('"')
        return sorted(u for u, (m, _) in self.boxes[box].items() if m == mid)


def _mail(uid: int, **extra: Any) -> dict[str, Any]:
    return {
        "subject": f"Mail {uid}",
        "from": f"s{uid}@example.com",
        "mailbox": "INBOX",
        "uid": uid,
        "message_id": f"<{uid}@example.com>",
        "rules": [],
        "move_to": None,
        "delete": False,
        "seen": None,
        "flag": None,
        **extra,
    }


async def _setup(hass: HomeAssistant, *, condstore: bool):
    core = await setup_core(hass)
    entry = await setup_postfach(hass, core, rules_auto=False)
    log = entry.runtime_data.activity
    imap = FakeImap(condstore=condstore)
    for uid in (1, 2, 3):
        imap.put("INBOX", uid, f"<{uid}@example.com>")
    imap.put("Archive", 40, "<4@example.com>")  # a rule moved 4 to the archive (the UID there is new)
    log.add_pass("push", "2026-10-20T10:00:00+02:00", [_mail(1), _mail(2), _mail(3)])
    log.add_pass("push", "2026-10-20T10:05:00+02:00", [_mail(4, rules=["Archiv"], move_to="Archive")])
    state = MailState(imap, log)
    entry.runtime_data.state = state
    return entry, log, imap, state


def _states(log) -> dict[int, Any]:
    keys = ("seen", "flagged", "gone", "mailbox", "uid")
    return {i["uid"]: {k: (i.get("state") or {}).get(k) for k in keys} if i.get("state") else None for i in log.items}


@pytest.mark.real_mail_state
@pytest.mark.parametrize("condstore", [False, True], ids=["flags", "condstore"])
async def test_first_look_reads_the_inbox_and_finds_the_moved_mail(hass: HomeAssistant, condstore: bool) -> None:
    entry, log, imap, state = await _setup(hass, condstore=condstore)
    imap.flag("INBOX", 2, [SEEN, FLAGGED])
    imap.flag("Archive", 40, [SEEN])
    await state.async_sync()
    assert _states(log) == {
        1: {"seen": False, "flagged": False, "gone": False, "mailbox": "INBOX", "uid": 1},
        2: {"seen": True, "flagged": True, "gone": False, "mailbox": "INBOX", "uid": 2},
        3: {"seen": False, "flagged": False, "gone": False, "mailbox": "INBOX", "uid": 3},
        4: {"seen": True, "flagged": False, "gone": False, "mailbox": "Archive", "uid": 40},
    }
    # the moved one was looked for where the rule put it first
    assert ("search", "Archive", "HEADER") in imap.calls and ("search", "INBOX", "HEADER") not in imap.calls
    assert state.status()["tracked"] == 4 and state.status()["folders"] == 2 and state.located == 1
    row = next(r for r in log.view([], ai_active=False) if r["uid"] == 2)
    assert row["state"]["flagged"] is True and row["state"]["mailbox"] == "INBOX"


@pytest.mark.real_mail_state
async def test_with_condstore_only_the_changes_per_folder(hass: HomeAssistant) -> None:
    entry, log, imap, state = await _setup(hass, condstore=True)
    await state.async_sync()  # the inbox; 4 is found in the archive
    await state.async_sync()  # the archive's first look of its own
    imap.calls.clear()
    await state.async_sync()  # nothing changed: one STATUS per folder, no FETCH
    assert [c[0] for c in imap.calls] == ["status", "status"]

    imap.flag("INBOX", 3, [SEEN])  # read on the iPhone
    imap.flag("Archive", 40, [FLAGGED])  # flagged in the archive
    imap.calls.clear()
    await state.async_sync()
    fetches = [c for c in imap.calls if c[0] == "flags"]
    assert all(c[3] is not None for c in fetches)  # changes only (CHANGEDSINCE)
    assert _states(log)[3]["seen"] is True and _states(log)[4]["flagged"] is True and state.changed == 2
    assert state.status()["mode"] == "condstore"


@pytest.mark.real_mail_state
async def test_a_mail_moved_on_the_iphone_is_followed(hass: HomeAssistant) -> None:
    entry, log, imap, state = await _setup(hass, condstore=True)
    await state.async_sync()
    imap.move("INBOX", 2, "Archive", 41)  # archived on the iPhone (read before)
    imap.flag("Archive", 41, [SEEN])
    with patch.object(mailstate, "FULL_EVERY", -1):  # the full look notices that 2 left the inbox
        await state.async_sync()
    assert _states(log)[2] == {"seen": True, "flagged": False, "gone": False, "mailbox": "Archive", "uid": 41}
    imap.flag("Archive", 41, [SEEN, FLAGGED])
    await state.async_sync()  # from now on kept current there
    assert _states(log)[2]["flagged"] is True


@pytest.mark.real_mail_state
async def test_deleted_for_good_keeps_its_last_state_and_is_looked_for_daily(hass: HomeAssistant) -> None:
    entry, log, imap, state = await _setup(hass, condstore=False)
    imap.flag("INBOX", 3, [FLAGGED])
    await state.async_sync()
    del imap.boxes["INBOX"][3]  # deleted for good
    await state.async_sync()
    assert _states(log)[3] == {"seen": False, "flagged": True, "gone": True, "mailbox": None, "uid": None}
    imap.calls.clear()
    await state.async_sync()  # not looked for again right away
    assert not [c for c in imap.calls if c[0] == "search" and c[2] == "HEADER"]
    with patch.object(mailstate, "SEARCH_AGAIN", -1):
        imap.put("INBOX", 30, "<3@example.com>")  # back (restored from somewhere)
        await state.async_sync()
    assert _states(log)[3]["mailbox"] == "INBOX" and _states(log)[3]["uid"] == 30


@pytest.mark.real_mail_state
async def test_a_mail_left_out_by_fetch_is_not_gone(hass: HomeAssistant) -> None:
    entry, log, imap, state = await _setup(hass, condstore=False)
    imap.flag("INBOX", 1, [SEEN])
    await state.async_sync()
    imap.drop_from_fetch = {1, 2, 3}  # an incomplete answer
    await state.async_sync()
    assert state.unconfirmed == 3 and _states(log)[1] == {
        "seen": True,
        "flagged": False,
        "gone": False,
        "mailbox": "INBOX",
        "uid": 1,
    }


@pytest.mark.real_mail_state
async def test_lines_of_1_0_25_continue(hass: HomeAssistant) -> None:
    """A line taken for gone by 1.0.25–1.0.27 is looked for; one with a state goes on where it was."""
    entry, log, imap, state = await _setup(hass, condstore=False)
    for item in log.items:
        if item["uid"] == 1:
            item["state"] = {"seen": True, "flagged": False, "gone": True, "checked": "x"}
        if item["uid"] == 2:
            item["state"] = {"seen": False, "flagged": False, "gone": False, "checked": "x"}
    imap.flag("INBOX", 2, [SEEN])
    await state.async_sync()
    assert _states(log)[1]["mailbox"] == "INBOX" and _states(log)[1]["gone"] is False
    assert _states(log)[2]["seen"] is True


@pytest.mark.real_mail_state
async def test_failures(hass: HomeAssistant) -> None:
    entry, log, imap, state = await _setup(hass, condstore=True)
    imap.status_error = MailboxNotFound("SELECT refused")  # no counters: the full look reads the flags anyway
    imap.flag("INBOX", 1, [SEEN])
    await state.async_sync()
    assert state.error is None and _states(log)[1]["seen"] is True and state.status()["mode"] == "flags"
    imap.fetch_error = MailError("IMAP operation failed: timeout")
    await state.async_sync()
    assert state.error == "IMAP operation failed: timeout"
    imap.fetch_error = None
    await state.async_sync()
    assert state.error is None
    from custom_components.friedafetch_mail.sensor import PushSensor  # noqa: PLC0415

    attrs = PushSensor(entry, entry.runtime_data).extra_state_attributes
    assert attrs["state_tracked"] == 4 and attrs["state_folders"] == 2 and attrs["state_error"] is None


@pytest.mark.real_mail_state
async def test_a_push_during_a_look_gets_one_more_look(hass: HomeAssistant) -> None:
    entry, log, imap, state = await _setup(hass, condstore=False)
    imap.gate = asyncio.Event()
    first = asyncio.create_task(state.async_sync())
    await asyncio.sleep(0)
    imap.flag("INBOX", 3, [SEEN])
    await state.async_sync()  # comes in while the first look waits for the server
    await state.async_sync()  # two pushes: still one more look, not two
    imap.gate.set()
    await first
    looks = [c for c in imap.calls if c[0] == "flags" and c[1] == "INBOX"]
    assert len(looks) == 2 and _states(log)[3]["seen"] is True


@pytest.mark.real_mail_state
async def test_opening_a_mail_teaches_the_look_where_it_is(hass: HomeAssistant, hass_ws_client) -> None:
    entry, log, imap, state = await _setup(hass, condstore=False)
    imap.move("INBOX", 1, "Archive", 50)
    entry.runtime_data.mail = imap  # the panel's search uses the same connection
    ws = await hass_ws_client(hass)
    await ws.send_json(
        {"id": 1, "type": "friedafetch_mail/mail/locate", "entry_id": entry.entry_id, "message_id": "<1@example.com>"}
    )
    msg = await ws.receive_json()
    assert msg["result"]["mailbox"] == "Archive" and msg["result"]["uid"] == 50
    await hass.async_block_till_done()
    assert _states(log)[1]["mailbox"] == "Archive" and _states(log)[1]["uid"] == 50
