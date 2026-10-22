"""Inbox rules evaluated and executed by the integration.

iCloud exposes no API for its server-side mail rules, so rules live in Home
Assistant storage and are applied by Frieda Postfach: on new mail (push or
timer) and on demand to a whole mailbox. The storage key is the one Frieda
used before 2.0 (``friedafetch.rules.<account>``), so existing rules carry over.
"""

from __future__ import annotations

import asyncio
import functools
import logging
import re
import time
import uuid
from dataclasses import asdict, dataclass
from datetime import datetime
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.helpers.storage import Store

from custom_components.friedafetch.guard import QUOTA_MAIL_MODIFY
from custom_components.friedafetch.llm_api import ToolNotFoundError
from custom_components.friedafetch.mail import ICloudMail, MailboxNotFound, MailError

from .const import CORE_DOMAIN, EVENT_RULE_MATCHED, MAX_EVENTS_PER_RUN, SIGNAL_UPDATED
from .live import async_notify

_LOGGER = logging.getLogger(__name__)

STORAGE_VERSION = 1
FIELDS = ("from", "to", "cc", "subject", "any")
OPS = ("contains", "equals", "starts_with", "ends_with", "domain", "regex")
MATCH_MODES = ("all", "any")
MAX_RULES = 100
MAX_SCAN_ALL = 2000  # newest messages inspected for scope="all"
_SUMMARY_CHUNK = 200
HISTORY_MAX = 200  # stored runs per account
HISTORY_MAILS = 20  # handled messages remembered per run (subject, sender, rules, action) for the panel
# Unattended runs (timer, push) and runs requested by an AI client change at most this many messages per run,
# and they count against Frieda's hourly quota for mail changes; the rest follows in the next run.
MAX_CHANGES_PER_RUN = 100
MAX_DELETES_PER_RUN = 50
LIMITED_TRIGGERS = ("auto", "push", "assistant")


# --------------------------------------------------------------- regex safety
# Python's re has no timeout: a pattern with nested unbounded repetition such as (a+)+$ needs exponential time on
# a short subject (35 characters: half an hour) and would block Home Assistant. Rules can be created by an AI,
# so such patterns are refused when saved and skipped when stored ones are evaluated.
try:  # the parser of the standard library (stable since Python 3.11)
    from re import _constants as _sre_c
    from re import _parser as _sre_parse
except ImportError:  # pragma: no cover
    _sre_parse = None
MAX_REGEX_INPUT = 300  # characters of a header that a regex condition looks at
REGEX_BUDGET = 0.05  # seconds a pattern may need on a hostile header of MAX_REGEX_INPUT characters
_UNBOUNDED = 10  # repeating a variable part more often than this counts as nested (e.g. (a|aa){1,50})


def _repeats(op: Any) -> bool:
    return op in (_sre_c.MAX_REPEAT, _sre_c.MIN_REPEAT, getattr(_sre_c, "POSSESSIVE_REPEAT", None))


def _variable(items: Any) -> bool:
    """Can this part match texts of different length in different ways (repetition or alternation)?"""
    for op, av in items:
        if _repeats(op):
            low, high, sub = av
            if high != low or _variable(sub):
                return True
        elif op is _sre_c.BRANCH:
            return True
        elif op is _sre_c.SUBPATTERN and _variable(av[-1]):
            return True
        elif op in (_sre_c.ASSERT, _sre_c.ASSERT_NOT) and _variable(av[1]):
            return True
    return False


def _nested_repeat(items: Any) -> bool:
    for op, av in items:
        if _repeats(op):
            _low, high, sub = av
            if (high == _sre_c.MAXREPEAT or high > _UNBOUNDED) and _variable(sub):
                return True
            if _nested_repeat(sub):
                return True
        elif op is _sre_c.BRANCH:
            if any(_nested_repeat(alt) for alt in av[1]):
                return True
        elif op is _sre_c.SUBPATTERN:
            if _nested_repeat(av[-1]):
                return True
        elif op in (_sre_c.ASSERT, _sre_c.ASSERT_NOT) and _nested_repeat(av[1]):
            return True
    return False


def _probe_texts(tree: Any, length: int) -> list[str]:
    """Hostile headers built from the pattern's own characters (long runs that almost match, then fail)."""
    chars: list[str] = []

    def collect(items: Any) -> None:
        for op, av in items:
            if op is _sre_c.LITERAL and len(chars) < 6:
                ch = chr(av)
                if ch.isprintable() and ch not in chars:
                    chars.append(ch)
            elif _repeats(op):
                collect(av[2])
            elif op is _sre_c.BRANCH:
                for alt in av[1]:
                    collect(alt)
            elif op is _sre_c.SUBPATTERN:
                collect(av[-1])

    collect(tree)
    for ch in ("a", " ", "0"):
        if ch not in chars:
            chars.append(ch)
    texts = []
    for ch in chars:
        texts += [ch * length, ch * (length - 1) + "!"]
    texts.append(("ab" * length)[:length])
    return texts


@functools.lru_cache(maxsize=512)
def risky_regex(pattern: str) -> bool:
    """True for patterns that can take exponential or high-polynomial time on a short header.

    Nested unbounded repetition (exponential) is refused from the syntax tree. Everything else is measured once
    against hostile headers of growing length up to MAX_REGEX_INPUT; the result is cached per pattern.
    """
    if _sre_parse is None:
        return False
    try:
        tree = _sre_parse.parse(pattern, re.IGNORECASE)
        if _nested_repeat(tree):
            return True
        compiled = re.compile(pattern, re.IGNORECASE)
    except Exception:  # noqa: BLE001 - unparsable: treat as unsafe
        return True
    # grow in steps of two and allow at most quadratic growth towards the budget: anything steeper is caught at a
    # short length, so a single probe never runs for long
    for length in (10, 20, 40, 80, 160, MAX_REGEX_INPUT):
        allowed = max(0.002, REGEX_BUDGET * (length / MAX_REGEX_INPUT) ** 2)
        for text in _probe_texts(tree, length):
            start = time.perf_counter()
            compiled.search(text)
            if time.perf_counter() - start > allowed:
                return True
    return False


class RuleError(ValueError):
    """Invalid rule definition (a ValueError, so Frieda's tool base reports it as a failed call)."""


class RuleNotFound(RuleError, ToolNotFoundError):
    """Rule id unknown (reported as 'not_found' by Frieda's tool base)."""


@dataclass
class Condition:
    field: str
    op: str
    value: str

    def validate(self) -> None:
        if self.field not in FIELDS:
            raise RuleError(f"Unknown condition field '{self.field}' (allowed: {', '.join(FIELDS)})")
        if self.op not in OPS:
            raise RuleError(f"Unknown condition operator '{self.op}' (allowed: {', '.join(OPS)})")
        if not isinstance(self.value, str) or not self.value.strip():
            raise RuleError("Condition value must be a non-empty string")
        if self.op == "regex":
            if len(self.value) > 200:
                raise RuleError("Regex too long (max 200 characters)")
            try:
                re.compile(self.value, re.IGNORECASE)
            except re.error as err:
                raise RuleError(f"Invalid regex {self.value!r}: {err}") from err
            if risky_regex(self.value):
                raise RuleError(
                    f"Regex {self.value!r} could block Home Assistant on some subjects: avoid repeating a repeated or "
                    "alternative part (like (a+)+) and chains of open-ended repetitions (like a+a+a+)"
                )

    def matches(self, summary: dict[str, Any]) -> bool:
        haystacks = _field_values(summary, self.field)
        needle = self.value.strip().lower()
        for hay in haystacks:
            text = hay.lower()
            if self.op == "contains" and needle in text:
                return True
            if self.op == "equals" and text == needle:
                return True
            if self.op == "starts_with" and text.startswith(needle):
                return True
            if self.op == "ends_with" and text.endswith(needle):
                return True
            if self.op == "domain":
                dom = needle.lstrip("@")
                for addr in re.findall(r"[\w.+-]+@([\w.-]+)", text):
                    if addr == dom or addr.endswith("." + dom):
                        return True
            if self.op == "regex" and not risky_regex(self.value):
                if re.search(self.value, hay[:MAX_REGEX_INPUT], re.IGNORECASE):
                    return True
        return False


def _field_values(summary: dict[str, Any], fld: str) -> list[str]:
    def addresses(key: str) -> list[str]:
        return [f"{a.get('name', '')} <{a.get('email', '')}>" for a in summary.get(key) or []]

    if fld == "subject":
        return [summary.get("subject") or ""]
    if fld in ("from", "to", "cc"):
        return addresses(fld)
    return [summary.get("subject") or "", *addresses("from"), *addresses("to"), *addresses("cc")]


@dataclass
class Actions:
    move_to: str | None = None
    mark_seen: bool | None = None
    flag: bool | None = None
    delete: bool = False
    stop: bool = True
    save_attachments: bool = False
    attachments_folder: str | None = None

    def validate(self) -> None:
        if self.move_to is not None and not str(self.move_to).strip():
            raise RuleError("move_to must be a mailbox name")
        if self.delete and self.move_to:
            raise RuleError("A rule cannot both move and delete a message")
        if self.attachments_folder is not None and len(str(self.attachments_folder)) > 120:
            raise RuleError("attachments_folder is too long (max 120 characters)")
        if not any(
            (self.move_to, self.mark_seen is not None, self.flag is not None, self.delete, self.save_attachments)
        ):
            raise RuleError("A rule needs at least one action (move_to, mark_seen, flag, delete or save_attachments)")


@dataclass
class Rule:
    id: str
    name: str
    conditions: list[Condition]
    actions: Actions
    match: str = "all"
    enabled: bool = True
    mailbox: str = "INBOX"
    created: str | None = None
    hits: int = 0

    def validate(self) -> None:
        if not self.name.strip():
            raise RuleError("Rule name must not be empty")
        if self.match not in MATCH_MODES:
            raise RuleError("match must be 'all' or 'any'")
        if not self.conditions:
            raise RuleError("A rule needs at least one condition")
        for cond in self.conditions:
            cond.validate()
        self.actions.validate()

    def matches(self, summary: dict[str, Any]) -> bool:
        results = (c.matches(summary) for c in self.conditions)
        return all(results) if self.match == "all" else any(results)

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        return data

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Rule:
        conds = [Condition(**{k: c.get(k) for k in ("field", "op", "value")}) for c in data.get("conditions", [])]
        act = data.get("actions") or {}
        actions = Actions(
            move_to=act.get("move_to"),
            mark_seen=act.get("mark_seen"),
            flag=act.get("flag"),
            delete=bool(act.get("delete", False)),
            stop=bool(act.get("stop", True)),
            save_attachments=bool(act.get("save_attachments", False)),
            attachments_folder=(str(act["attachments_folder"]).strip() or None)
            if act.get("attachments_folder")
            else None,
        )
        return cls(
            id=str(data.get("id") or uuid.uuid4().hex[:8]),
            name=str(data.get("name", "")),
            conditions=conds,
            actions=actions,
            match=str(data.get("match", "all")),
            enabled=bool(data.get("enabled", True)),
            mailbox=str(data.get("mailbox") or "INBOX"),
            created=data.get("created"),
            hits=int(data.get("hits", 0) or 0),
        )


class RuleEngine:
    """Stores rules in HA storage and applies them to mailboxes."""

    def __init__(
        self,
        hass: HomeAssistant,
        entry_id: str,
        mail: ICloudMail,
        *,
        allow_delete: bool = True,
        guard: Any | None = None,
        audit: Any | None = None,
        attachment_saver: Any | None = None,
    ) -> None:
        self._hass = hass
        self._entry_id = entry_id
        self._mail = mail
        self._guard = guard
        self._audit = audit
        # async (mailbox, uid, folder) -> list of stored files; None = attachments cannot be stored
        self.attachment_saver = attachment_saver
        self._store: Store[dict[str, Any]] = Store(hass, STORAGE_VERSION, f"{CORE_DOMAIN}.rules.{entry_id}")
        self._rules: list[Rule] = []
        self._last_uid: dict[str, int] = {}
        self._uidvalidity: dict[str, int] = {}
        self._loaded = False
        self._lock = asyncio.Lock()
        self.allow_delete = allow_delete
        self.last_run: dict[str, Any] | None = None
        # automation status, shown in the panel
        self.auto_enabled = False
        self.auto_interval: int | None = None
        self.next_run: str | None = None
        self.last_check: dict[str, Any] | None = None
        self.push: Any | None = None  # IMAP IDLE watcher, if push delivery is active
        self.current: dict[str, Any] | None = None  # a pass in progress (push), shown in the panel right away
        # run history (newest last); consecutive empty automatic runs are merged into one entry
        self._history: list[dict[str, Any]] = []
        self._history_seq = 0
        self.account: str = ""  # label of the account, part of the events
        self.activity: Any | None = None  # ActivityLog: one line per checked message (the panel's "Aktivität")

    # ------------------------------------------------------------ storage
    async def async_load(self) -> None:
        if self._loaded:
            return
        data = await self._store.async_load() or {}
        self._rules = [Rule.from_dict(r) for r in data.get("rules", [])]
        self._last_uid = {k: int(v) for k, v in (data.get("last_uid") or {}).items()}
        self._uidvalidity = {k: int(v) for k, v in (data.get("uidvalidity") or {}).items()}
        self.last_run = data.get("last_run")
        self.last_check = data.get("last_check")
        self._history = [_complete_run(r) for r in list(data.get("history") or [])[-HISTORY_MAX:]]
        self._history_seq = int(data.get("history_seq") or len(self._history))
        self._loaded = True

    def _data(self) -> dict[str, Any]:
        return {
            "rules": [r.to_dict() for r in self._rules],
            "last_uid": self._last_uid,
            "uidvalidity": self._uidvalidity,
            "last_run": self.last_run,
            "last_check": self.last_check,
            "history": self._history,
            "history_seq": self._history_seq,
        }

    async def _save(self) -> None:
        await self._store.async_save(self._data())
        async_notify(self._hass, self._entry_id, "rules")

    # -------------------------------------------------------- automation
    def set_automation(self, enabled: bool, interval_minutes: int | None, next_run: datetime | None) -> None:
        """Remember whether the periodic run is active and when it fires next."""
        self.auto_enabled = enabled
        self.auto_interval = interval_minutes if enabled else None
        self.next_run = next_run.isoformat(timespec="seconds") if (enabled and next_run) else None

    def note_check(self, result: str, next_run: datetime | None, error: str | None = None) -> None:
        """Record one tick of the periodic run (also when it had nothing to do)."""
        self.last_check = {"time": _now_iso(), "result": result, "error": error}
        if next_run is not None:
            self.next_run = next_run.isoformat(timespec="seconds")
        self._store.async_delay_save(self._data, 5)
        async_notify(self._hass, self._entry_id, "rules")

    def automation_status(self) -> dict[str, Any]:
        enabled_rules = sum(1 for r in self._rules if r.enabled)
        return {
            "enabled": self.auto_enabled,
            "interval": self.auto_interval,
            "next_run": self.next_run,
            "last_check": self.last_check,
            "enabled_rules": enabled_rules,
            "idle_reason": None if not self.auto_enabled or enabled_rules else "no_enabled_rules",
            "push": self.push.status() if self.push is not None else None,
        }

    # -------------------------------------------------------------- CRUD
    async def async_list(self) -> list[dict[str, Any]]:
        await self.async_load()
        return [r.to_dict() for r in self._rules]

    def _get(self, rule_id: str) -> Rule:
        for rule in self._rules:
            if rule.id == rule_id:
                return rule
        raise RuleNotFound(f"Rule '{rule_id}' not found")

    async def async_create(self, data: dict[str, Any]) -> dict[str, Any]:
        await self.async_load()
        if len(self._rules) >= MAX_RULES:
            raise RuleError(f"Too many rules (max {MAX_RULES})")
        rule = Rule.from_dict({**data, "id": uuid.uuid4().hex[:8], "created": _now_iso(), "hits": 0})
        rule.validate()
        await self._check_mailboxes(rule)
        self._rules.append(rule)
        await self._save()
        return rule.to_dict()

    async def async_update(self, rule_id: str, data: dict[str, Any]) -> dict[str, Any]:
        await self.async_load()
        rule = self._get(rule_id)
        merged = rule.to_dict()
        for key in ("name", "match", "enabled", "mailbox", "conditions"):
            if key in data and data[key] is not None:
                merged[key] = data[key]
        if "actions" in data and data["actions"] is not None:
            merged["actions"] = {**merged["actions"], **{k: v for k, v in data["actions"].items() if v is not None}}
        if data.get("position") is not None:
            pos = max(0, min(int(data["position"]), len(self._rules) - 1))
        else:
            pos = self._rules.index(rule)
        updated = Rule.from_dict(merged)
        updated.validate()
        await self._check_mailboxes(updated)
        self._rules.remove(rule)
        self._rules.insert(pos, updated)
        await self._save()
        return updated.to_dict()

    async def async_delete(self, rule_id: str) -> None:
        await self.async_load()
        rule = self._get(rule_id)
        self._rules.remove(rule)
        await self._save()

    async def _check_mailboxes(self, rule: Rule) -> None:
        try:
            boxes = {b["name"] for b in await self._mail.async_mailboxes()}
        except MailError as err:
            _LOGGER.debug("Cannot verify mailboxes for rule: %s", err)
            return
        if rule.mailbox not in boxes:
            raise RuleError(f"Mailbox '{rule.mailbox}' does not exist")
        if self._guard is not None:
            try:
                self._guard.check_mailbox_writable(rule.mailbox)
                if rule.actions.move_to:
                    self._guard.check_mailbox_visible(rule.actions.move_to)
            except Exception as err:  # noqa: BLE001 - PolicyError lives in guard.py
                raise RuleError(str(err)) from err
        if rule.actions.move_to and rule.actions.move_to not in boxes:
            raise RuleError(f"Target mailbox '{rule.actions.move_to}' does not exist (see icloud_list_mailboxes)")

    # ---------------------------------------------------------------- run
    def enabled_rules(self, mailbox: str | None = None) -> list[Rule]:
        return [r for r in self._rules if r.enabled and (mailbox is None or r.mailbox == mailbox)]

    @property
    def rule_count(self) -> int:
        return len(self._rules)

    @property
    def has_enabled_rules(self) -> bool:
        return any(r.enabled for r in self._rules)

    async def async_run(
        self,
        *,
        scope: str = "new",
        dry_run: bool = False,
        mailbox: str | None = None,
        rule_ids: list[str] | None = None,
        limit: int = MAX_SCAN_ALL,
        trigger: str = "manual",
        record: bool = True,
    ) -> dict[str, Any]:
        """Apply rules. scope 'new' = messages since the last run, 'all' = newest messages."""
        await self.async_load()
        if scope not in ("new", "all"):
            raise RuleError("scope must be 'new' or 'all'")
        async with self._lock:
            rules = [r for r in self._rules if r.enabled and (not rule_ids or r.id in rule_ids)]
            mailboxes = [mailbox] if mailbox else sorted({r.mailbox for r in rules}) or ["INBOX"]
            report: dict[str, Any] = {
                "scope": scope,
                "trigger": trigger,
                "dry_run": dry_run,
                "started": _now_iso(),
                "checked": 0,
                "matched": 0,
                "actions": [],
                "skipped": [],
                "errors": [],
            }
            for box in mailboxes:
                box_rules = [r for r in rules if r.mailbox == box]
                if self._guard is not None:
                    try:
                        self._guard.check_mailbox_writable(box)
                    except Exception as err:  # noqa: BLE001
                        report["skipped"].append({"mailbox": box, "code": "protected", "reason": str(err)})
                        continue
                try:
                    await self._run_mailbox(box, box_rules, scope, dry_run, limit, report)
                except (MailError, MailboxNotFound) as err:
                    report["errors"].append({"mailbox": box, "error": str(err)})
            report["finished"] = _now_iso()
            if not dry_run:
                # dry runs are previews and do not count as the last run
                self.last_run = {k: v for k, v in report.items() if k != "actions"} | {
                    "actions": len(report["actions"])
                }
                report["mailboxes"] = mailboxes
                if record:  # timer and push record the pass after the AI sorting (async_record)
                    self._add_history(report)
                await self._save()
                self._fire_events(report)
            if self._audit is not None and not dry_run and (report["matched"] or report["errors"]):
                try:
                    await self._audit.async_record(
                        tool="icloud_run_rules",
                        action="rules",
                        params={"scope": scope, "mailboxes": mailboxes, "trigger": trigger},
                        result="ok" if not report["errors"] else "error",
                        client=f"rules ({trigger})" if trigger in ("auto", "push") else "rules",
                        error="; ".join(e.get("error", "") for e in report["errors"]) or None,
                        details={
                            "checked": report["checked"],
                            "matched": report["matched"],
                            "actions": len(report["actions"]),
                            "trigger": trigger,
                            "mails": _audit_mails(report["actions"]),
                        },
                    )
                except Exception as err:  # noqa: BLE001
                    _LOGGER.debug("Audit logging of rule run failed: %s", err)
            return report

    def _fire_events(self, report: dict[str, Any]) -> None:
        """Tell automations what an executed run did, and let the sensors refresh."""
        for act in report["actions"][:MAX_EVENTS_PER_RUN]:
            sender = act.get("from") or []
            self._hass.bus.async_fire(
                EVENT_RULE_MATCHED,
                {
                    "account": self.account,
                    "entry_id": self._entry_id,
                    "trigger": report["trigger"],
                    "rule": act["rule"],
                    "rule_id": act["rule_id"],
                    "mailbox": act["mailbox"],
                    "uid": act["uid"],
                    "subject": act.get("subject") or "",
                    "from": sender[0] if sender else "",
                    "move_to": act.get("move_to"),
                    "delete": bool(act.get("delete")),
                    "mark_seen": act.get("mark_seen"),
                    "flag": act.get("flag"),
                },
            )
        async_dispatcher_send(self._hass, SIGNAL_UPDATED.format(self._entry_id))

    # -------------------------------------------------------- pass in progress
    def begin_pass(self, trigger: str, *, ai: bool) -> None:
        """New mail was noticed: the panel shows the pass at once, before rules and AI have finished."""
        self.current = {"trigger": trigger, "started": _now_iso(), "ai": ai}
        async_notify(self._hass, self._entry_id, "rules")

    def end_pass(self) -> None:
        if self.current is not None:
            self.current = None
            async_notify(self._hass, self._entry_id, "rules")

    def history_today(self) -> dict[str, Any]:
        """Runs and matches since local midnight (sensor)."""
        today = datetime.now().astimezone().date()
        runs = matched = 0
        for item in self._history:
            try:
                started = datetime.fromisoformat(str(item.get("finished") or item.get("started")))
            except ValueError:
                continue
            if started.astimezone().date() == today:
                runs += int(item.get("runs") or 1)
                matched += int(item.get("matched") or 0)
        return {"runs": runs, "matched": matched}

    async def async_record(self, report: dict[str, Any], ai: dict[str, Any] | None = None) -> None:
        """Write one pass to the history: the rule run and the AI sorting that followed it (timer and push)."""
        async with self._lock:
            self._add_history(report, ai)
            await self._save()
        async_dispatcher_send(self._hass, SIGNAL_UPDATED.format(self._entry_id))

    async def async_record_ai(self, trigger: str, ai: dict[str, Any] | None) -> None:
        """A pass of the AI sorting alone (no rule ran, or "rate newest" in the panel)."""
        if not ai or not (ai.get("rated") or ai.get("skipped") or ai.get("errors")):
            return
        now = _now_iso()
        report = {
            "started": ai.get("started") or now,
            "finished": now,
            "trigger": trigger,
            "scope": "new",
            "checked": 0,
            "matched": 0,
            "actions": [],
            "skipped": [],
            "errors": [],
            "mailboxes": ["INBOX"],
        }
        await self.async_record(report, ai)

    def _add_history(self, report: dict[str, Any], ai: dict[str, Any] | None = None) -> None:
        """Append a finished pass to the history; automatic passes without any message are merged."""
        mailboxes = report.get("mailboxes") or ["INBOX"]
        uids_per_rule: dict[str, set[Any]] = {}
        for act in report["actions"]:
            uids_per_rule.setdefault(act["rule"], set()).add((act.get("mailbox"), act["uid"]))
        per_rule = {name: len(uids) for name, uids in uids_per_rule.items()}
        mails = handled_mails(report["actions"], report.get("checked_mails"), ai)
        if self.activity is not None:
            self.activity.add_pass(report["trigger"], report["started"], mails)
        ai_part = (
            {
                "rated": int(ai.get("rated") or 0),
                "applied": int(ai.get("applied") or 0),
                "held": int(ai.get("skipped") or 0),
                "errors": [str(e) for e in ai.get("errors") or []][:5],
            }
            if ai
            else None
        )
        ai_busy = bool(ai_part and (ai_part["rated"] or ai_part["held"] or ai_part["errors"]))
        idle = (
            report["trigger"] in ("auto", "push")
            and not report["checked"]
            and not report["matched"]
            and not report["errors"]
            and not ai_busy
        )
        last = self._history[-1] if self._history else None
        if (
            idle
            and last is not None
            and last.get("idle")
            and last.get("scope") == report["scope"]
            and last.get("trigger") == report["trigger"]
        ):
            last["runs"] = int(last.get("runs") or 1) + 1
            last["finished"] = report["finished"]
            last["checked"] = int(last.get("checked") or 0) + report["checked"]
            return
        self._history_seq += 1
        self._history.append(
            {
                "id": self._history_seq,
                "started": report["started"],
                "finished": report["finished"],
                "trigger": report["trigger"],
                "scope": report["scope"],
                "mailboxes": mailboxes,
                "checked": report["checked"],
                "matched": report["matched"],
                "actions": len(report["actions"]),
                "rules": per_rule,
                "ai": ai_part,
                "mails": mails[:HISTORY_MAILS],
                "mails_more": max(0, len(mails) - HISTORY_MAILS),
                "errors": [e.get("error", "") for e in report["errors"]][:5],
                "skipped": len(report["skipped"]),
                "saved_files": len(report.get("saved_files") or []),
                "idle": idle,
                "runs": 1,
            }
        )
        if len(self._history) > HISTORY_MAX:
            del self._history[: len(self._history) - HISTORY_MAX]

    def history(self, limit: int = 50) -> list[dict[str, Any]]:
        """Return the newest runs first."""
        return list(reversed(self._history[-max(1, limit) :]))

    async def async_clear_history(self) -> None:
        await self.async_load()
        self._history = []
        await self._save()

    async def _run_mailbox(
        self,
        box: str,
        rules: list[Rule],
        scope: str,
        dry_run: bool,
        limit: int,
        report: dict[str, Any],
    ) -> None:
        last = self._last_uid.get(box)
        if scope == "new":
            if last is None:
                # first run: establish a baseline instead of processing the backlog
                if not dry_run:
                    self._last_uid[box] = await self._mail.async_last_uid(box)
                    self._remember_validity(box)
                report["skipped"].append(
                    {"mailbox": box, "code": "baseline", "reason": "baseline set, run again or use scope 'all'"}
                )
                return
            # only the new range is fetched from the server, not every UID of the mailbox
            candidates = await self._mail.async_new_uids(box, last)
            if self._validity_changed(box):
                # the server renumbered the mailbox: old UIDs mean nothing, start again from the newest message
                if not dry_run:
                    self._last_uid[box] = await self._mail.async_last_uid(box)
                    self._remember_validity(box)
                report["skipped"].append(
                    {"mailbox": box, "code": "uidvalidity", "reason": "the mailbox was renumbered; baseline set again"}
                )
                return
            if not candidates:
                return
            max_uid = max(candidates)
        else:
            uids = await self._mail.async_search_uids(box, ["ALL"])
            if not uids:
                return
            max_uid = max(uids)
            candidates = sorted(uids, reverse=True)[: max(1, min(limit, MAX_SCAN_ALL))]
        if not dry_run and scope == "new":
            self._last_uid[box] = max_uid
        if not candidates or not rules:
            report["checked"] += len(candidates)
            return

        summaries: list[dict[str, Any]] = []
        candidates.sort()
        for i in range(0, len(candidates), _SUMMARY_CHUNK):
            summaries.extend(await self._mail.async_summaries(box, candidates[i : i + _SUMMARY_CHUNK]))
        report["checked"] += len(summaries)
        checked = report.setdefault("checked_mails", [])
        for summary in summaries[: max(0, HISTORY_MAILS * 3 - len(checked))]:
            sender = summary.get("from") or [{}]
            checked.append(
                {
                    "mailbox": box,
                    "uid": summary["uid"],
                    "subject": summary.get("subject"),
                    "from": sender[0].get("email"),
                    "name": sender[0].get("name"),
                    "message_id": summary.get("message_id"),
                    "date": summary.get("date"),
                }
            )

        # decide per message
        plan: dict[int, dict[str, Any]] = {}
        for summary in summaries:
            uid = summary["uid"]
            decision: dict[str, Any] = {
                "rules": [],
                "seen": None,
                "flag": None,
                "move_to": None,
                "delete": False,
                "save": None,  # attachments folder ("" = default folder) or None
            }
            for rule in rules:
                if not rule.matches(summary):
                    continue
                decision["rules"].append(rule)
                act = rule.actions
                if act.mark_seen is not None:
                    decision["seen"] = act.mark_seen
                if act.flag is not None:
                    decision["flag"] = act.flag
                if act.delete:
                    if self.allow_delete:
                        decision["delete"] = True
                    else:
                        report["skipped"].append(
                            {
                                "uid": uid,
                                "rule": rule.name,
                                "code": "delete_disabled",
                                "reason": "deleting is disabled in the options",
                            }
                        )
                if act.move_to and not decision["move_to"] and not decision["delete"]:
                    decision["move_to"] = act.move_to
                if act.save_attachments and decision["save"] is None:
                    if self.attachment_saver is None:
                        report["skipped"].append(
                            {
                                "uid": uid,
                                "rule": rule.name,
                                "code": "attachments_unavailable",
                                "reason": "no attachment folder is configured",
                            }
                        )
                    else:
                        decision["save"] = act.attachments_folder or ""
                if act.stop or act.move_to or act.delete:
                    break
            if decision["rules"]:
                plan[uid] = decision
                report["matched"] += 1
                for rule in decision["rules"]:
                    report["actions"].append(
                        {
                            "uid": uid,
                            "mailbox": box,
                            "rule": rule.name,
                            "rule_id": rule.id,
                            "subject": summary.get("subject"),
                            "from": [a.get("email") for a in summary.get("from") or []],
                            "message_id": summary.get("message_id"),
                            "move_to": decision["move_to"],
                            "delete": decision["delete"],
                            "mark_seen": decision["seen"],
                            "flag": decision["flag"],
                            "save_attachments": decision["save"] is not None,
                        }
                    )
        if dry_run or not plan:
            return
        self._limit_plan(box, plan, scope, report)
        for d in plan.values():
            for rule in d["rules"]:
                rule.hits += 1
        if not plan:
            return

        # execute in batches: flags first (while the messages are still here), then moves/deletes
        for seen in (True, False):
            group = [u for u, d in plan.items() if d["seen"] is seen]
            if group:
                await self._safe(report, self._mail.async_set_flags(box, group, seen=seen))
        for flag in (True, False):
            group = [u for u, d in plan.items() if d["flag"] is flag]
            if group:
                await self._safe(report, self._mail.async_set_flags(box, group, flagged=flag))
        # attachments are stored before moves/deletes change the uids
        for uid, d in plan.items():
            if d["save"] is None:
                continue
            try:
                stored = await self.attachment_saver(box, uid, d["save"] or None)
            except Exception as err:  # noqa: BLE001 - one failing message must not stop the run
                report["errors"].append({"uid": uid, "error": f"Saving attachments failed: {err}"})
                continue
            report.setdefault("saved_files", []).extend(f["path"] for f in stored if f.get("status") == "saved")
        deletes = [u for u, d in plan.items() if d["delete"]]
        if deletes:
            await self._safe(report, self._mail.async_delete(box, deletes))
        targets: dict[str, list[int]] = {}
        for uid, d in plan.items():
            if d["move_to"] and not d["delete"]:
                targets.setdefault(d["move_to"], []).append(uid)
        for target, group in targets.items():
            await self._safe(report, self._mail.async_move(box, group, target))

    def _current_validity(self, box: str) -> int | None:
        getter = getattr(self._mail, "uidvalidity", None)
        value = getter(box) if callable(getter) else None
        return value if isinstance(value, int) else None

    def _remember_validity(self, box: str) -> None:
        if (value := self._current_validity(box)) is not None:
            self._uidvalidity[box] = value

    def _validity_changed(self, box: str) -> bool:
        current = self._current_validity(box)
        if current is None:
            return False
        known = self._uidvalidity.get(box)
        if known is None:  # stores from older versions: learn it now
            self._uidvalidity[box] = current
            return False
        return current != known

    def _limit_plan(self, box: str, plan: dict[int, dict[str, Any]], scope: str, report: dict[str, Any]) -> None:
        """Per-run cap and hourly quota for unattended and AI-requested runs; defers the rest to the next run."""
        trigger = report.get("trigger")
        guard = self._guard
        limited = trigger in LIMITED_TRIGGERS
        budget = MAX_CHANGES_PER_RUN if limited else len(plan)
        if guard is not None:
            limit = guard.limit(QUOTA_MAIL_MODIFY)
            if limit and limited:
                budget = min(budget, max(0, limit - guard.used(QUOTA_MAIL_MODIFY)))
        deletes_left = MAX_DELETES_PER_RUN if limited else len(plan)
        deferred: list[int] = []
        taken = 0
        for uid in sorted(plan):
            d = plan[uid]
            if taken >= budget or (d["delete"] and deletes_left <= 0):
                deferred.append(uid)
                continue
            taken += 1
            if d["delete"]:
                deletes_left -= 1
        if deferred:
            for uid in deferred:
                del plan[uid]
            report["actions"] = [a for a in report["actions"] if not (a["mailbox"] == box and a["uid"] in deferred)]
            report["matched"] -= len(deferred)
            report["deferred"] = report.get("deferred", 0) + len(deferred)
            report["skipped"].append(
                {
                    "mailbox": box,
                    "code": "limit",
                    "count": len(deferred),
                    "reason": f"{len(deferred)} messages deferred to the next run (per-run limit or hourly quota)",
                }
            )
            if scope == "new":
                # process them next time instead of skipping them for good
                self._last_uid[box] = min(self._last_uid.get(box, 0), min(deferred) - 1)
        if guard is not None and plan:
            guard.consume(QUOTA_MAIL_MODIFY, len(plan))

    @staticmethod
    async def _safe(report: dict[str, Any], coro: Any) -> None:
        try:
            await coro
        except (MailError, MailboxNotFound) as err:
            report["errors"].append({"error": str(err)})


def handled_mails(
    actions: list[dict[str, Any]],
    checked: list[dict[str, Any]] | None = None,
    ai: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """One entry per message of a pass: checked by the rules, acted on by rules, rated by the AI."""
    mails: dict[tuple[Any, Any], dict[str, Any]] = {}

    def entry(box: Any, uid: Any, subject: Any, sender: Any, item: dict[str, Any]) -> dict[str, Any]:
        mail = mails.setdefault(
            (box, uid),
            {
                "subject": str(subject or "")[:200],
                "from": str(sender or "")[:200],
                "mailbox": box,
                "uid": uid,
                "message_id": None,
                "date": None,
                "name": None,
                "rules": [],
                "move_to": None,
                "delete": False,
                "seen": None,
                "flag": None,
                "ai": None,  # set below for mails the AI rated or the kill switch held back
            },
        )
        # the Message-ID links the entry to the mail's timeline (it survives moves, the UID does not)
        for key in ("message_id", "date", "name"):
            if item.get(key) and not mail.get(key):
                mail[key] = str(item[key])[:300]
        return mail

    for item in checked or []:
        entry(item.get("mailbox"), item.get("uid"), item.get("subject"), item.get("from"), item)
    for act in actions:
        sender = act.get("from") or []
        mail = entry(act.get("mailbox"), act.get("uid"), act.get("subject"), sender[0] if sender else "", act)
        mail.update(
            {
                "move_to": act.get("move_to"),
                "delete": bool(act.get("delete")),
                "seen": act.get("mark_seen"),
                "flag": act.get("flag"),
            }
        )
        if act.get("rule") and act["rule"] not in mail["rules"]:
            mail["rules"].append(act["rule"])
    for item in (ai or {}).get("items") or []:
        mail = entry(item.get("mailbox") or "INBOX", item.get("uid"), item.get("subject"), item.get("from"), item)
        mail["ai"] = {k: item.get(k) for k in ("category", "importance", "confidence", "applied", "held")}
    return list(mails.values())


def _complete_run(run: dict[str, Any]) -> dict[str, Any]:
    """A run as stored by any version, with every field of today (older ones lack the mails and their IDs)."""
    run = {"ai": None, "mails": [], "mails_more": 0, **run}
    blank = {"uid": None, "message_id": None, "date": None, "name": None, "ai": None}
    run["mails"] = [{**blank, **mail} for mail in run["mails"] or []]
    for mail in run["mails"]:
        if isinstance(mail["ai"], dict):  # the AI's confidence came with 1.0.24
            mail["ai"] = {"confidence": None, **mail["ai"]}
    return run


def _audit_mails(actions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """The mails a run acted on, for the change log (message id and subject), so it can link to their timelines."""
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for act in actions:
        mid = act.get("message_id")
        if mid and mid not in seen and len(out) < 20:
            seen.add(mid)
            out.append({"message_id": mid, "subject": str(act.get("subject") or "")[:120]})
    return out


def _now_iso() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")
