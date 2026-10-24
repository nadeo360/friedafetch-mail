"""Reading and conversations, the command palette, the rule editor's preview, phones, the AI's overview."""

from __future__ import annotations

import pytest


def _open_text(panel) -> None:
    panel.click('.rtop ~ .rbody [data-action="mail-text"], .reader [data-action="mail-text"]', 700)


# ------------------------------------------------------------------ A: reading
def test_quotes_and_signature_fold_away_and_links_name_their_host(open_panel) -> None:
    panel = open_panel("postfach", "textslow=20")
    _open_text(panel)
    got = panel.js(
        "const m = root.querySelector('.reader .mtext'); const main = m.querySelector(':scope > .body');"
        "return { main: main.textContent, folds: [...m.querySelectorAll('details.fold > summary')].map((s) => s.textContent.trim()),"
        " open: [...m.querySelectorAll('details.fold')].some((d) => d.open),"
        " chip: m.querySelector('.lchip strong')?.textContent, href: m.querySelector('.lchip')?.getAttribute('href'),"
        " rel: m.querySelector('.lchip')?.getAttribute('rel') };"
    )
    assert "Beispieltext der Vorschau" in got["main"] and "Passt dir Samstag" not in got["main"]
    assert got["folds"] == ["Signatur", "Zitierten Text anzeigen"] and not got["open"]
    assert got["chip"] == "www.example.com" and got["href"].startswith("https://www.example.com/termine/2026")
    assert got["rel"] == "noopener noreferrer nofollow"


def test_hostile_links_stay_text(open_panel) -> None:
    panel = open_panel("postfach", "xss=1&textslow=20")
    _open_text(panel)
    panel.js("root.querySelectorAll('details.fold').forEach((d) => (d.open = true)); await wait(100);")
    got = panel.js(
        "return { ran: !!window.__xss, injected: root.querySelectorAll('[data-xss], script, [onmouseover], [onerror]').length,"
        " hrefs: [...root.querySelectorAll('.lchip')].map((a) => a.getAttribute('href')) };"
    )
    assert got["ran"] is False and got["injected"] == 0
    assert all(h.startswith("https://") and '"' not in h and "<" not in h for h in got["hrefs"])
    assert not any("javascript" in h for h in got["hrefs"])


def test_a_conversation_reads_like_messages(open_panel) -> None:
    panel = open_panel("postfach")
    panel.js(
        "const k = el._s.act.items.find((i) => i.thread_count > 1)?.key; if (k) { el._actOpen(k); } await wait(1200);"
    )
    got = panel.js(
        "return { chat: !!root.querySelector('.reader ul.thread.chat'), mine: root.querySelectorAll('.reader ul.thread.chat li.mine').length,"
        " all: root.querySelectorAll('.reader ul.thread.chat li').length };"
    )
    assert got["chat"] and got["all"] >= 2 and got["mine"] >= 1


def test_categories_have_one_colour_everywhere(open_panel) -> None:
    panel = open_panel("postfach")
    colours = panel.js(
        "const pick = (sel) => [...root.querySelectorAll(sel)].map((n) => [n.closest('.meta, .ai-cat, .reader')?.textContent.trim().slice(0, 30), n.style.getPropertyValue('--cat')]);"
        "const list = pick('.mlist .meta.ai .cdot'); el._setTab('ai'); await wait(300); return { list, cats: pick('.ai-cat .cdot') };"
    )
    assert colours["list"] and all(c for _, c in colours["list"])
    by_cat = {name.split(" · ")[0].strip(): c for name, c in colours["list"]}
    for name, colour in colours["cats"]:
        if name in by_cat:
            assert by_cat[name] == colour


# ------------------------------------------------------------------ B: the command palette
def test_the_command_palette_finds_places_rules_and_mails(open_panel) -> None:
    panel = open_panel("postfach")
    panel.js("root.querySelector('.mlist [data-action=\"act-open\"]').focus();")
    panel.page.keyboard.press("Control+k")
    panel.js("await wait(150);")
    assert panel.js("return root.activeElement?.id;") == "pal-q"
    assert panel.js("return root.querySelector('[data-frame]').inert;") is True  # the rest of the panel waits
    panel.page.keyboard.type("regeln")
    panel.js("await wait(150);")
    first = panel.js("return root.querySelector('#pal-list [aria-selected=\"true\"] .pl')?.textContent;")
    assert first == "Regeln"
    panel.page.keyboard.press("Enter")
    panel.js("await wait(300);")
    assert panel.js("return el._tab(el._tabs());") == "rules"
    assert panel.count(".palette") == 0 and panel.js("return root.querySelector('[data-frame]').inert;") is False
    # mails are searched on the server
    panel.page.keyboard.press("Control+k")
    panel.page.keyboard.type("ratenkredit")
    panel.page.wait_for_function(
        "() => [...document.querySelector('friedafetch-mail-panel').shadowRoot.querySelectorAll('#pal-list .pl')].some((n) => n.textContent.includes('Ratenkredit'))",
        timeout=5000,
    )
    options = panel.js(
        "return [...root.querySelectorAll('#pal-list [role=\"option\"] .pl')].map((n) => n.textContent);"
    )
    assert any("Ratenkredit" in o for o in options)
    for _ in range(len(options) - 1):
        panel.page.keyboard.press("ArrowDown")
    panel.page.keyboard.press("Enter")
    panel.js("await wait(1000);")
    assert "Ratenkredit" in (panel.text(".reader h2") or panel.text(".sheet h2") or "")
    panel.page.keyboard.press("Control+k")
    panel.page.keyboard.press("Escape")
    assert panel.count(".palette") == 0


def test_the_rule_editor_shows_a_sentence_and_a_live_preview(open_panel) -> None:
    panel = open_panel("postfach")
    panel.js(
        "el._setTab('rules'); await wait(200); root.querySelector('[data-action=\"new\"]').click(); await wait(300);"
    )
    panel.js(
        "const s = root.querySelector('.cond .c-field'); s.value = 'subject'; s.dispatchEvent(new Event('change', { bubbles: true }));"
        "const v = root.querySelector('.cond .c-value'); v.value = 'Ratenkredit'; v.dispatchEvent(new Event('input', { bubbles: true }));"
        "const m = root.querySelector('#f-move'); m.value = m.options[1].value; m.dispatchEvent(new Event('change', { bubbles: true }));"
        "await wait(900);"
    )
    sentence = panel.text("#rule-sentence")
    assert sentence.startswith("Wenn Betreff enthält „Ratenkredit“, dann: ") and sentence.endswith(".")
    preview = panel.text("#rule-preview")
    assert "Trifft auf 1 der letzten" in preview and "Ratenkredit" in preview
    # a redraw keeps the answer (no flicker, no new request)
    panel.js("el._render(); await wait(50);")
    assert "Trifft auf" in panel.text("#rule-preview")
    panel.js(
        "const v = root.querySelector('.cond .c-value'); v.value = 'gibt es nicht 4711'; v.dispatchEvent(new Event('input', { bubbles: true })); await wait(900);"
    )
    assert "Trifft auf keine der letzten" in panel.text("#rule-preview")


def test_rules_are_dragged_to_their_place(open_panel, browser_name: str) -> None:
    if browser_name == "webkit":
        pytest.skip("synthetic drag events with a DataTransfer: Chromium")
    panel = open_panel("postfach", "actslow=20")
    panel.js("el._setTab('rules'); await wait(300);")
    before = panel.js("return el._s.rules.map((r) => r.id);")
    assert len(before) >= 2 and panel.count("tr.rrow[draggable] .grip") == len(before)
    panel.js(
        "const rows = [...root.querySelectorAll('tr.rrow[draggable]')]; const dt = new DataTransfer();"
        "const fire = (el, type, y) => el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt, clientY: y }));"
        "const last = rows[rows.length - 1].getBoundingClientRect();"
        "fire(rows[0], 'dragstart', 0); fire(rows[rows.length - 1], 'dragover', last.bottom - 2); fire(rows[rows.length - 1], 'drop', last.bottom - 2); fire(rows[0], 'dragend', 0);"
        "await wait(600);"
    )
    after = panel.js("return el._s.rules.map((r) => r.id);")
    assert after == [*before[1:], before[0]]


# ------------------------------------------------------------------ C: phones
def test_phone_tabs_at_the_bottom_and_back_closes_the_mail(open_panel) -> None:
    panel = open_panel("postfach", "", phone=True)
    bar = panel.js(
        "const b = root.querySelector('.tabsbar').getBoundingClientRect(); return { pos: getComputedStyle(root.querySelector('.tabsbar')).position, bottom: Math.round(innerHeight - b.bottom) };"
    )
    assert bar == {"pos": "fixed", "bottom": 0}
    panel.click('.mlist [data-action="act-open"]', 900)
    assert panel.js("return !!el._s.sheet && history.state?.friedaMail === true;")
    panel.js("history.back(); await wait(500);")
    assert panel.js("return el._s.sheet;") is None


def test_phone_long_press_picks_and_pull_reloads(open_panel, browser_name: str) -> None:
    panel = open_panel("postfach", "", phone=True)
    picked = panel.js(
        "const btn = [...root.querySelectorAll('.mlist li.m .mitem')].find((b) => el._actItem(b.dataset.id)?.selectable);"
        "const r = btn.getBoundingClientRect();"
        "btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 3, pointerType: 'touch', isPrimary: true, clientX: r.left + 40, clientY: r.top + 10 }));"
        "await wait(700); btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 3, pointerType: 'touch', isPrimary: true })); btn.click(); await wait(200);"
        "return { picking: el._s.act.picking, sel: [...el._s.act.sel.keys()], key: btn.dataset.id, sheet: !!el._s.sheet };"
    )
    assert picked["picking"] and picked["sel"] == [picked["key"]] and not picked["sheet"]
    if browser_name == "webkit":
        return  # TouchEvent construction: Chromium
    panel.js("el._actStopPicking(); await wait(200);")
    calls = panel.js(
        "let n = 0; const load = el._loadActivity.bind(el); el._loadActivity = (...a) => (n++, load(...a));"
        "const s = root.querySelector('.lscroll'); const touch = (y) => new Touch({ identifier: 1, target: s, clientX: 100, clientY: y });"
        "s.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [touch(100)] }));"
        "s.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, touches: [touch(200)] }));"
        "const tip = root.querySelector('.ptr')?.textContent;"
        "s.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [] })); await wait(600); return { n, tip };"
    )
    assert calls == {"n": 1, "tip": "Loslassen zum Aktualisieren"}


# ------------------------------------------------------------------ D: insights and Frieda's panel
def test_the_ai_overview_and_handled_without_you(open_panel) -> None:
    panel = open_panel("postfach")
    panel.js("el._setTab('ai'); await wait(400);")
    donut = panel.js("return root.querySelector('.aidonut')?.getAttribute('aria-label');")
    assert donut.startswith("Kategorien der letzten ") and "Rechnungen & Belege" in donut
    assert panel.count(".aidonut title, .bars title") == 0  # no tooltips
    weeks = panel.js("return root.querySelector('.aiweeks .bars')?.getAttribute('aria-label');")
    assert weeks.startswith("Treffsicherheit je Woche: KW ") and weeks.endswith(" %")
    panel.js("el._setTab('foryou'); await wait(500);")
    tile = panel.js(
        "const t = [...root.querySelectorAll('.fy-tile')].find((n) => n.textContent.includes('ohne dich erledigt')); return t?.querySelector('.fy-s')?.textContent;"
    )
    assert tile.startswith("Regeln ") and "Min. bei 10 s je Mail" in tile


def test_friedas_panel_has_the_same_keys(open_panel) -> None:
    panel = open_panel("frieda")
    panel.js("(root.querySelector('[role=\"tab\"]') || el).focus();")
    panel.page.keyboard.press("?")
    panel.js("await wait(150);")
    assert panel.count(".modal.keys kbd") == 4
    panel.page.keyboard.press("Escape")
    panel.js("await wait(150);")
    assert panel.count(".modal.keys") == 0
    tabs = panel.js("return [...root.querySelectorAll('[role=\"tab\"]')].map((b) => b.dataset.tab);")
    panel.js("(root.querySelector('[role=\"tab\"]') || el).focus();")
    panel.page.keyboard.press(str(len(tabs)))
    panel.js("await wait(200);")
    assert panel.js('return root.querySelector(\'[role="tab"][aria-selected="true"]\').dataset.tab;') == tabs[-1]
    assert panel.count(".content.enter") == 1


# ------------------------------------------------------------------ subscriptions
def test_unsubscribed_newsletters_fold_away_unless_they_keep_sending(open_panel) -> None:
    panel = open_panel("postfach", "tab=foryou")
    panel.js("el._setTab('foryou'); await wait(500);")
    names = "return [...root.querySelectorAll(arg)].map((n) => n.querySelector('strong').textContent);"
    assert panel.js(names, '[data-widget="fy-subs"] > .card > .ai-cats .fy-sub') == [
        "Möbelhaus",
        "Gartenmarkt",
        "Schuhhaus",
    ]
    assert "schreibt weiter: 2 seit der Abmeldung" in panel.text('[data-widget="fy-subs"]')
    tabs = panel.js(
        "return [...root.querySelectorAll('.fy-subtabs .seg')].map((b) => [b.textContent.trim(), b.getAttribute('aria-pressed')]);"
    )
    assert tabs == [["Abonniert3", "true"], ["Abgemeldet1", "false"]]
    panel.click('.fy-subtabs [data-v="gone"]', 200)
    assert panel.js(names, ".fy-gone .fy-sub") == ["Reiseportal"]
    assert panel.count('[data-widget="fy-subs"] [data-action="fy-unsub"]') == 0  # only the unsubscribed ones
    panel.click('.fy-subtabs [data-v="on"]', 200)
    assert "2 Adressen" in panel.text('[data-widget="fy-subs"] .fy-sub')
    # hiding takes it off the list at once
    panel.click('[data-widget="fy-subs"] .fy-sub [data-action="fy-dismiss"]', 500)
    assert "Möbelhaus" not in panel.js(names, '[data-widget="fy-subs"] .fy-sub')


def test_after_a_web_page_frieda_asks_whether_it_worked(open_panel) -> None:
    panel = open_panel("postfach", "tab=foryou&unsubpage=1")
    panel.js("el._setTab('foryou'); window.open = () => null; await wait(500);")
    panel.click('[data-widget="fy-subs"] [data-action="fy-unsub"]', 200)
    panel.click('[data-action="confirm-yes"]', 900)  # "Unsubscribe?"
    assert panel.text(".modal h3") == "Auf der Seite abgemeldet?"
    panel.click('[data-action="confirm-yes"]', 900)  # "Yes, unsubscribed"
    assert panel.text('.fy-subtabs [data-v="gone"] .n') == "2"


# ------------------------------------------------------------------ tablets
@pytest.mark.parametrize("width", [768, 834, 1024])
def test_ipad_portrait_list_and_mail_side_by_side(browser, site, width: int) -> None:
    ctx = browser.new_context(viewport={"width": width, "height": 1100}, has_touch=True)
    page = ctx.new_page()
    page.goto(f"{site}/postfach.html")
    page.wait_for_function("document.title === 'ready'", timeout=20000)
    page.wait_for_timeout(600)
    got = page.evaluate(
        """() => { const root = document.querySelector('friedafetch-mail-panel').shadowRoot;
        const list = root.querySelector('.listpane').getBoundingClientRect();
        const inside = [...root.querySelectorAll('.lhead *')].filter((n) => n.getClientRects().length).every((n) => n.getBoundingClientRect().right <= list.right + 1);
        const top = root.querySelector('.reader .rtop'); return { inside, topRows: top ? Math.round(top.getBoundingClientRect().height) : 0,
          page: document.documentElement.scrollWidth - innerWidth }; }"""
    )
    page.goto(f"{site}/postfach.html?tab=rules")
    page.wait_for_function("document.title === 'ready'", timeout=20000)
    page.wait_for_timeout(400)
    rules = page.evaluate(
        "() => { const c = document.querySelector('friedafetch-mail-panel').shadowRoot.querySelector('[data-widget=\"rules\"] .card'); return c.scrollWidth - c.clientWidth; }"
    )
    ctx.close()
    assert got["inside"], "the list's tools stay in their column"
    assert got["topRows"] <= 60, "the mail's buttons fit in one row"
    assert got["page"] <= 1 and rules <= 1
