"""The connection between a Frieda Postfach entry and the Frieda account it extends."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from .rules import RuleEngine
from .tools import TOOL_CLASSES


@dataclass
class MailExtension:
    """Registered in ``ICloudClients.extensions['mail']`` of the Frieda account."""

    rules: RuleEngine
    tool_classes: list = field(default_factory=lambda: list(TOOL_CLASSES))

    def rule_matcher(self, mailbox: str) -> Callable[[dict[str, Any]], str | None]:
        """Name of the first enabled rule that matches a message summary (used by icloud_mailbox_stats)."""
        rules = self.rules.enabled_rules(mailbox)

        def covered(summary: dict[str, Any]) -> str | None:
            return next((r.name for r in rules if r.matches(summary)), None)

        return covered


@dataclass
class AccountLink:
    """Runtime data of a Frieda Postfach entry."""

    core_entry_id: str
    clients: Any  # custom_components.friedafetch.llm_api.ICloudClients
    label: str
    apple_id: str
    rules: RuleEngine
    extension: MailExtension
    watcher: Any | None = None
