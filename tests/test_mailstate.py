"""Read / flagged of the activity's inbox mails, with CONDSTORE (changes only) and without (one FETCH)."""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from homeassistant.core import HomeAssistant

from custom_components.friedafetch_mail import mailstate
from custom_components.friedafetch_mail.mailstate import MailState

from .conftest import setup_core, setup_postfach

SEEN, FLAGGED = "\\Seen", "\\Flagged"


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


async def _activity(hass: HomeAssistant):
    core = await setup_core(hass)
    entry = await setup_postfach(hass, core, rules_auto=False)
    log = entry.runtime_data.activity
    log.add_pass("push", "2026-10-20T10:00:00+02:00", [_mail(1), _mail(2), _mail(3)])
    log.add_pass("push", "2026-10-20T10:05:00+02:00", [_mail(4, rules=["Archiv"], move_to="Archive")])
    return entry, log


def _states(log) -> dict[int, Any]:
    return {i["uid"]: {k: v for k, v in (i.get("state") or {}).items() if k != "checked"} or None for i in log.items}


@pytest.mark.real_mail_state
async def test_without_condstore_one_fetch_of_the_tracked_mails(hass: HomeAssistant) -> None:
    entry, log = await _activity(hass)
    assert log.tracked_uids("INBOX", 10) == [3, 2, 1]  # 4 was moved to Archive by a rule
    mail = MagicMock(condstore=False)
    mail.async_flags = AsyncMock(return_value={1: [SEEN], 2: [SEEN, FLAGGED]})  # 3 left the inbox
    mail.async_search_uids = AsyncMock(return_value=[])  # confirmed: the inbox has no 3
    state = MailState(mail, log)
    await state.async_sync()
    mail.async_flags.assert_awaited_once_with("INBOX", [3, 2, 1])
    mail.async_search_uids.assert_awaited_once_with("INBOX", ["UID", "3"])
    assert _states(log) == {
        1: {"seen": True, "flagged": False, "gone": False},
        2: {"seen": True, "flagged": True, "gone": False},
        3: {"seen": None, "flagged": None, "gone": True},
        4: None,
    }
    assert state.status()["mode"] == "flags" and state.changed == 3 and log.tracked_uids("INBOX", 10) == [2, 1]
    # the panel gets the state with each line
    row = next(r for r in log.view([], ai_active=False) if r["uid"] == 2)
    assert row["state"]["flagged"] is True


@pytest.mark.real_mail_state
async def test_with_condstore_only_the_changes(hass: HomeAssistant) -> None:
    entry, log = await _activity(hass)
    mail = MagicMock(condstore=True)
    mail.async_search_uids = AsyncMock(return_value=[])
    mail.async_status = AsyncMock(return_value={"uidvalidity": 7, "highestmodseq": 100})
    mail.async_flags = AsyncMock(return_value={1: [], 2: [], 3: []})
    state = MailState(mail, log)
    await state.async_sync()  # first look: all tracked mails
    assert mail.async_flags.await_args.args == ("INBOX", [3, 2, 1])

    mail.async_flags.reset_mock()
    await state.async_sync()  # nothing changed in the mailbox: STATUS only
    mail.async_flags.assert_not_awaited()
    assert state.changed == 0 and state.status()["mode"] == "condstore"

    mail.async_status.return_value = {"uidvalidity": 7, "highestmodseq": 105}
    mail.async_flags.return_value = {2: [SEEN], 99: [SEEN]}  # 99 is not in the activity
    await state.async_sync()  # read on the iPhone: only the changes since 100
    mail.async_flags.assert_awaited_once_with("INBOX", changed_since=100)
    assert _states(log)[2]["seen"] is True and _states(log)[1]["seen"] is False and state.changed == 1

    # renumbered mailbox, or an hour since the last full look: everything again (only that notices moved mails)
    mail.async_flags.reset_mock()
    mail.async_flags.return_value = {1: [], 2: [SEEN]}
    mail.async_status.return_value = {"uidvalidity": 8, "highestmodseq": 1}
    await state.async_sync()
    assert mail.async_flags.await_args.args == ("INBOX", [3, 2, 1]) and _states(log)[3]["gone"] is True
    mail.async_flags.reset_mock()
    mail.async_status.return_value = {"uidvalidity": 8, "highestmodseq": 2}
    with patch.object(mailstate, "FULL_EVERY", -1):
        await state.async_sync()
    assert mail.async_flags.await_args.args == ("INBOX", [2, 1, 3])  # 3 is asked about again


@pytest.mark.real_mail_state
async def test_errors_are_kept_not_raised(hass: HomeAssistant) -> None:
    from custom_components.friedafetch.mail import MailError  # noqa: PLC0415

    entry, log = await _activity(hass)
    mail = MagicMock(condstore=False)
    mail.async_flags = AsyncMock(side_effect=MailError("IMAP operation failed: timeout"))
    state = MailState(mail, log)
    await state.async_sync()
    assert state.error == "IMAP operation failed: timeout"
    mail.async_flags = AsyncMock(return_value={})
    mail.async_search_uids = AsyncMock(return_value=[])
    await state.async_sync()
    assert state.error is None


@pytest.mark.real_mail_state
async def test_a_mail_left_out_by_fetch_is_not_gone(hass: HomeAssistant) -> None:
    """A FETCH answer that leaves mails out does not remove their state; only the inbox lacking them does."""
    entry, log = await _activity(hass)
    mail = MagicMock(condstore=False)
    mail.async_flags = AsyncMock(return_value={1: [SEEN], 2: [SEEN], 3: [FLAGGED]})
    mail.async_search_uids = AsyncMock(return_value=[1, 2, 3])
    state = MailState(mail, log)
    await state.async_sync()
    mail.async_flags.return_value = {}  # an incomplete answer
    await state.async_sync()
    assert state.unconfirmed == 3 and all(s and not s["gone"] for u, s in _states(log).items() if u != 4)
    assert _states(log)[3] == {"seen": False, "flagged": True, "gone": False}


@pytest.mark.real_mail_state
async def test_a_mail_wrongly_taken_for_gone_comes_back(hass: HomeAssistant) -> None:
    entry, log = await _activity(hass)
    mail = MagicMock(condstore=False)
    mail.async_flags = AsyncMock(return_value={1: [SEEN], 2: [SEEN]})
    mail.async_search_uids = AsyncMock(return_value=[])
    state = MailState(mail, log)
    await state.async_sync()
    assert _states(log)[3]["gone"] is True
    mail.async_flags.return_value = {1: [SEEN], 2: [SEEN], 3: [SEEN]}
    await state.async_sync()
    assert _states(log)[3] == {"seen": True, "flagged": False, "gone": False}
    assert log.tracked_uids("INBOX", 10) == [3, 2, 1]


@pytest.mark.real_mail_state
async def test_a_push_during_a_look_gets_one_more_look(hass: HomeAssistant) -> None:
    import asyncio  # noqa: PLC0415

    entry, log = await _activity(hass)
    gate = asyncio.Event()
    calls = 0

    async def flags(*args: Any, **kwargs: Any) -> dict[int, list[str]]:
        nonlocal calls
        calls += 1
        if calls == 1:
            await gate.wait()
        return {1: [], 2: [], 3: [SEEN] if calls > 1 else []}

    mail = MagicMock(condstore=False)
    mail.async_flags = flags
    state = MailState(mail, log)
    first = asyncio.create_task(state.async_sync())
    await asyncio.sleep(0)
    await state.async_sync()  # comes in while the first look waits for the server
    await state.async_sync()  # two pushes: still one more look, not two
    gate.set()
    await first
    assert calls == 2 and _states(log)[3]["seen"] is True


@pytest.mark.real_mail_state
async def test_a_failing_status_falls_back_to_the_full_look(hass: HomeAssistant) -> None:
    """The counters cannot be read (a server refusing a form of SELECT): the flags are read all the same."""
    from custom_components.friedafetch.mail import MailboxNotFound  # noqa: PLC0415

    entry, log = await _activity(hass)
    mail = MagicMock(condstore=True)
    mail.async_status = AsyncMock(side_effect=MailboxNotFound("Mailbox 'INBOX' not found or cannot be opened"))
    mail.async_flags = AsyncMock(return_value={1: [SEEN], 2: [], 3: [FLAGGED]})
    state = MailState(mail, log)
    entry.runtime_data.state = state
    await state.async_sync()
    assert state.error is None and state.status()["mode"] == "flags"
    assert _states(log)[3] == {"seen": False, "flagged": True, "gone": False}
    # the push sensor shows how the look goes (numbers and times only)
    from custom_components.friedafetch_mail.sensor import PushSensor  # noqa: PLC0415

    attrs = PushSensor(entry, entry.runtime_data).extra_state_attributes
    assert attrs["state_mode"] == "flags" and attrs["state_tracked"] == 3 and attrs["state_error"] is None
