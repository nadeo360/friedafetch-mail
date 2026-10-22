"""Parcels on their way, read from shipping mails: carrier, tracking number, status, expected delivery.

Worked out locally with patterns – no AI. A mail is a candidate by its sender (a carrier) or its subject (shipped,
on its way, delivered …); only candidates are read, each once. Tracking numbers count only when the carrier is named
in the mail or the number stands next to a word like "Sendungsnummer" or in a carrier's tracking link, so order and
customer numbers are not taken for parcels. The tracking link shown is built from the carrier's own address, never
taken from the mail (a link in a mail may lead anywhere).
"""

from __future__ import annotations

import re
from datetime import date, datetime, timedelta
from typing import Any

# carrier id: (name, sender domains, number patterns, tracking link with {n})
CARRIERS: dict[str, tuple[str, tuple[str, ...], tuple[str, ...], str]] = {
    "dhl": (
        "DHL",
        ("dhl.de", "dhl.com", "deutschepost.de", "dhl.net"),
        (r"\bJJD\d{18,20}\b", r"\b00340\d{15}\b", r"\b\d{12}\b", r"\b\d{20}\b"),
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
    "amazon": ("Amazon", ("amazon.de", "amazon.com"), (r"\bTBA\d{12}\b",), ""),
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
    r"sendungsverfolgung|tracking code|parcel number|shipment number)",
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
    r"(?:bestell(?:ung|nummer|nr)\.?|order)\s*(?:nr\.?|nummer|number|#|:)?\s*:?\s*([A-Z0-9][\w-]{4,})", re.I
)
_DATE = re.compile(r"\b(\d{1,2})\.(\d{1,2})\.(\d{2,4})?")
_ETA_WORDS = re.compile(
    r"(voraussichtlich|zustellung|zugestellt|lieferung|liefertermin|ankunft|erwartet|estimated|expected|arriv|deliver)",
    re.IGNORECASE,
)
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


def _eta(text: str, sent: date) -> tuple[str | None, str | None]:
    """Expected day (ISO) and time window ('10:00–14:00') near words like 'voraussichtlich' or 'Zustellung'."""
    day: date | None = None
    for m in _ETA_WORDS.finditer(text):
        near = text[m.start() : m.start() + 120]
        if (d := _DATE.search(near)) is not None:
            year = int(d.group(3)) if d.group(3) else sent.year
            year += 2000 if year < 100 else 0
            try:
                day = date(year, int(d.group(2)), int(d.group(1)))
            except ValueError:
                continue
            if day < sent - timedelta(days=2):  # "bestellt am …": not the delivery
                day = None
                continue
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
    return {
        "carrier": carrier,
        "numbers": numbers,
        "status": status or "in_transit",
        "eta": eta,
        "window": window,
        "order": order.group(1) if order else None,
        "shop": None if from_carrier else (sender.get("name") or domain or None),
        "domain": domain,
        "subject": subject[:160],
        "message_id": summary.get("message_id"),
        "date": sent.isoformat(),
    }


def tracking_url(carrier: str | None, number: str | None) -> str | None:
    if not carrier or not number or carrier not in CARRIERS or not CARRIERS[carrier][3]:
        return None
    return CARRIERS[carrier][3].format(n=number)


def carrier_name(carrier: str | None) -> str | None:
    return CARRIERS[carrier][0] if carrier in CARRIERS else None
