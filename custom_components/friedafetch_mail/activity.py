"""Activity: one line per message that Frieda Postfach checked, with what the rules or the AI did with it.

The run history keeps passes (and only a few mails of each); the panel's "Aktivität" tab needs every mail, also on
busy days. Each pass adds its mails here, linked by Message-ID (it survives moves, the UID does not). The AI part is
stored as it was, and overlaid with the current rating (a correction, a re-rating) when the list is read.

"Folder" is where Frieda put a message (or where it arrived), not a promise of where it is now; the panel looks the
real place up on request (locate.py).

Every line also keeps the steps of its message ("events": checked by the rules, sent to or held back from the AI,
rated, its actions, your corrections), written when they happen. The timeline reads them from here, so it stays
complete when the run history or the AI log have long moved on. Steps that come before the pass that adds the line
(the AI rates first, the pass is recorded after it) wait in memory until then.
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
MAX_EVENTS = 25  # steps per message; a busy one keeps its newest
MAX_PENDING = 500  # messages whose steps wait for their line


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
        self._backfilled = False  # the list was filled once from what was kept before it existed
        self._events_filled = False  # the lines of 1.0.23 and older got their steps from what was kept
        self._sync: dict[str, dict[str, Any]] = {}  # mailstate.py: per folder its modseq, validity, last full look
        self._pending: dict[str, list[dict[str, Any]]] = {}

    async def async_load(self) -> None:
        if self._loaded:
            return
        data = await self._store.async_load() or {}
        self._items = list(data.get("items") or [])[-MAX_ENTRIES:]
        self._backfilled = bool(data.get("backfilled"))
        self._events_filled = bool(data.get("events_filled"))
        self._sync = dict(data.get("sync") or {})
        self._loaded = True

    def _data(self) -> dict[str, Any]:
        return {
            "items": self._items,
            "backfilled": self._backfilled,
            "events_filled": self._events_filled,
            "sync": self._sync,
        }

    def _changed(self) -> None:
        self._store.async_delay_save(self._data, 2)
        async_notify(self._hass, self._entry_id, "activity")

    @property
    def items(self) -> list[dict[str, Any]]:
        return self._items

    @property
    def sync_memory(self) -> dict[str, dict[str, Any]]:
        """What the read/flagged look keeps per folder; kept over restarts (save_sync)."""
        return self._sync

    def save_sync(self) -> None:
        self._store.async_delay_save(self._data, 10)  # no panel refresh: nothing it shows changed

    # ------------------------------------------------------------ writing
    def find(self, mail: dict[str, Any]) -> dict[str, Any] | None:
        """The line of a message: by Message-ID, else by folder and UID."""
        key = self._key(mail)
        uid = (mail.get("mailbox") or "INBOX", mail.get("uid"))
        for item in reversed(self._items):
            if (key is not None and item.get("key") == key) or (
                mail.get("uid") is not None and (item.get("mailbox"), item.get("uid")) == uid
            ):
                return item
        return None

    def where(self, item: dict[str, Any]) -> tuple[str, int] | None:
        """Folder and UID of a line's message as last seen, or None while it has to be found (by Message-ID).

        Before the first look a message is where Frieda saw it, unless a rule or the AI moved it (then the old UID is
        no use). Lines of 1.0.25–1.0.27 kept no folder: the same holds for them unless they were taken for gone.
        """
        state = item.get("state") or {}
        if "mailbox" in state:
            return (state["mailbox"], int(state["uid"])) if state["mailbox"] and state.get("uid") is not None else None
        if state.get("gone") or item.get("uid") is None:
            return None
        box = item.get("mailbox") or "INBOX"
        return (box, int(item["uid"])) if folder_of(item) == (_folder_name(box) or "INBOX") else None

    def _newest(self) -> list[dict[str, Any]]:
        return sorted(self._items, key=lambda i: (_ts(i.get("time")), i.get("uid") or 0), reverse=True)

    def tracked(self, limit: int) -> dict[str, list[int]]:
        """UIDs per folder of the newest lines whose message has a known place (for mailstate.py)."""
        out: dict[str, list[int]] = {}
        count = 0
        for item in self._newest():
            if count >= limit:
                break
            if (place := self.where(item)) is not None:
                out.setdefault(place[0], []).append(place[1])
                count += 1
        return out

    def lost(self, limit: int, retry_after: float) -> list[dict[str, Any]]:
        """Newest lines whose message has to be found by its Message-ID (moved since, or never looked for).

        A message not found anywhere is looked for again after retry_after seconds (it may come back from the trash).
        """
        cutoff = dt_util.now().timestamp() - retry_after
        out: list[dict[str, Any]] = []
        for item in self._newest():
            if len(out) >= limit:
                break
            state = item.get("state") or {}
            if not item.get("message_id") or self.where(item) is not None:
                continue
            if state.get("searched") and _ts(state["searched"]) > cutoff:
                continue
            hints = [state.get("last_mailbox"), folder_of(item), item.get("mailbox")]
            out.append({"key": item["key"], "message_id": item["message_id"], "hints": [h for h in hints if h]})
        return out

    def _state(self, item: dict[str, Any], **changes: Any) -> bool:
        """Update a line's state; True if what the panel shows changed."""
        old = item.get("state") or {}
        new = {
            "seen": old.get("seen"),
            "flagged": old.get("flagged"),
            "gone": bool(old.get("gone")),
            "mailbox": old.get("mailbox"),
            "uid": old.get("uid"),
            "searched": old.get("searched"),
            **({"last_mailbox": old["last_mailbox"]} if old.get("last_mailbox") else {}),
            **changes,
        }
        item["state"] = new
        keys = ("seen", "flagged", "gone", "mailbox")
        return any(old.get(k) != new.get(k) for k in keys)

    def set_state(self, mailbox: str, flags: dict[int, list[str]], gone: set[int], time: str) -> int:
        """The flags a folder reported (read, flagged) and the messages it no longer has; returns the changes."""
        changed = 0
        for item in self._items:
            place = self.where(item)
            if place is None or place[0] != mailbox or (place[1] not in flags and place[1] not in gone):
                continue
            if place[1] in gone:
                # left the folder: found again by its Message-ID (soon, it has not been looked for yet)
                changed += self._state(
                    item, gone=True, mailbox=None, uid=None, searched=None, last_mailbox=mailbox, checked=time
                )
            else:
                names = {f.lower() for f in flags[place[1]]}
                changed += self._state(
                    item,
                    seen="\\seen" in names,
                    flagged="\\flagged" in names,
                    gone=False,
                    mailbox=mailbox,
                    uid=place[1],
                    checked=time,
                )
        if changed:
            self._changed()
        return changed

    def moved(self, key: str, target: str, time: str) -> None:
        """Moved by Frieda (an action from the panel): its UID there is found in the next look, starting there."""
        item = next((i for i in self._items if i.get("key") == key), None)
        if item is not None:
            self._state(item, gone=True, mailbox=None, uid=None, searched=None, last_mailbox=target, checked=time)
            self._changed()

    def set_location(self, key: str, mailbox: str | None, uid: int | None, time: str) -> bool:
        """Where a message was found by its Message-ID (or that it was found nowhere)."""
        item = next((i for i in self._items if i.get("key") == key), None)
        if item is None:
            return False
        if mailbox and uid is not None:
            changed = self._state(item, gone=False, mailbox=mailbox, uid=int(uid), searched=None, checked=time)
        else:
            changed = self._state(item, gone=True, mailbox=None, uid=None, searched=time, checked=time)
        if changed:
            self._changed()
        return changed

    def add_event(self, mail: dict[str, Any], event: dict[str, Any]) -> None:
        """Note one step of a message (mail: message_id, or mailbox and uid). Waits for its line if there is none."""
        key = self._key(mail)
        if not self._loaded or key is None:
            return
        item = self.find(mail)
        if item is None:
            self._pending.setdefault(key, []).append(event)
            while len(self._pending) > MAX_PENDING:
                self._pending.pop(next(iter(self._pending)))
            return
        _append(item, event)
        self._changed()

    def add_pass(self, trigger: str, time: str, mails: list[dict[str, Any]], *, record: bool = True) -> None:
        """Add the messages of one pass (entries of rules.handled_mails); known messages are updated.

        record: the pass is a step of each message (not when the list is filled from ratings or held mails).
        """
        if not self._loaded or not mails:
            return
        index = {self._key(i): i for i in self._items}
        by_uid = {(i.get("mailbox"), i.get("uid")): i for i in self._items if i.get("uid") is not None}
        for mail in mails:
            key = self._key(mail)
            if key is None:
                continue
            item = index.get(key)
            if item is None and mail.get("uid") is not None:
                # the same message seen before without its Message-ID (older entries): one line, not two
                item = by_uid.get((mail.get("mailbox") or "INBOX", mail.get("uid")))
                if item is not None and not item.get("message_id") and mail.get("message_id"):
                    index.pop(item["key"], None)
                    item["key"] = key
                    index[key] = item
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
                if item["uid"] is not None:
                    by_uid[(item["mailbox"], item["uid"])] = item
            item["updated"] = time
            if mail.get("events") and not item.get("events"):  # a line carried over (backfill)
                item["events"] = list(mail["events"])
            for event in self._pending.pop(key, []):
                _append(item, event)
            if record:
                _append(
                    item,
                    {
                        "time": time,
                        "kind": "checked",
                        "trigger": trigger,
                        "rules": list(mail.get("rules") or []),
                        "move_to": mail.get("move_to"),
                        "delete": bool(mail.get("delete")),
                        "seen": mail.get("seen"),
                        "flag": mail.get("flag"),
                        "count": 1,
                    },
                )
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
                item["ai"] = {k: mail["ai"].get(k) for k in ("category", "importance", "confidence", "applied", "held")}
        self._prune()
        self._changed()

    def backfill(
        self, history: list[dict[str, Any]], ratings: list[dict[str, Any]], usage_log: list[dict[str, Any]]
    ) -> bool:
        """Once, after the update that brought the list: start it with what was kept already.

        The run history (its mails), the AI ratings and the mails the kill switch held back go in, oldest first and
        merged by Message-ID. Returns whether anything was done.
        """
        if not self._loaded or self._backfilled:
            return False
        newest = list(self._items)  # passes since the update: they stay the newest entries
        self._items = []
        for run in sorted(history, key=lambda r: _ts(r.get("started"))):
            self.add_pass(
                str(run.get("trigger") or "auto"), str(run.get("started") or ""), list(run.get("mails") or [])
            )
        for rating in sorted(ratings, key=lambda r: _ts(r.get("time"))):
            mail = {
                "message_id": rating.get("message_id"),
                "mailbox": rating.get("mailbox") or "INBOX",
                "uid": rating.get("uid"),
                "subject": rating.get("subject"),
                "from": "",
                "name": rating.get("from"),
                "date": rating.get("date"),
                "ai": {
                    "category": rating.get("category"),
                    "importance": rating.get("importance"),
                    "applied": list(rating.get("applied") or []),
                    "held": None,
                },
            }
            self.add_pass("auto", str(rating.get("time") or ""), [mail], record=False)
        for entry in sorted(usage_log, key=lambda e: _ts(e.get("time"))):
            if entry.get("kind", "sort") != "sort" or entry.get("sent") is not False or not entry.get("message_id"):
                continue
            held = sorted({str(r.get("type")) for r in entry.get("held_back") or [] if isinstance(r, dict)}) or ["term"]
            mail = {
                "message_id": entry["message_id"],
                "mailbox": "INBOX",
                "subject": entry.get("subject"),
                "from": entry.get("sender"),
                "ai": {"held": held},
            }
            self.add_pass(str(entry.get("trigger") or "auto"), str(entry.get("time") or ""), [mail], record=False)
        for item in newest:
            self.add_pass(item.get("trigger") or "auto", item.get("time") or "", [item], record=False)
        self._backfilled = True
        self._prune()
        self._changed()
        return True

    def fill_events(
        self, history: list[dict[str, Any]], ratings: list[dict[str, Any]], usage_log: list[dict[str, Any]]
    ) -> bool:
        """Once, for lines from before the steps were kept (1.0.23 and older): their steps from what is still kept."""
        from .timeline import build_timeline  # noqa: PLC0415

        if not self._loaded or self._events_filled:
            return False
        runs: dict[str, list[dict[str, Any]]] = {}
        for run in history:
            for mail in run.get("mails") or []:
                if (key := self._key(mail)) is not None:
                    runs.setdefault(key, []).append({**run, "mails": [{**mail, "message_id": key}]})
        rated: dict[str, list[dict[str, Any]]] = {}
        for rating in ratings:
            if (key := self._key(rating)) is not None:
                rated.setdefault(key, []).append({**rating, "message_id": key})
        logged: dict[str, list[dict[str, Any]]] = {}
        for entry in usage_log:
            if entry.get("message_id"):
                logged.setdefault(str(entry["message_id"]), []).append(entry)
        for item in self._items:
            if item.get("events"):
                continue
            key = item["key"]
            found = build_timeline(runs.get(key, []), rated.get(key, []), logged.get(key, []), message_id=key)
            events = [e for e in found["events"] if e["kind"] != "received"]
            item["events"] = events[-MAX_EVENTS:]
        self._events_filled = True
        self._changed()
        return True

    def _prune(self) -> None:
        cutoff = (dt_util.now() - timedelta(days=MAX_DAYS)).timestamp()
        self._items = [i for i in self._items if _ts(i.get("time")) >= cutoff][-MAX_ENTRIES:]

    async def async_clear(self) -> None:
        await self.async_load()
        self._items = []
        self._pending = {}
        self._backfilled = True  # cleared on purpose: never filled again from the old entries
        self._events_filled = True
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
            row.pop("events", None)  # the timeline has them; the list stays small
            rating = by_mid.get(item.get("message_id")) or by_uid.get((item.get("mailbox"), item.get("uid")))
            ai = dict(item.get("ai") or {})
            if rating is not None and not ai.get("held"):
                # the rating as it is now: a correction or a re-rating since the pass
                ai.update(
                    category=rating.get("corrected") or rating.get("category"),
                    importance=rating.get("importance"),
                    confidence=rating.get("confidence"),
                    applied=list(rating.get("applied") or []),
                )
                row["rating_id"] = rating.get("id")
                row["corrected"] = bool(rating.get("corrected"))
                row["name"] = row.get("name") or rating.get("from")
            row["state"] = item.get("state")  # read / flagged as the mailbox has it (mailstate.py), or None
            if ai:
                ai.setdefault("confidence", None)  # lines from before 1.0.24
            row["ai"] = ai or None
            row["kind"] = kind_of(row)
            row["unsure"] = bool(row["kind"] == "ai" and ai.get("confidence") == "low" and not row.get("corrected"))
            row["folder"] = folder_of(row)
            row["day"] = _day(item.get("time"))
            row["selectable"] = bool(ai_active and row.get("message_id") and row["kind"] != "rule")
            out.append(row)
        return out


def _append(item: dict[str, Any], event: dict[str, Any]) -> None:
    """Add a step: once only, and passes without a match one after the other as one (like the timeline)."""
    events = item.setdefault("events", [])
    same = {k: v for k, v in event.items() if k != "count"}
    if any({k: v for k, v in e.items() if k != "count"} == same for e in events):
        return  # the same step again (a pass recorded twice, the list filled once more)
    if event.get("kind") == "checked" and not event.get("rules"):
        last = next((e for e in reversed(events) if e.get("kind") == "checked"), None)
        if last is not None and not last.get("rules"):
            last["count"] = last.get("count", 1) + 1
            return
    events.append(dict(event))
    del events[:-MAX_EVENTS]


def matches(row: dict[str, Any], view: str, query: str) -> bool:
    """view: all | unsure | unread | flagged | k:<kind> | f:<folder>; query: words in subject, sender, category, rule."""
    if view == "unsure" and not row.get("unsure"):
        return False
    state = row.get("state") or {}
    if view == "unread" and state.get("seen") is not False:
        return False
    if view == "flagged" and not state.get("flagged"):
        return False
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
        "counts": {
            "all": len(rows),
            "unsure": sum(1 for r in rows if r.get("unsure")),
            "unread": sum(1 for r in rows if (r.get("state") or {}).get("seen") is False),
            "flagged": sum(1 for r in rows if (r.get("state") or {}).get("flagged")),
            "kinds": kinds,
            "folders": folders,
        },
    }
