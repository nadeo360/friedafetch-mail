"""Activity: one line per message that Frieda Postfach checked, with what the rules or the AI did with it.

The run history keeps passes (and only a few mails of each); the panel's "Aktivität" tab needs every mail, also on
busy days. Each pass adds its mails here, linked by Message-ID (it survives moves, the UID does not). The AI part is
stored as it was, and overlaid with the current rating (a correction, a re-rating) when the list is read.

"Folder" is where Frieda put a message (or where it arrived), not a promise of where it is now; the panel looks the
real place up on request (locate.py).
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .const import CORE_DOMAIN
from .live import async_notify

STORAGE_VERSION = 1
MAX_ENTRIES = 3000
MAX_DAYS = 30
TRASH = "trash"  # deleted by a rule, or moved by the AI into the trash folder
TRASH_NAMES = {"deleted messages", "trash", "papierkorb", "gelöschte objekte", "deleted items"}
KINDS = ("ai", "rule", "held", "none")


def _ts(value: Any) -> float:
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).timestamp()
    except (TypeError, ValueError):
        return 0.0


def _day(value: Any) -> str:
    """The local day of an ISO time (the panel groups the list by it)."""
    try:
        return dt_util.as_local(datetime.fromisoformat(str(value).replace("Z", "+00:00"))).date().isoformat()
    except (TypeError, ValueError):
        return ""


def _folder_name(name: Any) -> str | None:
    text = str(name or "").strip()
    if not text:
        return None
    return TRASH if text.lower() in TRASH_NAMES else text


def kind_of(item: dict[str, Any]) -> str:
    """What happened to the message: a rule, the AI, the kill switch (held back), or nothing."""
    if item.get("rules"):
        return "rule"
    ai = item.get("ai") or {}
    if ai.get("held"):
        return "held"
    if ai.get("category"):
        return "ai"
    return "none"


def folder_of(item: dict[str, Any]) -> str:
    """Where Frieda put the message (a rule's or the AI's move), otherwise where it arrived."""
    if item.get("delete"):
        return TRASH
    if moved := _folder_name(item.get("move_to")):
        return moved
    for action in (item.get("ai") or {}).get("applied") or []:
        if str(action).startswith("moved:"):
            return _folder_name(str(action)[6:]) or "INBOX"
    return _folder_name(item.get("mailbox")) or "INBOX"


class ActivityLog:
    """Stores the activity of one account (newest last) and answers the panel's list requests."""

    def __init__(self, hass: HomeAssistant, entry_id: str) -> None:
        self._hass = hass
        self._entry_id = entry_id
        self._store: Store[dict[str, Any]] = Store(hass, STORAGE_VERSION, f"{CORE_DOMAIN}.activity.{entry_id}")
        self._items: list[dict[str, Any]] = []
        self._loaded = False

    async def async_load(self) -> None:
        if self._loaded:
            return
        data = await self._store.async_load() or {}
        self._items = list(data.get("items") or [])[-MAX_ENTRIES:]
        self._loaded = True

    def _data(self) -> dict[str, Any]:
        return {"items": self._items}

    def _changed(self) -> None:
        self._store.async_delay_save(self._data, 2)
        async_notify(self._hass, self._entry_id, "activity")

    @property
    def items(self) -> list[dict[str, Any]]:
        return self._items

    # ------------------------------------------------------------ writing
    def add_pass(self, trigger: str, time: str, mails: list[dict[str, Any]]) -> None:
        """Add the messages of one pass (entries of rules._handled_mails); known messages are updated."""
        if not self._loaded or not mails:
            return
        index = {self._key(i): i for i in self._items}
        for mail in mails:
            key = self._key(mail)
            if key is None:
                continue
            item = index.get(key)
            if item is None:
                item = {
                    "key": key,
                    "message_id": mail.get("message_id"),
                    "mailbox": mail.get("mailbox") or "INBOX",
                    "uid": mail.get("uid"),
                    "subject": str(mail.get("subject") or "")[:200],
                    "from": str(mail.get("from") or "")[:200],
                    "name": str(mail.get("name") or "")[:120] or None,
                    "date": mail.get("date"),
                    "time": time,
                    "trigger": trigger,
                    "rules": [],
                    "move_to": None,
                    "delete": False,
                    "seen": None,
                    "flag": None,
                    "ai": None,
                }
                self._items.append(item)
                index[key] = item
            item["updated"] = time
            for k in ("message_id", "date", "name"):
                if mail.get(k) and not item.get(k):
                    item[k] = str(mail[k])[:300]
            for rule in mail.get("rules") or []:
                if rule not in item["rules"]:
                    item["rules"].append(rule)
            for k in ("move_to", "seen", "flag"):
                if mail.get(k) is not None:
                    item[k] = mail[k]
            if mail.get("delete"):
                item["delete"] = True
            if mail.get("ai"):
                item["ai"] = {k: mail["ai"].get(k) for k in ("category", "importance", "applied", "held")}
        self._prune()
        self._changed()

    def _prune(self) -> None:
        cutoff = (dt_util.now() - timedelta(days=MAX_DAYS)).timestamp()
        self._items = [i for i in self._items if _ts(i.get("time")) >= cutoff][-MAX_ENTRIES:]

    async def async_clear(self) -> None:
        await self.async_load()
        self._items = []
        await self._store.async_save(self._data())
        async_notify(self._hass, self._entry_id, "activity")

    @staticmethod
    def _key(mail: dict[str, Any]) -> str | None:
        if mail.get("message_id"):
            return str(mail["message_id"])
        if mail.get("uid") is None:
            return None
        return f"{mail.get('mailbox') or 'INBOX'}:{mail['uid']}"

    # ------------------------------------------------------------ reading
    def view(self, ratings: list[dict[str, Any]], *, ai_active: bool) -> list[dict[str, Any]]:
        """All entries newest first, with what the panel needs: kind, folder, the current rating, selectable."""
        by_mid = {r["message_id"]: r for r in ratings if r.get("message_id")}
        by_uid = {(r.get("mailbox"), r.get("uid")): r for r in ratings}
        out = []
        for item in sorted(self._items, key=lambda i: _ts(i.get("time")), reverse=True):
            row = dict(item)
            rating = by_mid.get(item.get("message_id")) or by_uid.get((item.get("mailbox"), item.get("uid")))
            ai = dict(item.get("ai") or {})
            if rating is not None and not ai.get("held"):
                # the rating as it is now: a correction or a re-rating since the pass
                ai.update(
                    category=rating.get("corrected") or rating.get("category"),
                    importance=rating.get("importance"),
                    applied=list(rating.get("applied") or []),
                )
                row["rating_id"] = rating.get("id")
                row["corrected"] = bool(rating.get("corrected"))
                row["name"] = row.get("name") or rating.get("from")
            row["ai"] = ai or None
            row["kind"] = kind_of(row)
            row["folder"] = folder_of(row)
            row["day"] = _day(item.get("time"))
            row["selectable"] = bool(ai_active and row.get("message_id") and row["kind"] != "rule")
            out.append(row)
        return out


def matches(row: dict[str, Any], view: str, query: str) -> bool:
    """view: all | k:<kind> | f:<folder>; query: words in subject, sender, category or rule."""
    if view.startswith("k:") and row["kind"] != view[2:]:
        return False
    if view.startswith("f:") and row["folder"] != view[2:]:
        return False
    if not query:
        return True
    hay = " ".join(
        str(x or "")
        for x in (row.get("subject"), row.get("from"), row.get("name"), (row.get("ai") or {}).get("category"))
    ).lower()
    hay += " " + " ".join(row.get("rules") or []).lower()
    return all(word in hay for word in query.lower().split())


def summarize(rows: list[dict[str, Any]], view: str, query: str, offset: int, limit: int) -> dict[str, Any]:
    """One page of the filtered list, its size, the days in it, and the counts for the views."""
    kinds = dict.fromkeys(KINDS, 0)
    folders: dict[str, int] = {}
    for row in rows:
        kinds[row["kind"]] += 1
        folders[row["folder"]] = folders.get(row["folder"], 0) + 1
    hits = [r for r in rows if matches(r, view, query)]
    days: dict[str, dict[str, int]] = {}
    for row in hits:
        day = days.setdefault(row["day"], {"total": 0, "selectable": 0})
        day["total"] += 1
        day["selectable"] += int(row["selectable"])
    return {
        "items": hits[offset : offset + limit],
        "total": len(hits),
        "selectable": sum(1 for r in hits if r["selectable"]),
        "days": [{"day": d, **v} for d, v in days.items()],
        "counts": {"all": len(rows), "kinds": kinds, "folders": folders},
    }
