"""Parcels on their way, read from shipping mails: carrier, tracking number, status, expected delivery.

Worked out locally with patterns – no AI. A mail is a candidate by its sender (a carrier) or its subject (shipped,
on its way, delivered …); only candidates are read, each once. Tracking numbers count only when the carrier is named
in the mail or the number stands next to a word like "Sendungsnummer" or in a carrier's tracking link, so order and
customer numbers are not taken for parcels. The tracking link shown is built from the carrier's own address, never
taken from the mail (a link in a mail may lead anywhere); for a parcel without one, a known shop's own order page.

PARSER bumps when the patterns learn something new: the shipping mails of the last weeks are then read again.
"""

from __future__ import annotations

import re
from datetime import date, datetime, timedelta
from typing import Any

# 2: DHL Express waybills, dates with month names and weekdays, shop hints in carrier mails
# 3: parcels keep the mails they were read from (for "Where from?")
PARSER = 3

# carrier id: (name, sender domains, number patterns, tracking link with {n})
CARRIERS: dict[str, tuple[str, tuple[str, ...], tuple[str, ...], str]] = {
    "dhl": (
        "DHL",
        ("dhl.de", "dhl.com", "deutschepost.de", "dhl.net"),
        # JJD…, 00340…, 12 or 20 digits (DHL Paket), 10 digits (a DHL Express waybill)
        (r"\bJJD\d{18,20}\b", r"\b00340\d{15}\b", r"\b\d{12}\b", r"\b\d{20}\b", r"\b\d{10}\b"),
        "https://www.dhl.de/de/privatkunden/pakete-empfangen/verfolgen.html?piececode={n}",
    ),
    "dpd": (
        "DPD",
        ("dpd.de", "dpd.com"),
        (r"\b0\d{13}\b", r"\b\d{14}\b"),
        "https://tracking.dpd.de/status/de_DE/parcel/{n}",
    ),
    "hermes": (
        "Hermes",
        ("myhermes.de", "hermesworld.com", "hermes-europe.eu"),
        (r"\bH\d{19}\b", r"\b\d{14}\b"),
        "https://www.myhermes.de/empfangen/sendungsverfolgung/sendungsinformation/#{n}",
    ),
    "gls": (
        "GLS",
        ("gls-group.eu", "gls-group.com", "gls-pakete.de"),
        (r"\b\d{11,12}\b",),
        "https://gls-group.com/DE/de/paketverfolgung?match={n}",
    ),
    "ups": ("UPS", ("ups.com",), (r"\b1Z[0-9A-Z]{16}\b",), "https://www.ups.com/track?tracknum={n}"),
    # Amazon's own delivery: only by its number (mails from amazon.de are the shop, not the carrier)
    "amazon": ("Amazon Logistics", (), (r"\bTBA\d{12}\b",), ""),
}
# the carrier is named in the text (for mails from shops)
_NAMED = {
    "dhl": r"\bDHL\b|Deutsche Post",
    "dpd": r"\bDPD\b",
    "hermes": r"\bHermes\b",
    "gls": r"\bGLS\b",
    "ups": r"\bUPS\b",
    "amazon": r"Amazon Logistics|\bTBA\d{12}\b",
}
_NUMBER_WORDS = re.compile(
    r"(sendungs-?\s?nummer|sendungsnr|tracking-?\s?(nummer|number|id)|paket-?\s?nummer|paketnr|track(ing)? #|"
    r"sendungsverfolgung|tracking code|parcel number|shipment number|waybill|frachtbrief|awb|luftfrachtbrief)",
    re.IGNORECASE,
)
# a tracking number inside a carrier's link: ?piececode=, ?idc=, /parcel/, ?tracknum=, ?match=
_LINK_NUMBER = re.compile(
    r"(?:piececode|idc|identcode|parcelNumber|parcel/|tracknum|trackNums|match)=?/?([0-9A-Z]{10,22})"
)

CANDIDATE = re.compile(
    r"versand|versendet|verschickt|unterwegs|zustell|geliefert|lieferung|liefertermin|sendung|paket|päckchen|"
    r"abholbereit|abholung|packstation|shipped|shipping|shipment|delivery|delivered|out for delivery|tracking|"
    r"on (its|the) way|parcel|package|dispatched",
    re.IGNORECASE,
)
# status from the subject first, then the beginning of the text (the order matters: "wird heute zugestellt" is not
# "zugestellt")
STATUS = (
    (
        "out_for_delivery",
        r"heute zugestellt werden|wird heute (zugestellt|geliefert)|kommt heute|in zustellung|zustellfahrzeug|"
        r"heute zwischen|out for delivery|arriving today|delivered today|on (its|the) way to you today",
    ),
    ("pickup", r"abholbereit|zur abholung|abholen|packstation|paketshop|filiale|ready for pick-?up|pick it up"),
    ("delivered", r"zugestellt|geliefert(?! werden)|ausgeliefert|wurde abgeholt|delivered|has been picked up"),
    ("problem", r"nicht zugestellt|zustellung nicht möglich|verzögert|verspätet|delayed|could not be delivered"),
    (
        "in_transit",
        r"versandt|versendet|verschickt|versandbestätigung|versandbenachrichtigung|unterwegs|übergeben|auf dem weg|"
        r"shipped|shipping confirmation|on (its|the) way|dispatched|"
        r"in transit|has left",
    ),
)
_ORDER = re.compile(
    # an order number has a digit ("Bestellung wurde zugestellt" names none)
    r"(?:bestell(?:ung|nummer|nr)\.?|order)\s*(?:nr\.?|nummer|number|#|:)?\s*:?\s*((?=[\w-]*\d)[A-Z0-9][\w-]{4,})",
    re.I,
)
_MONTHS = {
    "jan": 1, "januar": 1, "january": 1, "feb": 2, "februar": 2, "february": 2, "mär": 3, "märz": 3, "mar": 3,
    "march": 3, "apr": 4, "april": 4, "mai": 5, "may": 5, "jun": 6, "juni": 6, "june": 6, "jul": 7, "juli": 7,
    "july": 7, "aug": 8, "august": 8, "sep": 9, "sept": 9, "september": 9, "okt": 10, "oktober": 10, "oct": 10,
    "october": 10, "nov": 11, "november": 11, "dez": 12, "dezember": 12, "dec": 12, "december": 12,
}  # fmt: skip
_MONTH = "|".join(sorted(_MONTHS, key=len, reverse=True))
_WEEKDAYS = {
    "montag": 0, "mo": 0, "monday": 0, "mon": 0, "dienstag": 1, "di": 1, "tuesday": 1, "tue": 1, "mittwoch": 2,
    "mi": 2, "wednesday": 2, "wed": 2, "donnerstag": 3, "do": 3, "thursday": 3, "thu": 3, "freitag": 4, "fr": 4,
    "friday": 4, "fri": 4, "samstag": 5, "sa": 5, "saturday": 5, "sat": 5, "sonntag": 6, "so": 6, "sunday": 6,
    "sun": 6,
}  # fmt: skip
_WEEKDAY = "|".join(sorted(_WEEKDAYS, key=len, reverse=True))
# 24.10.(2026), 24/10/2026, 24. Okt (2026), 24 Oct 2026, Oct 24 (2026), and a weekday ("Zustellung: Freitag")
_DAYS = (
    ("dmy", re.compile(r"\b(\d{1,2})[./](\d{1,2})[./](\d{2,4})?")),
    ("d_month", re.compile(rf"\b(\d{{1,2}})\.?\s+({_MONTH})\.?(?:\s+(\d{{4}}))?\b", re.IGNORECASE)),
    ("month_d", re.compile(rf"\b({_MONTH})\.?\s+(\d{{1,2}})(?:,?\s+(\d{{4}}))?\b", re.IGNORECASE)),
    ("weekday", re.compile(rf"\b({_WEEKDAY})\b\.?", re.IGNORECASE)),
)
_ETA_WORDS = re.compile(
    r"(voraussichtlich|zustell|zugestellt|lieferung|liefertermin|ankunft|erwartet|estimated|expected|arriv|deliver)",
    re.IGNORECASE,
)
# a carrier mail names the shop: "… von APPLE gebeten", "shipment … from APPLE"
_SHOP_HINT = re.compile(r"\b(?:von|from)\s+([A-ZÄÖÜ][A-ZÄÖÜ0-9&\-]+(?:\s[A-ZÄÖÜ][A-ZÄÖÜ0-9&\-]+){0,2})\b")
# a known shop's own order page (shown when no carrier link can be built); {order} where the shop allows it
SHOP_PAGES = {
    "amazon.de": "https://www.amazon.de/gp/your-account/order-details?orderID={order}",
    "amazon.com": "https://www.amazon.com/gp/your-account/order-details?orderID={order}",
    "ebay.com": "https://www.ebay.de/mye/myebay/purchase",
    "ebay.de": "https://www.ebay.de/mye/myebay/purchase",
    "apple.com": "https://www.apple.com/de/shop/order/list",
}
_WINDOW = re.compile(
    r"(?:zwischen\s*)?(\d{1,2})(?:[:.](\d{2}))?\s*(?:uhr\s*)?(?:–|-|bis|and|und)\s*(\d{1,2})(?:[:.](\d{2}))?\s*uhr",
    re.IGNORECASE,
)
_RELATIVE = (
    (re.compile(r"\b(heute|today)\b", re.I), 0),
    (re.compile(r"\b(morgen|tomorrow)\b", re.I), 1),
    (re.compile(r"\bübermorgen\b", re.I), 2),
)


def domain_of(address: str) -> str:
    return address.rsplit("@", 1)[-1].lower() if "@" in address else ""


def is_candidate(summary: dict[str, Any]) -> bool:
    """A mail that may be about a parcel: from a carrier, or with a shipping word in its subject."""
    sender = str(((summary.get("from") or [{}])[0]).get("email") or "")
    domain = domain_of(sender)
    if any(domain == d or domain.endswith("." + d) for _, domains, _, _ in CARRIERS.values() for d in domains):
        return True
    return bool(CANDIDATE.search(str(summary.get("subject") or "")))


def _carrier_of(domain: str, text: str) -> str | None:
    for cid, (_, domains, _, _) in CARRIERS.items():
        if any(domain == d or domain.endswith("." + d) for d in domains):
            return cid
    for cid, pattern in _NAMED.items():
        if re.search(pattern, text):
            return cid
    return None


def _numbers(carrier: str | None, text: str) -> list[str]:
    """Tracking numbers: in a tracking link, or by the carrier's pattern next to a word like 'Sendungsnummer'."""
    found = [m.group(1) for m in _LINK_NUMBER.finditer(text)]
    if carrier is not None:
        for pattern in CARRIERS[carrier][2]:
            for m in re.finditer(pattern, text):
                near = text[max(0, m.start() - 120) : m.end() + 40]
                strong = not re.fullmatch(r"\d+", m.group(0))  # JJD…, 1Z…, H…, TBA…: unmistakable
                if strong or _NUMBER_WORDS.search(near):
                    found.append(m.group(0))
    seen: dict[str, None] = {}
    for n in found:
        seen.setdefault(n.upper(), None)
    return list(seen)[:3]


def _status(subject: str, text: str) -> str | None:
    for part in (subject, text[:600]):
        for status, pattern in STATUS:
            if re.search(pattern, part, re.IGNORECASE):
                return status
    return None


def _first_day(near: str, sent: date) -> date | None:
    """The first date in a piece of text, in any of the usual forms; a weekday is its next occurrence."""
    best: tuple[int, date] | None = None
    for kind, pattern in _DAYS:
        for m in pattern.finditer(near):
            try:
                if kind == "dmy":
                    year = int(m.group(3)) if m.group(3) else sent.year
                    day = date(year + (2000 if year < 100 else 0), int(m.group(2)), int(m.group(1)))
                elif kind == "d_month":
                    day = date(int(m.group(3) or sent.year), _MONTHS[m.group(2).lower()], int(m.group(1)))
                elif kind == "month_d":
                    day = date(int(m.group(3) or sent.year), _MONTHS[m.group(1).lower()], int(m.group(2)))
                else:
                    ahead = (_WEEKDAYS[m.group(1).lower()] - sent.weekday()) % 7
                    day = sent + timedelta(days=ahead)
            except (ValueError, KeyError):
                continue
            if kind != "weekday" and day < sent - timedelta(days=60):
                day = date(day.year + 1, day.month, day.day)  # "2. Jan" written in December
            if best is None or m.start() < best[0]:
                best = (m.start(), day)
            break
    return best[1] if best else None


def _eta(text: str, sent: date) -> tuple[str | None, str | None]:
    """Expected day (ISO) and time window ('10:00–14:00') near words like 'voraussichtlich' or 'Zustellung'."""
    day: date | None = None
    for m in _ETA_WORDS.finditer(text):
        near = text[m.start() : m.start() + 80]
        found = _first_day(near, sent)
        if found is not None and found >= sent - timedelta(days=2):  # "bestellt am …" is not the delivery
            day = found
            break
        for pattern, offset in _RELATIVE:
            if pattern.search(near):
                day = sent + timedelta(days=offset)
                break
        if day is not None:
            break
    window = None
    if (w := _WINDOW.search(text)) is not None:
        start, end = int(w.group(1)), int(w.group(3))
        if 5 <= start < end <= 22:
            window = f"{start:02d}:{w.group(2) or '00'}–{end:02d}:{w.group(4) or '00'}"
    return (day.isoformat() if day else None), window


def parse(summary: dict[str, Any], text: str, sent: datetime) -> dict[str, Any] | None:
    """What one shipping mail says about a parcel, or None when it says nothing useful (an ad with 'Lieferung')."""
    sender = (summary.get("from") or [{}])[0]
    domain = domain_of(str(sender.get("email") or ""))
    subject = str(summary.get("subject") or "")
    whole = f"{subject}\n{text}"
    carrier = _carrier_of(domain, whole)
    numbers = _numbers(carrier, whole)
    status = _status(subject, text)
    if status is None and not numbers:
        return None
    if summary.get("newsletter") and not numbers and carrier is None:
        return None  # an offer with "free delivery"
    eta, window = _eta(whole, sent.date())
    if status == "out_for_delivery" and eta is None:
        eta = sent.date().isoformat()  # "kommt heute": the day of the mail
    order = _ORDER.search(whole)
    from_carrier = carrier is not None and any(domain.endswith(d) for d in CARRIERS[carrier][1])
    hint = _SHOP_HINT.search(text) if from_carrier else None
    return {
        "carrier": carrier,
        "numbers": numbers,
        "status": status or "in_transit",
        "eta": eta,
        "window": window,
        "order": order.group(1) if order else None,
        "shop": None if from_carrier else (sender.get("name") or domain or None),
        "domain": domain,
        "shop_hint": hint.group(1).strip() if hint else None,  # the shop a carrier names
        "subject": subject[:160],
        "message_id": summary.get("message_id"),
        "date": sent.isoformat(),
    }


def tracking_url(carrier: str | None, number: str | None) -> str | None:
    if not carrier or not number or carrier not in CARRIERS or not CARRIERS[carrier][3]:
        return None
    if carrier == "dhl" and len(number) == 10 and number.isdigit():  # a DHL Express waybill
        return f"https://www.dhl.com/de-de/home/tracking/tracking-express.html?tracking-id={number}"
    return CARRIERS[carrier][3].format(n=number)


def shop_url(domain: str | None, order: str | None) -> str | None:
    """A known shop's own order page, built from its address (never from the mail)."""
    for shop, page in SHOP_PAGES.items():
        if domain and (domain == shop or domain.endswith("." + shop)):
            if "{order}" in page:
                return page.format(order=order) if order and re.fullmatch(r"[\w-]{5,40}", order) else None
            return page
    return None


def carrier_name(carrier: str | None) -> str | None:
    return CARRIERS[carrier][0] if carrier in CARRIERS else None
