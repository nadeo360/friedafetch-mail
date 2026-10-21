"""The state of the mails in the activity as the mailbox has it now: read or unread, flagged, and in which folder.

You read a mail on the iPhone, flag one on the Mac, move one to the archive: the activity shows it, like a mail
program. Each line remembers where its message is now (folder and UID). The newest MAX_TRACKED of them are kept
current, folder by folder.

With CONDSTORE (RFC 7162) the server keeps a change counter per folder (HIGHESTMODSEQ). Then one STATUS tells whether
anything changed in a folder at all, and if so the server names only the messages whose flags changed since the last
look. Without CONDSTORE the flags of the tracked messages of a folder are read in one FETCH. Every hour (and after a
folder was renumbered) the full FETCH runs anyway: only it notices messages that left a folder.

A message counts as gone from a folder only when a second question (UID SEARCH) confirms it – a FETCH answer that
leaves messages out is not enough. A gone message is then looked for by its Message-ID (locate.py: the folders Frieda
knows of first, the trash last), MAX_LOCATE per look, and followed into its new folder. One found nowhere (deleted
for good) is looked for again after a day. Lines keep their last state meanwhile: flags travel with a moved mail.
"""

from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime
from typing import Any

from custom_components.friedafetch.mail import MailboxNotFound, MailError

from .locate import async_locate

_LOGGER = logging.getLogger(__name__)

MAX_TRACKED = 500
MAX_LOCATE = 10  # messages looked for by Message-ID per look (each may search several folders)
SEARCH_AGAIN = 24 * 3600  # seconds until a message found nowhere is looked for again
FULL_EVERY = 3600  # seconds
FULL_EVERY_QRESYNC = 6 * 3600  # with QRESYNC the server names the messages that left a folder itself


def _now_iso() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


class MailState:
    """Keeps the read / flagged state and the folder of the activity's lines current."""

    def __init__(self, mail: Any, activity: Any, guard: Any | None = None) -> None:
        self._mail = mail
        self._activity = activity
        self._guard = guard
        self._lock = asyncio.Lock()
        self.mode: str | None = None  # qresync | condstore | flags (what the last look used)
        self.last: str | None = None
        self.last_full: str | None = None
        self.changed = 0  # lines whose state changed in the last look
        self.located = 0  # messages found in another folder in the last look
        self.error: str | None = None
        self._again = False
        self.on_request: Any | None = None  # () -> None: schedules a look in the background (set up in __init__)

    def request(self) -> None:
        """A look soon, in the background (after an action from the panel)."""
        if self.on_request is not None:
            self.on_request()

    @property
    def unconfirmed(self) -> int:
        """Messages the last full FETCH left out although the folder still has them (kept, not taken for gone)."""
        return sum(m.get("unconfirmed", 0) for m in self._activity.sync_memory.values())

    def status(self) -> dict[str, Any]:
        tracked = self._activity.tracked(MAX_TRACKED)
        return {
            "condstore": bool(getattr(self._mail, "condstore", False)),
            "qresync": bool(getattr(self._mail, "qresync", False)),
            "mode": self.mode,
            "last": self.last,
            "last_full": self.last_full,
            "changed": self.changed,
            "tracked": sum(len(uids) for uids in tracked.values()),
            "folders": len(tracked),
            "gone": len(self._activity.lost(MAX_TRACKED, 0)),  # not in any folder Frieda knows of (yet)
            "located": self.located,
            "unconfirmed": self.unconfirmed,
            "error": self.error,
        }

    async def async_sync(self, *, full: bool = False) -> None:
        """One look. A request while a look runs is not lost: one more look follows it."""
        if self._lock.locked():
            self._again = True
            return
        async with self._lock:
            try:
                await self._sync(full)
                while self._again:  # a push came in meanwhile (another mail read on the iPhone)
                    self._again = False
                    await self._sync(False)
                self.error = None
            except Exception as err:  # noqa: BLE001 - a background look must never break anything
                error = str(err) or err.__class__.__name__
                if error != self.error:  # once per kind of failure, so it shows in the log without flooding it
                    _LOGGER.warning("Read/flagged look at the mailbox failed: %s", error)
                self.error = error

    async def _sync(self, full: bool) -> None:
        now = _now_iso()
        changed = 0
        modes: set[str] = set()
        for mailbox, uids in self._activity.tracked(MAX_TRACKED).items():
            changed += await self._look(mailbox, uids, full, now, modes)
        # messages that left their folder (or were moved by a rule or the AI): found by Message-ID and followed
        self.located = 0
        found: dict[str, list[int]] = {}
        for line in self._activity.lost(MAX_LOCATE, SEARCH_AGAIN):
            where = await async_locate(self._mail, self._guard, line["message_id"], line["hints"])
            mailbox, uid = (where["mailbox"], where.get("uid")) if where["found"] else (None, None)
            changed += self._activity.set_location(line["key"], mailbox, uid, now)
            if mailbox and uid is not None:
                found.setdefault(mailbox, []).append(int(uid))
                self.located += 1
        for mailbox, uids in found.items():
            changed += self._activity.set_state(mailbox, await self._mail.async_flags(mailbox, uids), set(), now)
        self.mode = next((m for m in ("qresync", "condstore", "flags") if m in modes), self.mode)
        self.last = now
        self.changed = changed

    async def _look(self, mailbox: str, uids: list[int], full: bool, now: str, modes: set[str]) -> int:
        """One folder: only the changes (CONDSTORE), or the flags of all its tracked messages."""
        memory = self._activity.sync_memory.setdefault(mailbox, {"modseq": None, "validity": None, "full_at": 0.0})
        condstore = bool(self._mail.condstore)
        status: dict[str, int] = {}
        if condstore:
            try:
                status = await self._mail.async_status(mailbox)
            except (MailError, MailboxNotFound) as err:
                # no counters this time: read all tracked flags instead of only the changes
                _LOGGER.debug("Mail state: STATUS of %s failed, full look instead: %s", mailbox, err)
                condstore = False
        modseq, validity = status.get("highestmodseq"), status.get("uidvalidity")
        qresync = condstore and bool(getattr(self._mail, "qresync", False))  # known once connected
        incremental = (
            condstore
            and not full
            and modseq is not None
            and memory["modseq"] is not None
            and validity == memory["validity"]
            and time.time() - memory["full_at"] < (FULL_EVERY_QRESYNC if qresync else FULL_EVERY)
        )
        gone: set[int] = set()
        if incremental:
            wanted = set(uids)
            if modseq == memory["modseq"]:
                flags: dict[int, list[str]] = {}  # nothing changed in the whole folder
            elif qresync:
                changes, gone = await self._mail.async_changes(mailbox, memory["modseq"], uids)
                flags = {uid: f for uid, f in changes.items() if uid in wanted}
            else:
                changes = await self._mail.async_flags(mailbox, changed_since=memory["modseq"])
                flags = {uid: f for uid, f in changes.items() if uid in wanted}
        else:
            flags = await self._mail.async_flags(mailbox, uids)
            missing = set(uids) - set(flags)
            memory["unconfirmed"] = 0
            if missing:
                # confirmed by a second question: only what the folder really lacks is gone
                still = set(await self._mail.async_search_uids(mailbox, ["UID", ",".join(map(str, sorted(missing)))]))
                gone = missing - still
                memory["unconfirmed"] = len(missing & still)
                if memory["unconfirmed"]:
                    _LOGGER.warning(
                        "Mail state: FETCH left out %s of %s messages that %s still has (kept)",
                        memory["unconfirmed"],
                        len(uids),
                        mailbox,
                    )
            memory["full_at"] = time.time()
            self.last_full = now
        memory.update(modseq=modseq, validity=validity)
        self._activity.save_sync()
        modes.add("qresync" if qresync else "condstore" if condstore else "flags")
        changed = self._activity.set_state(mailbox, flags, gone, now)
        _LOGGER.debug(
            "Mail state %s (%s, %s): %s tracked, %s answered, %s changed, %s gone",
            mailbox,
            "condstore" if condstore else "flags",
            "changes" if incremental else "full",
            len(uids),
            len(flags),
            changed,
            len(gone),
        )
        return changed
