"""Parcels from shipping mails: carrier, tracking number, status, expected day – and nothing from ads or order numbers."""

from __future__ import annotations

from datetime import datetime, timedelta
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, MagicMock

from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import async_capture_events

from custom_components.friedafetch_mail.activity import ActivityLog
from custom_components.friedafetch_mail.const import EVENT_PACKAGE
from custom_components.friedafetch_mail.insights import Insights
from custom_components.friedafetch_mail.packages import is_candidate, parse, tracking_url

SENT = datetime(2026, 10, 22, 7, 30, tzinfo=dt_util.get_default_time_zone())


def _mail(sender: str, subject: str, name: str = "", **extra: Any) -> dict[str, Any]:
    return {"from": [{"name": name, "email": sender}], "subject": subject, "message_id": f"<{subject[:12]}@x>", **extra}


def test_a_carrier_says_it_comes_today() -> None:
    mail = _mail("noreply@dhl.de", "Ihre DHL Sendung kommt heute", "DHL Paket")
    text = "Sendungsnummer: 00340434161094000001\nIhr Paket wird voraussichtlich heute zwischen 10:00 und 14:00 Uhr zugestellt."
    info = parse(mail, text, SENT)
    assert info["carrier"] == "dhl" and info["numbers"] == ["00340434161094000001"]
    assert info["status"] == "out_for_delivery" and info["eta"] == "2026-10-22" and info["window"] == "10:00–14:00"
    assert info["shop"] is None  # from the carrier itself
    assert tracking_url("dhl", "00340434161094000001").startswith("https://www.dhl.de/")


def test_a_shop_names_the_carrier_and_the_day() -> None:
    mail = _mail("versand@shop.example", "Ihre Bestellung 4711-2026 ist unterwegs", "Shop")
    text = (
        "Gute Nachrichten! Ihr Paket wurde an DPD übergeben.\nPaketnummer: 01234567890123\n"
        "Voraussichtliche Zustellung: 24.10.2026"
    )
    info = parse(mail, text, SENT)
    assert (info["carrier"], info["numbers"], info["status"]) == ("dpd", ["01234567890123"], "in_transit")
    assert info["eta"] == "2026-10-24" and info["shop"] == "Shop" and info["order"] == "4711-2026"


def test_strong_numbers_and_links() -> None:
    info = parse(_mail("ship@store.example", "Your order has shipped"), "UPS tracking: 1Z999AA10123456784", SENT)
    assert info["carrier"] == "ups" and info["numbers"] == ["1Z999AA10123456784"] and info["status"] == "in_transit"
    linked = parse(
        _mail("info@store.example", "Versandbestätigung"),
        "Verfolgen: https://nolp.dhl.de/nextt-online-public/set_identcodes.do?idc=123456789012 (DHL)",
        SENT,
    )
    assert linked["numbers"] == ["123456789012"]


def test_delivered_and_pick_up() -> None:
    assert parse(_mail("noreply@dhl.de", "Ihre Sendung wurde zugestellt"), "", SENT)["status"] == "delivered"
    assert (
        parse(_mail("noreply@dhl.de", "Ihr Paket ist abholbereit"), "In Ihrer Packstation 123.", SENT)["status"]
        == "pickup"
    )
    late = parse(_mail("noreply@dhl.de", "Ihre Sendung wird heute zugestellt"), "", SENT)
    assert late["status"] == "out_for_delivery"  # "zugestellt" in it, but not yet


def test_nothing_from_ads_and_order_numbers() -> None:
    ad = _mail("news@shop.example", "Nur heute: kostenlose Lieferung!", newsletter=True)
    assert is_candidate(ad) and parse(ad, "Sparen Sie 20 % auf alles.", SENT) is None
    assert not is_candidate(_mail("anna@example.com", "Treffen am Samstag?"))
    order = parse(
        _mail("bestellung@shop.example", "Ihre Bestellung ist unterwegs"),
        "Bestellnummer 123456789012. Versand mit DHL.",
        SENT,
    )
    assert order["numbers"] == []  # twelve digits, but an order number: no word like "Sendungsnummer" near it
    old = parse(_mail("versand@shop.example", "Versandbestätigung"), "Bestellt am 01.10.2026, Lieferung bald.", SENT)
    assert old["eta"] is None  # the order date is not the delivery


# ------------------------------------------------------------------ the list of parcels
async def test_parcels_follow_their_mails(hass: HomeAssistant) -> None:
    log = ActivityLog(hass, "parcels")
    await log.async_load()
    texts = {
        1: ("Ihre Bestellung ist unterwegs", "Mit DHL. Sendungsnummer 00340434161094000001.", -2),
        2: ("Ihre Sendung kommt heute", "Sendungsnummer 00340434161094000001, heute zwischen 9 und 12 Uhr.", -0.2),
        3: ("Ihre Sendung wurde zugestellt", "Sendungsnummer 00340434161094000001", 0),
    }

    async def message(box: str, uid: int, **kwargs: Any) -> dict[str, Any]:
        subject, body, days = texts[uid]
        sender = "versand@shop.example" if uid == 1 else "noreply@dhl.de"
        when = (dt_util.now() + timedelta(days=days)).isoformat()
        return {"uid": uid, "subject": subject, "from": [{"name": "Shop", "email": sender}], "date": when, "body": body}

    mail = MagicMock()
    mail.async_get_message = AsyncMock(side_effect=message)
    insights = Insights(hass, "parcels", SimpleNamespace(guard=None), mail, log, {}, language="de")
    events = async_capture_events(hass, EVENT_PACKAGE)

    async def read(uid: int, *, fire: bool) -> None:
        subject, _, days = texts[uid]
        when = (dt_util.now() + timedelta(days=days)).isoformat()
        summary = {
            "uid": uid,
            "subject": subject,
            "message_id": f"<p{uid}@x>",
            "date": when,
            "from": [{"email": "x@y"}],
        }
        await insights._read_parcels([("INBOX", summary)], fire=fire)  # noqa: SLF001

    await read(1, fire=False)
    [parcel] = insights.parcels()
    assert (parcel["carrier"], parcel["status"], parcel["shop"]) == ("DHL", "in_transit", "Shop")
    await read(2, fire=True)
    [parcel] = insights.parcels()
    assert parcel["status"] == "out_for_delivery" and parcel["window"] == "09:00–12:00"
    assert parcel["url"].endswith("00340434161094000001") and parcel["shop"] == "Shop"  # one parcel, both mails
    await read(3, fire=True)
    await hass.async_block_till_done()
    assert [e.data["status"] for e in events] == ["out_for_delivery", "delivered"]
    assert events[-1].data["carrier"] == "DHL" and insights.week()["parcels"] == 0
    assert insights.parcels()[0]["status"] == "delivered"  # still shown for two days

    assert "<p3@x>" in insights.parsed  # a mail is read once (insights._parcel_candidate skips it from now on)
    insights.packages[0]["updated"] = (dt_util.now() - timedelta(days=3)).isoformat()
    assert insights.parcels() == []  # delivered three days ago: gone from the list


async def test_new_shipping_mail_of_a_pass_is_read_at_once(hass: HomeAssistant) -> None:
    log = ActivityLog(hass, "parcels-pass")
    await log.async_load()
    now = dt_util.now().isoformat(timespec="seconds")
    line = {"subject": "Ihre Sendung kommt heute", "from": "noreply@dhl.de", "mailbox": "INBOX", "uid": 7}
    log.add_pass(
        "push", now, [{**line, "message_id": "<dhl@x>", "date": now, "rules": [], "move_to": None, "delete": False}]
    )
    log.add_pass(
        "push",
        now,
        [{"subject": "Hallo", "from": "anna@example.com", "mailbox": "INBOX", "uid": 8, "message_id": "<a@x>"}],
    )
    mail = MagicMock()
    mail.async_get_message = AsyncMock(
        return_value={
            "subject": line["subject"],
            "from": [{"email": "noreply@dhl.de"}],
            "date": now,
            "body": "JJD000390007827531234",
        }
    )
    insights = Insights(hass, "parcels-pass", SimpleNamespace(guard=None), mail, log, {}, language="de")
    events = async_capture_events(hass, EVENT_PACKAGE)
    await insights.async_parcels_after_pass()
    await hass.async_block_till_done()
    mail.async_get_message.assert_awaited_once()  # only the shipping mail is read
    assert mail.async_get_message.await_args.args[:2] == ("INBOX", 7)
    [parcel] = insights.parcels()
    assert parcel["number"] == "JJD000390007827531234" and parcel["status"] == "out_for_delivery"
    assert [e.data["status"] for e in events] == ["out_for_delivery"]
    await insights.async_parcels_after_pass()
    mail.async_get_message.assert_awaited_once()  # not read twice
