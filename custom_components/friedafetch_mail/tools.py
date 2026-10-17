"""AI tools contributed by Frieda Postfach (registered with the Frieda account they extend)."""

from __future__ import annotations

from typing import Any

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

    async def run(self, hass, args):
        return await self.rules.async_run(
            scope=args.get("scope") or "all",
            dry_run=bool(args.get("dry_run")),
            mailbox=args.get("mailbox"),
            rule_ids=args.get("rule_ids"),
            limit=clamp(args.get("limit"), 2000, 2000),
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


TOOL_CLASSES: list[type[ICloudTool]] = [ListRules, CreateRule, UpdateRule, DeleteRule, RunRules, DailyOverview]
