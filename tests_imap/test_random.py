"""Random walks against the real server: another mail program changes mails at random, Frieda looks and acts.

After every look the activity must show what the server really has: for each line the folder and UID of its message
and whether it is read and flagged – or that it is gone, when the account no longer has it. The truth is read with a
second, independent client (imaplib) and compared line by line.

What the walk does: read, unread, flag, unflag, move (also into a folder created meanwhile, with an umlaut), copy,
delete for good, the trash, a folder emptied and created again (new UIDVALIDITY), new mail; Frieda's own actions from
the panel; connections that break off. Each walk runs with QRESYNC, with CONDSTORE only and without either.

A failure names the seed and the mode; this repeats it:

    RANDOM_SEED=<seed> RANDOM_MODE=<mode> pytest tests_imap/test_random.py

RANDOM_WALKS and RANDOM_STEPS make the walks more and longer (locally, before a release that touches the look).
"""

from __future__ import annotations

import os
import random
from types import SimpleNamespace
from typing import Any

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util

from custom_components.friedafetch.mail import ICloudMail, decode_utf7, encode_utf7
from custom_components.friedafetch_mail.actions import async_act
from custom_components.friedafetch_mail.activity import ActivityLog
from custom_components.friedafetch_mail.mailstate import MAX_LOCATE, MailState

MODES = ("qresync", "condstore", "flags")
WALKS = int(os.environ.get("RANDOM_WALKS", "4"))
STEPS = int(os.environ.get("RANDOM_STEPS", "40"))
MAX_LINES = MAX_LOCATE - 2  # every line that left its folder is found again in one look
TRASH = "Deleted Messages"
NEW_FOLDERS = ("Rechnungen", "Verträge", "Reisen/2026")

if os.environ.get("RANDOM_SEED"):
    WALK_PARAMS = [(int(os.environ["RANDOM_SEED"]), os.environ.get("RANDOM_MODE", "qresync"))]
else:
    WALK_PARAMS = [(seed, mode) for mode in MODES for seed in range(WALKS)]


def _without(*names: str) -> Any:
    """A server that does not offer these capabilities (CONDSTORE, QRESYNC): Frieda's other ways of looking."""
    real = ICloudMail._learn_capabilities

    async def learn(self: ICloudMail, client: Any) -> None:
        await real(self, client)
        self._shared["capabilities"] = [c for c in self._shared["capabilities"] if c not in names]

    return learn


class Walk:
    def __init__(self, rnd: random.Random, device: Any, mail: Any, log: ActivityLog, state: MailState) -> None:
        self.rnd = rnd
        self.device = device
        self.mail = mail
        self.log = log
        self.state = state
        self.steps: list[str] = []
        self.count = 0
        self.folders = ["INBOX", "Archive", TRASH]  # as the server names them (modified UTF-7)

    def note(self, text: str) -> None:
        self.steps.append(text)

    def place(self) -> tuple[str, str, int] | None:
        """A random message of a line, where it really is now."""
        truth = self.device.messages()
        keys = [i["message_id"] for i in self.log.items if truth.get(i["message_id"])]
        if not keys:
            return None
        mid = self.rnd.choice(keys)
        folder, uid, _ = self.rnd.choice(truth[mid])
        return mid, folder, uid

    def new_line(self) -> None:
        self.count += 1
        mid = f"<w{self.count}@example.com>"
        flags = self.rnd.choice(["", "\\Seen", "\\Flagged", "\\Seen \\Flagged"])
        uid = self.device.append("INBOX", mid, subject=f"Mail {self.count}", flags=flags)
        line = {
            "subject": f"Mail {self.count}",
            "from": "anna@example.com",
            "mailbox": "INBOX",
            "uid": uid,
            "message_id": mid,
            "rules": [],
            "move_to": None,
            "delete": False,
            "seen": None,
            "flag": None,
        }
        self.log.add_pass("push", dt_util.now().isoformat(timespec="seconds"), [line])
        self.note(f"new {mid} INBOX/{uid} ({flags})")

    async def step(self) -> None:
        kind = self.rnd.choices(
            ["new", "noise", "flags", "move", "copy", "delete", "folder", "recreate", "act", "break", "look"],
            weights=[2 if len(self.log.items) < MAX_LINES else 0, 1, 5, 4, 1, 1, 1, 1, 3, 1, 3],
        )[0]
        if kind == "new":
            self.new_line()
            return
        if kind == "noise":  # mail that is not in the activity
            self.device.append(self.rnd.choice(self.folders), f"<n{self.rnd.random()}@example.com>")
            self.note("noise")
            return
        if kind == "folder":
            free = [encode_utf7(f) for f in NEW_FOLDERS if encode_utf7(f) not in self.folders]
            if free:
                name = self.rnd.choice(free)
                self.device.create(name)
                self.folders.append(name)
                self.note(f"create {decode_utf7(name)}")
            return
        if kind == "recreate":
            await self.recreate()
            return
        if kind == "act":
            await self.act()
            return
        if kind == "break":
            client = self.mail._client  # noqa: SLF001 - the connection breaks off as a server or network does
            if client is not None and client.protocol.transport is not None:
                client.protocol.transport.abort()
                self.note("connection broken off")
            return
        if kind == "look":
            await self.look(full=self.rnd.random() < 0.3)
            return
        picked = self.place()
        if picked is None:
            return
        mid, folder, uid = picked
        if kind == "flags":
            flag = self.rnd.choice(["\\Seen", "\\Flagged"])
            add = self.rnd.random() < 0.5
            self.device.flags(folder, uid, **{"add" if add else "remove": flag})
            self.note(f"{'+' if add else '-'}{flag} {mid} {decode_utf7(folder)}/{uid}")
        elif kind == "move":
            target = self.rnd.choice([f for f in self.folders if f != folder])
            new = self.device.move(folder, uid, target)
            self.note(f"move {mid} {decode_utf7(folder)}/{uid} -> {decode_utf7(target)}/{new}")
        elif kind == "copy":
            target = self.rnd.choice([f for f in self.folders if f != folder])
            self.device.copy(folder, uid, target)
            self.note(f"copy {mid} {decode_utf7(folder)}/{uid} -> {decode_utf7(target)}")
        elif kind == "delete":
            self.device.delete(folder, uid)
            self.note(f"delete for good {mid} {decode_utf7(folder)}/{uid}")

    async def recreate(self) -> None:
        """A folder emptied and created again (or restored from a backup): same mails, new UIDs, new UIDVALIDITY."""
        folder = self.rnd.choice([f for f in self.folders if f not in ("INBOX", TRASH)])
        truth = self.device.messages()
        inside = sorted((uid, mid) for mid, places in truth.items() for f, uid, _ in places if f == folder)
        self.device.create("Zwischenablage")
        for uid, _ in inside:
            self.device.move(folder, uid, "Zwischenablage")
        self.device.remove(folder)
        self.device.create(folder)
        moved = self.device.messages()
        for uid in sorted(u for places in moved.values() for f, u, _ in places if f == "Zwischenablage"):
            self.device.move("Zwischenablage", uid, folder)
        self.device.remove("Zwischenablage")
        self.note(f"recreate {decode_utf7(folder)} ({len(inside)} mails)")

    async def act(self) -> None:
        """An action from the panel on one or two lines."""
        keys = self.rnd.sample([i["key"] for i in self.log.items], k=min(len(self.log.items), self.rnd.choice([1, 2])))
        if not keys:
            return
        action = self.rnd.choice(["seen", "unseen", "flag", "unflag", "archive", "inbox", "trash"])
        link = SimpleNamespace(
            activity=self.log,
            mail=self.mail,
            clients=SimpleNamespace(guard=None, audit=None, mail=self.mail),
            state=None,
        )
        out = await async_act(link, keys, action, read_only=False, allow_delete=True)
        self.note(f"act {action} {keys} -> done {out['done']}, skipped {out['skipped']}, failed {out['failed']}")

    async def look(self, *, full: bool) -> None:
        await self.state.async_sync(full=full)
        self.note(f"look{' (full)' if full else ''}: mode {self.state.mode}, error {self.state.error}")

    def check(self, *, strict: bool) -> list[str]:
        """What the activity shows that the server does not have. strict=False: only lines Frieda has in place."""
        truth = self.device.messages()
        wrong = []
        for item in self.log.items:
            mid = item["message_id"]
            shown = item.get("state") or {}
            places = [(decode_utf7(f), uid, flags) for f, uid, flags in truth.get(mid, [])]
            here = next((p for p in places if (p[0], p[1]) == (shown.get("mailbox"), shown.get("uid"))), None)
            if here is None:
                if not strict:
                    continue
                if not places and shown.get("gone") and shown.get("mailbox") is None:
                    continue
                wrong.append(f"{mid}: shown in {shown.get('mailbox')}/{shown.get('uid')}, really {places or 'gone'}")
                continue
            seen, flagged = "\\Seen" in here[2], "\\Flagged" in here[2]
            if (shown.get("seen"), shown.get("flagged"), bool(shown.get("gone"))) != (seen, flagged, False):
                wrong.append(
                    f"{mid} in {here[0]}/{here[1]}: shown seen={shown.get('seen')} flagged={shown.get('flagged')}"
                    f" gone={shown.get('gone')}, really seen={seen} flagged={flagged}"
                )
        return wrong


@pytest.mark.parametrize(("seed", "mode"), WALK_PARAMS, ids=[f"{m}-{s}" for s, m in WALK_PARAMS])
async def test_random_walk(
    hass: HomeAssistant,
    account: dict[str, Any],
    mail: Any,
    monkeypatch: pytest.MonkeyPatch,
    seed: int,
    mode: str,
) -> None:
    if mode == "condstore":
        monkeypatch.setattr(ICloudMail, "_learn_capabilities", _without("QRESYNC"))
    elif mode == "flags":
        monkeypatch.setattr(ICloudMail, "_learn_capabilities", _without("QRESYNC", "CONDSTORE"))
    log = ActivityLog(hass, f"walk{seed}{mode}")
    await log.async_load()
    walk = Walk(random.Random(seed), account["device"], mail, log, MailState(mail, log))  # noqa: S311 - repeatable
    for _ in range(3):
        walk.new_line()
    await walk.look(full=False)

    for number in range(STEPS):
        await walk.step()
        if walk.steps[-1:] and walk.steps[-1].startswith("look"):
            # without QRESYNC an incremental look does not notice messages that left a folder (the full one does)
            full = "(full)" in walk.steps[-1] or mode != "condstore"
            wrong = walk.check(strict=full)
            assert not wrong, _report(seed, mode, number, walk, wrong)
            assert walk.state.error is None, _report(seed, mode, number, walk, [walk.state.error])
    await walk.look(full=True)
    wrong = walk.check(strict=True)
    assert not wrong, _report(seed, mode, STEPS, walk, wrong)
    assert walk.state.error is None, _report(seed, mode, STEPS, walk, [walk.state.error])


def _report(seed: int, mode: str, number: int, walk: Walk, wrong: list[str]) -> str:
    return (
        f"seed {seed}, mode {mode}, step {number}: RANDOM_SEED={seed} RANDOM_MODE={mode} repeats it\n"
        + "\n".join(f"  {w}" for w in wrong)
        + "\nsteps:\n"
        + "\n".join(f"  {s}" for s in walk.steps)
    )
