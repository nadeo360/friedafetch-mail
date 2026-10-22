"""For you: what Frieda notices in the mailbox and offers – never done without a click.

- Important senders: people from chosen contact groups (or any address and domain the user names) are announced
  right away, also when no AI rates the mail or the AI was unsure.
- Appointments from mails: the AI names a date it read in a mail (an appointment, a deadline); Frieda proposes a
  calendar entry, which the user adds with one click in the panel or from the notification.
- Waiting for a reply: mails the user sent to people that got no answer after a few days.
- Rule suggestions: a sender whose mails the user always moves to the same folder (or deletes).
- Subscriptions: newsletters of the last weeks, how many of them stayed unread, and unsubscribing from the panel.
- The week: what arrived, what the rules and the AI did, how often the AI was right, what is still open.

Everything is worked out locally from the activity, the mailbox and the contacts. Nothing of it goes to an AI.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import re
import time
from collections import Counter
from collections.abc import Awaitable, Callable
from datetime import date, datetime, timedelta
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from custom_components.friedafetch.mail import MailboxNotFound, MailError

from .activity import TRASH, TRASH_NAMES, _ts
from .const import (
    CONF_EVENTS_CALENDAR,
    CONF_FOLLOWUP_DAYS,
    CONF_VIP_GROUPS,
    CONF_VIP_NOTIFY,
    CONF_VIP_SENDERS,
    CONF_WEEKLY_DAY,
    DEFAULT_FOLLOWUP_DAYS,
    DEFAULT_VIP_NOTIFY,
    DOMAIN,
    VIP_ALL_CONTACTS,
)
from .live import async_notify

_LOGGER = logging.getLogger(__name__)

STORAGE_VERSION = 1
SUGGEST_DAYS = 30  # rule suggestions look at the activity of these days
SUGGEST_MIN = 3  # mails of a sender moved to the same folder
SUGGEST_SHARE = 0.8  # of all mails of that sender
FOLLOWUP_LOOKBACK = 14  # days of sent mail that may wait for a reply
FOLLOWUP_SCAN = 40  # newest sent mails looked at
FOLLOWUP_EVERY = 3 * 3600  # seconds between looks at the sent mail
MAX_PROPOSALS = 30
SUBS_DAYS = 30
SUBS_SCAN = 400  # newest mails per folder for the subscriptions
SUBS_EVERY = 6 * 3600
VIP_EVERY = 6 * 3600  # the contact groups are read again after this
MAX_DISMISSED = 300
WEEKDAYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
AUTOMATED = re.compile(
    r"(^|[._+-])(no-?reply|do-?not-?reply|donotreply|noreply|notifications?|notify|mailer-daemon|postmaster|bounces?|"
    r"newsletter|info|news|support|service|billing|alerts?)([._+-]|@)",
    re.IGNORECASE,
)
_EMAIL_RE = re.compile(r"[\w.+'-]+@[\w-]+(?:\.[\w-]+)+")
_IMAP_MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")

Notify = Callable[..., Awaitable[None]]  # (title, message, *, actions=[(id, title)], tag=None)


def _now_iso() -> str:
    return dt_util.now().isoformat(timespec="seconds")


def _imap_date(day: date) -> str:
    return f"{day.day:02d}-{_IMAP_MONTHS[day.month - 1]}-{day.year}"


def _id(*parts: Any) -> str:
    return hashlib.sha1("\x1f".join(str(p) for p in parts).encode(), usedforsecurity=False).hexdigest()[:12]


def email_of(value: Any) -> str:
    """The address in a sender as the activity keeps it ("anna@example.com" or "Anna <anna@example.com>")."""
    found = _EMAIL_RE.search(str(value or ""))
    return found.group(0).lower() if found else ""


def parse_list(value: Any) -> list[str]:
    """Addresses and domains, one per line or separated by commas (as typed in the options)."""
    if isinstance(value, (list, tuple)):
        items = [str(v) for v in value]
    else:
        items = re.split(r"[\n,;]+", str(value or ""))
    return [i.strip().lower().lstrip("@") for i in items if i.strip()]


def parse_when(value: Any, tz: Any) -> datetime | date | None:
    """'2026-10-24' (a whole day) or '2026-10-24T15:30' (local time) as the AI names it; None if it is no date."""
    text = str(value or "").strip()
    if not text:
        return None
    try:
        if len(text) == 10:
            return date.fromisoformat(text)
        moment = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None
    return moment.replace(tzinfo=tz) if moment.tzinfo is None else moment.astimezone(tz)


def _day_of(value: datetime | date) -> date:
    return value.date() if isinstance(value, datetime) else value


class Insights:
    """What Frieda offers on the tab "For you" of one account."""

    def __init__(
        self,
        hass: HomeAssistant,
        core_entry_id: str,
        clients: Any,
        mail: Any,
        activity: Any,
        opts: dict[str, Any],
        *,
        notify: Notify | None = None,
        language: str = "en",
    ) -> None:
        self._hass = hass
        self._entry_id = core_entry_id
        self._clients = clients
        self._mail = mail
        self._activity = activity
        self.opts = dict(opts)
        self._notify = notify
        self._de = language.lower().startswith("de")
        self._store: Store[dict[str, Any]] = Store(hass, STORAGE_VERSION, f"{DOMAIN}.insights.{core_entry_id}")
        self._loaded = False
        self._lock = asyncio.Lock()
        self.sorter: Any | None = None  # ai.AiSorter (ratings for the week, corrections, notified mails)
        self.rules: Any | None = None  # rules.RuleEngine (rule suggestions skip covered senders)
        self.dismissed: dict[str, list[str]] = {}
        self.proposals: list[dict[str, Any]] = []
        self.followups: list[dict[str, Any]] = []
        self.followups_checked: str | None = None
        self._followup_at = 0.0
        self.replied: list[str] = []  # Message-IDs of sent mails that got an answer (not looked at again)
        self.subscriptions: list[dict[str, Any]] = []
        self.subscriptions_checked: str | None = None
        self._subs_at = 0.0
        self.unsubscribed: dict[str, str] = {}  # sender -> when
        self.weekly_sent: str | None = None  # ISO week of the last weekly review
        self._last_uid: int | None = None
        self._validity: int | None = None
        self._vips: set[str] = set()
        self._vips_at = 0.0
        self.error: str | None = None

    # ------------------------------------------------------------ storage
    async def async_load(self) -> None:
        if self._loaded:
            return
        data = await self._store.async_load() or {}
        self.dismissed = {k: list(v) for k, v in (data.get("dismissed") or {}).items()}
        self.proposals = list(data.get("proposals") or [])
        self.followups = list(data.get("followups") or [])
        self.followups_checked = data.get("followups_checked")
        self.replied = list(data.get("replied") or [])
        self.unsubscribed = dict(data.get("unsubscribed") or {})
        self.weekly_sent = data.get("weekly_sent")
        self._last_uid = data.get("last_uid")
        self._validity = data.get("validity")
        self._loaded = True

    def _data(self) -> dict[str, Any]:
        return {
            "dismissed": {k: v[-MAX_DISMISSED:] for k, v in self.dismissed.items()},
            "proposals": self.proposals[-MAX_PROPOSALS:],
            "followups": self.followups,
            "followups_checked": self.followups_checked,
            "replied": self.replied[-MAX_DISMISSED:],
            "unsubscribed": dict(list(self.unsubscribed.items())[-MAX_DISMISSED:]),
            "weekly_sent": self.weekly_sent,
            "last_uid": self._last_uid,
            "validity": self._validity,
        }

    async def _save(self) -> None:
        await self._store.async_save(self._data())
        async_notify(self._hass, self._entry_id, "insights")

    async def async_dismiss(self, kind: str, item_id: str) -> None:
        """Not shown again: a rule suggestion, a reply that is not expected, a subscription, a proposal."""
        await self.async_load()
        if kind == "proposal":
            for p in self.proposals:
                if p["id"] == item_id and p["status"] == "open":
                    p["status"] = "dismissed"
                    self._step(p, "event_dismissed")
        else:
            ids = self.dismissed.setdefault(kind, [])
            if item_id not in ids:
                ids.append(item_id)
            if kind == "followup":
                self.followups = [f for f in self.followups if f["id"] != item_id]
        await self._save()

    async def async_restore(self, kind: str) -> None:
        """Show everything of a kind again (the user dismissed too much)."""
        await self.async_load()
        self.dismissed.pop(kind, None)
        await self._save()

    def _step(self, proposal: dict[str, Any], kind: str, **extra: Any) -> None:
        if self._activity is not None and proposal.get("message_id"):
            self._activity.add_event(
                {"message_id": proposal["message_id"]}, {"time": _now_iso(), "kind": kind, **extra}
            )

    # ---------------------------------------------------- important senders
    async def async_vips(self, *, force: bool = False) -> set[str]:
        """Addresses and domains that count as important: typed in the options, and the chosen contact groups."""
        groups = [g.lower() for g in self.opts.get(CONF_VIP_GROUPS) or []]
        manual = set(parse_list(self.opts.get(CONF_VIP_SENDERS)))
        if not groups:
            return manual
        if force or not self._vips_at or time.monotonic() - self._vips_at > VIP_EVERY:
            try:
                self._vips = await self._group_addresses(groups)
                self._vips_at = time.monotonic()
            except Exception as err:  # noqa: BLE001 - the contacts may be off or unreachable: the last list stays
                _LOGGER.debug("Important senders: reading the contacts failed: %s", err)
        return manual | self._vips

    async def _group_addresses(self, groups: list[str]) -> set[str]:
        carddav = getattr(self._clients, "carddav", None)
        if carddav is None:
            return set()
        records = await carddav.async_sync()
        everyone = VIP_ALL_CONTACTS in groups
        members: set[str] = set()
        if not everyone:
            for rec in records:
                card = rec.vcard
                kind = card.get("X-ADDRESSBOOKSERVER-KIND")
                if kind is None or kind.text.lower() != "group" or (card.full_name or "").lower() not in groups:
                    continue
                members.update(
                    p.text.removeprefix("urn:uuid:").lower() for p in card.get_all("X-ADDRESSBOOKSERVER-MEMBER")
                )
        out: set[str] = set()
        for rec in records:
            if not everyone and (rec.uid or "").lower() not in members:
                continue
            out.update(str(e.get("value") or "").lower() for e in rec.to_dict().get("emails") or [] if e.get("value"))
        return out

    async def async_groups(self) -> list[str]:
        """The contact groups of the account (options)."""
        carddav = getattr(self._clients, "carddav", None)
        if carddav is None:
            return []
        names = set()
        for rec in await carddav.async_sync():
            card = rec.vcard
            kind = card.get("X-ADDRESSBOOKSERVER-KIND")
            if kind is not None and kind.text.lower() == "group" and card.full_name:
                names.add(card.full_name)
        return sorted(names, key=str.lower)

    def is_vip(self, sender: Any, vips: set[str]) -> bool:
        email = email_of(sender)
        return bool(email) and (email in vips or email.rsplit("@", 1)[-1] in vips)

    def vip_now(self, sender: Any) -> bool:
        """With the list as last read (for the AI sorting, which must not wait for the contacts)."""
        manual = set(parse_list(self.opts.get(CONF_VIP_SENDERS)))
        return self.is_vip(sender, manual | self._vips)

    async def async_new_mail(self) -> list[dict[str, Any]]:
        """After a pass: mail from important senders that arrived since the last look is announced.

        Mail the AI sorting already announced is left out. The first look only notes where the inbox stands.
        """
        vips = await self.async_vips()
        if not vips and not self._last_uid:
            return []
        await self.async_load()
        async with self._lock:
            new = sorted(await self._mail.async_new_uids("INBOX", self._last_uid)) if self._last_uid is not None else []
            # known once the inbox was opened: a renumbered inbox starts again from its newest message
            if self._last_uid is None or self._validity != self._mail.uidvalidity("INBOX"):
                self._last_uid = await self._mail.async_last_uid("INBOX")
                self._validity = self._mail.uidvalidity("INBOX")
                await self._save()
                return []
            if not new:
                return []
            self._last_uid = max(new)
            await self._save()
            if not vips:
                return []
            summaries = await self._mail.async_summaries("INBOX", new[-50:])
        found = []
        for s in summaries:
            sender = (s.get("from") or [{}])[0]
            if not self.is_vip(sender.get("email"), vips):
                continue
            line = self._activity.find({"message_id": s.get("message_id")}) if s.get("message_id") else None
            if line is not None:
                line["vip"] = True
            found.append(s)
            if self._notified_by_ai(s.get("message_id")) or not self.opts.get(CONF_VIP_NOTIFY, DEFAULT_VIP_NOTIFY):
                continue
            if self._notify is not None:
                name = sender.get("name") or sender.get("email") or ""
                await self._notify(
                    ("Wichtiger Absender: " if self._de else "Important sender: ") + name,
                    str(s.get("subject") or ""),
                    tag=f"frieda_postfach_vip_{_id(s.get('message_id'))}",
                )
                if s.get("message_id"):
                    self._activity.add_event(
                        {"message_id": s["message_id"]}, {"time": _now_iso(), "kind": "vip_notified"}
                    )
        return found

    def _notified_by_ai(self, message_id: Any) -> bool:
        if self.sorter is None or not message_id:
            return False
        return any(
            r.get("message_id") == message_id and "notified" in (r.get("applied") or []) for r in self.sorter.ratings
        )

    # ------------------------------------------------- appointments from mails
    def add_proposal(self, rating: dict[str, Any], event: dict[str, Any]) -> dict[str, Any] | None:
        """A date the AI read in a rated mail; kept as a proposal until added, dismissed or past."""
        tz = dt_util.get_default_time_zone()
        start = parse_when(event.get("start"), tz)
        if start is None or _day_of(start) < dt_util.now().date():
            return None
        end = parse_when(event.get("end"), tz)
        if end is not None and (type(end) is not type(start) or end < start):  # noqa: E721 - date and datetime
            end = None
        proposal_id = _id(rating.get("message_id") or rating.get("id"), event.get("start"))
        if any(p["id"] == proposal_id for p in self.proposals):
            return None
        proposal = {
            "id": proposal_id,
            "status": "open",
            "created": _now_iso(),
            "rating_id": rating.get("id"),
            "message_id": rating.get("message_id"),
            "subject": str(rating.get("subject") or "")[:200],
            "from": str(rating.get("from") or "")[:120],
            "kind": event.get("kind") if event.get("kind") in ("appointment", "deadline") else "appointment",
            "title": str(event.get("title") or rating.get("subject") or "")[:120],
            "start": start.isoformat(),
            "end": end.isoformat() if end is not None else None,
            "all_day": not isinstance(start, datetime),
            "location": str(event.get("location") or "")[:200] or None,
        }
        self.proposals.append(proposal)
        self.proposals = [p for p in self.proposals if p["status"] == "open" or p is proposal][-MAX_PROPOSALS:]
        self._step(proposal, "event_proposed", title=proposal["title"], start=proposal["start"])
        self._hass.async_create_task(self._save())
        return proposal

    def open_proposals(self) -> list[dict[str, Any]]:
        today = dt_util.now().date()
        tz = dt_util.get_default_time_zone()
        out = []
        for p in self.proposals:
            when = parse_when(p["start"], tz)
            if p["status"] == "open" and when is not None and _day_of(when) >= today:
                out.append(p)
        return sorted(out, key=lambda p: p["start"])

    async def async_calendars(self) -> list[dict[str, Any]]:
        """Calendars an entry may go to: those with events that Frieda does not protect."""
        caldav = getattr(self._clients, "caldav", None)
        if caldav is None:
            return []
        guard = self._clients.guard
        out = []
        for cal in await caldav.async_calendars():
            if not cal.supports_events:
                continue
            if guard is not None:
                try:
                    guard.check_calendar_writable(cal.id, cal.name)
                except Exception:  # noqa: BLE001, S112 - protected in Frieda's options
                    continue
            out.append({"id": cal.id, "name": cal.name, "color": cal.color})
        return out

    async def async_add_event(
        self,
        proposal_id: str,
        *,
        calendar_id: str | None = None,
        title: str | None = None,
        start: str | None = None,
        end: str | None = None,
        read_only: bool,
        calendar_on: bool,
        client: str = "Frieda Postfach (panel)",
        audit: bool = True,
    ) -> dict[str, Any]:
        """Put a proposal into the calendar (the user clicked): the calendar of the options or the one chosen."""
        from .actions import ActionError  # noqa: PLC0415

        await self.async_load()
        proposal = next((p for p in self.proposals if p["id"] == proposal_id), None)
        if proposal is None or proposal["status"] != "open":
            raise ActionError("This proposal is no longer open")
        if read_only:
            raise ActionError("Frieda is in read-only mode (options of Frieda)")
        if not calendar_on:
            raise ActionError("The calendar is switched off (options of Frieda)")
        calendars = await self.async_calendars()
        wanted = calendar_id or self.opts.get(CONF_EVENTS_CALENDAR) or ""
        cal = next((c for c in calendars if c["id"] == wanted or c["name"] == wanted), None) or (
            calendars[0] if calendars and not calendar_id else None
        )
        if cal is None:
            raise ActionError("No calendar to add it to (or it is protected in Frieda's options)")
        tz = dt_util.get_default_time_zone()
        begin = parse_when(start or proposal["start"], tz)
        finish = parse_when(end, tz) if end else parse_when(proposal.get("end"), tz)
        if begin is None:
            raise ActionError("Invalid start")
        if finish is not None and (type(finish) is not type(begin) or finish < begin):  # noqa: E721
            finish = None
        name = (title or proposal["title"] or proposal["subject"]).strip()[:120]
        note = ("Aus der Mail „{s}“ von {f}" if self._de else "From the e-mail “{s}” from {f}").format(
            s=proposal["subject"], f=proposal["from"]
        )
        created = await self._clients.caldav.async_create_event(
            cal["id"], name, begin, finish, description=note, location=proposal.get("location")
        )
        proposal.update(
            status="added",
            calendar=cal["name"],
            added=_now_iso(),
            event_uid=created.get("uid"),
            # as entered: the proposal shows what is in the calendar now
            title=name,
            start=begin.isoformat(),
            end=finish.isoformat() if finish is not None else None,
            all_day=not isinstance(begin, datetime),
        )
        self._step(proposal, "event_added", calendar=cal["name"], title=name, start=begin.isoformat())
        log = getattr(self._clients, "audit", None) if audit else None
        if log is not None:
            try:
                await log.async_record(
                    tool="icloud_create_event",
                    action="write",
                    params={"calendar": cal["name"], "summary": name},
                    result="ok",
                    client=client,
                    details={"mails": [{"message_id": proposal["message_id"], "subject": proposal["subject"][:120]}]},
                )
            except Exception as err:  # noqa: BLE001
                _LOGGER.debug("Audit logging of a calendar entry failed: %s", err)
        await self._save()
        return proposal

    # ----------------------------------------------------- waiting for a reply
    async def async_followups(self, *, force: bool = False) -> list[dict[str, Any]]:
        """Sent mails to people without an answer after the days of the options (0 = off)."""
        await self.async_load()
        days = int(self.opts.get(CONF_FOLLOWUP_DAYS, DEFAULT_FOLLOWUP_DAYS) or 0)
        if days <= 0:
            self.followups = []
            return []
        if not force and time.monotonic() - self._followup_at < FOLLOWUP_EVERY and self._followup_at:
            return self.followups
        async with self._lock:
            try:
                self.followups = await self._look_for_followups(days)
                self.error = None
            except (MailError, MailboxNotFound) as err:
                self.error = str(err)
                _LOGGER.debug("Waiting for a reply: looking at the sent mail failed: %s", err)
            self._followup_at = time.monotonic()
            self.followups_checked = _now_iso()
            await self._save()
        return self.followups

    async def _look_for_followups(self, days: int) -> list[dict[str, Any]]:
        mail = self._mail
        sent = await mail.async_special_mailbox("sent")
        if not sent:
            return []
        now = dt_util.now()
        since = (now - timedelta(days=FOLLOWUP_LOOKBACK)).date()
        uids = await mail.async_search_uids(sent, ["SINCE", _imap_date(since)])
        if not uids:
            return []
        me = {str(getattr(mail, "from_address", "") or "").lower()}
        dismissed = set(self.dismissed.get("followup") or [])
        folders = await self._reply_folders()
        out = []
        for s in reversed(await mail.async_summaries(sent, sorted(uids)[-FOLLOWUP_SCAN:])):
            mid = s.get("message_id")
            when = dt_util.parse_datetime(str(s.get("date") or ""))
            if not mid or when is None or mid in self.replied:
                continue
            item_id = _id(mid)
            if item_id in dismissed or now - when < timedelta(days=days):
                continue
            people = [
                a
                for a in [*(s.get("to") or []), *(s.get("cc") or [])]
                if a.get("email") and a["email"].lower() not in me and not AUTOMATED.search(a["email"])
            ]
            if not people:
                continue
            if await self._answered(folders, mid, people[0]["email"], when.date()):
                self.replied.append(mid)
                continue
            out.append(
                {
                    "id": item_id,
                    "message_id": mid,
                    "subject": str(s.get("subject") or "")[:200],
                    "to": [{"name": a.get("name") or "", "email": a["email"]} for a in people[:3]],
                    "more": max(0, len(people) - 3),
                    "sent": when.isoformat(),
                    "days": (now - when).days,
                }
            )
        return out

    async def _reply_folders(self) -> list[str]:
        """The inbox and where Frieda puts mail (archive, the folders of rules and categories)."""
        names = ["INBOX"]
        archive = await self._mail.async_special_mailbox("archive")
        if archive:
            names.append(archive)
        for rule in self.rules.enabled_rules() if self.rules is not None else []:
            target = getattr(rule.actions, "move_to", None)
            if target:
                names.append(target)
        for cat in self.sorter.categories if self.sorter is not None else []:
            if cat.get("move_to"):
                names.append(cat["move_to"])
        return list(dict.fromkeys(n for n in names if n.lower() not in TRASH_NAMES))

    async def _answered(self, folders: list[str], message_id: str, person: str, since: date) -> bool:
        quoted = '"' + message_id.replace("\\", "\\\\").replace('"', '\\"') + '"'
        for name in folders:
            try:
                if await self._mail.async_search_uids(
                    name, ["OR", "HEADER", "In-Reply-To", quoted, "HEADER", "References", quoted]
                ):
                    return True
                # an answer without threading headers: a mail from that person since then
                if await self._mail.async_search_uids(name, ["FROM", f'"{person}"', "SINCE", _imap_date(since)]):
                    return True
            except MailboxNotFound:
                continue
        return False

    # ------------------------------------------------------ rule suggestions
    def rule_suggestions(self) -> list[dict[str, Any]]:
        """Senders whose mails the user always moves to the same folder, and that no rule handles yet."""
        cutoff = dt_util.now().timestamp() - SUGGEST_DAYS * 86400
        per_sender: dict[str, list[tuple[str | None, dict[str, Any]]]] = {}
        for item in self._activity.items:
            if _ts(item.get("time")) < cutoff:
                continue
            sender = email_of(item.get("from"))
            if not sender:
                continue
            per_sender.setdefault(sender, []).append((self._destination(item), item))
        dismissed = set(self.dismissed.get("rule") or [])
        rules = self.rules.enabled_rules() if self.rules is not None else []
        out = []
        for sender, lines in per_sender.items():
            moved = Counter(dest for dest, _ in lines if dest)
            if not moved:
                continue
            folder, count = moved.most_common(1)[0]
            if count < SUGGEST_MIN or count / len(lines) < SUGGEST_SHARE:
                continue
            suggestion_id = _id(sender, folder)
            if suggestion_id in dismissed:
                continue
            newest = max((item for _, item in lines), key=lambda i: _ts(i.get("time")))
            summary = {
                "from": [{"email": sender, "name": newest.get("name") or ""}],
                "to": [],
                "cc": [],
                "subject": newest.get("subject") or "",
            }
            if any(r.matches(summary) for r in rules):
                continue
            out.append(
                {
                    "id": suggestion_id,
                    "sender": sender,
                    "name": newest.get("name") or "",
                    "folder": folder,  # a folder name, or TRASH
                    "count": count,
                    "total": len(lines),
                    "subjects": [str(i.get("subject") or "")[:80] for _, i in lines[-3:]],
                }
            )
        return sorted(out, key=lambda s: -s["count"])

    def _destination(self, item: dict[str, Any]) -> str | None:
        """Where the user took a mail: a folder, TRASH, or None (left where it was, or put there by Frieda)."""
        state = item.get("state") or {}
        if "mailbox" not in state:
            return None
        where = state.get("mailbox")
        if where is None:
            # gone for good (or not found yet): deleted when it was last seen in the trash
            last = str(state.get("last_mailbox") or "")
            return TRASH if state.get("gone") and state.get("searched") and last.lower() in TRASH_NAMES else None
        if where == (item.get("mailbox") or "INBOX"):
            return None
        if where == item.get("move_to"):  # a rule moved it
            return None
        applied = (item.get("ai") or {}).get("applied") or []
        if f"moved:{where}" in applied:  # the AI moved it
            return None
        return TRASH if where.lower() in TRASH_NAMES else where

    # --------------------------------------------------------- subscriptions
    async def async_subscriptions(self, *, force: bool = False) -> list[dict[str, Any]]:
        """Newsletters of the last weeks per sender: how many, how many stayed unread, where the newest is."""
        await self.async_load()
        if not force and self._subs_at and time.monotonic() - self._subs_at < SUBS_EVERY:
            return self.subscriptions
        async with self._lock:
            try:
                self.subscriptions = await self._look_for_subscriptions()
                self.error = None
            except (MailError, MailboxNotFound) as err:
                self.error = str(err)
                _LOGGER.debug("Subscriptions: looking at the mailbox failed: %s", err)
            self._subs_at = time.monotonic()
            self.subscriptions_checked = _now_iso()
        return self.subscriptions

    async def _look_for_subscriptions(self) -> list[dict[str, Any]]:
        since = (dt_util.now() - timedelta(days=SUBS_DAYS)).date()
        per_sender: dict[str, dict[str, Any]] = {}
        for folder in await self._reply_folders():
            try:
                uids = await self._mail.async_search_uids(folder, ["SINCE", _imap_date(since)])
            except MailboxNotFound:
                continue
            for s in await self._mail.async_summaries(folder, sorted(uids)[-SUBS_SCAN:]) if uids else []:
                if not s.get("newsletter"):
                    continue
                sender = (s.get("from") or [{}])[0]
                email = str(sender.get("email") or "").lower()
                if not email:
                    continue
                sub = per_sender.setdefault(
                    email,
                    {"id": _id("sub", email), "sender": email, "name": "", "count": 0, "unread": 0, "last": ""},
                )
                sub["count"] += 1
                sub["unread"] += not s.get("seen")
                when = str(s.get("date") or "")
                if when >= sub["last"]:
                    sub.update(last=when, name=sender.get("name") or sub["name"], mailbox=folder, uid=s["uid"])
                    sub["subject"] = str(s.get("subject") or "")[:120]
        dismissed = set(self.dismissed.get("subscription") or [])
        out = []
        for sub in per_sender.values():
            sub["never_opened"] = sub["unread"] == sub["count"]
            sub["unsubscribed"] = self.unsubscribed.get(sub["sender"])
            if sub["id"] not in dismissed:
                out.append(sub)
        return sorted(out, key=lambda s: (-(s["unread"] / s["count"]), -s["count"]))

    async def async_unsubscribe(self, sender: str, *, read_only: bool, allow_send: bool) -> dict[str, Any]:
        """Unsubscribe from a newsletter with the newest mail of its sender (as Frieda's icloud_unsubscribe)."""
        from homeassistant.util.ssl import client_context  # noqa: PLC0415

        from custom_components.friedafetch.guard import QUOTA_MAIL_SEND  # noqa: PLC0415
        from custom_components.friedafetch.mail import list_unsubscribe  # noqa: PLC0415
        from custom_components.friedafetch.unsubscribe import async_one_click, parse_mailto  # noqa: PLC0415

        from .actions import ActionError  # noqa: PLC0415

        await self.async_load()
        sub = next((s for s in self.subscriptions if s["sender"] == sender.lower()), None)
        if sub is None or "uid" not in sub:
            raise ActionError("This newsletter was not found (look again)")
        if read_only:
            raise ActionError("Frieda is in read-only mode (options of Frieda)")
        guard = self._clients.guard
        if guard is not None:
            guard.check_quota(QUOTA_MAIL_SEND)
        _, msg = await self._mail.async_fetch_raw(sub["mailbox"], int(sub["uid"]))
        info = list_unsubscribe(msg)
        if not info:
            raise ActionError("This newsletter names no way to unsubscribe (List-Unsubscribe)")
        if info["one_click"]:
            result = await async_one_click(info["https"][0], ssl_context=client_context())
        elif info["mailto"] and allow_send:
            target = parse_mailto(info["mailto"][0])
            sent = await self._clients.mail.async_send(
                to=[target["address"]], subject=target["subject"], body=target["body"]
            )
            result = {"method": "mailto", "to": target["address"], "message_id": sent.get("message_id")}
        elif info["https"]:
            return {"method": "manual", "url": info["https"][0]}
        else:
            raise ActionError(
                "Unsubscribing needs an e-mail here, but sending e-mails is switched off (options of Frieda)"
            )
        if guard is not None:
            guard.consume(QUOTA_MAIL_SEND)
        self.unsubscribed[sub["sender"]] = _now_iso()
        sub["unsubscribed"] = self.unsubscribed[sub["sender"]]
        audit = getattr(self._clients, "audit", None)
        if audit is not None:
            try:
                await audit.async_record(
                    tool="icloud_unsubscribe",
                    action="write",
                    params={"sender": sub["sender"], "method": result.get("method")},
                    result="ok",
                    client="Frieda Postfach (panel)",
                )
            except Exception as err:  # noqa: BLE001
                _LOGGER.debug("Audit logging of unsubscribing failed: %s", err)
        await self._save()
        return {"sender": sub["sender"], **result}

    # --------------------------------------------------------------- the week
    def week(self, now: datetime | None = None) -> dict[str, Any]:
        """The last seven days, and the seven before for comparison."""
        now = now or dt_util.now()
        end = now.timestamp()
        start, before = end - 7 * 86400, end - 14 * 86400
        lines = [i for i in self._activity.items if start <= _ts(i.get("time")) <= end]
        earlier = sum(1 for i in self._activity.items if before <= _ts(i.get("time")) < start)
        ratings = [r for r in (self.sorter.ratings if self.sorter else []) if start <= _ts(r.get("time")) <= end]
        corrected = sum(1 for r in ratings if r.get("corrected") and r.get("corrected") != r.get("category"))
        senders = Counter(email_of(i.get("from")) for i in lines if email_of(i.get("from")))
        unread = sum(
            1
            for i in lines
            if (i.get("state") or {}).get("seen") is False and (i.get("state") or {}).get("mailbox") is not None
        )
        return {
            "from": datetime.fromtimestamp(start, now.tzinfo).isoformat(timespec="seconds"),
            "to": now.isoformat(timespec="seconds"),
            "mails": len(lines),
            "mails_before": earlier,
            "by_rules": sum(1 for i in lines if i.get("rules")),
            "by_ai": sum(
                1 for i in lines if (i.get("ai") or {}).get("category") and not (i.get("ai") or {}).get("held")
            ),
            "rated": len(ratings),
            "corrected": corrected,
            "accuracy": round(100 * (len(ratings) - corrected) / len(ratings)) if ratings else None,
            "unread": unread,
            "top_senders": [{"sender": s, "count": n} for s, n in senders.most_common(3)],
            "waiting": len(self.followups),
            "proposals": len(self.open_proposals()),
            "never_opened": sum(1 for s in self.subscriptions if s.get("never_opened") and not s.get("unsubscribed")),
        }

    def week_text(self, week: dict[str, Any]) -> tuple[str, str]:
        de = self._de
        parts = [
            (f"{week['mails']} Mails angekommen" if de else f"{week['mails']} e-mails arrived")
            + (f" (Woche davor: {week['mails_before']})" if de else f" (week before: {week['mails_before']})"),
        ]
        if week["by_rules"]:
            parts.append(f"Regeln: {week['by_rules']}" if de else f"Rules: {week['by_rules']}")
        if week["rated"]:
            parts.append(
                f"KI: {week['rated']} sortiert, {week['accuracy']} % richtig"
                if de
                else f"AI: {week['rated']} sorted, {week['accuracy']} % right"
            )
        if week["unread"]:
            parts.append(f"Noch ungelesen: {week['unread']}" if de else f"Still unread: {week['unread']}")
        if week["waiting"]:
            parts.append(f"Warten auf Antwort: {week['waiting']}" if de else f"Waiting for a reply: {week['waiting']}")
        if week["proposals"]:
            parts.append(f"Terminvorschläge: {week['proposals']}" if de else f"Calendar proposals: {week['proposals']}")
        if week["never_opened"]:
            parts.append(
                f"Nie geöffnete Newsletter: {week['never_opened']}"
                if de
                else f"Newsletters never opened: {week['never_opened']}"
            )
        return ("Frieda – Wochenrückblick" if de else "Frieda – weekly review"), "\n".join(parts)

    async def async_weekly(self, now: datetime | None = None) -> bool:
        """Send the weekly review on the chosen day (once per week)."""
        now = now or dt_util.now()
        day = str(self.opts.get(CONF_WEEKLY_DAY) or "")
        if day not in WEEKDAYS or WEEKDAYS[now.weekday()] != day or self._notify is None:
            return False
        await self.async_load()
        year, number, _ = now.isocalendar()
        key = f"{year}-W{number:02d}"
        if self.weekly_sent == key:
            return False
        await self.async_followups()
        title, message = self.week_text(self.week(now))
        await self._notify(title, message, tag="frieda_postfach_week")
        self.weekly_sent = key
        await self._save()
        return True

    def important_unread(self, limit: int = 15) -> list[dict[str, Any]]:
        """Today's mail that is important (AI rating or an important sender) and still unread, newest first."""
        today = dt_util.now().date()
        threshold = self.sorter.important_from if self.sorter is not None else 4
        out = []
        for item in sorted(self._activity.items, key=lambda i: _ts(i.get("time")), reverse=True):
            when = dt_util.parse_datetime(str(item.get("time") or ""))
            if when is None or dt_util.as_local(when).date() != today:
                continue
            state = item.get("state") or {}
            if state.get("seen") is not False or state.get("mailbox") is None:
                continue  # read, or not in a folder any more
            ai = item.get("ai") or {}
            vip = bool(item.get("vip")) or self.vip_now(item.get("from"))
            if not vip and int(ai.get("importance") or 0) < threshold:
                continue
            out.append(
                {
                    "from": item.get("name") or item.get("from") or "",
                    "subject": item.get("subject") or "",
                    "time": item.get("time"),
                    "folder": state.get("mailbox"),
                    "category": ai.get("category"),
                    "importance": ai.get("importance"),
                    "important_sender": vip,
                }
            )
            if len(out) >= limit:
                break
        return out

    # ------------------------------------------------------------- overview
    async def async_get(self) -> dict[str, Any]:
        """Everything of the tab, with what is known now (the slow looks run in the background)."""
        await self.async_load()
        return {
            "week": self.week(),
            "proposals": self.open_proposals(),
            "followups": self.followups,
            "followups_checked": self.followups_checked,
            "followup_days": int(self.opts.get(CONF_FOLLOWUP_DAYS, DEFAULT_FOLLOWUP_DAYS) or 0),
            "suggestions": self.rule_suggestions(),
            "subscriptions": self.subscriptions,
            "subscriptions_checked": self.subscriptions_checked,
            "vip": {
                "groups": list(self.opts.get(CONF_VIP_GROUPS) or []),
                "senders": len(parse_list(self.opts.get(CONF_VIP_SENDERS))),
                "known": len(self._vips),
                "notify": bool(self.opts.get(CONF_VIP_NOTIFY, DEFAULT_VIP_NOTIFY)),
            },
            "weekly_day": str(self.opts.get(CONF_WEEKLY_DAY) or "") or None,
            "events_calendar": self.opts.get(CONF_EVENTS_CALENDAR) or None,
            "dismissed": {k: len(v) for k, v in self.dismissed.items() if v},
            "error": self.error,
        }
