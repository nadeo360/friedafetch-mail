"""When iCloud asks to slow down: a pause for the background work instead of logging in again at once.

iCloud answers too many requests with "NO [THROTTLED]", "[LIMIT]" or by closing connections ("too many
connections"). Logging in again at once makes it worse. So the timer, the push passes and the look pause for a while
(5 minutes, doubled with every throttled answer up to an hour) and go on by themselves; mail that arrived meanwhile is
picked up by the next pass. The first throttled answer of a pause is logged once.
"""

from __future__ import annotations

import logging
import re
import time
from datetime import datetime, timedelta
from typing import Any

_LOGGER = logging.getLogger(__name__)

THROTTLED = re.compile(
    r"THROTTL|\[LIMIT\]|\[UNAVAILABLE\]|too many (simultaneous )?(connections|requests|logins)|rate.?limit|"
    r"try again later",
    re.IGNORECASE,
)
FIRST_PAUSE = 5 * 60  # seconds
MAX_PAUSE = 60 * 60


class Throttle:
    """Pause of the background work after throttled answers."""

    def __init__(self) -> None:
        self._until = 0.0
        self._pause = 0.0
        self.count = 0  # throttled answers since the last good one
        self.last: str | None = None
        self.since: str | None = None

    def note(self, error: Any) -> bool:
        """An error of a pass or look: True (and a pause) when it is iCloud asking to slow down."""
        text = str(error or "")
        if not THROTTLED.search(text):
            return False
        self._pause = min(MAX_PAUSE, self._pause * 2 if self._pause else FIRST_PAUSE)
        self._until = time.monotonic() + self._pause
        if not self.count:
            _LOGGER.warning("iCloud asks to slow down (%s): background work pauses for a while", text[:200])
            self.since = datetime.now().astimezone().isoformat(timespec="seconds")
        self.count += 1
        self.last = text[:300]
        return True

    def note_all(self, errors: Any) -> bool:
        return any([self.note(e) for e in errors or []])

    def ok(self) -> None:
        """A pass or look went through: the next throttled answer starts with the short pause again."""
        if not self.active():
            self._pause, self.count, self.since = 0.0, 0, None

    def active(self) -> bool:
        return time.monotonic() < self._until

    def until(self) -> str | None:
        if not self.active():
            return None
        left = self._until - time.monotonic()
        return (datetime.now().astimezone() + timedelta(seconds=left)).isoformat(timespec="seconds")

    def status(self) -> dict[str, Any]:
        return {
            "active": self.active(),
            "until": self.until(),
            "count": self.count,
            "since": self.since,
            "last": self.last,
        }
