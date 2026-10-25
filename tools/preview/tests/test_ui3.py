"""Today as a timeline, the parcels' week, quick-filter chips, the quick check, the sender's page, rule templates and
their effect, "Done today", the compact layout and calm empty states."""

from __future__ import annotations

import pytest


def _foryou(panel) -> None:
    panel.js("el._setTab('foryou'); await wait(600);")


def test_today_as_a_timeline(open_panel) -> None:
    panel = open_panel("postfach", "tab=foryou")
    _foryou(panel)
    first = panel.js("return root.querySelector('.content > section.widget').dataset.widget;")
    assert first == "fy-today"  # the first thing in For you
    rows = panel.js(
        "return [...root.querySelectorAll('ol.daytl li')].map((li) => [li.className, li.querySelector('.dt').textContent.trim(), li.querySelector('.dx').textContent.replace(/\\s+/g, ' ').trim()]);"
    )
    texts = [r[2] for r in rows]
    assert any(t.startswith("Paket von Shop Versand") for t in texts)
    assert any(t.startswith("Wichtige Mail von Erika Mustermann") for t in texts)
    assert sum(1 for r in rows if r[0] == "now") == 1
    later = [r[0] for r in rows].index("later")
    assert all(t.startswith("Antwort an") for t in texts[later + 1 :])  # replies have no hour


def test_the_parcels_week(open_panel) -> None:
    panel = open_panel("postfach", "tab=foryou")
    _foryou(panel)
    days = panel.js(
        "return [...root.querySelectorAll('.pweek .pday')].map((b) => [b.textContent.replace(/\\s+/g, ' ').trim(), b.classList.contains('has')]);"
    )
    assert len(days) == 8 and days[0][0] == "Alle" and days[1][1]  # "All", then today with a parcel
    panel.click(".pweek .pday:nth-child(2)", 300)
    shops = panel.js(
        "return [...root.querySelectorAll('[data-widget=\"fy-parcels\"] .fy-row strong')].map((n) => n.textContent);"
    )
    assert shops == ["Shop Versand"]
    panel.click(".pweek .pday.all", 300)
    assert panel.count('[data-widget="fy-parcels"] .fy-row') >= 4


def test_quick_filter_chips_on_a_tablet(browser, site) -> None:
    ctx = browser.new_context(viewport={"width": 834, "height": 1100}, has_touch=True)
    page = ctx.new_page()
    page.goto(f"{site}/postfach.html")
    page.wait_for_function("document.title === 'ready'", timeout=20000)
    page.wait_for_timeout(500)
    got = page.evaluate(
        """async () => { const el = document.querySelector('friedafetch-mail-panel'); const root = el.shadowRoot;
        const chips = [...root.querySelectorAll('.vchips .vchip')];
        const visible = getComputedStyle(root.querySelector('.vchips')).display;
        chips.find((c) => c.dataset.v === 'unread').click(); await new Promise((r) => setTimeout(r, 600));
        return { visible, labels: chips.map((c) => c.dataset.v), view: el._s.act.view,
          pressed: root.querySelector('.vchip[data-v="unread"]').getAttribute('aria-pressed') }; }"""
    )
    ctx.close()
    assert got["visible"] == "flex" and got["labels"][0] == "all" and "unsure" in got["labels"]
    assert got["view"] == "unread" and got["pressed"] == "true"


def test_the_quick_check(open_panel) -> None:
    panel = open_panel("postfach")
    unsure = panel.js("return el._s.act.counts.unsure;")
    assert unsure >= 2
    panel.click('[data-action="qc-open"]', 600)
    assert panel.text(".qc-progress") == f"1 von {unsure}"
    first = panel.text(".qc-card .qc-subj")
    panel.page.keyboard.press("Enter")  # right
    panel.js("await wait(300);")
    assert panel.text(".qc-card .qc-subj") != first
    panel.page.keyboard.press("1")  # the first category
    panel.js("await wait(300);")
    for _ in range(unsure):
        if not panel.count(".qc-card"):
            break
        panel.page.keyboard.press("ArrowRight")  # skip the rest
        panel.js("await wait(150);")
    assert "Alles geprüft" in panel.text(".modal.qc")
    panel.page.keyboard.press("Escape")
    panel.js("await wait(700);")
    assert panel.count(".modal.qc") == 0
    assert panel.js("return el._s.act.counts.unsure;") < unsure


def test_the_senders_page(open_panel) -> None:
    panel = open_panel("postfach")
    panel.click(".reader .whobtn", 700)
    got = panel.js(
        "const s = root.querySelector('.sheet.sender'); return { title: s.querySelector('#sp-title').textContent,"
        " tiles: [...s.querySelectorAll('.sp-tile')].map((t) => t.textContent.replace(/\\s+/g, ' ').trim()),"
        " vip: !!s.querySelector('.sp-vip'), mails: s.querySelectorAll('.sp-mails li').length };"
    )
    assert got["title"] == "Erika Mustermann" and got["vip"] and got["mails"] >= 1
    assert got["tiles"][0].endswith("Mails in 30 Tagen")
    panel.click('.sheet.sender [data-action="sender-all"]', 700)
    assert panel.count(".sheet.sender") == 0
    assert panel.js("return el._s.act.query;") == "erika@example.com"


def test_rule_templates_and_the_effect_of_rules(open_panel) -> None:
    panel = open_panel("postfach")
    panel.js("el._setTab('rules'); await wait(300);")
    sparks = panel.js(
        "return [...root.querySelectorAll('tr.rrow')].map((tr) => [tr.querySelector('.rname strong').textContent, tr.querySelector('svg.rspark')?.getAttribute('aria-label') || tr.querySelector('.rspark.quiet')?.textContent]);"
    )
    assert any(label and label.endswith("Treffer in 30 Tagen") for _, label in sparks)
    assert any(label == "30 Tage ohne Treffer" for _, label in sparks)
    # right after the update there are no 30 days counted yet
    since = panel.js(
        "el._s.dailySince = new Date().toISOString().slice(0, 10); el._render(); return root.querySelector('.rspark.quiet').textContent;"
    )
    assert since.startswith("Seit ") and since.endswith(" ohne Treffer")
    panel.js("root.querySelector('[data-action=\"new\"]').click(); await wait(300);")
    panel.click('[data-action="rule-tpl"][data-v="bills"]', 1000)
    assert panel.js("return root.querySelector('#f-name').value;") == "Rechnungen ablegen"
    assert panel.js("return [...root.querySelectorAll('.cond .c-value')].map((i) => i.value);") == [
        "Rechnung",
        "Invoice",
    ]
    assert panel.text("#rule-sentence").startswith("Wenn Betreff enthält „Rechnung“ oder Betreff enthält „Invoice“")


def test_done_today_can_be_undone_later(open_panel) -> None:
    panel = open_panel("postfach", "actslow=20")
    key = panel.js("return el._s.act.open;")
    panel.click('.rtop [data-action="mail-act"][data-v="archive"]', 600)
    panel.js("el._hideUndo();")  # the bar is gone: the history still has it
    panel.click('[data-action="hist-open"]', 300)
    assert panel.text(".hilist li .hi-x") == "1 archiviert"
    panel.click('.hilist [data-action="hist-undo"]', 900)
    assert panel.js("return el._actItem(arg).state.mailbox;", key) == "INBOX"
    assert panel.text(".hilist li .chip") == "rückgängig gemacht"


def test_compact_layout_stays_on_this_device(open_panel) -> None:
    panel = open_panel("postfach")
    tall = panel.js("return root.querySelector('.mlist li.m').getBoundingClientRect().height;")
    panel.js("el._density(); await wait(100);")
    assert panel.js("return el.classList.contains('dense');")
    assert panel.js("return root.querySelector('.mlist li.m').getBoundingClientRect().height;") < tall
    panel.page.reload()
    panel.page.wait_for_function("document.title === 'ready'", timeout=20000)
    assert panel.js("return el.classList.contains('dense');")


@pytest.mark.parametrize("dark", [False, True])
def test_calm_empty_states(open_panel, dark: bool) -> None:
    panel = open_panel("postfach", dark=dark)
    panel.js(
        "const i = root.querySelector('#act-q'); i.value = 'gibt es nicht 4711'; i.dispatchEvent(new Event('input')); await wait(900);"
    )
    assert panel.count(".lscroll .empty-state img") == 1
    assert panel.text(".lscroll .empty-state p") == "Keine Mails in dieser Ansicht."


def test_a_failed_undo_from_done_today_says_so(open_panel) -> None:
    panel = open_panel("postfach", "actslow=20")
    panel.click('.rtop [data-action="mail-act"][data-v="archive"]', 600)
    panel.js("el._hideUndo(); el._mailAct = async () => { el._s.error = 'Die Mail ist nicht mehr da.'; };")
    panel.click('[data-action="hist-open"]', 300)
    panel.click('.hilist [data-action="hist-undo"]', 400)
    assert panel.text(".modal.hist .error") == "Die Mail ist nicht mehr da."
    assert panel.count('.hilist [data-action="hist-undo"]') == 1  # still there to try again
