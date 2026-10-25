"""Undo steps kept in Home Assistant: the panel stores only a token and a line of text ("Done today").

A token is used once: the undo bar and the list "Done today" cannot run the same step twice. Steps live in memory
for a day (a restart forgets them; the panel then says the step can no longer be undone).
"""

from __future__ import annotations

import secrets
import time
from typing import Any

MAX_STEPS = 100
TTL = 24 * 3600


class UndoBook:
    def __init__(self) -> None:
        self._steps: dict[str, dict[str, Any]] = {}

    def add(self, kind: str, data: dict[str, Any]) -> str:
        now = time.monotonic()
        for token in [t for t, s in self._steps.items() if now - s["at"] > TTL]:
            del self._steps[token]
        while len(self._steps) >= MAX_STEPS:
            del self._steps[next(iter(self._steps))]  # the oldest
        token = secrets.token_urlsafe(12)
        self._steps[token] = {"kind": kind, "data": data, "at": now}
        return token

    def take(self, token: str) -> tuple[str, dict[str, Any]] | None:
        step = self._steps.pop(token, None)
        if step is None or time.monotonic() - step["at"] > TTL:
            return None
        return step["kind"], step["data"]
