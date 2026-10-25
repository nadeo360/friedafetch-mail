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
from custom_components.friedafetch_mail.packages import is_candidate, items, parse, tracking_url

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


async def test_corrections_hold_when_the_mails_are_read_again(hass: HomeAssistant) -> None:
    """New patterns read the shipping mails again: what the user corrected by hand is applied again by Message-ID."""
    insights = await _insights(hass)
    now = dt_util.now()
    infos = [
        _info("versand@shop.example", "Ihre Bestellung ist unterwegs", "Shop", "Mit DPD.", now - timedelta(hours=9), "<m1>"),
        _info("noreply@dhl.de", "Ihr Paket kommt", "DHL", "Sendungsnummer 00340434161094000001", now - timedelta(hours=8), "<m2>"),
        _info("noreply@dhl.de", "Ihr Paket kommt", "DHL", "Sendungsnummer 00340434161094000002", now - timedelta(hours=7), "<m3>"),
        _info("noreply@dhl.de", "Ihr Paket kommt", "DHL", "Sendungsnummer 00340434161094000003", now - timedelta(hours=6), "<m4>"),
        _info("noreply@dhl.de", "Ihr Paket kommt", "DHL", "Sendungsnummer 00340434161094000004", now - timedelta(hours=5), "<m5>"),
    ]  # fmt: skip

    def read_all() -> None:
        for info in infos:
            insights._merge_parcel(dict(info), fire=False)  # noqa: SLF001

    def by_mail() -> dict[str, dict[str, Any]]:
        return {",".join(sorted(x["message_id"] for x in p["sources"])): p for p in insights.packages}

    read_all()
    parcels = by_mail()
    await insights.async_parcel_merge(parcels["<m3>"]["id"], parcels["<m2>"]["id"])  # one parcel
    await insights.async_parcel_merge(parcels["<m1>"]["id"], by_mail()["<m2>,<m3>"]["id"])
    await insights.async_parcel_split(by_mail()["<m1>,<m2>,<m3>"]["id"], "<m1>")  # the shop's mail was another one
    await insights.async_parcel_ignore(by_mail()["<m4>"]["id"], sender=False)  # not a parcel
    await insights.async_parcel_arrived(by_mail()["<m5>"]["id"])
    expected = {k: p.get("status") for k, p in by_mail().items()}
    assert expected == {"<m1>": "in_transit", "<m2>,<m3>": "in_transit", "<m5>": "delivered"}

    insights.packages, insights.parsed = [], []  # the patterns learned more (PARSER): everything is read again
    read_all()
    assert len(insights.packages) == 5
    assert insights._apply_fixes()  # noqa: SLF001
    assert {k: p.get("status") for k, p in by_mail().items()} == expected
    assert by_mail()["<m5>"]["arrived"] == "you"
    assert not insights._apply_fixes()  # noqa: SLF001 - nothing more to do

    # a new mail of the split-off parcel is its own update, not split again
    insights._merge_parcel(  # noqa: SLF001
        _info("versand@shop.example", "Ihre Bestellung ist unterwegs", "Shop", "Mit DPD.", now, "<m6>"), fire=False
    )
    assert "<m1>,<m6>" in by_mail()
    insights._apply_fixes()  # noqa: SLF001
    assert "<m1>,<m6>" in by_mail()
    # undo takes a correction back together with its fix
    fixes = len(insights.parcel_fixes)
    await insights.async_parcel_waiting(by_mail()["<m2>,<m3>"]["id"])
    assert insights.parcel_fixes[-1]["op"] == "waiting" and len(insights.parcel_fixes) == fixes + 1
    await insights.async_undo(insights._undo["token"])  # noqa: SLF001
    assert len(insights.parcel_fixes) == fixes and insights._data()["parcel_fixes"] == insights.parcel_fixes  # noqa: SLF001


# ------------------------------------------------------------------ corrected by hand
async def test_parcels_merged_split_and_not_a_parcel(hass: HomeAssistant) -> None:
    insights = await _insights(hass)
    now = dt_util.now()
    first = _info(
        "versand@shop.example", "Ihre Bestellung ist unterwegs", "Shop", "Mit DPD.", now - timedelta(hours=5), "<m1>"
    )
    other = _info(
        "noreply@dhl.de",
        "Ihr Paket kommt",
        "DHL",
        "Sendungsnummer 00340434161094000001",
        now - timedelta(hours=1),
        "<m2>",
    )
    insights._merge_parcel(first, fire=False)  # noqa: SLF001
    insights._merge_parcel(other, fire=False)  # noqa: SLF001
    a, b = sorted(insights.parcels(), key=lambda p: p["updated"])
    assert [s["message_id"] for s in a["sources"]] == ["<m1>"] and a["senders"] == ["shop.example"]

    await insights.async_parcel_merge(a["id"], b["id"])  # the user: they are the same parcel
    [merged] = insights.parcels()
    assert merged["id"] == b["id"] and merged["shop"] == "Shop" and merged["number"] == "00340434161094000001"
    assert [s["message_id"] for s in merged["sources"]] == ["<m1>", "<m2>"]

    # a later mail with that number still finds the merged parcel
    again = _info(
        "noreply@dhl.de", "Ihre Sendung wurde zugestellt", "DHL", "Sendungsnummer 00340434161094000001", now, "<m3>"
    )
    insights._merge_parcel(again, fire=False)  # noqa: SLF001
    [merged] = insights.parcels()
    assert merged["status"] == "delivered" and len(merged["sources"]) == 3

    await insights.async_parcel_split(merged["id"], "<m1>")  # the shop's mail was about another parcel after all
    parcels = {p["sources"][0]["message_id"]: p for p in insights.parcels()}
    assert set(parcels) == {"<m1>", "<m2>"}
    assert parcels["<m1>"]["shop"] == "Shop" and parcels["<m1>"]["number"] is None
    assert parcels["<m2>"]["number"] == "00340434161094000001" and parcels["<m2>"]["shop"] is None

    await insights.async_parcel_ignore(parcels["<m1>"]["id"], sender=True)  # this shop never sends parcels
    assert insights.parcel_ignored == ["shop.example"] and len(insights.parcels()) == 1
    later = {
        "message_id": "<m9>",
        "date": now.isoformat(),
        "subject": "Versand",
        "from": [{"email": "info@shop.example"}],
    }
    assert insights._parcel_candidate(later) is False  # noqa: SLF001 - its shipping-like mails are not read
    await insights.async_restore("parcel")
    assert insights.parcel_ignored == [] and insights._parcel_candidate(later) is True  # noqa: SLF001


# ------------------------------------------------------------------ fuzzing: no crash, no runaway pattern
def test_parser_on_hostile_text() -> None:
    import time  # noqa: PLC0415

    from hypothesis import given, settings  # noqa: PLC0415
    from hypothesis import strategies as st  # noqa: PLC0415

    words = st.sampled_from(
        ["Sendungsnummer", "von", "APPLE", "Zustellung", "23", "Okt", "2026", "1Z999AA10123456784", "1" * 30, "Re:",
         "zwischen", "10", "und", "14", "Uhr", "Bestellnummer", "W123", ".", "/", "\n", "DHL", "voraussichtlich"]
    )  # fmt: skip

    @settings(max_examples=150, deadline=None)
    @given(
        st.lists(st.one_of(words, st.text(max_size=12)), max_size=400),
        st.sampled_from(["noreply@dhl.de", "x@shop.example"]),
    )
    def run(parts: list[str], sender: str) -> None:
        parse(_mail(sender, "Ihre Sendung"), " ".join(parts), SENT)

    run()
    # long, repetitive text (what makes badly built patterns take forever) – each in well under a second
    for text in (
        "1" * 20000,
        "von " * 5000 + "A",
        ("Zustellung " + "23 " * 50) * 100,
        "zwischen 1 und " * 2000,
        "Sendungsnummer " + "0" * 19999,
        "Okt " * 5000,
        "Bestellnummer: " + "-" * 20000,
    ):
        started = time.perf_counter()
        parse(_mail("noreply@dhl.de", "Ihre Sendung kommt heute"), text, SENT)
        assert time.perf_counter() - started < 1.0, text[:40]


# ------------------------------------------------------------------ orders and what is in a parcel (real formats)
APPLE_ORDER = (
    "Bestellnummer W1234567890\r\nBestellt am 16/10/2026\r\n\r\nVielen Dank für deine Bestellung.\r\n\r\nVersand 1:\r\n"
    "------------------------------ \r\nLieferung: Fr. 23 Okt. per Expressversand\r\niPhone Duo 512 GB Sternenweiß\r\n"
    "2.549,00 €\r\n1\r\n 2.549,00 € ------\r\nApple Trade In\r\n\r\nGeschätzter Eintauschwert:\r\n865,00 €\r\n"
    "Dein Gerät:\r\niPhone 17 Pro Max\r\n\r\nVersand 2:\r\n------------------------------ \r\n"
    "Lieferung: Fr. 23 Okt. per Expressversand\r\nAppleCare One\r\n20,99 €\r\n1\r\n 20,99 € \r\nZwischensumme :\r\n"
)
APPLE_SHIPPED = (
    "Apple Store\r\n\r\nBestellnummer W1234567890\r\n\r\nDeine Artikel wurden versendet.\r\n\r\n Lieferung  23/10/2026\r\n"
    "   Expressversand\r\n Sendungsverfolgung\r\nUnterschrift erforderlich\r\n------\r\n\r\niPhone Duo 512 GB Sternenweiß"
    "\r\n\r\n\r\nnot defined\r\n\r\nVersandadresse\r\n"
)
AMAZON_ORDER = (
    "    Vielen Dank für deine Bestellung!\r\nBestellt\r\n\r\nVersendet\r\n\r\nIn Zustellung\r\n\r\nZugestellt\r\n\r\n"
    "Zustellung: Montag\r\n\r\nBestellnr.\r\n304-1111111-2222222\r\n\r\n* Greluma 1,5 mm² Kabelmarkierungen, 300 Stück\r\n"
    "  Menge: 1\r\n  9.99 EUR\r\n\r\n* Kabelkennzeichnung 0-9 (100Pcs 2.5mm²)\r\n  Menge: 2\r\n  6.53 EUR\r\n\r\nSumme\r\n16.52 EUR\r\n"
)
NUDIENT_ORDER = (
    "BESTELLBESTÄTIGUNG\r\n\r\nBestellnummer: 1195235\r\nBestelldatum: 16-10-2026\r\n\r\nLieferadresse\r\n\r\n"
    "Bestellübersicht\r\n\r\nhttps://shop.example/products/slice-case\r\n1.00 x Slice Case - Ink Black / iPhone Duo\r\n"
    "35.00 EUR\r\n\r\nhttps://shop.example/products/prio\r\n1.00 x Priority order handling\r\n1.00 EUR\r\n\r\nVersand:\r\n"
    "0.00 EUR\r\nGesamtsumme:\r\n36.00 EUR\r\n"
)
EBAY_SHIPPED = (
    "Bald ist es so weit! Ihre Bestellung befindet sich in der Zustellung.\r\n\nSendung verfolgen\r\n\nSchweberegal "
    "Wandregal Esche Whiskey\r\n\nArtikelnr.:\r\n\n257492762587\r\n\nBestellnummer:\r\n\n19-15263-93328\r\n\nSchweberegal "
    "Wandregal Esche Whiskey\r\n\nArtikelnr.:\r\n\n257492762587\r\n\nVersanddienstleister:\r\n\nDPD Germany\r\n"
)


def test_order_confirmations_and_their_items() -> None:
    amazon = parse(
        _mail("bestellbestaetigung@amazon.de", "Bestellt: „Greluma 1,5 mm²...“ und 1 mehr Artikel", "Amazon.de"),
        AMAZON_ORDER,
        SENT,
    )
    assert amazon["status"] == "ordered"  # not "In Zustellung" from Amazon's progress bar
    assert amazon["order"] == "304-1111111-2222222"
    assert [(i["name"], i["qty"], i["price"]) for i in amazon["items"]] == [
        ("Greluma 1,5 mm² Kabelmarkierungen, 300 Stück", 1, "9.99 EUR"),
        ("Kabelkennzeichnung 0-9 (100Pcs 2.5mm²)", 2, "6.53 EUR"),
    ]
    shop = parse(_mail("shop@nudient.example", "Bestellbestätigung", "NUDIENT", newsletter=True), NUDIENT_ORDER, SENT)
    assert shop["status"] == "ordered" and [i["name"] for i in shop["items"]] == ["Slice Case - Ink Black / iPhone Duo"]
    apple = parse(
        _mail("your_order@orders.apple.example", "Wir bearbeiten deine Bestellung W1234567890"), APPLE_ORDER, SENT
    )
    assert [i["name"] for i in apple["items"]] == ["iPhone Duo 512 GB Sternenweiß", "AppleCare One"]  # no trade-in
    ebay = parse(
        _mail("ebay@ebay.example", "IN ZUSTELLUNG: Schweberegal W... und 2 weitere(r) Artikel"), EBAY_SHIPPED, SENT
    )
    assert ebay["status"] == "out_for_delivery" and [i["name"] for i in ebay["items"]] == [
        "Schweberegal Wandregal Esche Whiskey"
    ]
    assert ebay["more"] == 2
    # only the subject: the name cut off there
    short = parse(
        _mail("bestellbestaetigung@amazon.de", "Bestellt: „Irfora HT97D Digitaler...“"), "Bestellnr. 304-1-2", SENT
    )
    assert short["items"][0]["name"] == "Irfora HT97D Digitaler"
    # nothing for food and tickets, nor a thank-you without an order
    assert parse(_mail("no-reply@lieferando.de", "Stefan, Bestellung erhalten"), "Lieferung in 30 Min.", SENT) is None
    assert (
        parse(_mail("news@shop.example", "Vielen Dank für Ihre Bestellung!"), "Hier ist ein Gutschein.", SENT) is None
    )


async def test_the_order_tells_what_is_in_the_parcel(hass: HomeAssistant) -> None:
    """Apple: the order lists two things, the shipping mail names the one in this parcel."""
    insights = await _insights(hass)
    now = dt_util.now()
    insights._merge_parcel(  # noqa: SLF001
        _info(
            "your_order@orders.apple.example",
            "Wir bearbeiten deine Bestellung W1234567890",
            "Apple Store",
            APPLE_ORDER,
            now - timedelta(days=6),
            "<o1>",
        ),
        fire=False,
    )
    [parcel] = insights.parcels()
    assert parcel["status"] == "ordered" and parcel["items_from"] == "order" and len(parcel["items"]) == 2
    assert insights.week()["parcels"] == 0  # ordered is not on its way yet
    insights._merge_parcel(  # noqa: SLF001
        _info(
            "shipping@orders.apple.example",
            "Versandbenachrichtigung W1234567890",
            "Apple Store",
            APPLE_SHIPPED,
            now - timedelta(days=1),
            "<s1>",
        ),
        fire=False,
        text=APPLE_SHIPPED,
    )
    [parcel] = insights.parcels()
    assert parcel["status"] == "in_transit" and parcel["items_from"] == "parcel"
    assert [i["name"] for i in parcel["items"]] == ["iPhone Duo 512 GB Sternenweiß"]  # not the AppleCare
    assert [s["items"] for s in parcel["sources"]] == [
        ["iPhone Duo 512 GB Sternenweiß", "AppleCare One"],
        ["iPhone Duo 512 GB Sternenweiß"],
    ]


async def test_an_order_in_two_parcels(hass: HomeAssistant) -> None:
    insights = await _insights(hass)
    now = dt_util.now()
    order = (
        "Vielen Dank für Ihre Bestellung 4711-2026\n2 x Sofa Beige\n499,00 €\n1 x Kissen Grau\n19,00 €\n"
        "Lieferadresse: Beispielweg 1"
    )
    insights._merge_parcel(  # noqa: SLF001
        _info(
            "shop@moebel.example", "Bestellbestätigung 4711-2026", "Möbelhaus", order, now - timedelta(days=4), "<o>"
        ),
        fire=False,
    )
    for n, (name, number) in enumerate(
        (("Sofa Beige", "00340434161094000011"), ("Kissen Grau", "00340434161094000022"))
    ):
        text = (
            f"Ihre Bestellung 4711-2026 wurde mit DHL versendet.\nSendungsnummer: {number}\nIn diesem Paket: {name}\n"
        )
        insights._merge_parcel(  # noqa: SLF001
            _info(
                "shop@moebel.example",
                "Ihre Bestellung ist unterwegs",
                "Möbelhaus",
                text,
                now - timedelta(days=3 - n),
                f"<s{n}>",
            ),
            fire=False,
            text=text,
        )
    listed = sorted(insights.parcels(), key=lambda p: p["number"] or "")
    assert [(p["number"], [i["name"] for i in p["items"]]) for p in listed] == [
        ("00340434161094000011", ["Sofa Beige"]),
        ("00340434161094000022", ["Kissen Grau"]),
    ]
    assert all(p["order"] == "4711-2026" and p["items_from"] == "parcel" for p in listed)


NUDIENT_SHIPPED = (
    "VERSANDBESTÄTIGUNG\r\n\r\nLieber Stefan,\r\nGute Nachrichten! Deine Bestellung, 1195235, ist auf dem Weg und wird "
    "dir in Kürze zugestellt.\r\n\r\nSendungsnummer:\r\n\r\nLX700399511DE\r\n\r\n[Lieferung verfolgen]"
    "(https://shop.example/apps/track123?nums=LX700399511DE)\r\n"
)


async def test_lessons_from_real_mails(hass: HomeAssistant) -> None:
    """An order number after a comma, Deutsche Post's international number, "Abstellung erfolgt", and what is no parcel."""
    insights = await _insights(hass)
    now = dt_util.now()
    insights._merge_parcel(  # noqa: SLF001
        _info("shop@nudient.example", "Bestellbestätigung", "NUDIENT", NUDIENT_ORDER, now - timedelta(days=3), "<n1>"),
        fire=False,
    )
    shipped = parse(
        _mail("shop@nudient.example", "Ihre Bestellung ist auf dem Weg", "NUDIENT", newsletter=True),
        NUDIENT_SHIPPED,
        SENT,
    )
    assert shipped["order"] == "1195235" and shipped["carrier"] == "dhl" and shipped["numbers"] == ["LX700399511DE"]
    insights._merge_parcel(
        shipped | {"message_id": "<n2>", "date": (now - timedelta(days=1)).isoformat()},
        fire=False,
        text=NUDIENT_SHIPPED,
    )
    [parcel] = insights.parcels()
    assert parcel["status"] == "in_transit" and parcel["url"].endswith("LX700399511DE")
    assert [i["name"] for i in parcel["items"]] == ["Slice Case - Ink Black / iPhone Duo"]  # named by the order

    dropped = parse(
        _mail("noreply@dpd.de", "Die Abstellung Ihres DPD Pakets ist erfolgt"), "Paketnummer 01126812252093", SENT
    )
    assert dropped["status"] == "delivered"
    # a booking request "versendet": no number, no order, no carrier, no items – it starts no parcel
    request = parse(
        _mail("noreply@booking.example", "Anfrage an Aparthotel Beispielstadt versendet"), "Ihre Nachricht.", SENT
    )
    assert request is not None and insights._merge_parcel(request | {"message_id": "<b1>"}, fire=False) is False  # noqa: SLF001
    # a download: an order confirmation without items
    assert parse(_mail("ea@ea.example", "Bestellbestätigung"), "Bestellnummer: 1005429910250\nDanke!", SENT) is None


async def test_an_order_read_after_its_shipping_mail(hass: HomeAssistant) -> None:
    """The order comes in a later look: the shipping mail is read again for the items it names."""
    insights = await _insights(hass)
    now = dt_util.now()
    shipped = _info(
        "shipping@orders.apple.example",
        "Versandbenachrichtigung W1234567890",
        "Apple Store",
        APPLE_SHIPPED,
        now - timedelta(days=1),
        "<s1>",
    )
    insights._merge_parcel(shipped | {"mailbox": "Shop", "uid": 359}, fire=False, text=APPLE_SHIPPED)  # noqa: SLF001
    order = _info(
        "your_order@orders.apple.example",
        "Wir bearbeiten deine Bestellung W1234567890",
        "Apple Store",
        APPLE_ORDER,
        now - timedelta(days=6),
        "<o1>",
    )
    insights._merge_parcel(order | {"mailbox": "Shop", "uid": 346}, fire=False)  # noqa: SLF001
    [parcel] = insights.packages
    insights._mail = MagicMock()  # noqa: SLF001
    insights._mail.async_get_message = AsyncMock(return_value={"body": APPLE_SHIPPED})  # noqa: SLF001
    assert await insights._items_from_order(parcel) is True  # noqa: SLF001
    insights._mail.async_get_message.assert_awaited_once_with("Shop", 359, max_chars=20000)  # noqa: SLF001
    [view] = insights.parcels()
    assert view["items_from"] == "parcel" and [i["name"] for i in view["items"]] == ["iPhone Duo 512 GB Sternenweiß"]
    assert await insights._items_from_order(parcel) is False  # noqa: SLF001 - once


def test_names_found_across_odd_spaces() -> None:
    """Real shipping mails split names with non-breaking spaces and line breaks."""
    from custom_components.friedafetch_mail.insights import _names_in  # noqa: PLC0415

    items = [{"name": "iPhone Duo 512 GB Sternenweiß"}, {"name": "AppleCare One"}]
    found = _names_in(items, "Lieferung\r\n\r\niPhone Duo 512 GB\r\nSternenweiß\r\n")
    assert [i["name"] for i in found] == ["iPhone Duo 512 GB Sternenweiß"]
    assert _names_in(items, "Apple Care is great") == []  # word for word, not letters across words


async def test_a_shop_that_never_writes_on_delivery(hass: HomeAssistant) -> None:
    """Nudient writes when a parcel leaves, never when it arrives: Frieda asks, learns, and then takes it as delivered."""
    insights = await _insights(hass)
    now = dt_util.now()

    def shipped(days: float, mid: str, number: str) -> None:
        text = f"Ihre Bestellung ist auf dem Weg. Sendungsnummer {number}"
        info = _info(
            "shop@nudient.example", "Ihre Bestellung ist auf dem Weg", "NUDIENT", text, now - timedelta(days=days), mid
        )
        insights._merge_parcel(info, fire=False)  # noqa: SLF001

    shipped(1, "<q1>", "LX700399511DE")
    [parcel] = insights.parcels()
    assert parcel["status"] == "in_transit" and parcel["quiet"] is None  # a day on its way is nothing unusual

    shipped(5, "<q2>", "LX700399522DE")
    quiet = next(p for p in insights.parcels() if p["number"] == "LX700399522DE")
    assert quiet["status"] == "in_transit" and quiet["quiet"] == 5  # Frieda asks whether it came

    await insights.async_parcel_waiting(quiet["id"])  # "still missing": asked again in three days
    assert next(p for p in insights.parcels() if p["id"] == quiet["id"])["quiet"] is None

    await insights.async_parcel_arrived(quiet["id"])  # it came after all
    came = next(p for p in insights.parcels() if p["id"] == quiet["id"])
    assert came["status"] == "delivered" and came["arrived"] == "you"
    assert insights.parcel_silent == []  # "still missing" made it not quiet any more: nothing to learn from it

    shipped(6, "<q3>", "LX700399533DE")
    third = next(p for p in insights.parcels() if p["number"] == "LX700399533DE")
    await insights.async_parcel_arrived(third["id"])
    assert insights.parcel_silent == ["nudient.example"]  # a quiet parcel that came: this shop never writes
    await insights.async_undo(insights._undo["token"])  # noqa: SLF001 - undone: not learned
    assert insights.parcel_silent == []
    await insights.async_parcel_arrived(third["id"])

    shipped(5, "<q4>", "LX700399544DE")  # the next quiet one is taken as delivered, without asking
    fourth = next(p for p in insights.parcels() if p["number"] == "LX700399544DE")
    assert fourth["status"] == "delivered" and fourth["arrived"] == "assumed" and fourth["quiet"] is None
    shipped(9, "<q5>", "LX700399555DE")  # taken as delivered more than two days ago: gone from the list
    assert not any(p["number"] == "LX700399555DE" for p in insights.parcels())

    await insights.async_restore("silent")  # forget it: Frieda asks again
    assert next(p for p in insights.parcels() if p["id"] == fourth["id"])["quiet"] == 5


async def test_a_carrier_is_never_learned_as_silent(hass: HomeAssistant) -> None:
    insights = await _insights(hass)
    info = _info(
        "noreply@dhl.de",
        "Ihr Paket ist unterwegs",
        "DHL",
        "Sendungsnummer 00340434161094000077",
        dt_util.now() - timedelta(days=5),
        "<c1>",
    )
    insights._merge_parcel(info | {"shop": "Beispielshop"}, fire=False)  # noqa: SLF001
    [parcel] = insights.parcels()
    assert parcel["quiet"] == 5
    await insights.async_parcel_arrived(parcel["id"])
    assert insights.parcel_silent == []


async def test_a_parcel_due_on_a_day_goes_quiet_two_days_after_it(hass: HomeAssistant) -> None:
    insights = await _insights(hass)
    now = dt_util.now()
    insights._merge_parcel(  # noqa: SLF001
        _info(
            "versand@shop.example", "Ihre Bestellung ist unterwegs", "Shop", "Mit DPD.", now - timedelta(days=6), "<e1>"
        )
        | {"eta": (now - timedelta(days=1)).date().isoformat()},
        fire=False,
    )
    [parcel] = insights.parcels()
    assert parcel["quiet"] is None  # due yesterday: still in time
    insights.packages[0]["eta"] = (now - timedelta(days=3)).date().isoformat()
    assert insights.parcels()[0]["quiet"] == 6


def test_order_and_item_patterns_on_hostile_text() -> None:
    """The patterns of 1.0.39 (items of an order, order numbers, names a shipping mail gives) do not crash or run
    away on any text."""
    import time  # noqa: PLC0415

    from hypothesis import given, settings  # noqa: PLC0415
    from hypothesis import strategies as st  # noqa: PLC0415

    from custom_components.friedafetch_mail.insights import _names_in  # noqa: PLC0415

    words = st.sampled_from(
        ["1 x", "2×", "1.00 x", "Menge:", "Anzahl", "Stück", "Qty", "Artikelnr.", "Item #", "12,99 €", "EUR 5",
         "-3,00 €", "Versand", "Summe", "Bestellnummer", "Bestellung,", "Order #", "W123-45", "\n", " ", "/",
         "und 2 weitere Artikel", "Bestellt:", "„", "“", "iPhone", "AppleCare+", "x" * 40]
    )  # fmt: skip

    @settings(max_examples=200, deadline=None)
    @given(st.lists(st.one_of(words, st.text(max_size=12)), max_size=400), st.text(max_size=80))
    def run(parts: list[str], subject: str) -> None:
        text = " ".join(parts)
        found, more = items(subject, text)
        assert more >= 0 and all(isinstance(i.get("name"), str) and i["name"] for i in found)
        parse(_mail("versand@shop.example", subject or "Bestellbestätigung"), text, SENT)
        assert all(i.get("from_order") for i in _names_in(found, text))

    run()
    for text in (
        "1 x " * 5000,
        "Menge: " * 5000,
        "Artikelnr.\n" * 3000,
        "1" * 20000 + " x Name",
        "Bestellung, " * 3000,
        "Order #" + "A1-" * 6000,
        ("12,99 € " * 50 + "\n") * 100,
    ):
        started = time.perf_counter()
        items("Bestellt: „" + text[:500] + "“ und 3 weitere Artikel", text)
        parse(_mail("versand@shop.example", "Bestellbestätigung"), text, SENT)
        _names_in([{"name": text[:200]}], text)
        assert time.perf_counter() - started < 1.0, text[:40]
