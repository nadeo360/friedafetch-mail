"""Acting on mails from the activity, like a mail program: read, unread, flag, unflag, archive, back to the inbox, trash.

The same guard rails as every Frieda tool: nothing in read-only mode, protected and hidden folders stay untouched, the
hourly quota of mail changes applies, the trash only when deleting is allowed – and nothing is ever deleted for good
(a mail already in the trash stays there). Every action is written to Frieda's change log and to the mail's timeline.
A mail is acted on where it is now (the read/flagged look knows its folder; otherwise it is found by Message-ID).
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from homeassistant.exceptions import HomeAssistantError

from custom_components.friedafetch.guard import QUOTA_MAIL_MODIFY

from .locate import async_locate

_LOGGER = logging.getLogger(__name__)

ACTIONS = ("seen", "unseen", "flag", "unflag", "archive", "inbox", "trash")
MAX_MAILS = 100  # per action
AUDIT_TOOL = {
    "seen": "icloud_mark_mail",
    "unseen": "icloud_mark_mail",
    "flag": "icloud_mark_mail",
    "unflag": "icloud_mark_mail",
    "archive": "icloud_move_mail",
    "inbox": "icloud_move_mail",
    "trash": "icloud_delete_mail",
}


class ActionError(HomeAssistantError):
    """An action that the options or the guard rails do not allow."""


def _now_iso() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


async def async_act(link: Any, keys: list[str], action: str, *, read_only: bool, allow_delete: bool) -> dict[str, Any]:
    """Run one action on the mails of the given activity lines; returns {action, done, failed, skipped}."""
    if action not in ACTIONS:
        raise ActionError(f"Unknown action '{action}'")
    if read_only:
        raise ActionError("Frieda is in read-only mode (options of Frieda)")
    if action == "trash" and not allow_delete:
        raise ActionError("Deleting mail is switched off (options of Frieda)")
    activity = link.activity
    mail = link.mail or link.clients.mail
    guard = link.clients.guard
    await activity.async_load()
    lines = [
        i for k in dict.fromkeys(keys[:MAX_MAILS]) if (i := next((x for x in activity.items if x["key"] == k), None))
    ]
    if not lines:
        raise ActionError("No mails chosen")

    target: str | None = None
    trash = await mail.async_special_mailbox("trash")
    if action == "archive":
        target = await mail.async_special_mailbox("archive") or "Archive"
    elif action == "inbox":
        target = "INBOX"
    elif action == "trash":
        target = trash

    now = _now_iso()
    out: dict[str, Any] = {"action": action, "done": 0, "failed": [], "skipped": 0}
    groups: dict[str, list[tuple[dict[str, Any], int]]] = {}
    for item in lines:
        place = activity.where(item)
        if place is None and item.get("message_id"):
            found = await async_locate(mail, guard, item["message_id"], [item.get("mailbox") or "INBOX"])
            activity.set_location(item["key"], found["mailbox"], found["uid"], now)
            place = activity.where(item)
        if place is None:
            out["failed"].append({"key": item["key"], "error": "not found"})
            continue
        if place[0] == target or (action == "trash" and place[0] == trash):
            out["skipped"] += 1  # there already (and nothing is deleted for good)
            continue
        groups.setdefault(place[0], []).append((item, place[1]))

    count = sum(len(g) for g in groups.values())
    if count and guard is not None:
        guard.check_quota(QUOTA_MAIL_MODIFY, count)
        for box in groups:
            guard.check_mailbox_writable(box)
        if target:
            guard.check_mailbox_writable(target)
    for box, members in groups.items():
        uids = [uid for _, uid in members]
        try:
            if action in ("seen", "unseen"):
                await mail.async_set_flags(box, uids, seen=action == "seen")
            elif action in ("flag", "unflag"):
                await mail.async_set_flags(box, uids, flagged=action == "flag")
            elif action == "trash":
                await mail.async_delete(box, uids)  # moves to the trash (box is never the trash here)
            else:
                await mail.async_move(box, uids, str(target))
        except Exception as err:  # noqa: BLE001 - report per folder, go on with the others
            out["failed"] += [{"key": item["key"], "error": str(err) or err.__class__.__name__} for item, _ in members]
            continue
        if guard is not None:
            guard.consume(QUOTA_MAIL_MODIFY, len(uids))
        for item, uid in members:
            out["done"] += 1
            _after(activity, item, box, uid, action, target, now)
    await _audit(link, action, lines, out)
    if out["done"] and link.state is not None:
        link.state.request()  # the look confirms flags and finds moved mails in their new folder
    return out


def _after(activity: Any, item: dict[str, Any], box: str, uid: int, action: str, target: str | None, now: str) -> None:
    """Show the result right away (the next look confirms it) and note it in the mail's timeline."""
    state = item.get("state") or {}
    if action in ("seen", "unseen"):
        activity.set_state(box, {uid: _flags(action == "seen", bool(state.get("flagged")))}, set(), now)
    elif action in ("flag", "unflag"):
        activity.set_state(box, {uid: _flags(state.get("seen") is not False, action == "flag")}, set(), now)
    else:
        # moved: its new UID is found by Message-ID in the next look, starting with the target folder
        activity.moved(item["key"], str(target), now)
    activity.add_event(
        {"message_id": item.get("message_id"), "mailbox": item.get("mailbox"), "uid": item.get("uid")},
        {"time": now, "kind": "acted", "action": action, "mailbox": target},
    )


def _flags(seen: bool, flagged: bool) -> list[str]:
    return [f for f, on in (("\\Seen", seen), ("\\Flagged", flagged)) if on]


async def _audit(link: Any, action: str, lines: list[dict[str, Any]], out: dict[str, Any]) -> None:
    audit = getattr(link.clients, "audit", None)
    if audit is None or not (out["done"] or out["failed"]):
        return
    try:
        await audit.async_record(
            tool=AUDIT_TOOL[action],
            action="delete" if action == "trash" else "write",
            params={"action": action, "count": out["done"]},
            result="error" if out["failed"] and not out["done"] else "ok",
            client="Frieda Postfach (panel)",
            error="; ".join(sorted({f["error"] for f in out["failed"]})) or None,
            details={
                "mails": [
                    {"message_id": i.get("message_id"), "subject": str(i.get("subject") or "")[:120]}
                    for i in lines[:20]
                    if i.get("message_id")
                ]
            },
        )
    except Exception as err:  # noqa: BLE001
        _LOGGER.debug("Audit logging of a mail action failed: %s", err)
