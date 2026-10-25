"""Panel and websocket API of Frieda Postfach."""

from unittest.mock import AsyncMock, patch

from homeassistant.components import frontend
from homeassistant.core import HomeAssistant

from .conftest import setup_core, setup_postfach

MAILBOXES = [{"name": "INBOX", "special_use": None}, {"name": "Archive", "special_use": None}]


async def test_panel_registered_and_removed(hass: HomeAssistant) -> None:
    core = await setup_core(hass)
    entry = await setup_postfach(hass, core)
    panels = hass.data[frontend.DATA_PANELS]
    assert "frieda-postfach" in panels and panels["frieda-postfach"].require_admin is True
    assert "friedafetch" in panels  # Frieda keeps its own panel (accounts, approvals, activity)
    cards = [
        u for u in hass.data[frontend.DATA_EXTRA_MODULE_URL].urls if u.startswith("/friedafetch_mail_static/card.js")
    ]
    assert len(cards) == 1  # the dashboard card, on every dashboard
    assert await hass.config_entries.async_unload(entry.entry_id)
    await hass.async_block_till_done()
    assert "frieda-postfach" not in hass.data[frontend.DATA_PANELS]
    assert not [u for u in hass.data[frontend.DATA_EXTRA_MODULE_URL].urls if "card.js" in u]


async def test_static_panel_served(hass: HomeAssistant, hass_client) -> None:
    core = await setup_core(hass)
    await setup_postfach(hass, core)
    client = await hass_client()
    resp = await client.get("/friedafetch_mail_static/panel.js")
    assert resp.status == 200
    body = await resp.text()
    assert "friedafetch-mail-panel" in body and "friedafetch_mail/rules/run" in body
    assert "friedafetch/approvals" not in body
    card = await client.get("/friedafetch_mail_static/card.js")
    assert card.status == 200 and "friedafetch-mail-card" in await card.text()
    for module in ("i18n.js", "styles.js"):  # loaded by panel.js with the same version query
        resp = await client.get(f"/friedafetch_mail_static/{module}?v=1")
        assert resp.status == 200 and "export const" in await resp.text()
    # the panel takes its design from Frieda's library; the cache key covers both versions
    assert "/friedafetch_static/ui.js" in body
    lib = await client.get("/friedafetch_static/ui.js")
    assert lib.status == 200 and "UI_API" in await lib.text()
    module_url = hass.data[frontend.DATA_PANELS]["frieda-postfach"].config["_panel_custom"]["module_url"]
    assert module_url.count("-") >= 1


async def test_websocket_rule_lifecycle(hass: HomeAssistant, hass_ws_client) -> None:
    with patch(
        "custom_components.friedafetch.mail.ICloudMail.async_mailboxes", new_callable=AsyncMock, return_value=MAILBOXES
    ):
        core = await setup_core(hass)
        entry = await setup_postfach(hass, core)
        ws = await hass_ws_client(hass)

        await ws.send_json({"id": 1, "type": "friedafetch_mail/accounts"})
        msg = await ws.receive_json()
        account = msg["result"]["accounts"][0]
        assert msg["success"] and account["entry_id"] == entry.entry_id and account["label"] == "test"
        assert account["rules_total"] == 0 and account["rules_auto"] is True and account["rules_push"] is True

        await ws.send_json({"id": 2, "type": "friedafetch_mail/mailboxes"})
        msg = await ws.receive_json()
        assert msg["result"]["mailboxes"] == ["INBOX", "Archive"]

        rule = {
            "name": "Rechnungen",
            "conditions": [{"field": "subject", "op": "contains", "value": "rechnung"}],
            "actions": {"move_to": "Archive"},
        }
        await ws.send_json({"id": 3, "type": "friedafetch_mail/rules/create", "rule": rule})
        msg = await ws.receive_json()
        assert msg["success"], msg
        rule_id = msg["result"]["rule"]["id"]

        await ws.send_json(
            {"id": 4, "type": "friedafetch_mail/rules/update", "rule_id": rule_id, "changes": {"enabled": False}}
        )
        msg = await ws.receive_json()
        assert msg["success"] and msg["result"]["rule"]["enabled"] is False

        await ws.send_json({"id": 5, "type": "friedafetch_mail/rules/list"})
        msg = await ws.receive_json()
        assert [r["id"] for r in msg["result"]["rules"]] == [rule_id]

        await ws.send_json({"id": 6, "type": "friedafetch_mail/rules/create", "rule": rule | {"actions": {}}})
        msg = await ws.receive_json()
        assert msg["success"] is False and msg["error"]["code"] == "rule_error"

        await ws.send_json({"id": 7, "type": "friedafetch_mail/rules/delete", "rule_id": "nope"})
        msg = await ws.receive_json()
        assert msg["success"] is False and msg["error"]["code"] == "not_found"

        with patch(
            "custom_components.friedafetch_mail.rules.RuleEngine.async_run",
            new_callable=AsyncMock,
            return_value={"scope": "all", "dry_run": True, "checked": 0, "matched": 0, "actions": []},
        ) as run:
            await ws.send_json({"id": 8, "type": "friedafetch_mail/rules/run", "scope": "all", "dry_run": True})
            msg = await ws.receive_json()
        assert msg["success"] and msg["result"]["dry_run"] is True
        run.assert_awaited_once_with(scope="all", dry_run=True, mailbox=None, rule_ids=None)


async def test_websocket_requires_admin(hass: HomeAssistant, hass_ws_client, hass_read_only_access_token) -> None:
    core = await setup_core(hass)
    await setup_postfach(hass, core)
    ws = await hass_ws_client(hass, hass_read_only_access_token)
    await ws.send_json({"id": 1, "type": "friedafetch_mail/rules/list"})
    msg = await ws.receive_json()
    assert msg["success"] is False and msg["error"]["code"] == "unauthorized"


def test_panel_texts_have_no_key_twice_and_both_languages_the_same_keys() -> None:
    """A key written twice silently replaces the first text (a new "fyWaiting" once renamed a tile of "Your week")."""
    import re  # noqa: PLC0415
    from pathlib import Path  # noqa: PLC0415

    source = (Path(__file__).parent.parent / "custom_components/friedafetch_mail/frontend/i18n.js").read_text()
    de, en = re.split(r"\n  en: \{", source.split("\n  de: {", 1)[1], maxsplit=1)
    keys = {lang: re.findall(r"^    ([A-Za-z_0-9]+):", block, re.M) for lang, block in (("de", de), ("en", en))}
    for lang, found in keys.items():
        assert not sorted({k for k in found if found.count(k) > 1}), lang
    assert set(keys["de"]) == set(keys["en"])
