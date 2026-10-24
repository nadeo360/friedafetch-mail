"""The rule editor's live preview: a draft is tried on the newest mails of the activity."""

from __future__ import annotations

from homeassistant.core import HomeAssistant

from .test_activity import _mail, _setup, dt_now_iso


async def test_a_draft_is_tried_on_the_newest_mails(hass: HomeAssistant, hass_ws_client) -> None:
    entry = await _setup(hass)
    log = entry.runtime_data.activity
    log.add_pass("push", dt_now_iso(), [_mail(1, subject="Rechnung Oktober"), _mail(2, subject="Treffen morgen?")])
    log.add_pass("push", dt_now_iso(), [_mail(3, subject="Ihre Rechnung", **{"from": "billing@shop.example"})])
    ws = await hass_ws_client(hass)

    async def preview(msg_id: int, conditions: list[dict[str, str]], match: str = "all") -> dict:
        await ws.send_json(
            {"id": msg_id, "type": "friedafetch_mail/rules/preview", "conditions": conditions, "match": match}
        )
        return await ws.receive_json()

    res = (await preview(1, [{"field": "subject", "op": "contains", "value": "rechnung"}]))["result"]
    assert (res["checked"], res["total"], res["unknown"]) == (3, 2, False)
    assert [m["subject"] for m in res["matches"]] == ["Ihre Rechnung", "Rechnung Oktober"]  # newest first

    both = [
        {"field": "subject", "op": "contains", "value": "Rechnung"},
        {"field": "from", "op": "domain", "value": "shop.example"},
    ]
    assert (await preview(2, both))["result"]["total"] == 1
    assert (await preview(3, both, "any"))["result"]["total"] == 2

    to = (await preview(4, [{"field": "to", "op": "contains", "value": "me"}]))["result"]
    assert to["unknown"] is True and to["total"] == 0  # the activity does not know the recipients

    bad = await preview(5, [{"field": "subject", "op": "regex", "value": "(a+)+$"}])
    assert bad["success"] is False  # the same regex safety check as real rules
    assert (await preview(6, [{"field": "nope", "op": "contains", "value": "x"}]))["success"] is False
