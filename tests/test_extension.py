"""Frieda Postfach attached to a Frieda account: setup, tools, re-attach, overview, sensor."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import Context, HomeAssistant
from homeassistant.data_entry_flow import FlowResultType
from homeassistant.helpers import issue_registry as ir
from homeassistant.helpers import llm
from pytest_homeassistant_custom_component.common import async_mock_service

from custom_components.friedafetch.const import LLM_API_ID
from custom_components.friedafetch_mail.digest import async_send_digest, render_text
from custom_components.friedafetch_mail.rules import RuleEngine

from .conftest import setup_core, setup_postfach

RULE_TOOLS = {"icloud_list_rules", "icloud_create_rule", "icloud_update_rule", "icloud_delete_rule", "icloud_run_rules"}


async def _tool_names(hass: HomeAssistant) -> set[str]:
    ctx = llm.LLMContext(platform="test", context=Context(), language="de", assistant=None, device_id=None)
    api = await llm.async_get_api(hass, LLM_API_ID, ctx)
    return {t.name for t in api.tools}


# ------------------------------------------------------------ config flow
async def test_config_flow_takes_over_legacy_options(hass: HomeAssistant) -> None:
    result = await hass.config_entries.flow.async_init("friedafetch_mail", context={"source": "user"})
    assert result["type"] is FlowResultType.ABORT and result["reason"] == "no_frieda"

    core = await setup_core(hass, rules_interval=15, rules_auto=False, digest_time="07:00", allow_delete=True)
    result = await hass.config_entries.flow.async_init("friedafetch_mail", context={"source": "user"})
    assert result["type"] is FlowResultType.FORM
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {"account": core.entry_id})
    await hass.async_block_till_done()
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["data"] == {"account": core.entry_id}
    assert result["options"] == {"rules_interval": 15, "rules_auto": False, "digest_time": "07:00"}

    again = await hass.config_entries.flow.async_init("friedafetch_mail", context={"source": "user"})
    assert again["type"] is FlowResultType.ABORT and again["reason"] == "already_configured"


async def test_options_flow(hass: HomeAssistant) -> None:
    core = await setup_core(hass)
    entry = await setup_postfach(hass, core)
    result = await hass.config_entries.options.async_init(entry.entry_id)
    assert result["type"] is FlowResultType.MENU and result["menu_options"] == ["automation", "ai"]
    result = await hass.config_entries.options.async_configure(result["flow_id"], {"next_step_id": "automation"})
    form = {
        "rules_auto": True,
        "rules_interval": 10,
        "rules_push": False,
        "digest_time": "7:5x",
        "digest_notify": "",
        "digest_ai_task": "",
        "birthday_sensor": False,
    }
    result = await hass.config_entries.options.async_configure(result["flow_id"], form)
    assert result["errors"] == {"digest_time": "invalid_time"}
    result = await hass.config_entries.options.async_configure(
        result["flow_id"], form | {"digest_time": "06:45", "digest_notify": "notify.mobile_app_x"}
    )
    await hass.async_block_till_done()
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert entry.options["digest_time"] == "06:45" and entry.options["digest_notify"] == "mobile_app_x"
    assert entry.runtime_data.watcher is None  # push switched off


# --------------------------------------------------------------- lifecycle
async def test_tools_registered_and_removed(hass: HomeAssistant) -> None:
    core = await setup_core(hass)
    assert not RULE_TOOLS & await _tool_names(hass)
    entry = await setup_postfach(hass, core)
    names = await _tool_names(hass)
    assert RULE_TOOLS <= names and "icloud_daily_overview" in names
    assert core.runtime_data.extensions["mail"] is entry.runtime_data.extension

    assert await hass.config_entries.async_unload(entry.entry_id)
    await hass.async_block_till_done()
    assert "mail" not in core.runtime_data.extensions
    assert not RULE_TOOLS & await _tool_names(hass)


async def test_read_only_account_hides_writing_rule_tools(hass: HomeAssistant) -> None:
    core = await setup_core(hass, read_only=True)
    entry = await setup_postfach(hass, core)
    names = await _tool_names(hass)
    assert "icloud_list_rules" in names and "icloud_create_rule" not in names
    assert entry.runtime_data.rules.automation_status()["enabled"] is False  # nothing runs on read-only accounts


async def test_reattaches_after_frieda_reload(hass: HomeAssistant) -> None:
    core = await setup_core(hass)
    entry = await setup_postfach(hass, core)
    old_clients = entry.runtime_data.clients
    assert await hass.config_entries.async_reload(core.entry_id)
    await hass.async_block_till_done()
    assert entry.state is ConfigEntryState.LOADED
    assert entry.runtime_data.clients is core.runtime_data is not old_clients
    assert core.runtime_data.extensions["mail"] is entry.runtime_data.extension


async def test_waits_for_frieda_and_clears_repair_issue(hass: HomeAssistant) -> None:
    core = await setup_core(hass)
    ir.async_create_issue(
        hass,
        "friedafetch",
        f"rules_moved_{core.entry_id}",
        is_fixable=False,
        severity=ir.IssueSeverity.WARNING,
        translation_key="rules_moved",
        translation_placeholders={"account": "test"},
    )
    assert await hass.config_entries.async_unload(core.entry_id)
    from pytest_homeassistant_custom_component.common import MockConfigEntry

    entry = MockConfigEntry(
        domain="friedafetch_mail", title="test", unique_id=core.entry_id, data={"account": core.entry_id}
    )
    entry.add_to_hass(hass)
    await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    assert entry.state is ConfigEntryState.SETUP_RETRY
    # Frieda comes back -> Frieda Postfach attaches without waiting for the retry timer
    assert await hass.config_entries.async_setup(core.entry_id)
    await hass.async_block_till_done()
    assert entry.state is ConfigEntryState.LOADED
    assert ir.async_get(hass).async_get_issue("friedafetch", f"rules_moved_{core.entry_id}") is None


async def test_push_watcher_and_mailbox_stats_coverage(hass: HomeAssistant) -> None:
    core = await setup_core(hass)
    entry = await setup_postfach(hass, core)
    link = entry.runtime_data
    assert link.watcher is not None and link.rules.push is link.watcher
    assert link.rules.automation_status()["push"]["mailbox"] == "INBOX"
    with patch(
        "custom_components.friedafetch.mail.ICloudMail.async_mailboxes",
        AsyncMock(return_value=[{"name": "INBOX", "special_use": None}]),
    ):
        await link.rules.async_create(
            {
                "name": "Shop",
                "conditions": [{"field": "from", "op": "domain", "value": "shop.example"}],
                "actions": {"mark_seen": True},
            }
        )
    summaries = [{"uid": 1, "seen": False, "newsletter": True, "from": [{"name": "", "email": "n@shop.example"}]}]
    ctx = llm.LLMContext(platform="test", context=Context(), language="de", assistant=None, device_id=None)
    api = await llm.async_get_api(hass, LLM_API_ID, ctx)
    with (
        patch("custom_components.friedafetch.mail.ICloudMail.async_search_uids", AsyncMock(return_value=[1])),
        patch("custom_components.friedafetch.mail.ICloudMail.async_summaries", AsyncMock(return_value=summaries)),
    ):
        result = await api.async_call_tool(llm.ToolInput(tool_name="icloud_mailbox_stats", tool_args={}))
    assert result.data["top_senders"][0]["covered_by"] == "Shop"
    assert result.data["rule_suggestions"] == []

    # status shown on the Frieda overview
    status = link.extension.status()
    assert status["rules_total"] == 1 and status["rules_enabled"] == 1
    assert status["auto"] is True and status["interval"] >= 1
    assert status["push"] == link.watcher.state

    from custom_components.friedafetch.frontend import _postfach  # noqa: PLC0415

    overview = await _postfach(hass, core)
    assert overview["state"] == "running" and overview["status"]["rules_total"] == 1
    assert overview["version"]


# ------------------------------------------------------------------ rules
async def test_rule_saves_attachments_before_deleting(hass: HomeAssistant) -> None:
    mail = MagicMock()
    mail.async_mailboxes = AsyncMock(return_value=[{"name": "INBOX", "special_use": None}])
    mail.async_search_uids = AsyncMock(return_value=[5])
    mail.async_summaries = AsyncMock(
        return_value=[{"uid": 5, "subject": "Ihre Rechnung", "from": [{"name": "", "email": "bill@shop.example"}]}]
    )
    order: list[str] = []
    mail.async_delete = AsyncMock(side_effect=lambda *a, **k: order.append("delete"))
    saver = AsyncMock(
        side_effect=lambda *a: order.append("save") or [{"status": "saved", "path": "Belege/2026-10/x.pdf"}]
    )
    engine = RuleEngine(hass, "entry-att", mail, attachment_saver=saver)
    await engine.async_create(
        {
            "name": "Belege",
            "conditions": [{"field": "subject", "op": "contains", "value": "rechnung"}],
            "actions": {"delete": True, "save_attachments": True, "attachments_folder": "Belege"},
        }
    )
    report = await engine.async_run(scope="all")
    saver.assert_awaited_once_with("INBOX", 5, "Belege")
    assert order == ["save", "delete"]
    assert report["saved_files"] == ["Belege/2026-10/x.pdf"] and engine.history()[0]["saved_files"] == 1
    engine.attachment_saver = None
    report = await engine.async_run(scope="all")
    assert any(s["code"] == "attachments_unavailable" for s in report["skipped"])


async def test_rules_storage_is_shared_with_frieda_1x(hass: HomeAssistant, hass_storage) -> None:
    """Rules stored by Frieda < 2.0 under friedafetch.rules.<account> are picked up unchanged."""
    core = await setup_core(hass)
    hass_storage[f"friedafetch.rules.{core.entry_id}"] = {
        "version": 1,
        "key": f"friedafetch.rules.{core.entry_id}",
        "data": {
            "rules": [
                {
                    "id": "abc",
                    "name": "Alt",
                    "conditions": [{"field": "subject", "op": "contains", "value": "x"}],
                    "actions": {"mark_seen": True},
                }
            ],
            "last_uid": {"INBOX": 10},
        },
    }
    entry = await setup_postfach(hass, core)
    assert [r["name"] for r in await entry.runtime_data.rules.async_list()] == ["Alt"]


# --------------------------------------------------------------- overview
def test_render_text() -> None:
    title, text = render_text(
        {
            "unread": [
                {"from": "Chef", "subject": "Budget", "newsletter": False},
                {"from": "Shop", "subject": "Deal", "newsletter": True},
            ],
            "rules": {"Werbung": 4, "Belege": 1},
            "events": [{"summary": "Zahnarzt", "start": "2026-10-17T09:30:00+02:00", "all_day": False}],
            "birthdays": [{"name": "Anna", "in_days": 0}],
        },
        "de",
    )
    assert title == "Frieda – Tagesüberblick"
    assert "2 ungelesene Mails" in text and "Chef: Budget" in text and "Shop: Deal" not in text
    assert "Regeln: 5 Mails verarbeitet" in text and "09:30 Zahnarzt" in text and "Anna (heute)" in text


async def test_send_digest_paths(hass: HomeAssistant) -> None:
    hass.config.language = "de"
    clients = MagicMock()
    clients.options = {"enable_calendar": False, "enable_contacts": False, "enable_mail": False}
    notifications = async_mock_service(hass, "persistent_notification", "create")
    result = await async_send_digest(hass, clients, {})
    assert result["sent_to"] == "persistent_notification" and len(notifications) == 1

    phone = async_mock_service(hass, "notify", "mobile_app_iphone")
    async_mock_service(
        hass, "ai_task", "generate_data", response={"data": "Guten Morgen! Alles ruhig."}, supports_response=True
    )
    opts = {"digest_notify": "notify.mobile_app_iphone", "digest_ai_task": "ai_task.google"}
    result = await async_send_digest(hass, clients, opts, account="privat")
    assert result["ai"] is True and result["sent_to"] == "notify.mobile_app_iphone"
    assert phone[0].data == {"title": "Frieda – Tagesüberblick (privat)", "message": "Guten Morgen! Alles ruhig."}


async def test_send_digest_service(hass: HomeAssistant) -> None:
    core = await setup_core(hass)
    with patch(
        "custom_components.friedafetch_mail.digest.async_send_digest",
        AsyncMock(return_value={"sent_to": "persistent_notification", "message": "x"}),
    ) as send:
        await setup_postfach(hass, core)
        response = await hass.services.async_call(
            "friedafetch_mail", "send_digest", {}, blocking=True, return_response=True
        )
    send.assert_awaited_once()
    assert response["results"][0]["sent_to"] == "persistent_notification"
    with pytest.raises(Exception, match="No Frieda Postfach account"):
        await hass.services.async_call(
            "friedafetch_mail", "send_digest", {"account": "nope"}, blocking=True, return_response=True
        )


async def test_birthday_sensor(hass: HomeAssistant) -> None:
    from homeassistant.util import dt as dt_util

    today = dt_util.now().date()
    contacts = [{"uid": "1", "full_name": "Anna", "birthday": f"1990-{today:%m-%d}"}]
    core = await setup_core(hass)
    with patch(
        "custom_components.friedafetch.carddav_client.ICloudCardDav.async_search", AsyncMock(return_value=contacts)
    ):
        await setup_postfach(hass, core)
    states = [s for s in hass.states.async_all("sensor") if "birthday" in s.entity_id or "geburtstag" in s.entity_id]
    assert len(states) == 1
    assert states[0].state == today.isoformat() and states[0].attributes["names"] == ["Anna"]
