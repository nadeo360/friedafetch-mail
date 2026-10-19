"""Where a message really is now: searched by its Message-ID, first where Frieda put it, then everywhere else.

The activity list says where Frieda put a message; the user may have moved it in Apple Mail since, or emptied the
trash. Opening a message in the panel asks this once (one IMAP search per folder, until it is found). Folders that
Frieda hides from AI clients are not searched.
"""

from __future__ import annotations

from typing import Any

from homeassistant.util import dt as dt_util

from custom_components.friedafetch.mail import MailboxNotFound, MailError

from .activity import TRASH


async def async_locate(mail: Any, guard: Any | None, message_id: str, hints: list[str] | None = None) -> dict[str, Any]:
    """{found, mailbox, trash, checked}: the folder that holds the message, or found=False."""
    boxes = await mail.async_mailboxes()
    trash = next((b["name"] for b in boxes if b.get("special_use") == "trash"), None)
    wanted = [trash if h == TRASH else h for h in hints or [] if h]
    names = [b["name"] for b in boxes if b["name"] != trash]
    order = list(dict.fromkeys([*wanted, "INBOX", *names, *([trash] if trash else [])]))
    quoted = '"' + str(message_id).replace("\\", "\\\\").replace('"', '\\"') + '"'
    for name in order:
        if name is None:
            continue
        if guard is not None:
            try:
                guard.check_mailbox_visible(name)
            except Exception:  # noqa: BLE001, S112 - a hidden folder is not searched
                continue
        try:
            uids = await mail.async_search_uids(name, ["HEADER", "Message-ID", quoted])
        except (MailError, MailboxNotFound):
            continue
        if uids:
            return {"found": True, "mailbox": name, "trash": name == trash, "checked": _now()}
    return {"found": False, "mailbox": None, "trash": False, "checked": _now()}


def _now() -> str:
    return dt_util.now().isoformat(timespec="seconds")
