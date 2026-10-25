"""A folding phone (iPhone Duo: 466×678 folded, 626×890 opened, 890×626 opened and turned) and parcels that never
report their delivery."""

from __future__ import annotations

STATE = """() => { const el = document.querySelector('friedafetch-mail-panel'); const r = el.shadowRoot;
  return { sheet: !!r.querySelector('.sheet.mailsheet'), reader: getComputedStyle(r.querySelector('.reader')).display,
    open: el._s.act.open, short: el.classList.contains('short'), inbar: !!r.querySelector('.toolbar .tabsbar.inbar'),
    toolbar: r.querySelector('.toolbar').getBoundingClientRect().height,
    first: r.querySelector('.mlist li.m').getBoundingClientRect().top }; }"""


def _phone(browser, site, width: int, height: int):
    ctx = browser.new_context(viewport={"width": width, "height": height}, has_touch=True, is_mobile=True)
    page = ctx.new_page()
    page.goto(f"{site}/postfach.html")
    page.wait_for_function("document.title === 'ready'", timeout=20000)
    page.wait_for_timeout(700)
    return ctx, page


def test_folding_open_and_shut_keeps_the_mail(browser, site) -> None:
    ctx, page = _phone(browser, site, 466, 678)
    folded = page.evaluate(STATE)
    assert folded["reader"] == "none" and folded["open"] is None  # the outer screen: the list only
    assert folded["toolbar"] <= 46 and folded["first"] < 260  # a slim head: the first mail in the upper third
    page.set_viewport_size({"width": 626, "height": 890})  # opened: list and mail side by side
    page.wait_for_timeout(900)
    opened = page.evaluate(STATE)
    assert opened["reader"] != "none" and opened["open"] and not opened["sheet"]
    page.set_viewport_size({"width": 466, "height": 678})  # shut again: the same mail as its own page
    page.wait_for_timeout(900)
    shut = page.evaluate(STATE)
    assert shut["sheet"] and shut["open"] == opened["open"]
    page.set_viewport_size({"width": 626, "height": 890})  # and back into the reading pane
    page.wait_for_timeout(900)
    again = page.evaluate(STATE)
    assert not again["sheet"] and again["reader"] != "none" and again["open"] == opened["open"]
    rtop = page.evaluate(
        "() => document.querySelector('friedafetch-mail-panel').shadowRoot.querySelector('.reader .rtop').getBoundingClientRect().height"
    )
    assert rtop < 60  # the mail's buttons in one row
    ctx.close()


def test_opened_and_turned_the_tabs_share_the_title_row(browser, site) -> None:
    ctx, page = _phone(browser, site, 890, 626)
    state = page.evaluate(STATE)
    assert state["short"] and state["inbar"] and state["toolbar"] <= 48
    page.evaluate(
        "() => document.querySelector('friedafetch-mail-panel').shadowRoot.querySelector('.toolbar #tab-foryou').click()"
    )
    page.wait_for_timeout(500)
    assert page.evaluate("() => document.querySelector('friedafetch-mail-panel')._s.tab") == "foryou"
    page.set_viewport_size({"width": 626, "height": 890})  # upright: the tabs below the title again
    page.wait_for_timeout(700)
    assert not page.evaluate(
        "() => !!document.querySelector('friedafetch-mail-panel').shadowRoot.querySelector('.toolbar .tabsbar')"
    )
    ctx.close()


def test_a_parcel_without_news_asks_and_learns(open_panel) -> None:
    panel = open_panel("postfach", "tab=foryou")
    panel.js("el._setTab('foryou'); await wait(600);")
    assert panel.text(".fy-quiet:not(.assumed) > span") == "Seit 6 Tagen keine Neuigkeit – angekommen?"
    assert panel.text(".fy-quiet.assumed > span") == "Teeversand meldet keine Zustellung"
    assert panel.text('[data-widget="fy-parcels"] .subbar .muted') == "Ohne Zustellmeldung: tee.example"
    panel.click('.fy-quiet [data-action="fy-parcel-arrived"]', 600)  # it came: delivered, and the shop is learned
    assert panel.count(".fy-quiet:not(.assumed)") == 0
    assert panel.js("return el._s.insights.parcel_silent;") == ["tee.example", "huellen.example"]
    assert panel.text(".undobar .ut") == "Als angekommen vermerkt"
    panel.click('.fy-quiet.assumed [data-action="fy-parcel-waiting"]', 600)  # "still missing": on its way again
    assert panel.js("return el._s.insights.parcels.find((p) => p.id === 'k7').status;") == "in_transit"
    panel.click('[data-widget="fy-parcels"] [data-action="fy-restore"][data-kind="silent"]', 600)
    assert panel.js("return el._s.insights.parcel_silent;") == []
