"""The state of the mails in the activity as the mailbox has it now: read or unread, flagged, still in the inbox.

You read a mail on the iPhone, flag one on the Mac: the activity shows it, like a mail program. Only lines that are
in the inbox (as far as Frieda knows) are kept current, the newest MAX_TRACKED of them.

With CONDSTORE (RFC 7162) the server keeps a change counter per mailbox (HIGHESTMODSEQ). Then one STATUS tells
whether anything changed at all, and if so the server names only the messages whose flags changed since the last
look. Without CONDSTORE the flags of the tracked messages are read in one FETCH. Every hour (and after a renumbering
of the mailbox) the full FETCH runs anyway: only it notices messages that left the inbox.
"""

from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime
from typing import Any

from custom_components.friedafetch.mail import MailboxNotFound, MailError

_LOGGER = logging.getLogger(__name__)

MAILBOX = "INBOX"
MAX_TRACKED = 500
FULL_EVERY = 3600  # seconds


def _now_iso() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


class MailState:
    """Keeps the read and flagged state of the activity's inbox lines current."""

    def __init__(self, mail: Any, activity: Any) -> None:
        self._mail = mail
        self._activity = activity
        self._lock = asyncio.Lock()
        self._modseq: int | None = None
        self._validity: int | None = None
        self._full_at = 0.0
        self.mode: str | None = None  # condstore | flags (what the last look used)
        self.last: str | None = None
        self.last_full: str | None = None
        self.changed = 0  # lines whose state changed in the last look
        self.error: str | None = None

    def status(self) -> dict[str, Any]:
        return {
            "condstore": bool(getattr(self._mail, "condstore", False)),
            "mode": self.mode,
            "last": self.last,
            "last_full": self.last_full,
            "changed": self.changed,
            "tracked": len(self._activity.tracked_uids(MAILBOX, MAX_TRACKED)),
            "error": self.error,
        }

    async def async_sync(self, *, full: bool = False) -> None:
        """One look at the inbox; a look already running covers this request."""
        if self._lock.locked():
            return
        async with self._lock:
            try:
                await self._sync(full)
                self.error = None
            except (MailError, MailboxNotFound) as err:
                self.error = str(err) or err.__class__.__name__
                _LOGGER.debug("Mail state sync failed: %s", err)
            except Exception as err:  # noqa: BLE001 - a background look must never break anything
                self.error = str(err) or err.__class__.__name__
                _LOGGER.warning("Mail state sync failed: %s", err)

    async def _sync(self, full: bool) -> None:
        uids = self._activity.tracked_uids(MAILBOX, MAX_TRACKED)
        if not uids:
            return
        condstore = bool(self._mail.condstore)
        status = await self._mail.async_status(MAILBOX) if condstore else {}
        modseq = status.get("highestmodseq")
        validity = status.get("uidvalidity")
        incremental = (
            condstore
            and not full
            and modseq is not None
            and self._modseq is not None
            and validity == self._validity
            and time.monotonic() - self._full_at < FULL_EVERY
        )
        gone: set[int] = set()
        if incremental:
            if modseq == self._modseq:
                flags: dict[int, list[str]] = {}  # nothing changed in the whole mailbox
            else:
                changed = await self._mail.async_flags(MAILBOX, changed_since=self._modseq)
                wanted = set(uids)
                flags = {uid: f for uid, f in changed.items() if uid in wanted}
        else:
            flags = await self._mail.async_flags(MAILBOX, uids)
            gone = set(uids) - set(flags)
            self._full_at = time.monotonic()
            self.last_full = _now_iso()
        self._modseq, self._validity = modseq, validity
        self.mode = "condstore" if condstore else "flags"
        self.last = _now_iso()
        self.changed = self._activity.set_state(MAILBOX, flags, gone, self.last)
