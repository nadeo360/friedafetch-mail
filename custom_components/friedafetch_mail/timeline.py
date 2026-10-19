"""Timeline of one message: what Frieda Postfach did with it, from arrival to your last correction.

Nothing new is stored for it. The steps are collected from what is kept anyway: the run history (rules), the log of
what went to an AI (or was held back by the kill switch) and the AI ratings. They are linked by the message's
Message-ID, which survives moves (the IMAP UID does not). Older entries without it are matched by subject and sender.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any


def _ts(value: Any) -> float:
    """Sort key for ISO times with different offsets; steps without a time go last."""
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).timestamp()
    except (TypeError, ValueError):
        return float("inf")


def _domain(address: str) -> str:
    return address.rsplit("@", 1)[-1].lower() if "@" in address else ""


def _matches(item: dict[str, Any], message_id: str | None, subject: str | None, sender: str | None) -> bool:
    mid = item.get("message_id")
    if message_id and mid:
        return mid == message_id
    # an older entry without Message-ID: same subject and the same sender (address, or at least its domain)
    if not subject or str(item.get("subject") or "").strip() != subject.strip():
        return False
    if not sender:
        return True
    sender = sender.lower()
    other = str(item.get("sender") or item.get("from") or "").lower()
    return other == sender or (item.get("from_domain") or _domain(other)) == _domain(sender)


def build_timeline(
    history: list[dict[str, Any]],
    ratings: list[dict[str, Any]],
    usage_log: list[dict[str, Any]],
    *,
    message_id: str | None = None,
    subject: str | None = None,
    sender: str | None = None,
) -> dict[str, Any]:
    """Steps of one message, oldest first, plus a short header (subject, sender, where it is, its category)."""
    events: list[dict[str, Any]] = []
    head: dict[str, Any] = {
        "message_id": message_id,
        "subject": subject,
        "sender": sender,
        "date": None,
        "mailbox": None,
        "location": None,
        "category": None,
        "corrected": False,
        "held": False,
    }

    def note(item: dict[str, Any]) -> None:
        head["message_id"] = head["message_id"] or item.get("message_id")
        head["subject"] = head["subject"] or item.get("subject")
        head["sender"] = head["sender"] or item.get("sender") or item.get("from")
        head["date"] = head["date"] or item.get("date")
        head["mailbox"] = head["mailbox"] or item.get("mailbox")

    # rules: every pass that checked the message (oldest first)
    for run in sorted(history, key=lambda r: _ts(r.get("started"))):
        for mail in run.get("mails") or []:
            if not _matches(mail, message_id, subject, sender):
                continue
            note(mail)
            step = {
                "time": run.get("started"),
                "kind": "checked",
                "trigger": run.get("trigger"),
                "rules": list(mail.get("rules") or []),
                "move_to": mail.get("move_to"),
                "delete": bool(mail.get("delete")),
                "seen": mail.get("seen"),
                "flag": mail.get("flag"),
                "count": 1,
            }
            last = events[-1] if events else None
            quiet = not step["rules"]
            if quiet and last and last["kind"] == "checked" and not last["rules"]:
                last["count"] += 1  # checked again without a match: one step
                continue
            events.append(step)
            if step["move_to"] or step["delete"]:
                head["location"] = "trash" if step["delete"] else step["move_to"]

    # what went to an AI, or was held back by the kill switch
    for entry in usage_log:
        if entry.get("kind", "sort") != "sort" or not _matches(entry, message_id, subject, sender):
            continue
        note(entry)
        if entry.get("sent") is False:
            head["held"] = True
            events.append({"time": entry.get("time"), "kind": "ai_held", "reasons": list(entry.get("held_back") or [])})
        else:
            events.append(
                {
                    "time": entry.get("time"),
                    "kind": "ai_sent",
                    "entity": entry.get("entity"),
                    "fields": list(entry.get("fields") or []),
                    "chars": entry.get("chars") or 0,
                    "ok": entry.get("ok", True),
                    "error": entry.get("error"),
                    "duration": entry.get("duration"),  # seconds until the AI answered
                }
            )

    # the AI's rating, what it did, and your correction
    for rating in ratings:
        if not _matches(rating, message_id, subject, sender):
            continue
        note(rating)
        prev = rating.get("previous")
        if prev:  # rated again later: the earlier rating, its actions and correction come first
            events.append(
                {
                    "time": prev.get("time"),
                    "kind": "rated",
                    "category": prev.get("category"),
                    "importance": prev.get("importance"),
                    "reason": prev.get("reason"),
                    "suspicious": False,
                }
            )
            if prev.get("applied"):
                events.append({"time": prev.get("time"), "kind": "ai_applied", "applied": list(prev["applied"])})
            if prev.get("corrected"):
                events.append(
                    {
                        "time": prev.get("corrected_at"),
                        "kind": "corrected",
                        "before": prev.get("category"),
                        "after": prev.get("corrected"),
                    }
                )
        events.append(
            {
                "time": rating.get("time"),
                "kind": "rated",
                "again": bool(prev),
                "category": rating.get("category"),
                "importance": rating.get("importance"),
                "reason": rating.get("reason"),
                "suspicious": bool(rating.get("suspicious")),
            }
        )
        applied = list(rating.get("applied") or [])
        if applied:
            events.append({"time": rating.get("time"), "kind": "ai_applied", "applied": applied})
            moved = next((a[6:] for a in applied if str(a).startswith("moved:")), None)
            if moved:
                head["location"] = moved
        head["category"] = rating.get("corrected") or rating.get("category")
        if rating.get("corrected"):
            head["corrected"] = True
            events.append(
                {
                    "time": rating.get("corrected_at"),
                    "kind": "corrected",
                    "before": rating.get("category"),
                    "after": rating.get("corrected"),
                }
            )

    if head["date"]:
        events.insert(0, {"time": head["date"], "kind": "received", "mailbox": head["mailbox"]})
    # steps without a time (older corrections) stay at the end, the rest in time order
    events.sort(key=lambda e: _ts(e.get("time")))
    return {**head, "found": bool(events), "events": events}
