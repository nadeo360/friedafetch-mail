"""AI tools contributed by Frieda Postfach (registered with the Frieda account they extend)."""

from __future__ import annotations

from typing import Any

from custom_components.friedafetch.const import (
    CONF_APPROVAL_DELETE,
    CONF_APPROVAL_MASS,
    DEFAULT_APPROVAL_DELETE,
    DEFAULT_APPROVAL_MASS,
)
from custom_components.friedafetch.llm_api import ICloudTool
from custom_components.friedafetch.schema import vol
from custom_components.friedafetch.util import UNTRUSTED_NOTICE, clamp

from .const import EXTENSION_NAME
from .rules import FIELDS, MATCH_MODES, OPS, RuleEngine

_CONDITION = {
    vol.Required("field", description="Which header to test: from, to, cc, subject or any"): vol.In(FIELDS),
    vol.Required("op", description="contains, equals, starts_with, ends_with, domain (sender domain) or regex"): vol.In(
        OPS
    ),
    vol.Required("value", description="Text to compare with (case-insensitive)"): str,
}
_ACTIONS = {
    vol.Optional("move_to", description="Target mailbox name (see icloud_list_mailboxes)"): str,
    vol.Optional("mark_seen", description="Mark as read (true) or unread (false)"): bool,
    vol.Optional("flag", description="Flag (true) or unflag (false)"): bool,
    vol.Optional("delete", description="Move to the trash"): bool,
    vol.Optional("stop", description="Stop evaluating further rules for a matching message (default true)"): bool,
    vol.Optional(
        "save_attachments", description="Store the attachments in the Frieda attachment folder (e.g. receipts)"
    ): bool,
    vol.Optional("attachments_folder", description="Subfolder for stored attachments, e.g. 'Receipts'"): str,
}


class RuleTool(ICloudTool):
    """Base for rule tools: requires the rule engine of Frieda Postfach."""

    @property
    def rules(self) -> RuleEngine:
        ext = self.clients.extensions.get(EXTENSION_NAME)
        if ext is None:
            raise ValueError("Inbox rules are not available (Frieda Postfach is not set up for this account)")
        return ext.rules

    # A rule is a mass action in disguise: an AI could create "delete everything from @" and run it on the whole
    # mailbox. So rules that delete or move, and real runs over the whole mailbox, follow Frieda's approvals
    # ("approve deleting" and the mass threshold) and the injection lock.
    @staticmethod
    def _destructive(actions: dict[str, Any] | None) -> bool:
        return bool(actions) and bool(actions.get("delete") or actions.get("move_to"))

    def _reason_for(self, *, deletes: bool, mass: bool) -> str | None:
        if self.clients.approvals is None:
            return None
        opts = self.clients.options
        if deletes and opts.get(CONF_APPROVAL_DELETE, DEFAULT_APPROVAL_DELETE):
            return "rule"
        if mass and int(opts.get(CONF_APPROVAL_MASS, DEFAULT_APPROVAL_MASS) or 0) > 0:
            return "rule"
        return None

    def _resulting_actions(self, args: dict[str, Any]) -> dict[str, Any]:
        return dict(args.get("actions") or {})

    def is_critical(self, args: dict[str, Any]) -> bool:
        return self._destructive(self._resulting_actions(args))

    def approval_reason(self, args: dict[str, Any]) -> str | None:
        actions = self._resulting_actions(args)
        if not self._destructive(actions) or args.get("enabled") is False:
            return None
        return self._reason_for(deletes=bool(actions.get("delete")), mass=True)

    def approval_summary(self, args: dict[str, Any]) -> str:
        actions = self._resulting_actions(args)
        parts = [f"rule: {args.get('name') or args.get('rule_id') or '?'}"]
        if actions.get("delete"):
            parts.append("action: delete (trash)")
        if actions.get("move_to"):
            parts.append(f"action: move to {actions['move_to']}")
        conds = args.get("conditions") or []
        if conds:
            parts.append(
                "conditions: " + ", ".join(f"{c.get('field')} {c.get('op')} {c.get('value')}" for c in conds[:5])
            )
        return "; ".join(parts)


class ListRules(RuleTool):
    name = "icloud_list_rules"
    feature = "mail"
    description = (
        "List the inbox rules managed by Home Assistant (with ids, conditions, actions, hit counters) and the last run."
    )
    parameters = vol.Schema({})

    async def run(self, hass, args):
        return {
            "rules": await self.rules.async_list(),
            "last_run": self.rules.last_run,
            "automation": self.rules.automation_status(),
            "recent_runs": self.rules.history(10),
        }


class CreateRule(RuleTool):
    name = "icloud_create_rule"
    feature = "mail"
    writes = True
    description = (
        "Create an inbox rule that Home Assistant applies to new e-mails (and on demand to the whole mailbox). "
        "Example: move everything from newsletter@example.com to 'Archive'. Rules are evaluated in order."
    )
    parameters = vol.Schema(
        {
            vol.Required("name"): str,
            vol.Required("conditions", description="One or more conditions"): [_CONDITION],
            vol.Required("actions"): _ACTIONS,
            vol.Optional("match", description="all (default) or any of the conditions"): vol.In(MATCH_MODES),
            vol.Optional("enabled"): bool,
            vol.Optional("mailbox", description="Mailbox the rule watches, default INBOX"): str,
        }
    )

    async def run(self, hass, args):
        return await self.rules.async_create(args)


class UpdateRule(RuleTool):
    name = "icloud_update_rule"
    feature = "mail"
    writes = True
    description = "Change an inbox rule (only the provided fields change; conditions replace the list). 'position' reorders the rule."
    parameters = vol.Schema(
        {
            vol.Required("rule_id"): str,
            vol.Optional("name"): str,
            vol.Optional("conditions"): [_CONDITION],
            vol.Optional("actions"): _ACTIONS,
            vol.Optional("match"): vol.In(MATCH_MODES),
            vol.Optional("enabled"): bool,
            vol.Optional("mailbox"): str,
            vol.Optional("position", description="New index in the rule order (0 = first)"): int,
        }
    )

    def _resulting_actions(self, args: dict[str, Any]) -> dict[str, Any]:
        try:
            current = self.rules._get(args["rule_id"])  # noqa: SLF001 - same package
        except Exception:  # noqa: BLE001 - unknown rule: the run reports not_found
            return dict(args.get("actions") or {})
        merged = {**current.to_dict().get("actions", {}), **(args.get("actions") or {})}
        enabled = args.get("enabled", current.enabled)
        return merged if enabled else {}

    def approval_reason(self, args: dict[str, Any]) -> str | None:
        actions = self._resulting_actions(args)
        if not self._destructive(actions):
            return None
        return self._reason_for(deletes=bool(actions.get("delete")), mass=True)

    async def run(self, hass, args):
        rule_id = args.pop("rule_id")
        if not args:
            raise ValueError("No fields to update")
        return await self.rules.async_update(rule_id, args)


class DeleteRule(RuleTool):
    name = "icloud_delete_rule"
    feature = "mail"
    writes = True
    description = "Delete an inbox rule."
    parameters = vol.Schema({vol.Required("rule_id"): str})

    async def run(self, hass, args):
        await self.rules.async_delete(args["rule_id"])
        return {"deleted": True, "rule_id": args["rule_id"]}


class RunRules(RuleTool):
    name = "icloud_run_rules"
    feature = "mail"
    writes = True
    description = (
        "Apply the inbox rules now. scope 'all' (default) checks the newest messages of the mailbox, "
        "'new' only messages since the last automatic run. dry_run=true only reports what would happen."
    )
    parameters = vol.Schema(
        {
            vol.Optional("scope"): vol.In(["new", "all"]),
            vol.Optional("dry_run"): bool,
            vol.Optional("mailbox"): str,
            vol.Optional("rule_ids", description="Only these rules"): [str],
            vol.Optional("limit", description="Newest messages to inspect for scope 'all' (default 2000)"): int,
        }
    )

    def _selected(self, args: dict[str, Any]) -> list[Any]:
        try:
            rules = self.rules.enabled_rules(args.get("mailbox"))
        except Exception:  # noqa: BLE001
            return []
        wanted = args.get("rule_ids")
        return [r for r in rules if not wanted or r.id in wanted]

    def is_critical(self, args: dict[str, Any]) -> bool:
        return not args.get("dry_run")

    def approval_reason(self, args: dict[str, Any]) -> str | None:
        if args.get("dry_run") or (args.get("scope") or "all") != "all":
            return None  # "new" does what the automation does anyway
        deletes = any(r.actions.delete for r in self._selected(args))
        return self._reason_for(deletes=deletes, mass=True)

    def approval_summary(self, args: dict[str, Any]) -> str:
        names = ", ".join(r.name for r in self._selected(args)[:8]) or "all enabled rules"
        return f"apply rules to the whole mailbox ({args.get('mailbox') or 'all rule mailboxes'}): {names}"

    async def run(self, hass, args):
        return await self.rules.async_run(
            scope=args.get("scope") or "all",
            dry_run=bool(args.get("dry_run")),
            mailbox=args.get("mailbox"),
            rule_ids=args.get("rule_ids"),
            limit=clamp(args.get("limit"), 2000, 2000),
            trigger="assistant",
        )


class DailyOverview(ICloudTool):
    name = "icloud_daily_overview"
    feature = "core"
    description = (
        "Collect today's overview: unread e-mails since yesterday, inbox rule activity, today's events and "
        "birthdays in the next 7 days. Use it for questions like 'what is on today?'."
    )
    parameters = vol.Schema({})

    async def run(self, hass, args):
        from .digest import async_collect  # noqa: PLC0415

        ext = self.clients.extensions.get(EXTENSION_NAME)
        data: dict[str, Any] = await async_collect(hass, self.clients, ext.rules if ext else None)
        data["content_notice"] = UNTRUSTED_NOTICE
        return data


class ForYouTool(ICloudTool):
    """Base for the tools of "For you": they read what Frieda Postfach worked out locally."""

    @property
    def insights(self) -> Any:
        ext = self.clients.extensions.get(EXTENSION_NAME)
        insights = getattr(ext, "insights", None)
        if insights is None:
            raise ValueError("This is not available (Frieda Postfach is not set up for this account)")
        return insights


class MailForYou(ForYouTool):
    name = "icloud_mail_for_you"
    feature = "mail"
    description = (
        "What needs the user's attention in their mail, worked out locally by Frieda Postfach: important mail of "
        "today that is still unread (rated important by the AI sorting, or from an important sender), mail the user "
        "sent that is still waiting for a reply, appointments and deadlines found in mails (calendar proposals, with "
        "ids for icloud_add_proposed_event), parcels on their way (carrier, status, expected day), rule suggestions, "
        "newsletters never opened, and this week's numbers. "
        "Use it for questions like 'what is important in my mail today?' or 'who still owes me an answer?'."
    )
    parameters = vol.Schema(
        {vol.Optional("refresh", description="Look at the mailbox again first (slower; normally every 3 hours)"): bool}
    )

    async def run(self, hass, args):
        insights = self.insights
        if args.get("refresh"):
            await insights.async_vips(force=True)
            await insights.async_followups(force=True)
            await insights.async_subscriptions(force=True)
        data = await insights.async_get()
        return {
            "important_unread": insights.important_unread(),
            "waiting_for_reply": [
                {
                    "subject": f["subject"],
                    "to": [p.get("name") or p["email"] for p in f["to"]] + ([f"+{f['more']}"] if f.get("more") else []),
                    "sent": f["sent"],
                    "days": f["days"],
                }
                for f in data["followups"]
            ],
            "calendar_proposals": [
                {k: p.get(k) for k in ("id", "kind", "title", "start", "end", "all_day", "location", "from", "subject")}
                for p in data["proposals"]
            ],
            "rule_suggestions": [
                {k: g[k] for k in ("sender", "folder", "count", "total")} for g in data["suggestions"]
            ],
            "never_opened_newsletters": [
                {"sender": n["sender"], "name": n.get("name") or "", "count": n["count"]}
                for n in data["subscriptions"]
                if n.get("never_opened") and not n.get("unsubscribed")
            ],
            "parcels": [
                {k: p[k] for k in ("carrier", "number", "shop", "status", "eta", "window", "url")}
                for p in data["parcels"]
            ],
            "week": {k: v for k, v in data["week"].items() if k != "trend"},  # the panel's trend lines stay there
            "checked": data.get("followups_checked"),
            "content_notice": UNTRUSTED_NOTICE,
        }


class AddProposedEvent(ForYouTool):
    name = "icloud_add_proposed_event"
    feature = "calendar"
    writes = True
    description = (
        "Put a calendar proposal of icloud_mail_for_you into the calendar – only when the user asked for it. Title "
        "and times may be changed (YYYY-MM-DD for a whole day, YYYY-MM-DDTHH:MM in local time); the calendar by id or "
        "name, otherwise the one of the options. Calendars that Frieda protects are never used."
    )
    parameters = vol.Schema(
        {
            vol.Required("proposal_id", description="id from icloud_mail_for_you (calendar_proposals)"): str,
            vol.Optional("calendar", description="Calendar id or name"): str,
            vol.Optional("title"): str,
            vol.Optional("start"): str,
            vol.Optional("end"): str,
        }
    )

    async def run(self, hass, args):
        from custom_components.friedafetch.const import (  # noqa: PLC0415
            CONF_ENABLE_CALENDAR,
            CONF_READ_ONLY,
            DEFAULT_ENABLE_CALENDAR,
            DEFAULT_READ_ONLY,
        )

        opts = self.clients.options
        proposal = await self.insights.async_add_event(
            str(args["proposal_id"]),
            calendar_id=args.get("calendar"),
            title=args.get("title"),
            start=args.get("start"),
            end=args.get("end"),
            read_only=bool(opts.get(CONF_READ_ONLY, DEFAULT_READ_ONLY)),
            calendar_on=bool(opts.get(CONF_ENABLE_CALENDAR, DEFAULT_ENABLE_CALENDAR)),
            audit=False,  # this tool's call is in the change log already
        )
        return {k: proposal.get(k) for k in ("id", "title", "start", "end", "all_day", "calendar", "status")}


TOOL_CLASSES: list[type[ICloudTool]] = [
    ListRules,
    CreateRule,
    UpdateRule,
    DeleteRule,
    RunRules,
    DailyOverview,
    MailForYou,
    AddProposedEvent,
]
