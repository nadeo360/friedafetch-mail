"""Undo instead of asking, swiping, the keyboard, parcel steps, trend lines, the AI's confidence and the glide in."""

from __future__ import annotations

UNDO = "return root.querySelector('.undobar:not([hidden]) .ut')?.textContent ?? null;"


def _state(panel, key: str | None = None) -> dict:
    return panel.js("const i = el._actItem(arg || el._s.act.open); return { key: i.key, ...(i.state || {}) };", key)


def test_archive_offers_undo_and_it_puts_the_mail_back(open_panel) -> None:
    panel = open_panel("postfach", "actslow=50")
    key = panel.js("return el._s.act.open;")
    panel.click('.rtop [data-action="mail-act"][data-v="archive"]', 700)
    assert panel.js(UNDO) == "1 archiviert"
    assert _state(panel, key)["mailbox"] == "Archive"
    assert panel.count("[role=dialog], [role=alertdialog]") == 0  # nothing was asked first
    panel.click(".undobar [data-undo]", 900)
    assert _state(panel, key)["mailbox"] == "INBOX"
    assert panel.js(UNDO) is None
    steps = panel.js("return [...root.querySelectorAll('.reader ol.tl li .what strong')].map((n) => n.textContent);")
    assert steps[-1] == "Von dir zurückgelegt (rückgängig gemacht)"


def test_z_undoes_and_only_what_changed(open_panel) -> None:
    """Marking an already read mail read again changes nothing, so there is nothing to undo for it."""
    panel = open_panel("postfach", "actslow=50")
    seen = _state(panel)["seen"]
    panel.js("root.querySelector('.mlist [data-action=\"act-open\"]').focus();")
    panel.page.keyboard.press("u")
    panel.js("await wait(700);")
    assert _state(panel)["seen"] is (not seen)
    panel.page.keyboard.press("z")
    panel.js("await wait(700);")
    assert _state(panel)["seen"] is seen
    answer = panel.js(
        "const k = el._s.act.open; const seen = !!el._actItem(k).state?.seen;"
        "return el._ws({ type: 'friedafetch_mail/mail/act', keys: [k], action: seen ? 'seen' : 'unseen' });"
    )
    assert answer["undo"] is None


def test_deleting_a_rule_asks_nothing_and_undo_brings_it_back(open_panel) -> None:
    panel = open_panel("postfach", "tab=rules&actslow=50")
    panel.js("el._setTab('rules'); await wait(400);")
    before = panel.js("return el._s.rules.map((r) => r.id);")
    victim = before[1]
    panel.js(f"await el._delete({victim!r}); await wait(300);")
    assert panel.count("[role=alertdialog]") == 0
    assert victim not in panel.js("return el._s.rules.map((r) => r.id);")
    assert "gelöscht" in panel.js(UNDO)
    panel.click(".undobar [data-undo]", 700)
    assert panel.js("return el._s.rules.map((r) => r.id);") == before  # same id, same place


def test_for_you_hides_and_corrects_with_undo(open_panel) -> None:
    panel = open_panel("postfach", "tab=foryou")
    panel.js("el._setTab('foryou'); await wait(600);")
    parcels = panel.js("return el._s.insights.parcels.map((p) => p.id);")
    panel.click('[data-widget="fy-parcels"] [data-action="fy-dismiss"]', 500)
    assert panel.js(UNDO) == "Paket ausgeblendet"
    panel.click(".undobar [data-undo]", 500)
    assert panel.js("return el._s.insights.parcels.map((p) => p.id);") == parcels
    # "Never parcels from …" no longer asks first: it is undone the same way
    panel.click('[data-widget="fy-parcels"] [data-action="fy-parcel-open"]', 400)
    panel.click('.fy-where [data-action="fy-parcel-ignore"][data-sender="1"]', 500)
    assert panel.count("[role=alertdialog]") == 0
    assert panel.js("return el._s.insights.parcel_ignored.length;") > 0
    panel.click(".undobar [data-undo]", 500)
    assert panel.js("return [el._s.insights.parcel_ignored.length, el._s.insights.parcels.length];") == [
        0,
        len(parcels),
    ]


def test_the_undo_bar_waits_while_the_pointer_is_on_it(open_panel) -> None:
    panel = open_panel("postfach", "actslow=50")
    panel.click('.rtop [data-action="mail-act"][data-v="flag"], .rtop [data-action="mail-act"][data-v="unflag"]', 600)
    assert panel.js(UNDO) in ("1 markiert", "Markierung bei 1 entfernt")
    # resting on it stops the countdown; leaving starts it again
    panel.js(
        "el._undoLater = () => (el.__restarted = true); root.querySelector('.undobar').dispatchEvent(new PointerEvent('pointerleave'));"
    )
    assert panel.js("return el.__restarted === true;")
    panel.click(".undobar [data-undo-close]", 200)
    assert panel.js(UNDO) is None


def test_the_keyboard_overview_tabs_and_search(open_panel) -> None:
    panel = open_panel("postfach")
    panel.js("root.querySelector('.mlist [data-action=\"act-open\"]').focus();")
    panel.page.keyboard.press("?")
    panel.js("await wait(200);")
    assert panel.count(".modal.keys kbd") == 11
    panel.page.keyboard.press("Escape")
    panel.js("await wait(200);")
    assert panel.count(".modal.keys") == 0
    panel.js("root.querySelector('.mlist [data-action=\"act-open\"]').focus();")
    panel.page.keyboard.press("/")
    assert panel.js("return root.activeElement?.id;") == "act-q"
    panel.js("root.activeElement.blur(); root.querySelector('.mlist [data-action=\"act-open\"]').focus();")
    panel.page.keyboard.press("3")
    panel.js("await wait(300);")
    assert panel.js("return el._tab(el._tabs());") == panel.js("return el._tabs()[2].id;")


def test_swiping_a_mail_on_a_phone(open_panel) -> None:
    """Right: read/unread; left: archive – with the undo bar; a short swipe does nothing and opens nothing."""
    panel = open_panel("postfach", "actslow=50", phone=True)
    swipe = (
        "const btn = root.querySelectorAll('.mlist li.m .mitem')[arg.i];"
        "const r = btn.getBoundingClientRect(); const y = r.top + r.height / 2; const x = r.left + r.width / 2;"
        "const ev = (type, dx) => btn.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: x + dx, clientY: y }));"
        "ev('pointerdown', 0); for (const dx of [6, 20, 50, arg.dx]) ev('pointermove', dx);"
        "const shown = [...root.querySelectorAll('.mlist li.m.swiping .swbg')].filter((n) => getComputedStyle(n).display !== 'none').map((n) => n.textContent);"
        "ev('pointerup', arg.dx); btn.click(); await wait(800); return { key: btn.dataset.id, shown };"
    )
    panel.js(swipe, {"i": 1, "dx": 40})
    assert panel.js(UNDO) is None and panel.js("return el._s.sheet;") is None  # neither acted nor opened
    left = panel.js(swipe, {"i": 1, "dx": -120})
    assert left["shown"] == ["Archivieren"]
    assert _state(panel, left["key"])["mailbox"] == "Archive"
    assert panel.js(UNDO) == "1 archiviert"
    third = panel.js("return root.querySelectorAll('.mlist li.m .mitem')[2].dataset.id;")
    seen = bool(_state(panel, third).get("seen"))
    right = panel.js(swipe, {"i": 2, "dx": 120})
    assert right["key"] == third
    assert right["shown"] == (["Ungelesen"] if seen else ["Gelesen"])
    assert bool(_state(panel, third).get("seen")) is (not seen)


def test_parcel_steps_and_the_time_window_of_today(open_panel) -> None:
    panel = open_panel("postfach", "tab=foryou")
    panel.js("el._setTab('foryou'); await wait(600);")
    rows = panel.js(
        "return [...root.querySelectorAll('[data-widget=\"fy-parcels\"] .pstep')].map((n) => n.getAttribute('aria-label'));"
    )
    assert "Fortschritt: Heute" in rows and "Fortschritt: Zugestellt" in rows
    window = panel.js("return root.querySelector('.pwin')?.getAttribute('aria-label');")
    assert window.startswith("Zeitfenster 10:00–14:00, jetzt ")
    assert panel.count(".pwin") == 1  # only the parcel that comes today with a window


def test_trend_lines_and_the_ais_confidence(open_panel) -> None:
    panel = open_panel("postfach", "tab=foryou")
    panel.js("el._setTab('foryou'); await wait(600);")
    labels = panel.js("return [...root.querySelectorAll('.fy-tile .spark')].map((n) => n.getAttribute('aria-label'));")
    assert len(labels) == 3 and all(x.startswith("Verlauf der letzten 8 Wochen: ") for x in labels)
    assert panel.count(".spark polyline") == 3
    panel.js("el._setTab('activity'); await wait(400);")
    panel.js(
        "const k = el._s.act.items.find((i) => i.subject === 'Wir werden Ihre Karte bald belasten').key;"
        "el._actOpen(k); await wait(900);"
    )
    assert (
        panel.js("return root.querySelector('.reader .conf')?.getAttribute('aria-label');") == "KI-Sicherheit: unsicher"
    )
    assert panel.count(".reader .conf .cbar i.on") == 1


def test_a_short_glide_where_something_new_comes_in(open_panel) -> None:
    panel = open_panel("postfach")
    panel.js("el._setTab('rules');")
    assert panel.count(".content.enter") == 1
    panel.js("el._render();")
    assert panel.count(".content.enter") == 0  # only once, not on every redraw
    panel.page.emulate_media(reduced_motion="reduce")
    panel.js("el._setTab('activity');")
    assert panel.count(".enter") == 0


# ------------------------------------------------------------------ the dashboard card
CARD = "const c = window.__card.shadowRoot;"


def test_the_dashboard_card_shows_parcels_mail_and_state(open_panel) -> None:
    panel = open_panel("postfach", "card=1")
    assert panel.problems == []
    got = panel.page.evaluate(
        f"() => {{ {CARD} return {{ chip: c.querySelector('.chip').textContent.trim(),"
        " parcels: [...c.querySelectorAll('section:first-of-type li strong')].map((n) => n.textContent),"
        " first: c.querySelector('section:first-of-type li small').textContent,"
        " mails: c.querySelectorAll('section:nth-of-type(2) .mail').length,"
        " foot: c.querySelector('.foot')?.textContent.trim() }; }"
    )
    assert got["chip"] == "Alles läuft"
    assert got["parcels"][0] == "Shop Versand" and "Gartenmarkt" not in got["parcels"]  # today first, delivered not
    assert got["first"] == "kommt heute · 10:00–14:00"
    assert got["mails"] >= 1
    assert got["foot"].endswith("ungelesen")


def test_the_card_names_problems_and_opens_the_mail(open_panel) -> None:
    panel = open_panel("postfach", "card=1&problem=1")
    chip = panel.page.evaluate(f"() => {{ {CARD} return c.querySelector('.chip.warn').textContent.trim(); }}")
    assert chip == "Push getrennt · iCloud bremst"
    url = panel.page.evaluate(
        f"""() => {{ {CARD} const b = c.querySelector('.mail'); let seen = null;
        window.addEventListener('location-changed', () => (seen = location.pathname + location.search), {{ once: true }});
        b.click(); const mid = b.dataset.mid; history.replaceState(null, '', '/postfach.html?card=1'); return [seen, mid]; }}"""
    )
    assert url[0] == f"/frieda-postfach?mail={__import__('urllib.parse').parse.quote_plus(url[1])}&account=e1"


def test_the_card_finds_its_entities_without_translation_keys(open_panel) -> None:
    """Older frontends give no translation keys: the sensors are found by their attributes."""
    panel = open_panel("postfach", "card=1")
    found = panel.page.evaluate(
        "() => { const h = structuredClone(window.__cardHass); for (const e of Object.values(h.entities)) delete e.translation_key;"
        " const f = window.__findEntities(h); return [f.parcels, f.problem]; }"
    )
    assert found == ["sensor.frieda_postfach_privat_pakete_unterwegs", "binary_sensor.frieda_postfach_privat_problem"]
