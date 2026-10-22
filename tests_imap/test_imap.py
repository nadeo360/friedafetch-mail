"""Frieda's IMAP client and Frieda Postfach's read/flagged look against a real IMAP server (Dovecot)."""

from __future__ import annotations

import asyncio
from typing import Any
from unittest.mock import AsyncMock, patch

from homeassistant.core import HomeAssistant

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
    await state.async_sync()  # QRESYNC (CONDSTORE): only the changes
    assert state.mode == "qresync" and mail.qresync
    assert states()["<m0@example.com>"]["seen"] is True and states()["<m1@example.com>"]["flagged"] is True

    archived = device.move("INBOX", uids[0], "Archive")  # archived on the iPhone
    device.delete("INBOX", uids[2])  # deleted for good
    calls: list[str] = []
    real_flags = mail.async_flags

    async def counted(*args: Any, **kwargs: Any) -> Any:
        calls.append(args[0])
        return await real_flags(*args, **kwargs)

    with patch.object(mail, "async_flags", counted):
        await state.async_sync()  # QRESYNC names both as vanished: no full look of the inbox needed
    assert "INBOX" not in calls
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


async def test_actions_from_the_panel(hass: HomeAssistant, account: dict[str, Any], mail: Any) -> None:
    """Read, flag, archive, back, trash – on the server, in the activity, in the timeline; nothing deleted for good."""
    from types import SimpleNamespace  # noqa: PLC0415

    from custom_components.friedafetch_mail.actions import async_act  # noqa: PLC0415

    device = account["device"]
    uids = [device.append("INBOX", f"<a{i}@example.com>") for i in range(2)]
    log = ActivityLog(hass, "act")
    await log.async_load()
    log.add_pass("push", "2026-10-21T09:00:00+02:00", [_line(u, f"<a{i}@example.com>") for i, u in enumerate(uids)])
    link = SimpleNamespace(
        activity=log, mail=mail, clients=SimpleNamespace(guard=None, audit=None, mail=mail), state=None
    )
    keys = ["<a0@example.com>", "<a1@example.com>"]

    async def act(action: str, which: list[str]) -> dict[str, Any]:
        return await async_act(link, which, action, read_only=False, allow_delete=True)

    assert (await act("seen", keys))["done"] == 2
    assert (await act("flag", keys[:1]))["done"] == 1
    flags = await mail.async_flags("INBOX", uids)
    assert all(SEEN in f for f in flags.values()) and FLAGGED in flags[uids[0]] and FLAGGED not in flags[uids[1]]
    assert log.items[0]["state"]["seen"] is True

    await act("archive", keys[:1])
    state = MailState(mail, log)
    await state.async_sync()  # finds it in the archive
    archived = next(i for i in log.items if i["key"] == keys[0])["state"]
    assert archived["mailbox"] == "Archive" and archived["flagged"] is True
    await act("inbox", keys[:1])
    await state.async_sync()
    assert next(i for i in log.items if i["key"] == keys[0])["state"]["mailbox"] == "INBOX"

    await act("trash", keys[1:])
    await state.async_sync()
    assert next(i for i in log.items if i["key"] == keys[1])["state"]["mailbox"] == "Deleted Messages"
    again = await act("trash", keys[1:])  # already in the trash: stays there, nothing is deleted for good
    assert again["done"] == 0 and again["skipped"] == 1
    assert (await async_locate(mail, None, keys[1], []))["mailbox"] == "Deleted Messages"
    steps = [e["action"] for e in next(i for i in log.items if i["key"] == keys[0])["events"] if e["kind"] == "acted"]
    assert steps == ["seen", "flag", "archive", "inbox"]


async def test_for_you_against_the_server(hass: HomeAssistant, account: dict[str, Any], mail: Any) -> None:
    """Waiting for a reply (threaded or not), newsletters and their unsubscribe header, with real SEARCH commands."""
    from types import SimpleNamespace  # noqa: PLC0415

    from custom_components.friedafetch.mail import list_unsubscribe  # noqa: PLC0415
    from custom_components.friedafetch_mail.insights import Insights  # noqa: PLC0415

    device = account["device"]
    device.create("Sent Messages")
    me = account["user"]
    device.append("Sent Messages", "<s1@icloud.com>", "Angebot?", sender=me, to="Bob <bob@example.com>", days_ago=5)
    device.append("Sent Messages", "<s2@icloud.com>", "Samstag?", sender=me, to="erika@example.com", days_ago=5)
    device.append("Sent Messages", "<s3@icloud.com>", "Frage", sender=me, to="anna@example.com", days_ago=6)
    device.append(
        "INBOX",
        "<r2@example.com>",
        "Re: Samstag?",
        sender="erika@example.com",
        headers="In-Reply-To: <s2@icloud.com>\r\n",
    )
    device.append("Archive", "<r3@example.com>", "Antwort", sender="Anna <anna@example.com>")  # no threading headers
    unsubscribe = (
        "List-Unsubscribe: <https://moebel.example/u>\r\nList-Unsubscribe-Post: List-Unsubscribe=One-Click\r\n"
    )
    for n in range(2):
        device.append(
            "INBOX", f"<n{n}@moebel.example>", "Angebote", sender="Möbelhaus <news@moebel.example>", headers=unsubscribe
        )
    log = ActivityLog(hass, "fy-imap")
    await log.async_load()
    clients = SimpleNamespace(guard=None, audit=None, mail=mail)
    insights = Insights(hass, "fy-imap", clients, mail, log, {}, language="de")

    [waiting] = await insights.async_followups(force=True)
    assert waiting["message_id"] == "<s1@icloud.com>" and waiting["to"][0]["email"] == "bob@example.com"
    assert set(insights.replied) == {"<s2@icloud.com>", "<s3@icloud.com>"} and waiting["days"] == 5

    [sub] = await insights.async_subscriptions(force=True)
    assert (sub["sender"], sub["count"], sub["unread"]) == ("news@moebel.example", 2, 2)
    _, msg = await mail.async_fetch_raw(sub["mailbox"], sub["uid"])
    assert list_unsubscribe(msg)["one_click"]


async def test_parcels_and_conversations_against_the_server(
    hass: HomeAssistant, account: dict[str, Any], mail: Any
) -> None:
    """A shipping mail in a folder is read once; my answer to a mail is found in the sent mail by its reference."""
    from types import SimpleNamespace  # noqa: PLC0415

    from custom_components.friedafetch_mail.insights import Insights  # noqa: PLC0415

    device = account["device"]
    device.create("Sent Messages")
    device.append("Archive", "<dhl1@dhl.de>", "Ihre DHL Sendung kommt heute", sender="DHL <noreply@dhl.de>")
    device.append("INBOX", "<q1@example.com>", "Frage zum Elternabend", sender="Schule <sekretariat@schule.example>")
    device.append(
        "Sent Messages",
        "<a1@icloud.com>",
        "Re: Frage zum Elternabend",
        sender=account["user"],
        to="sekretariat@schule.example",
        headers="In-Reply-To: <q1@example.com>\r\n",
    )
    log = ActivityLog(hass, "fy-imap2")
    await log.async_load()
    clients = SimpleNamespace(guard=None, audit=None, mail=mail)
    insights = Insights(hass, "fy-imap2", clients, mail, log, {}, language="de")
    await insights.async_subscriptions(force=True)  # the same look reads the shipping mails
    [parcel] = insights.parcels()
    assert parcel["carrier"] == "DHL" and parcel["status"] == "out_for_delivery"

    uids = await mail.async_search_uids("Sent Messages", ["HEADER", "In-Reply-To", '"<q1@example.com>"'])
    assert len(uids) == 1  # how the conversation finds my answer
