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


# ------------------------------------------------------------------ formats seen in real shipping mails (made up data)
WED = datetime(2026, 10, 21, 21, 2, tzinfo=dt_util.get_default_time_zone())

DHL_EXPRESS = (
    "IHRE AKTUALISIERTEN ZUSTELLANGABEN\n\nHallo ANNA BEISPIEL,\n\nSie haben um eine Änderung der Zustellung Ihrer "
    "DHL Express-Sendung mit Sendungsnr. 1234567890 von BEISPIELSHOP gebeten.\n\nSendungsnr.\n1234567890\n\n"
    "Voraussichtliches Zustelldatum\n23 Okt 2026\n\nUhrzeit der Zustellung\nbis Tagesende\n\n"
    "You have requested a delivery change for your DHL Express shipment with waybill number 1234567890 from "
    "BEISPIELSHOP.\nEstimated Delivery Date\nFri Oct 23 2026"
)
SHOP = (
    "Bestellnummer W1234567890\nhttps://store.shop.example/vieworder/W1234567890\n\nBestellt am 16/10/2026\n\n"
    "Deine Artikel wurden versendet.\n\n Lieferung  23/10/2026\n   Expressversand\n Sendungsverfolgung\n"
)


def test_a_dhl_express_waybill_and_the_shop_it_names() -> None:
    info = parse(_mail("donotreply_odd@dhl.com", "DHL On Demand Delivery", "DHL EXPRESS"), DHL_EXPRESS, SENT)
    assert info["carrier"] == "dhl" and info["numbers"] == ["1234567890"] and info["eta"] == "2026-10-23"
    assert info["shop_hint"] == "BEISPIELSHOP" and info["shop"] is None
    assert tracking_url("dhl", "1234567890").startswith("https://www.dhl.com/de-de/home/tracking/tracking-express")


def test_dates_with_slashes_month_names_and_weekdays() -> None:
    shop = parse(
        _mail("shipping@orders.shop.example", "Versandbenachrichtigung W1234567890", "Beispielshop"), SHOP, SENT
    )
    assert (shop["status"], shop["eta"], shop["order"], shop["carrier"]) == (
        "in_transit",
        "2026-10-23",
        "W1234567890",
        None,
    )
    amazon = parse(
        _mail("versandbestaetigung@amazon.de", "Versendet: „Regal aus Holz…“", "Amazon.de"),
        "Dein Paket wurde versendet!\nZustellung: Freitag\n\nBestellnr.\n304-1234567-7654321\n",
        WED,
    )
    assert (amazon["eta"], amazon["order"], amazon["carrier"], amazon["shop"]) == (
        "2026-10-23",
        "304-1234567-7654321",
        None,  # amazon.de is the shop, not the carrier
        "Amazon.de",
    )
    ebay = parse(
        _mail("ebay@ebay.com", "IN ZUSTELLUNG: Regal und 2 weitere(r) Artikel", "eBay"),
        "Bestellnummer:\n\n12-34567-89012\n\nLieferung ca.:\n\nDi, 20. Okt\n\nVersanddienstleister:\n\nDPD Germany\n",
        datetime(2026, 10, 20, 8, 38, tzinfo=dt_util.get_default_time_zone()),
    )
    assert (ebay["status"], ebay["carrier"], ebay["eta"], ebay["order"]) == (
        "out_for_delivery",
        "dpd",
        "2026-10-20",
        "12-34567-89012",
    )


async def _insights(hass: HomeAssistant) -> Insights:
    log = ActivityLog(hass, "parcels-real")
    await log.async_load()
    insights = Insights(hass, "parcels-real", SimpleNamespace(guard=None), MagicMock(), log, {}, language="de")
    await insights.async_load()
    return insights


def _info(sender: str, subject: str, name: str, text: str, when: datetime, mid: str) -> dict[str, Any]:
    info = parse(_mail(sender, subject, name) | {"message_id": mid}, text, when)
    assert info is not None
    return info


async def test_updates_join_their_parcel(hass: HomeAssistant) -> None:
    """Regression: updates without a tracking number became new parcels; a carrier's mail stood apart from the shop's."""
    insights = await _insights(hass)
    now = dt_util.now()
    insights._merge_parcel(  # noqa: SLF001
        _info(
            "shipping@orders.shop.example",
            "Versandbenachrichtigung W1234567890",
            "Beispielshop Store",
            SHOP,
            now - timedelta(hours=2),
            "<s1>",
        ),
        fire=False,
    )
    for n, mid in enumerate(("<d1>", "<d2>")):  # two updates of DHL Express about the same waybill
        insights._merge_parcel(  # noqa: SLF001
            _info(
                "donotreply_odd@dhl.com",
                "DHL On Demand Delivery",
                "DHL EXPRESS",
                DHL_EXPRESS,
                now - timedelta(minutes=30 - n),
                mid,
            ),
            fire=False,
        )
    [parcel] = insights.parcels()
    assert (parcel["shop"], parcel["carrier"], parcel["number"], parcel["link"]) == (
        "Beispielshop Store",
        "DHL",
        "1234567890",
        "carrier",
    )

    # eBay: in delivery, then an update without order number, then delivered – one parcel; its link is eBay's page
    ebay_text = "Bestellnummer:\n\n12-34567-89012\n\nVersanddienstleister:\n\nDPD Germany\n"
    insights._merge_parcel(
        _info("ebay@ebay.com", "IN ZUSTELLUNG: Regal", "eBay", ebay_text, now - timedelta(hours=3), "<e1>"), fire=False
    )  # noqa: SLF001
    insights._merge_parcel(
        _info(
            "ebay@ebay.com",
            "Ihr Paket ist bald da – Sendung unterwegs",
            "eBay",
            "Bald ist es so weit.",
            now - timedelta(hours=2),
            "<e2>",
        ),
        fire=False,
    )  # noqa: SLF001
    ebay = [p for p in insights.parcels() if p["shop"] == "eBay"]
    assert len(ebay) == 1 and ebay[0]["link"] == "shop" and ebay[0]["url"] == "https://www.ebay.de/mye/myebay/purchase"
    insights._merge_parcel(
        _info("ebay@ebay.com", "Ihre Bestellung wurde zugestellt", "eBay", ebay_text, now - timedelta(hours=1), "<e3>"),
        fire=False,
    )  # noqa: SLF001
    assert [p["status"] for p in insights.parcels() if p["shop"] == "eBay"] == ["delivered"]
    assert len(insights.parcels()) == 2

    # Amazon: the shop's order page with its order number
    amazon = _info(
        "versandbestaetigung@amazon.de",
        "Versendet: „Regal…“",
        "Amazon.de",
        "Zustellung: Freitag\nBestellnr.\n304-1234567-7654321",
        now,
        "<a1>",
    )
    insights._merge_parcel(amazon, fire=False)  # noqa: SLF001
    [shop] = [p for p in insights.parcels() if p["shop"] == "Amazon.de"]
    assert shop["url"] == "https://www.amazon.de/gp/your-account/order-details?orderID=304-1234567-7654321"


async def test_new_patterns_read_the_shipping_mails_again(hass: HomeAssistant, hass_storage: dict[str, Any]) -> None:
    hass_storage["friedafetch_mail.insights.parcels-old"] = {
        "version": 1,
        "key": "friedafetch_mail.insights.parcels-old",
        "data": {
            "packages": [{"id": "x", "keys": ["mail:<1>"], "status": "in_transit"}],
            "parsed": ["<1>"],
            "parser": 1,
        },
    }
    log = ActivityLog(hass, "parcels-old")
    await log.async_load()
    insights = Insights(hass, "parcels-old", SimpleNamespace(guard=None), MagicMock(), log, {}, language="de")
    await insights.async_load()
    assert insights.packages == [] and insights.parsed == []  # read again with the new patterns
