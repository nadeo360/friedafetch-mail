"""Frieda's IMAP client and Frieda Postfach's read/flagged look against a real IMAP server (Dovecot)."""

from __future__ import annotations

import asyncio
from typing import Any
from unittest.mock import AsyncMock, patch

from homeassistant.core import HomeAssistant

from custom_components.friedafetch_mail import mailstate
from custom_components.friedafetch_mail.activity import ActivityLog
from custom_components.friedafetch_mail.idle import MailWatcher
from custom_components.friedafetch_mail.locate import async_locate
from custom_components.friedafetch_mail.mailstate import MailState

SEEN, FLAGGED = "\\Seen", "\\Flagged"


async def test_capabilities_status_and_flags(account: dict[str, Any], mail: Any) -> None:
    device = account["device"]
    one = device.append("INBOX", "<1@example.com>")
    two = device.append("INBOX", "<2@example.com>", flags="\\Seen")
    status = await mail.async_status("INBOX")  # not open yet: STATUS
    assert mail.condstore and "QRESYNC" in mail.capabilities and "IDLE" in mail.capabilities
    assert status["messages"] == 2 and status["unseen"] == 1 and status["highestmodseq"] > 0

    flags = await mail.async_flags("INBOX", [one, two, 999])  # 999 is not there
    assert set(flags) == {one, two} and SEEN not in flags[one] and SEEN in flags[two]
    # the open mailbox: opened again with (CONDSTORE), so the counter comes back
    again = await mail.async_status("INBOX")
    assert again["unseen"] == 1 and again["highestmodseq"] == status["highestmodseq"]

    device.flags("INBOX", one, add="\\Seen \\Flagged")
    changes = await mail.async_flags("INBOX", changed_since=status["highestmodseq"])
    assert set(changes) == {one} and {SEEN, FLAGGED} <= set(changes[one])
    after = await mail.async_status("INBOX")
    assert after["highestmodseq"] > status["highestmodseq"] and after["unseen"] == 0


async def test_locate_by_message_id(account: dict[str, Any], mail: Any) -> None:
    device = account["device"]
    uid = device.append("INBOX", "<loc@example.com>")
    moved = device.move("INBOX", uid, "Archive")
    found = await async_locate(mail, None, "<loc@example.com>", ["INBOX"])
    assert found["found"] and found["mailbox"] == "Archive" and found["uid"] == moved
    assert (await async_locate(mail, None, "<none@example.com>", []))["found"] is False


def _line(uid: int, mid: str, **extra: Any) -> dict[str, Any]:
    return {
        "subject": "Hallo",
        "from": "anna@example.com",
        "mailbox": "INBOX",
        "uid": uid,
        "message_id": mid,
        "rules": [],
        "move_to": None,
        "delete": False,
        "seen": None,
        "flag": None,
        **extra,
    }


async def test_read_flagged_and_moved_on_another_device(
    hass: HomeAssistant, account: dict[str, Any], mail: Any
) -> None:
    device = account["device"]
    uids = [device.append("INBOX", f"<m{i}@example.com>") for i in range(3)]
    log = ActivityLog(hass, "imap")
    await log.async_load()
    log.add_pass("push", "2026-10-21T09:00:00+02:00", [_line(u, f"<m{i}@example.com>") for i, u in enumerate(uids)])
    state = MailState(mail, log)

    def states() -> dict[str, Any]:
        return {i["message_id"]: i.get("state") or {} for i in log.items}

    await state.async_sync()
    assert all(s["seen"] is False and s["mailbox"] == "INBOX" for s in states().values())

    device.flags("INBOX", uids[0], add="\\Seen")  # read on the iPhone
    device.flags("INBOX", uids[1], add="\\Flagged")
    await state.async_sync()  # CONDSTORE: only the changes
    assert state.mode == "condstore"
    assert states()["<m0@example.com>"]["seen"] is True and states()["<m1@example.com>"]["flagged"] is True

    archived = device.move("INBOX", uids[0], "Archive")  # archived on the iPhone
    device.delete("INBOX", uids[2])  # deleted for good
    with patch.object(mailstate, "FULL_EVERY", -1):
        await state.async_sync()
    moved = states()["<m0@example.com>"]
    assert moved["mailbox"] == "Archive" and moved["uid"] == archived and moved["seen"] is True
    assert states()["<m2@example.com>"]["gone"] is True and states()["<m2@example.com>"]["mailbox"] is None

    device.flags("Archive", archived, add="\\Flagged")  # kept current in the archive
    await state.async_sync()
    assert states()["<m0@example.com>"]["flagged"] is True and state.error is None


async def test_push_reports_new_mail_and_changed_flags(account: dict[str, Any]) -> None:
    device = account["device"]
    uid = device.append("INBOX", "<p1@example.com>")
    new_mail, changed = AsyncMock(), AsyncMock()
    watcher = MailWatcher(
        username=account["user"],
        password="pass",
        host=account["host"],
        port=account["port"],
        on_new_mail=new_mail,
        on_change=changed,
        debounce=0.2,
    )
    with patch("custom_components.friedafetch_mail.idle.CHANGE_DEBOUNCE", 0.2):
        watcher.start(lambda coro, name: asyncio.get_running_loop().create_task(coro))
        for _ in range(50):
            if watcher.state == "listening":
                break
            await asyncio.sleep(0.1)
        assert watcher.state == "listening", watcher.status()
        await asyncio.sleep(0.3)
        device.flags("INBOX", uid, add="\\Seen")
        await _until(lambda: changed.await_count >= 1)
        new_mail.assert_not_awaited()
        device.append("INBOX", "<p2@example.com>")
        await _until(lambda: new_mail.await_count >= 1)
        await watcher.async_stop()


async def _until(check: Any, seconds: float = 10) -> None:
    for _ in range(int(seconds * 10)):
        if check():
            return
        await asyncio.sleep(0.1)
    raise AssertionError("the server did not report it in time")
