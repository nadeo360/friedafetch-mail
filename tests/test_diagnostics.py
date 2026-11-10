"""Diagnostics carry what helps to find a fault, and nothing of the mails; a too old Frieda gets a repair."""

from __future__ import annotations

import json
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, patch

from freezegun.api import FrozenDateTimeFactory
from homeassistant.core import HomeAssistant
from homeassistant.helpers import issue_registry as ir

from custom_components.friedafetch_mail.const import DOMAIN, MIN_FRIEDA_VERSION
from custom_components.friedafetch_mail.diagnostics import async_get_config_entry_diagnostics

from .conftest import APPLE_ID, setup_core, setup_postfach
from .test_upgrade import OCTOBER, _upgrade


async def test_diagnostics_without_mail_content(
    hass: HomeAssistant, hass_storage: dict[str, Any], freezer: FrozenDateTimeFactory
) -> None:
    freezer.move_to(OCTOBER)  # the stored data are of October 2026
    entry = await _upgrade(hass, hass_storage)
    hass.config_entries.async_update_entry(
        entry,
        options=entry.options
        | {
            "ai_block_terms": "Diagnose",
            "ai_exclude": "bank.example",
            "digest_notify": "mobile_app_annas_phone",
            "vip_senders": "chefin@firma.example",
            "vip_groups": ["Familie Windeck"],
            "events_calendar": "calendar.therapie",
        },
    )
    await hass.async_block_till_done()
    diag = await async_get_config_entry_diagnostics(hass, entry)
    text = json.dumps(diag)
    for secret in (
        "Rechnung",
        "Stadtwerke",
        "stadtwerke.example",
        "<7@example.com>",
        "Run failed",
        "ci@code.example",
        "Befund",
        "Diagnose",
        "bank.example",
        "annas_phone",
        APPLE_ID,
        '"CI"',  # the value of the rule condition
        "chefin@firma.example",
        "Familie Windeck",
        "therapie",
    ):
        assert secret not in text, secret
    assert diag["versions"]["frieda_postfach"] and diag["versions"]["frieda"]
    assert diag["rules"][0]["conditions"] == [{"field": "subject", "op": "contains"}]
    assert diag["rules"][0]["actions"] == {"delete": True, "stop": True}
    assert diag["runs"][0]["mails"] == 1 and diag["runs"][1]["mails"] == 0
    assert diag["ai"]["ratings"] == 1 and diag["ai"]["status"]["block_terms"] == 1
    assert diag["activity"]["mails"] == 1
    assert diag["mail_state"]["condstore"] is False and diag["mail_state"]["tracked"] == 1
    assert diag["for_you"]["proposals_open"] == 0 and diag["for_you"]["followups"] == 0


async def test_repair_while_frieda_is_too_old(hass: HomeAssistant) -> None:
    from custom_components.friedafetch_mail import async_get_integration as real  # noqa: PLC0415

    version = "2.0.14"

    async def fake(hass: HomeAssistant, domain: str):
        integration = await real(hass, domain)
        return SimpleNamespace(version=version) if domain == "friedafetch" else integration

    core = await setup_core(hass)
    with patch("custom_components.friedafetch_mail.async_get_integration", fake):
        entry = await setup_postfach(hass, core, rules_auto=False)
        issue = ir.async_get(hass).async_get_issue(DOMAIN, "frieda_too_old")
        assert issue is not None
        assert issue.translation_placeholders == {"installed": "2.0.14", "required": MIN_FRIEDA_VERSION}

        version = MIN_FRIEDA_VERSION  # updated: the next start removes the repair
        assert await hass.config_entries.async_reload(entry.entry_id)
        await hass.async_block_till_done()
        assert ir.async_get(hass).async_get_issue(DOMAIN, "frieda_too_old") is None


async def test_diagnostics_leave_out_the_folders_rules_use(hass: HomeAssistant) -> None:
    core = await setup_core(hass)
    entry = await setup_postfach(hass, core, rules_auto=False)
    rules = entry.runtime_data.rules
    rule = {"field": "from", "op": "contains", "value": "praxis"}
    with patch.object(rules, "_check_mailboxes", AsyncMock()):
        await rules.async_create(
            {
                "name": "Arzt",
                "conditions": [rule],
                "actions": {
                    "move_to": "Gesundheit/Dr Weber",
                    "save_attachments": True,
                    "attachments_folder": "Befunde",
                },
            }
        )
        await rules.async_create(
            {"name": "Zweit", "mailbox": "Privat/Anna", "conditions": [rule], "actions": {"flag": True}}
        )
    diag = await async_get_config_entry_diagnostics(hass, entry)
    text = json.dumps(diag)
    for secret in ("Gesundheit", "Weber", "Befunde", "Privat/Anna", "praxis"):
        assert secret not in text, secret
    actions = diag["rules"][0]["actions"]
    assert actions["move_to"] == "**REDACTED**" and actions["save_attachments"] is True
    assert diag["rules"][1]["mailbox"] == "**REDACTED**" and diag["rules"][0]["mailbox"] == "INBOX"
