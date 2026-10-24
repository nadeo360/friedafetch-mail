/* Panel styles (Home Assistant theme variables, mobile layout). Loaded by panel.js. */

export const STYLE = `
  .toolbar select { background: rgba(255,255,255,.15); color: inherit; border: 1px solid rgba(255,255,255,.4); border-radius: 6px; padding: 4px 8px; font-size: 14px; }
  /* data tables (rules, AI log): one line per item, details on click, row menu */
  .rtable .c-pos { width: 28px; color: var(--secondary-text-color); font-size: 12px; }
  .rtable .c-on { width: 40px; }
  .rtable .c-name { min-width: 180px; max-width: 320px; }
  .rtable .c-cond { cursor: pointer; max-width: 320px; }
  .rtable .c-cond .ctext { display: inline-block; max-width: calc(100% - 40px); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: bottom; }
  .rtable .c-cond .more { margin-left: 6px; font-size: 11px; padding: 1px 6px; border-radius: 8px; background: var(--secondary-background-color, #f0f0f0); }
  .rtable .c-act .chip { margin: 1px 4px 1px 0; }
  .rtable .c-menu, .rtable th.c-menu { width: 40px; text-align: right; }
  tr.rrow.off .c-name, tr.rrow.off .c-cond, tr.rrow.off .c-act, tr.rrow.off .c-hits { opacity: .5; }
  tr.rrow.flash > td { background: color-mix(in srgb, var(--primary-color) 14%, transparent); transition: background .4s; }
  .rdet, .adet { display: grid; gap: 10px; padding-left: 70px; }
  .adet { padding-left: 44px; }
  .rdet .lbl, .adet .lbl { font-size: 12px; color: var(--secondary-text-color); margin-bottom: 3px; }
  .rdet-tools { display: flex; flex-wrap: wrap; gap: 6px; }
  .adet-meta { font-size: 12px; }
  .sortnote { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin: 0 0 8px; padding: 6px 10px; border-radius: 8px; font-size: 13px; color: var(--secondary-text-color); background: color-mix(in srgb, var(--info-color, #039be5) 8%, transparent); --mdc-icon-size: 16px; }
  .rule-new { margin-bottom: 10px; border: 1px solid color-mix(in srgb, var(--primary-color) 45%, var(--divider-color, #e0e0e0)); border-radius: 12px; }
  .atable .c-st { width: 40px; }
  .atable .c-st .aiu-st { width: 30px; height: 30px; --mdc-icon-size: 16px; }
  .atable .c-time { width: 70px; text-align: left; }
  .atable .c-subj { min-width: 200px; max-width: 380px; }
  .ratetable .c-imp { width: 40px; }
  .ratetable .c-imp .imp { display: inline-grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; font-weight: 600; font-size: 13px; background: var(--secondary-background-color, #f0f0f0); color: var(--frieda-text-on-fill); }
  .ratetable .c-imp .imp.i5 { background: color-mix(in srgb, var(--error-color, #db4437) 18%, transparent); color: var(--frieda-text-err); }
  .ratetable .c-imp .imp.i4 { background: color-mix(in srgb, var(--warning-color, #ffa600) 22%, transparent); color: var(--primary-text-color); }
  .ratetable .c-imp .imp.i3 { background: color-mix(in srgb, var(--primary-color) 14%, transparent); color: var(--primary-color); }
  .ratetable .c-from { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ratetable .c-cat { white-space: nowrap; }
  .ratetable .c-cat .chip { margin: 0 4px 0 0; }
  .ratetable .c-cat .chip.fixed { background: color-mix(in srgb, var(--primary-color) 14%, transparent); }
  .ratetable .fi { display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 6px; background: var(--secondary-background-color, #f0f0f0); --mdc-icon-size: 14px; vertical-align: middle; }
  .ratetable .fi.hot { background: color-mix(in srgb, var(--warning-color, #ffa600) 18%, transparent); }
  .ratetable .fields { display: inline-flex; gap: 3px; }
  .det .corr { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .det .corr .lbl { margin: 0; }
  .atable .c-sender { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  button.rtext { display: block; width: 100%; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; background: none; color: inherit; padding: 0; text-align: left; font: inherit; font-size: 14px; min-height: 0; border: none; cursor: pointer; }
  table.dtable tr.arow { cursor: pointer; }
  table.dtable tr.arow.open button.rtext { font-weight: 500; }
  .stat.with-chart { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .stat .stat-tx { min-width: 0; }
  .atable .c-kind, .atable .c-ent { white-space: nowrap; }
  .atable .fields { display: inline-flex; gap: 3px; }
  .atable .fi { display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 6px; background: var(--secondary-background-color, #f0f0f0); --mdc-icon-size: 14px; }
  .atable .fi.hot, .chip.hot { background: color-mix(in srgb, var(--warning-color, #ffa600) 18%, transparent); }
  .atable tr.held .aiu-st { background: color-mix(in srgb, var(--success-color, #43a047) 16%, transparent); color: var(--frieda-text-ok); }
  .atable tr.err .aiu-st { background: color-mix(in srgb, var(--error-color, #db4437) 14%, transparent); color: var(--frieda-text-err); }
  .aiu-scroll { max-height: 560px; overflow-y: auto; }
  .htable .c-time { white-space: nowrap; }
  .htable .c-time .nm strong { font-weight: 400; overflow: visible; text-overflow: clip; }
  .htable .c-trig, .htable .c-res { white-space: nowrap; }
  .tchip { display: inline-flex; align-items: center; gap: 5px; padding: 2px 9px 2px 6px; border-radius: 12px; font-size: 13px; white-space: nowrap; --mdc-icon-size: 15px; background: var(--secondary-background-color, #f0f0f0); color: var(--frieda-text-on-fill); }
  .tchip.t-push { background: color-mix(in srgb, var(--warning-color, #ffa600) 20%, transparent); color: var(--primary-text-color); }
  .tchip.t-manual { background: color-mix(in srgb, var(--primary-color) 14%, transparent); color: var(--primary-color); }
  .tchip.t-ai { background: color-mix(in srgb, var(--frieda-ai-color, #8e6bd8) 14%, transparent); color: var(--frieda-text-ai); }
  .tchip .sub { display: inline-flex; align-items: center; gap: 2px; color: var(--secondary-text-color); --mdc-icon-size: 13px; }
  .htable .c-ai { white-space: nowrap; }
  .tchip.t-assistant { background: color-mix(in srgb, var(--info-color, #039be5) 16%, transparent); color: var(--frieda-text-info); }
  .htable .scope { display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .htable .scope .chip.mbox { margin: 0; font-size: 12px; }
  .htable .c-matched { white-space: nowrap; }
  table.dtable tr.expandable { cursor: pointer; }
  button.hitchip { display: inline-flex; align-items: center; gap: 5px; padding: 2px 9px 2px 7px; min-height: 0; border-radius: 12px; font-size: 13px; background: color-mix(in srgb, var(--primary-color) 12%, transparent); color: var(--primary-text-color); --mdc-icon-size: 15px; }
  button.hitchip ha-icon { color: var(--primary-color); }
  tr.open button.hitchip { background: var(--primary-color); color: var(--text-primary-color, #fff); }
  tr.open button.hitchip ha-icon { color: inherit; }
  .htable tr.err .res { color: var(--frieda-text-err); }
  .htable tr.hit .res { color: var(--frieda-text-ok); }
  .htable tr.idle .res { color: var(--secondary-text-color); }
  tr.disabled td { opacity: .5; }
  .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 10px; }
  /* forms: field names 13px grey like secondary table columns, values and options 14px in the text colour */
  .row label { min-width: 170px; color: var(--secondary-text-color); font-size: 13px; }
  .row label.opt { display: inline-flex; align-items: center; gap: 10px; min-width: 0; color: var(--primary-text-color); font-size: 14px; cursor: pointer; }
  .row select { min-width: 240px; }
  input[type=text], select { font: inherit; font-size: 14px; padding: 7px 10px; border: 1px solid var(--divider-color, #ccc); border-radius: 6px; background: var(--card-background-color, #fff); color: var(--primary-text-color); min-width: 160px; }
  input[type=text].grow { flex: 1; min-width: 200px; }
  .cond { display: grid; grid-template-columns: minmax(0, 190px) minmax(0, 190px) minmax(0, 1fr) 40px; gap: 8px; margin-bottom: 8px; align-items: center; }
  .cond select, .cond input[type=text] { width: 100%; min-width: 0; box-sizing: border-box; }
  .actionsbar { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 14px; }
  .actionsbar button { border-radius: 18px; padding: 8px 18px; }
  .actionsbar button.ib { justify-content: center; }
  .tab .label .dot { width: 10px; height: 10px; border-radius: 50%; background: var(--success-color, #43a047); display: inline-block; }
  .tab .label .dot.off { background: var(--secondary-text-color); }
  .tab .badges { display: flex; gap: 6px; flex-wrap: wrap; }
  select.copy { min-width: 0; max-width: 120px; padding: 3px 6px; font-size: 12px; }
  table.stack { width: 100%; }
  .editor { padding: 12px 14px; scroll-margin-top: 16px; }
  h3.with-add { display: flex; align-items: center; gap: 10px; }
  div.with-add { display: flex; align-items: center; gap: 10px; margin: 14px 0 8px; }
  div.with-add > h3 { margin: 0; }
  .mode { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; border-radius: 10px; background: var(--secondary-background-color, #f5f5f5); margin-bottom: 12px; }
  .mode.warn { background: color-mix(in srgb, var(--warning-color, #ffa600) 14%, transparent); }
  .mode .ic { font-size: 18px; line-height: 1.2; }
  .mode .tx { display: grid; gap: 2px; flex: 1; min-width: 0; }
  .mode .tx strong { font-weight: 600; }
  .mode .muted { color: var(--frieda-text-on-fill); }
  .mode .tx .muted { font-size: 12.5px; }
  .subbar { display: flex; gap: 0 10px; align-items: center; flex-wrap: wrap; margin: -4px 0 10px; }
  .subbar button.link { margin-left: auto; }
  .subbar .grow { flex: 1; }
  #run-menu .menu-list { min-width: 280px; }
  details.menu.run > summary { display: inline-flex; align-items: center; gap: 6px; box-sizing: border-box; height: 36px; padding: 0 16px 0 12px; border-radius: 18px; background: var(--primary-color); color: var(--text-primary-color, #fff); font-size: 14px; font-weight: 500; }
  details.menu.run > summary ha-icon { --mdc-icon-size: 18px; }
  details.menu.run > summary:hover, details.menu.run[open] > summary { filter: brightness(.92); }
  details.menu.run > summary:focus-visible, button.round:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
  .ai-cats { display: grid; gap: 6px; }
  .fy-tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; margin: 4px 0 10px; }
  .fy-tile { display: grid; gap: 2px; justify-items: start; text-align: left; border: 1px solid var(--divider-color, #e0e0e0); border-radius: 12px; padding: 10px 12px; background: none; color: inherit; font: inherit; min-height: 0; --mdc-icon-size: 20px; }
  .fy-tile ha-icon { color: var(--secondary-text-color); }
  .fy-v { font-size: 22px; font-weight: 600; line-height: 1.2; }
  .fy-l { font-size: 13px; }
  .fy-s { font-size: 12px; color: var(--secondary-text-color); }
  .fy-foot { display: flex; align-items: flex-start; gap: 6px; margin: 0; --mdc-icon-size: 16px; }
  .fy-foot ha-icon { flex: none; margin-top: 1px; }
  .fy-row .fy-ic { display: inline-grid; place-items: center; width: 32px; height: 32px; border-radius: 10px; flex: none; background: var(--secondary-background-color, #f0f0f0); --mdc-icon-size: 18px; }
  .fy-row .fy-ic.warn { background: color-mix(in srgb, var(--warning-color, #ffa600) 18%, transparent); }
  .fy-row .fy-subj { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .fy-where { padding: 4px 0 6px 42px; display: grid; gap: 8px; }
  .fy-where ul.thread li { display: grid; gap: 2px; border: 1px solid var(--divider-color, #e0e0e0); border-radius: 10px; padding: 8px 10px; }
  .fy-where .tw { display: flex; gap: 8px; align-items: baseline; }
  .fy-where .tw .muted { margin-left: auto; font-size: 12px; }
  .fy-where .ts { font-size: 13px; color: var(--secondary-text-color); }
  .fy-merge { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 13px; }
  @media (max-width: 600px) { .fy-where { padding-left: 0; } }
  .fy-edit { border: 1px solid var(--divider-color, #e0e0e0); border-radius: 10px; padding: 10px; }
  .thr { display: inline-flex; align-items: center; gap: 2px; margin-left: 6px; font-size: 12px; color: var(--secondary-text-color); --mdc-icon-size: 14px; }
  ul.thread { list-style: none; margin: 0 0 14px; padding: 0; display: grid; gap: 4px; }
  .threadrow { display: grid; gap: 2px; width: 100%; text-align: left; font: inherit; color: inherit; background: none; border: 1px solid var(--divider-color, #e0e0e0); border-radius: 10px; padding: 8px 10px; min-height: 0; cursor: default; }
  button.threadrow { cursor: pointer; }
  .threadrow.here { border-color: var(--primary-color); }
  .threadrow.mine { background: var(--secondary-background-color); }
  .threadrow.unread strong { font-weight: 700; }
  .threadrow .tw { display: flex; align-items: center; gap: 6px; --mdc-icon-size: 16px; }
  .threadrow .tw .muted { margin-left: auto; font-size: 12px; }
  .threadrow .ts { font-size: 13px; color: var(--secondary-text-color); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .vip { display: inline-flex; color: var(--warning-color, #ffa600); --mdc-icon-size: 14px; margin-left: 4px; }
  @media (max-width: 600px) { .fy-row { flex-wrap: wrap; } .fy-row .tx { flex-basis: calc(100% - 44px); } }
  .ai-cat { border: 1px solid var(--divider-color, #e0e0e0); border-radius: 10px; padding: 8px 10px; display: flex; gap: 10px; align-items: center; }
  .ai-cat .tx { flex: 1; min-width: 0; display: grid; gap: 2px; }
  .ai-cat .tx .muted { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ai-edit { border: 1px solid color-mix(in srgb, var(--primary-color) 45%, var(--divider-color, #e0e0e0)); border-radius: 10px; padding: 12px; }
  .stat .facts { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 4px; font-size: 12px; color: var(--secondary-text-color); }
  .fact.hot, .fi.hot { color: var(--frieda-text-warn); }
  .fact.err { color: var(--frieda-text-err); }
  .chip.held { background: color-mix(in srgb, var(--success-color, #43a047) 14%, transparent); white-space: nowrap; }
  .aiu-st { display: inline-grid; place-items: center; width: 34px; height: 34px; border-radius: 50%; --mdc-icon-size: 18px; background: color-mix(in srgb, var(--primary-color) 14%, transparent); color: var(--primary-color); }
  .aiu-error { display: flex; gap: 4px; align-items: center; font-size: 12px; color: var(--frieda-text-err); overflow-wrap: anywhere; }
  .pill { display: inline-flex; align-items: center; gap: 6px; height: 36px; padding: 0 16px 0 12px; border-radius: 18px; font-size: 14px; font-weight: 500; }
  .editor h3.title { margin: 0 0 14px; font-size: 16px; font-weight: 500; text-transform: none; letter-spacing: normal; color: var(--primary-text-color); }
  .fbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 6px; }
  .fbar .grow { flex: 1; }
  button.ftoggle { display: none; }
  thead tr.filters th { padding: 4px 6px 8px; font-weight: 400; }
  thead tr.filters input, thead tr.filters select { width: 100%; min-width: 0; box-sizing: border-box; padding: 4px 6px; font-size: 12.5px; }
  thead tr.filters .active { border-color: var(--primary-color); box-shadow: 0 0 0 1px var(--primary-color); }
  tr.fhide { display: none !important; }
  @media (max-width: 760px) {
    .card .chead button { flex: 1 1 auto; }
    table.stack thead { display: block; }
    table.stack thead tr.head { display: none; }
    table.stack thead tr.filters { display: none; }
    .ftable.fopen table.stack thead tr.filters { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; border: none; padding: 0; margin-bottom: 10px; background: none; }
    table.stack thead tr.filters th { display: block; padding: 0; border: none; }
    button.ftoggle { display: inline-block; }
    .editor { padding: 10px; }
    table.stack, table.stack tbody, table.stack tr, table.stack td { display: block; width: 100%; box-sizing: border-box; }
    table.stack tr { border: 1px solid var(--divider-color, #e0e0e0); border-radius: 10px; padding: 8px 10px; margin-bottom: 10px; background: var(--card-background-color, #fff); }
    table.stack td { border: none; padding: 4px 0; white-space: normal !important; }
    table.stack td[data-label]::before { content: attr(data-label); display: block; font-size: 11px; letter-spacing: .04em; text-transform: uppercase; color: var(--secondary-text-color); margin-bottom: 2px; }
    table.stack td[data-label=""]::before, table.stack td:not([data-label])::before { display: none; }
    table.stack td.actions { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding-top: 8px; }
    .scroll { overflow: visible; }
    .actionsbar { flex-direction: column; }
    .card .chead button.round { flex: none; }
    /* phones: table rows become compact two-line entries */
    .actionsbar button { width: 100%; }
    .cond { grid-template-columns: 1fr; gap: 6px; padding: 8px; border: 1px solid var(--divider-color, #e0e0e0); border-radius: 10px; }
    .cond button.icon { justify-self: end; }
    details.menu.run > summary { height: 42px; border-radius: 21px; }
    .pill { height: 42px; border-radius: 21px; }
    .card .chead button.pill { flex: none; }
    .ai-cat { flex-wrap: wrap; }
    .ai-cat .tx { flex: 1 1 calc(100% - 60px); }
    button.round.small { width: 36px; height: 36px; }
    input[type=text], select, select.copy { width: 100%; max-width: none; min-width: 0; box-sizing: border-box; min-height: 44px; font-size: 16px; }
    .row { gap: 4px; }
    .row label { min-width: 100%; font-size: 14px; }
    /* phones: values and options 16px like Home Assistant's own fields (and no zoom on focus in iOS) */
    .row label.opt { font-size: 16px; min-height: 40px; }
    .row label:empty { display: none; }
    .row { margin-bottom: 8px; }
    .editor h3.title { font-size: 17px; }
    .row label:has(input[type=checkbox]) { display: flex; align-items: center; gap: 10px; min-height: 44px; }
    input[type=checkbox]:not(.switch):not(.selbox) { width: 22px; height: 22px; }
    input.selbox { width: 20px; height: 20px; }
  }
  @container (max-width: 720px) {
    table.dtable tr.rrow { display: grid; grid-template-columns: 40px minmax(0, 1fr) auto 36px; grid-template-areas: "on name hits menu" ". cond cond cond" ". act act act"; align-items: center; column-gap: 6px; padding: 6px 0; border-bottom: 1px solid var(--divider-color, #e0e0e0); }
    table.dtable tr.rrow > td { display: block; border: none; padding: 1px 0; max-width: none; min-width: 0; }
    table.dtable tr.rrow > td.c-pos { display: none; }
    /* runs on phones: [trigger] time … result, then the rules that acted */
    .htable tbody tr[data-search] { grid-template-columns: auto minmax(0, 1fr) auto; column-gap: 10px; row-gap: 4px; }
    .htable .c-trig { grid-column: 1; grid-row: 1; }
    /* only the symbol is shown; screen readers still read the trigger */
    .htable .c-trig .tchip .tl { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
    .htable .c-trig .tchip { padding: 4px; border-radius: 50%; }
    .htable .c-time { grid-column: 2; grid-row: 1; }
    .htable .c-res { grid-column: 3; grid-row: 1; justify-self: end; }
    .htable .c-res .muted { display: none; }
    .htable .c-rules { grid-column: 2 / 4; grid-row: 2; }
    .htable .c-rules .chip { margin: 0 4px 0 0; }
    .htable .c-rules:has(> .muted), .htable .c-scope { display: none !important; }
    .htable .c-matched { display: none !important; }
    .htable .c-checked { display: block !important; grid-column: 3; grid-row: 2; justify-self: end; align-self: start; }
    .htable .c-checked:not(:has(.hitchip)) { display: none !important; }
    .htable tr:has(.hitchip) .c-rules { grid-column: 2; }
    .htable .c-ai { grid-column: 2; grid-row: 3; }
    .htable .c-ai:has(> .muted) { display: none !important; }
    .htable tr:has(.c-rules > .muted) .c-ai { grid-row: 2; }
    .rtable .c-on { grid-area: on; }
    .rtable .c-name { grid-area: name; }
    .rtable .c-hits { grid-area: hits; font-size: 12px; color: var(--secondary-text-color); }
    .rtable .c-menu { grid-area: menu; }
    .rtable .c-cond { grid-area: cond; }
    .rtable .c-act { grid-area: act; }
    table.dtable tr.arow { display: grid; grid-template-columns: 40px minmax(0, 1fr) auto; grid-template-areas: "st subj time" ". meta meta"; align-items: center; column-gap: 6px; padding: 6px 0; border-bottom: 1px solid var(--divider-color, #e0e0e0); }
    table.dtable tr.arow > td { display: block; border: none; padding: 1px 0; max-width: none; min-width: 0; }
    .atable .c-st { grid-area: st; }
    .atable .c-subj { grid-area: subj; }
    .atable .c-sender { grid-row: 2; grid-column: 2 / 4; max-width: none; font-size: 12px; }
    .atable .c-time { grid-area: time; width: auto; text-align: right; }
    .atable .c-kind, .atable .c-fields, .atable .c-chars, .atable .c-ent { grid-row: 2; display: inline-flex !important; align-items: center; }
    .atable tr.arow { grid-template-areas: "st subj time"; grid-auto-flow: row; }
    .atable .c-kind { grid-row: 3; grid-column: 2 / 4; }
    .atable .c-fields, .atable .c-chars, .atable .c-ent { display: none !important; }
    .rdet, .adet { padding-left: 0; }
    .ratetable tbody tr[data-search] { grid-template-columns: 40px minmax(0, 1fr) auto; grid-template-areas: "imp subj time" ". from from" ". cat cat"; }
    .ratetable .c-imp { grid-area: imp; }
    .ratetable .c-subj { grid-area: subj; }
    .ratetable .c-time { grid-area: time; text-align: right; width: auto; }
    .ratetable .c-from { grid-area: from; max-width: none; }
    .ratetable .c-cat { grid-area: cat; }
    .ratetable .c-applied { display: none !important; }
  }
  /* subject cells that open a timeline: text with a small chevron */
  button.rtext.go { display: flex; align-items: center; gap: 4px; }
  button.rtext.go .rt { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  button.rtext.go ha-icon { --mdc-icon-size: 16px; opacity: .4; flex: none; }
  tr.arow:hover button.rtext.go ha-icon, button.rtext.go:focus-visible ha-icon { opacity: .8; }

  /* timeline sheet: from the right on wide screens, from the bottom on phones */
  .sheet-backdrop { position: fixed; inset: 0; z-index: 20; background: rgba(0,0,0,.32); }
  .sheet { position: fixed; z-index: 21; top: 0; right: 0; bottom: 0; width: min(460px, 100vw); box-sizing: border-box; display: grid; grid-template-rows: auto auto auto 1fr auto; background: var(--card-background-color, #fff); color: var(--primary-text-color); box-shadow: -12px 0 40px rgba(0,0,0,.22); }
  .sheet .handle { display: block; height: 0; }  /* keeps its grid row; drawn only on phones */
  .sheet button:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
  .sheet-top { display: flex; align-items: center; gap: 8px; padding: 14px 12px 6px 20px; }
  .sheet-top .ttl { flex: 1; font-size: 13px; font-weight: 500; color: var(--secondary-text-color); text-transform: uppercase; letter-spacing: .04em; }
  .sheet-head { padding: 0 20px 14px; border-bottom: 1px solid var(--divider-color, #e0e0e0); display: grid; gap: 6px; min-width: 0; }
  .sheet-head h2 { margin: 0; font-size: 18px; font-weight: 500; line-height: 1.3; overflow-wrap: anywhere; }
  .sheet-head .from { font-size: 13px; color: var(--secondary-text-color); overflow-wrap: anywhere; }
  .sheet-head .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
  .sheet .state { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; padding: 3px 10px 3px 8px; border-radius: 12px; --mdc-icon-size: 15px; }
  .sheet .state.ai { background: color-mix(in srgb, var(--frieda-ai-color, #8e6bd8) 14%, transparent); color: var(--frieda-text-ai); }
  .sheet .state.held { background: color-mix(in srgb, var(--success-color, #43a047) 14%, transparent); color: var(--frieda-text-ok); }
  .sheet .state.box { background: var(--secondary-background-color); color: var(--frieda-text-on-fill); }
  .sheet-body { overflow: auto; padding: 16px 20px 8px; overscroll-behavior: contain; }
  .sheet-foot { padding: 12px 20px 16px; border-top: 1px solid var(--divider-color, #e0e0e0); }
  .sheet-foot .muted { font-size: 12px; }
  ol.tl { list-style: none; margin: 0; padding: 0; }
  ol.tl li { position: relative; display: grid; grid-template-columns: 32px minmax(0, 1fr) auto; column-gap: 12px; padding-bottom: 18px; }
  ol.tl li:not(:last-child)::before { content: ""; position: absolute; left: 15px; top: 34px; bottom: 2px; width: 2px; border-radius: 1px; background: var(--divider-color, #e0e0e0); }
  ol.tl .dot { width: 32px; height: 32px; border-radius: 50%; display: inline-grid; place-items: center; --mdc-icon-size: 17px; background: var(--secondary-background-color); color: var(--frieda-text-on-fill); }
  ol.tl .what { min-width: 0; padding-top: 6px; display: grid; gap: 3px; }
  ol.tl .what strong { font-size: 14px; font-weight: 500; overflow-wrap: anywhere; }
  ol.tl .what .sub { font-size: 13px; color: var(--secondary-text-color); overflow-wrap: anywhere; }
  ol.tl .what .quote { font-size: 13px; border-left: 2px solid var(--divider-color, #e0e0e0); padding: 2px 0 2px 10px; margin-top: 2px; }
  ol.tl .what .chips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 2px; }
  ol.tl .mini { font-size: 12px; padding: 1px 8px; border-radius: 10px; background: var(--secondary-background-color); color: var(--frieda-text-on-fill); }
  ol.tl .when { padding-top: 7px; font-size: 12px; color: var(--secondary-text-color); font-variant-numeric: tabular-nums; white-space: nowrap; }
  ol.tl .t-ai .dot { background: color-mix(in srgb, var(--frieda-ai-color, #8e6bd8) 15%, transparent); color: var(--frieda-text-ai); }
  ol.tl .t-move .dot { background: color-mix(in srgb, var(--info-color, #039be5) 13%, transparent); color: var(--frieda-text-info); }
  ol.tl .t-held .dot { background: color-mix(in srgb, var(--success-color, #43a047) 14%, transparent); color: var(--frieda-text-ok); }
  ol.tl .t-warn .dot { background: color-mix(in srgb, var(--warning-color, #ffa600) 18%, transparent); color: var(--frieda-text-warn); }
  ol.tl .t-err .dot { background: color-mix(in srgb, var(--error-color, #db4437) 12%, transparent); color: var(--frieda-text-err); }
  ol.tl .t-you .dot { background: color-mix(in srgb, var(--primary-color) 14%, transparent); color: var(--primary-color); }
  ol.tl li.now .what strong { font-weight: 600; }
  @media (max-width: 600px) {
    .sheet { top: auto; left: 0; width: 100vw; max-height: 92vh; touch-action: pan-y; will-change: transform; border-radius: 16px 16px 0 0; box-shadow: 0 -10px 40px rgba(0,0,0,.25); }
    .sheet .handle { width: 36px; height: 4px; border-radius: 2px; background: var(--divider-color, #e0e0e0); margin: 8px auto 0; }
    .sheet-top { padding-top: 6px; }
    .sheet-head h2 { font-size: 17px; }
    .sheet-foot { padding-bottom: calc(16px + env(safe-area-inset-bottom)); }
  }

  /* a pass that is still running, and the hint to reload after an update */
  table.htable tr.pending > td { padding: 8px; background: color-mix(in srgb, var(--primary-color) 6%, transparent); }
  .pending-run { flex-wrap: wrap; gap: 8px 10px; font-size: 14px; }
  .pending-run .tchip .tl { display: inline; }
  .content.widgets > .update-hint { grid-column: 1 / -1; }
  .update-hint { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; --mdc-icon-size: 20px; }
  .update-hint .grow { flex: 1 1 220px; }
  @container (max-width: 720px) {
    table.htable tr.pending, table.htable tr.pending > td { display: block; border-radius: 10px; }
  }

  /* the long tables (Recently rated, Sent to AI) keep their own scroll area in every layout: if it were switched
     off (as for the other tables on narrow screens), the rows would spill out of their card */
  .scroll.aiu-scroll, .widget .scroll.aiu-scroll { overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain; }
  @media (max-width: 760px) {
    .scroll.aiu-scroll { max-height: 70vh; }
  }
  @container (max-width: 720px) {
    .scroll.aiu-scroll { overflow-x: hidden; overflow-y: auto; }
  }

  /* selection in "Recently rated" and the re-rating */
  .ratetable .c-sel { width: 28px; padding-right: 0; }
  /* selection boxes in the theme's colours (native ones stay light in dark themes) */
  input.selbox { appearance: none; -webkit-appearance: none; flex: none; width: 18px; height: 18px; min-height: 0; margin: 0; padding: 0; border-radius: 5px; border: 1.5px solid var(--secondary-text-color); background: transparent; display: inline-grid; place-content: center; cursor: pointer; vertical-align: middle; }
  input.selbox:checked { background: var(--primary-color); border-color: var(--primary-color); }
  input.selbox:checked::after { content: ""; width: 9px; height: 5px; border: 2px solid var(--text-primary-color, #fff); border-top: 0; border-right: 0; transform: translateY(-1px) rotate(-45deg); }
  input.selbox:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
  table.dtable tbody tr.picked > td { background: color-mix(in srgb, var(--primary-color) 7%, transparent); }
  .selbar { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px; padding: 8px 12px; margin: 0 0 8px; border-radius: 12px; background: color-mix(in srgb, var(--primary-color) 9%, transparent); font-size: 14px; }
  .selbar .grow { flex: 1; }
  .batch { display: flex; align-items: center; gap: 12px; padding: 10px 12px; margin: 0 0 10px; border-radius: 12px; background: var(--secondary-background-color); --mdc-icon-size: 20px; }
  .batch .bt { flex: 1; min-width: 0; display: grid; gap: 4px; font-size: 14px; }
  .batch .bt .muted { font-size: 13px; }
  .batch .bar { height: 6px; border-radius: 3px; background: color-mix(in srgb, var(--primary-color) 18%, transparent); overflow: hidden; }
  .batch .bar span { display: block; height: 100%; background: var(--primary-color); border-radius: 3px; transition: width .3s; }
  .batch.done > ha-icon { color: var(--frieda-text-ok); }
  .batch.wait > ha-icon { color: var(--frieda-text-warn); }
  .batch.done.err > ha-icon { color: var(--frieda-text-err); }
  .sheet-foot { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .sheet-foot .muted { flex: 1 1 220px; }
  @container (max-width: 720px) {
    .ratetable tbody tr[data-search] { grid-template-columns: 28px 40px minmax(0, 1fr) auto; grid-template-areas: "sel imp subj time" "sel . from from" "sel . cat cat"; }
    .ratetable .c-sel { grid-area: sel; align-self: start; padding-top: 6px; }
    table.dtable tbody tr.picked { background: color-mix(in srgb, var(--primary-color) 7%, transparent); border-radius: 10px; }
    table.dtable tbody tr.picked > td { background: none; }
  }
  @media (prefers-reduced-motion: reduce) { .batch .bar span { transition: none; } }

  /* ---------------------------------------------------------------- activity: a mail program */
  .mcwrap { container-type: inline-size; }
  .mc { display: grid; grid-template-columns: 216px minmax(300px, 390px) minmax(0, 1fr); height: max(540px, calc(100vh - 190px)); background: var(--card-background-color, #fff); border-radius: var(--ha-card-border-radius, 12px); box-shadow: var(--ha-card-box-shadow, none); border: var(--ha-card-border-width, 1px) solid var(--ha-card-border-color, var(--divider-color, #e0e0e0)); overflow: hidden; }
  .rail { display: flex; flex-direction: column; gap: 1px; padding: 12px 8px; overflow: auto; border-right: 1px solid var(--divider-color, #e0e0e0); background: color-mix(in srgb, var(--secondary-background-color) 45%, var(--card-background-color, #fff)); }
  .rail h3 { margin: 14px 10px 4px; font-size: 11.5px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: var(--secondary-text-color); }
  .rail h3:first-child { margin-top: 2px; }
  .rail button.box { display: flex; align-items: center; gap: 10px; width: 100%; padding: 7px 10px; border: 0; border-radius: 8px; background: none; color: var(--primary-text-color); font: inherit; font-size: 14px; text-align: left; min-height: 0; cursor: pointer; --mdc-icon-size: 18px; }
  .rail button.box ha-icon { color: var(--secondary-text-color); flex: none; }
  .rail button.box .lbl { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rail button.box .n { font-size: 12px; color: var(--secondary-text-color); font-variant-numeric: tabular-nums; }
  .rail button.box:hover { background: var(--secondary-background-color); }
  .rail button.box[aria-current="true"] { background: color-mix(in srgb, var(--primary-color) 13%, transparent); font-weight: 500; }
  .rail button.box[aria-current="true"] ha-icon { color: var(--primary-color); }
  .rail .grow { flex: 1; min-height: 16px; }
  .rail .status { display: grid; gap: 1px; padding-top: 8px; border-top: 1px solid var(--divider-color, #e0e0e0); }
  .rail .status button.st { display: flex; align-items: center; gap: 8px; padding: 5px 10px; border: 0; border-radius: 6px; background: none; color: var(--secondary-text-color); font: inherit; font-size: 12.5px; text-align: left; min-height: 0; cursor: pointer; --mdc-icon-size: 15px; }
  .rail .status button.st:hover { background: var(--secondary-background-color); color: var(--primary-text-color); }
  .st.ok ha-icon { color: var(--frieda-text-ok); }
  .st.ai ha-icon { color: var(--frieda-text-ai); }
  .listpane { display: flex; flex-direction: column; min-width: 0; min-height: 0; border-right: 1px solid var(--divider-color, #e0e0e0); }
  .lhead { display: grid; gap: 8px; padding: 14px 14px 10px; border-bottom: 1px solid var(--divider-color, #e0e0e0); }
  .lhead .ttl { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .lhead h2 { margin: 0; font-size: 18px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .lhead .cnt { flex: 1; font-size: 13px; color: var(--secondary-text-color); }
  .lhead .lrow { display: flex; gap: 8px; }
  .lhead label.search { flex: 1 1 120px; min-width: 0; max-width: none; }
  .lhead select.boxsel { display: none; flex: 0 1 auto; min-width: 0; max-width: 55%; }
  .lhead .pickbtn { flex: none; }
  .lhead .narrow-menu { display: none; flex: none; }
  .lhead .batch { margin: 0; }
  .lstatus { display: none; flex-wrap: wrap; gap: 4px 12px; }
  .lstatus button.st { display: inline-flex; align-items: center; gap: 6px; padding: 0; border: 0; background: none; color: var(--secondary-text-color); font: inherit; font-size: 12.5px; min-height: 0; cursor: pointer; --mdc-icon-size: 15px; }
  .errline { display: flex; align-items: flex-start; gap: 8px; font-size: 12.5px; color: var(--secondary-text-color); --mdc-icon-size: 15px; }
  .errline ha-icon { color: var(--frieda-text-err); flex: none; margin-top: 1px; }
  .errline span { flex: 1; min-width: 0; overflow-wrap: anywhere; }
  .errline button { flex: none; padding: 0; border: 0; background: none; color: inherit; font: inherit; text-decoration: underline; min-height: 0; cursor: pointer; }
  .lscroll { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; }
  .lscroll, .rbody, .rail, .as-log, .prop { scrollbar-width: thin; scrollbar-color: color-mix(in srgb, var(--secondary-text-color) 40%, transparent) transparent; }
  ul.mlist { list-style: none; margin: 0; padding: 0 0 6px; }
  .mlist li.day { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; gap: 10px; padding: 10px 16px 4px; background: var(--card-background-color, #fff); }
  button.dayfold { display: inline-flex; align-items: center; gap: 4px; padding: 0; border: 0; background: none; color: var(--secondary-text-color); min-height: 0; font: inherit; font-size: 11.5px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; cursor: pointer; --mdc-icon-size: 16px; }
  button.dayfold[disabled] { cursor: default; opacity: 1; }
  button.dayfold .dn { font-weight: 500; letter-spacing: 0; opacity: .8; }
  button.dayfold .dn::before { content: "· "; }
  .mlist li.m { position: relative; display: grid; grid-template-columns: minmax(0, 1fr); column-gap: 10px; align-items: start; margin: 0 6px; padding: 9px 10px 10px; border-radius: 10px; }
  .listpane.picking li.m { grid-template-columns: 20px minmax(0, 1fr); }
  .mlist li.m + li.m::after { content: ""; position: absolute; left: 10px; right: 10px; top: 0; height: 1px; background: var(--divider-color, #e0e0e0); }
  .mlist li.m:hover::after, .mlist li.m:hover + li.m::after, .mlist li.m.open::after, .mlist li.m.open + li.m::after, .mlist li.m.picked::after, .mlist li.m.picked + li.m::after { opacity: 0; }
  .mlist li.m:hover { background: color-mix(in srgb, var(--secondary-background-color) 55%, transparent); }
  .mlist li.m.picked { background: color-mix(in srgb, var(--primary-color) 9%, transparent); }
  .mlist li.m.open { background: color-mix(in srgb, var(--primary-color) 12%, transparent); }
  .mlist li.m.fresh { animation: frieda-fresh 2.4s ease-out; }
  .mlist li.m:has(.mitem:focus-visible) { outline: 2px solid var(--primary-color); outline-offset: -2px; }
  .mlist li.m.dim .mitem { opacity: .5; cursor: default; }
  button.mitem { display: grid; gap: 2px; min-width: 0; padding: 0; border: 0; background: none; color: inherit; font: inherit; text-align: left; min-height: 0; cursor: pointer; }
  button.mitem::after { content: ""; position: absolute; inset: 0; }  /* the whole row is the button */
  button.mitem:focus-visible { outline: none; }
  .mitem .r1 { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
  .mitem .from { flex: 1; min-width: 0; font-size: 14px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mitem .time { flex: none; font-size: 12px; color: var(--secondary-text-color); font-variant-numeric: tabular-nums; }
  .mitem .ud { flex: none; align-self: center; width: 8px; height: 8px; border-radius: 50%; background: var(--primary-color); }
  .mlist li.unread .from { font-weight: 650; }
  .mlist li.unread .subj { color: var(--primary-text-color); }
  .fl { flex: none; align-self: center; display: inline-flex; color: var(--frieda-text-warn); --mdc-icon-size: 14px; }
  .mv.fl { color: var(--frieda-text-warn); }
  .mitem .subj { font-size: 13.5px; color: var(--secondary-text-color); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mitem .r3 { display: flex; align-items: center; gap: 10px; min-width: 0; margin-top: 2px; }
  .meta, .mv { display: inline-flex; align-items: center; gap: 5px; min-width: 0; font-size: 12.5px; color: var(--secondary-text-color); --mdc-icon-size: 14px; }
  .meta .rl { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .meta ha-icon, .mv ha-icon { flex: none; }
  .mv { flex: none; }
  .mv ha-icon { opacity: .7; }
  .meta.ai ha-icon { color: var(--frieda-text-ai); }
  .meta.rule ha-icon { color: var(--frieda-text-info); }
  .meta.held ha-icon { color: var(--frieda-text-ok); }
  .meta .catsel + .rl { flex: none; overflow: visible; }
  .uns { flex: none; font-size: 12px; color: var(--frieda-text-warn); }
  .macts { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .rtop { flex-wrap: wrap; row-gap: 6px; }
  .macts .mact .lb { display: none; }
  .macts .mact { padding-inline: 8px; }
  .rtop .macts { gap: 4px; }
  .askline { grid-column: 1 / -1; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 10px; padding: 8px 10px; border-radius: 10px; background: var(--secondary-background-color); font-size: 13.5px; --mdc-icon-size: 18px; }
  .askline > span:not(.askbtns) { flex: 1; min-width: 12em; }
  .askline .askbtns { display: flex; gap: 8px; margin-left: auto; }
  .mtextwrap { margin: 10px 0 16px; }
  .mtext .body { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 14px; line-height: 1.55; max-height: 45vh; overflow: auto; padding: 12px 14px; border-radius: 10px; background: var(--secondary-background-color); }
  .mtext .warnline, .mtext .files { display: flex; gap: 6px; align-items: center; --mdc-icon-size: 16px; }
  .mtext .warnline { color: var(--frieda-text-warn); font-size: 13px; }
  .rfoot .keys { display: block; margin-top: 4px; opacity: .8; }
  .check-h { margin: 18px 0 4px; }
  .check-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 4px 0 8px; }
  .check-row .fsel { max-width: 100%; }
  .check-res p { margin: 6px 0; }
  .check-list { list-style: none; margin: 4px 0 0; padding: 0; display: grid; gap: 6px; }
  .check-list li { display: grid; gap: 2px; padding: 6px 10px; border-radius: 8px; background: var(--secondary-background-color); font-size: 13.5px; }
  .check-list li span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .check-list small { color: var(--secondary-text-color); }
  select.catsel { min-height: 0; height: auto; padding: 1px 22px 1px 6px; margin: -2px 0; border-radius: 8px; border: 1px solid var(--divider-color, #e0e0e0); background-color: var(--card-background-color, #fff); color: var(--primary-text-color); font: inherit; font-size: 13px; max-width: 100%; }
  .rr { display: inline-flex; align-items: center; gap: 5px; flex: none; font-size: 12px; color: var(--secondary-text-color); --mdc-icon-size: 14px; }
  .rr.done { color: var(--frieda-text-ok); }
  .rr.work { color: var(--frieda-text-ai); }
  .rr .spinner { width: 12px; height: 12px; border-width: 2px; }
  .lmore { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 14px; font-size: 13px; }
  .lmore .spinner { width: 14px; height: 14px; border-width: 2px; }
  .lempty { padding: 32px 16px; margin: 0; text-align: center; color: var(--secondary-text-color); font-size: 14px; }
  /* picking several mails */
  .pickbar { display: flex; align-items: center; gap: 8px; min-height: 36px; }
  .pickbar .grow { flex: 1; }
  label.pickall { display: inline-flex; align-items: center; gap: 10px; font-size: 14px; cursor: pointer; }
  .pickbar button.link { font-weight: 500; }
  .daypicks { display: flex; flex-wrap: wrap; gap: 6px; }
  .daypicks .seg { background: var(--secondary-background-color); }
  .daypicks .seg.on { background: color-mix(in srgb, var(--primary-color) 16%, transparent); color: var(--primary-text-color); box-shadow: none; }
  .av { position: relative; z-index: 1; width: 36px; height: 36px; border-radius: 50%; display: inline-grid; place-items: center; padding: 0; border: 0; background: var(--secondary-background-color); color: var(--frieda-text-on-fill); font: inherit; font-size: 13px; font-weight: 600; min-height: 0; --mdc-icon-size: 20px; }
  .av.pick, .av.off { width: 20px; height: 20px; margin-top: 1px; --mdc-icon-size: 14px; pointer-events: none; }
  .av.pick { background: transparent; box-shadow: inset 0 0 0 1.5px var(--secondary-text-color); }
  li.m.picked .av.pick { background: var(--primary-color); color: var(--text-primary-color, #fff); box-shadow: none; }
  .av.off { background: none; }
  .actbar { position: sticky; bottom: 0; z-index: 3; display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-top: 1px solid var(--divider-color, #e0e0e0); background: var(--card-background-color, #fff); font-size: 14px; }
  .actbar .grow { flex: 1; }
  .actbar .pill[disabled] { opacity: .45; }
  /* the reading pane (and the content of the sheet) */
  .reader { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
  .rtop { display: flex; align-items: center; gap: 8px; min-height: 52px; box-sizing: border-box; padding: 8px 14px; border-bottom: 1px solid var(--divider-color, #e0e0e0); }
  .rtop .grow { flex: 1; }
  .rbody { flex: 1; min-height: 0; overflow: auto; padding: 22px 26px 12px; overscroll-behavior: contain; }
  .rhead { display: grid; grid-template-columns: 44px minmax(0, 1fr) auto; column-gap: 12px; row-gap: 4px; align-items: center; padding-bottom: 16px; margin-bottom: 18px; border-bottom: 1px solid var(--divider-color, #e0e0e0); }
  .rhead h2 { grid-column: 1 / -1; margin: 0 0 12px; font-size: 21px; font-weight: 600; line-height: 1.3; overflow-wrap: anywhere; }
  .rhead h2:focus { outline: none; }
  .rhead .av { width: 44px; height: 44px; font-size: 15px; }
  .rhead .who { display: grid; min-width: 0; }
  .rhead .who strong { font-size: 14.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rhead .who small { font-size: 13px; color: var(--secondary-text-color); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rhead .date { font-size: 12.5px; color: var(--secondary-text-color); white-space: nowrap; align-self: start; padding-top: 3px; }
  .rhead .chips { grid-column: 2 / -1; display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; margin-top: 8px; }
  .rhead .chips .meta { font-size: 13px; }
  h3.sect { margin: 0 0 12px; font-size: 11.5px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: var(--secondary-text-color); }
  .rfoot { padding: 10px 26px 14px; font-size: 12px; color: var(--secondary-text-color); border-top: 1px solid var(--divider-color, #e0e0e0); }
  .rempty { flex: 1; display: grid; place-content: center; justify-items: center; gap: 10px; padding: 24px; text-align: center; color: var(--secondary-text-color); --mdc-icon-size: 44px; }
  .rempty > ha-icon { opacity: .45; }
  .pickinfo { gap: 12px; max-width: 420px; margin: 0 auto; }
  .pickinfo > ha-icon { --mdc-icon-size: 40px; width: 40px; height: 40px; }
  .pickinfo strong { font-size: 17px; color: var(--primary-text-color); }
  ul.picklist { list-style: none; margin: 4px 0; padding: 0; width: 100%; display: grid; gap: 6px; text-align: left; }
  ul.picklist li { display: grid; padding: 8px 12px; border-radius: 10px; background: var(--secondary-background-color); font-size: 13.5px; color: var(--primary-text-color); }
  ul.picklist li span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  ul.picklist li small { color: var(--secondary-text-color); font-size: 12px; }
  ul.picklist li.muted { background: none; padding: 0 12px; }
  .runsbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  /* where the mail really is */
  .loc { grid-column: 1 / -1; display: grid; grid-template-columns: 20px minmax(0, 1fr) auto; column-gap: 10px; row-gap: 2px; align-items: center; margin-top: 12px; padding: 10px 12px; border-radius: 12px; background: var(--secondary-background-color); font-size: 13.5px; --mdc-icon-size: 18px; }
  .loc .li { display: inline-grid; place-items: center; color: var(--secondary-text-color); }
  .loc .li .spinner { width: 14px; height: 14px; border-width: 2px; }
  .loc.same .li { color: var(--frieda-text-ok); }
  .loc.moved .li { color: var(--frieda-text-info); }
  .loc.gone .li { color: var(--frieda-text-warn); }
  .loc .lt { min-width: 0; overflow-wrap: anywhere; }
  .loc .lt small { display: block; font-size: 12px; color: var(--secondary-text-color); }
  .loc .note { grid-column: 2 / -1; font-size: 12.5px; color: var(--secondary-text-color); }
  .loc button.link { font-size: 12.5px; white-space: nowrap; }
  /* the sheet (phones, and links from elsewhere) shows the same mail view */
  .sheet.mailsheet { grid-template-rows: auto auto minmax(0, 1fr); }
  .mailview { display: grid; grid-template-rows: auto minmax(0, 1fr) auto; min-height: 0; }
  .mailsheet .rtop { min-height: 0; padding: 0 16px 6px; border-bottom: 0; }
  .mailsheet .rtop:not(:has(button)) { display: none; }
  .mailsheet .rbody { padding: 4px 20px 12px; }
  .mailsheet .rhead h2 { font-size: 18px; }
  .mailsheet .rfoot { padding: 10px 20px calc(14px + env(safe-area-inset-bottom, 0px)); }
  /* tablet: the views move into a menu above the list */
  @container (max-width: 1000px) {
    .mc { grid-template-columns: minmax(280px, 340px) minmax(0, 1fr); }
    .rail { display: none; }
    .lhead select.boxsel { display: block; flex: 1 1 0; min-width: 0; max-width: none; font-size: 15px; font-weight: 600; }
    .lhead .ttl { display: none; }  /* the view menu is the title, it shows the count */
    .lhead .narrow-menu { display: inline-flex; align-items: center; }
    .lstatus { display: flex; }
  }
  /* phone: the list; a mail opens in the sheet over it */
  @container (max-width: 720px) {
    .mc { display: block; height: auto; overflow: visible; }
    .listpane { border-right: 0; }
    .reader { display: none; }
    .lscroll { overflow: visible; }
    .lhead .lrow { flex-wrap: wrap; }
    .lhead label.search { order: 3; flex: 1 1 100%; }
  }

  /* ---------------------------------------------------------------- the category assistant */
  .sheet.assist { left: 50%; top: 50%; right: auto; bottom: auto; transform: translate(-50%, -50%); width: min(900px, 94vw); height: min(660px, 90vh); max-height: none; display: grid; grid-template-rows: auto minmax(0, 1fr); border-radius: 20px; box-shadow: 0 24px 70px rgba(0,0,0,.3); overflow: hidden; touch-action: auto; }
  .as-top { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; padding: 14px 14px 12px 20px; border-bottom: 1px solid var(--divider-color, #e0e0e0); --mdc-icon-size: 20px; }
  .as-top h2 { margin: 0; font-size: 17px; font-weight: 600; flex: 1; }
  .as-top > ha-icon { color: var(--frieda-text-ai); }
  .as-views { display: none; width: 100%; order: 3; }
  .as-views .segs { width: 100%; }
  .as-views .seg { flex: 1; justify-content: center; }
  .as-views .seg.pulse::after { content: ""; width: 7px; height: 7px; border-radius: 50%; background: var(--primary-color); }
  .as-body { display: grid; grid-template-columns: minmax(0, 1fr) 340px; min-height: 0; }
  .as-chat { display: grid; grid-template-rows: minmax(0, 1fr) auto; min-height: 0; }
  .as-log { overflow: auto; padding: 18px 20px 8px; display: flex; flex-direction: column; gap: 10px; overscroll-behavior: contain; }
  .msg { max-width: 86%; padding: 10px 14px; border-radius: 16px; font-size: 14px; line-height: 1.45; white-space: pre-line; overflow-wrap: anywhere; }
  .msg.me { align-self: flex-end; background: color-mix(in srgb, var(--primary-color) 16%, transparent); border-bottom-right-radius: 6px; }
  .msg.ai { align-self: flex-start; background: var(--secondary-background-color); border-bottom-left-radius: 6px; }
  .msg.ai .who { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; font-size: 12px; font-weight: 600; color: var(--frieda-text-ai); --mdc-icon-size: 14px; }
  .msg .changes { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }
  .msg .changes span { font-size: 12px; padding: 1px 8px; border-radius: 10px; background: color-mix(in srgb, var(--frieda-ai-color, #8e6bd8) 14%, transparent); color: var(--frieda-text-ai); }
  .typing { align-self: flex-start; display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: var(--secondary-text-color); padding: 4px 6px; }
  .typing .spinner { width: 14px; height: 14px; border-width: 2px; }
  .compose { padding: 8px 16px 12px; border-top: 1px solid var(--divider-color, #e0e0e0); display: grid; gap: 8px; }
  .compose .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .compose .chips button { border: 1px solid var(--divider-color, #e0e0e0); background: none; color: var(--primary-text-color); border-radius: 16px; padding: 5px 12px; font: inherit; font-size: 13px; min-height: 0; cursor: pointer; text-align: left; }
  .compose .chips button:hover { background: var(--secondary-background-color); }
  .compose .row { display: flex; align-items: flex-end; gap: 8px; margin: 0; }
  .compose textarea { flex: 1; min-width: 0; resize: none; box-sizing: border-box; min-height: 42px; max-height: 120px; padding: 10px 12px; border-radius: 14px; border: 1px solid var(--divider-color, #e0e0e0); background: var(--secondary-background-color); color: var(--primary-text-color); font: inherit; font-size: 14px; line-height: 1.4; }
  .compose textarea:focus { outline: 2px solid color-mix(in srgb, var(--primary-color) 55%, transparent); }
  .compose button.send { width: 42px; height: 42px; min-height: 0; border-radius: 50%; padding: 0; display: inline-grid; place-items: center; --mdc-icon-size: 20px; flex: none; }
  .compose .privacy { display: flex; gap: 6px; align-items: flex-start; font-size: 12px; color: var(--secondary-text-color); --mdc-icon-size: 14px; }
  .compose .privacy ha-icon { flex: none; margin-top: 1px; }
  .as-pane { border-left: 1px solid var(--divider-color, #e0e0e0); display: grid; grid-template-rows: minmax(0, 1fr) auto; min-height: 0; background: color-mix(in srgb, var(--secondary-background-color) 40%, var(--card-background-color, #fff)); }
  .as-pane .prop { overflow: auto; padding: 18px 18px 10px; display: grid; gap: 12px; align-content: start; }
  .as-pane .prop h3 { margin: 0; font-size: 11.5px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: var(--secondary-text-color); }
  .as-pane .empty { color: var(--secondary-text-color); font-size: 13.5px; line-height: 1.5; margin: 0; }
  .as-pane .f { display: grid; gap: 4px; }
  .as-pane .f > span { font-size: 12.5px; color: var(--secondary-text-color); }
  .as-pane .f input, .as-pane .f textarea, .as-pane .f select { width: 100%; box-sizing: border-box; border-radius: 10px; border: 1px solid var(--divider-color, #e0e0e0); background: var(--card-background-color, #fff); color: var(--primary-text-color); font: inherit; font-size: 14px; padding: 8px 10px; }
  .as-pane .f textarea { min-height: 96px; resize: vertical; }
  .as-pane .f .count { justify-self: end; font-size: 11.5px; color: var(--secondary-text-color); }
  .as-pane .flash input, .as-pane .flash textarea, .as-pane .flash select, .as-pane label.opt.flash { animation: frieda-assist 1.6s ease-out; }
  @keyframes frieda-assist { 0% { box-shadow: 0 0 0 3px color-mix(in srgb, var(--frieda-ai-color, #8e6bd8) 45%, transparent); } 100% { box-shadow: 0 0 0 3px transparent; } }
  .as-pane label.opt { display: flex; align-items: center; gap: 10px; font-size: 14px; border-radius: 10px; }
  .as-pane .overlap { display: flex; gap: 8px; align-items: flex-start; margin: 0; font-size: 13px; color: var(--secondary-text-color); --mdc-icon-size: 16px; }
  .as-pane .overlap ha-icon { color: var(--frieda-text-info); flex: none; margin-top: 1px; }
  .as-pane .test { border-top: 1px solid var(--divider-color, #e0e0e0); padding-top: 12px; display: grid; gap: 8px; }
  .as-pane .test p { margin: 0; font-size: 12.5px; color: var(--secondary-text-color); }
  .as-pane .test ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .as-pane .test li { display: grid; padding: 7px 10px; border-radius: 10px; background: var(--card-background-color, #fff); font-size: 13px; }
  .as-pane .test li small { color: var(--secondary-text-color); font-size: 12px; }
  .as-pane .acts { display: flex; gap: 8px; justify-content: flex-end; padding: 12px 18px 16px; border-top: 1px solid var(--divider-color, #e0e0e0); }
  @media (max-width: 760px) {
    .sheet.assist { left: 0; right: 0; top: auto; bottom: 0; transform: none; width: 100vw; height: 94vh; border-radius: 18px 18px 0 0; }
    .as-top { padding: 12px 12px 10px 16px; }
    .as-views { display: flex; }
    .as-body { grid-template-columns: minmax(0, 1fr); }
    .as-body[data-view="chat"] .as-pane, .as-body[data-view="card"] .as-chat { display: none; }
    .as-pane { border-left: 0; }
    .msg { max-width: 92%; }
    .compose { padding: 8px 12px 12px; }
    .as-pane .prop { padding: 16px; }
    .as-pane .acts { padding: 10px 16px calc(14px + env(safe-area-inset-bottom, 0px)); }
    .as-pane .acts button { flex: 1; height: 44px; }
  }


  /* ---------------------------------------------------------------- undo instead of asking first */
  .undobar { position: fixed; z-index: 30; left: 50%; bottom: calc(16px + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%); display: flex; align-items: center; gap: 10px; width: max-content; max-width: calc(100vw - 32px); box-sizing: border-box; padding: 6px 6px 6px 14px; border-radius: 14px; background: var(--primary-text-color, #212121); color: var(--card-background-color, #fff); box-shadow: 0 8px 28px rgba(0,0,0,.28); font-size: 14px; --mdc-icon-size: 18px; }
  .undobar[hidden] { display: none; }
  .undobar.show { animation: frieda-undo-in .2s ease-out; }
  .undobar .ut { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .undobar button.link { color: inherit; font-weight: 700; text-decoration: underline; text-underline-offset: 3px; padding: 6px 8px; min-height: 36px; }
  .undobar button.icon { color: inherit; opacity: .8; }
  @keyframes frieda-undo-in { from { opacity: 0; transform: translate(-50%, 10px); } }

  /* ---------------------------------------------------------------- the overview of the keys */
  .modal.keys { width: min(440px, calc(100vw - 32px)); }
  .keylist { display: grid; gap: 6px; margin: 4px 0 16px; }
  .keylist div { display: grid; grid-template-columns: 92px 1fr; align-items: center; gap: 10px; }
  .keylist dt, .keylist dd { margin: 0; }
  .keylist dd { font-size: 14px; }
  kbd { display: inline-block; min-width: 18px; padding: 2px 7px; border: 1px solid var(--divider-color, #d0d0d0); border-bottom-width: 2px; border-radius: 6px; font: 600 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; text-align: center; background: var(--secondary-background-color, #f5f5f5); color: var(--primary-text-color); }

  /* ---------------------------------------------------------------- swiping a mail on touch screens */
  .mlist li.m .mitem { touch-action: pan-y; }
  .mlist li.m.swiping { overflow: hidden; }
  .mlist li.m.swiping .mitem { position: relative; z-index: 1; background: var(--card-background-color, #fff); border-radius: 8px; }
  .mlist li.m:not(.swiping) .mitem { transition: transform .18s ease-out; }
  .swbg { position: absolute; inset: 0; display: none; align-items: center; gap: 8px; padding: 0 18px; border-radius: 10px; font-size: 14px; font-weight: 500; --mdc-icon-size: 20px; }
  .swbg.l { justify-content: flex-start; background: color-mix(in srgb, var(--primary-color) 16%, transparent); color: var(--primary-color); }
  .swbg.r { justify-content: flex-end; background: color-mix(in srgb, var(--success-color, #43a047) 18%, transparent); color: var(--frieda-text-ok); }
  .mlist li.m.sw-r .swbg.l, .mlist li.m.sw-l .swbg.r { display: flex; }
  .mlist li.m.sw-go .swbg { font-weight: 700; }
  .mlist li.m.sw-go.sw-r .swbg.l { background: color-mix(in srgb, var(--primary-color) 28%, transparent); }
  .mlist li.m.sw-go.sw-l .swbg.r { background: color-mix(in srgb, var(--success-color, #43a047) 30%, transparent); }

  /* ---------------------------------------------------------------- parcels: steps and today's window */
  .pstep { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; margin-top: 6px; max-width: 360px; }
  .pstep .ps { display: grid; gap: 3px; }
  .pstep .ps i { display: block; height: 4px; border-radius: 2px; background: var(--divider-color, #e0e0e0); }
  .pstep .ps.done i, .pstep .ps.now i { background: var(--primary-color); }
  .pstep .ps.now:not(.done) i { background: linear-gradient(90deg, var(--primary-color) 55%, var(--divider-color, #e0e0e0) 55%); }
  .pstep.warn .ps.now i { background: var(--warning-color, #ffa600); }
  .pstep .ps small { font-size: 11px; color: var(--secondary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pstep .ps.now small { color: var(--primary-text-color); font-weight: 600; }
  .pwin { position: relative; display: block; height: 22px; max-width: 360px; margin-top: 4px; }
  .pwin::before { content: ""; position: absolute; left: 0; right: 0; top: 4px; height: 6px; border-radius: 3px; background: var(--secondary-background-color, #f0f0f0); }
  .pwin .pw { position: absolute; top: 4px; height: 6px; border-radius: 3px; background: color-mix(in srgb, var(--primary-color) 55%, transparent); }
  .pwin .pn { position: absolute; top: 1px; width: 2px; height: 12px; margin-left: -1px; border-radius: 1px; background: var(--primary-text-color); }
  .pwin small { position: absolute; top: 11px; font-size: 10px; color: var(--secondary-text-color); }
  .pwin .p0 { left: 0; }
  .pwin .p1 { right: 0; }

  /* ---------------------------------------------------------------- the week: trend lines */
  .fy-tile { position: relative; }
  .spark { position: absolute; top: 10px; right: 10px; width: 64px; height: 18px; overflow: visible; }
  .spark polyline { fill: none; stroke: var(--primary-color); stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; opacity: .75; }
  .spark circle { fill: var(--primary-color); }

  /* ---------------------------------------------------------------- the AI's confidence */
  .conf { display: inline-flex; align-items: center; gap: 6px; flex: none; font-size: 12px; color: var(--secondary-text-color); }
  .conf .cbar { display: inline-flex; gap: 2px; }
  .conf .cbar i { display: block; width: 10px; height: 4px; border-radius: 2px; background: var(--divider-color, #e0e0e0); }
  .conf .cbar i.on { background: var(--success-color, #43a047); }
  .conf.c-medium .cbar i.on { background: var(--primary-color); }
  .conf.c-low .cbar i.on { background: var(--warning-color, #ffa600); }
  .conf.c-low { color: var(--frieda-text-warn); }

  /* ---------------------------------------------------------------- a short glide where something new comes in */
  .enter { animation: frieda-enter .18s ease-out; }
  @keyframes frieda-enter { from { opacity: 0; transform: translateY(6px); } }
  @media (prefers-reduced-motion: reduce) { .enter, .undobar.show { animation: none; } .mlist li.m .mitem { transition: none !important; } }

  /* ---------------------------------------------------------------- A: the conversation as a thread of messages */
  ul.thread.chat { gap: 8px; }
  ul.thread.chat li { display: flex; }
  ul.thread.chat li.mine { justify-content: flex-end; }
  ul.thread.chat .threadrow { max-width: 82%; border-radius: 14px 14px 14px 4px; background: var(--card-background-color, #fff); }
  ul.thread.chat li.mine .threadrow { border-radius: 14px 14px 4px 14px; background: color-mix(in srgb, var(--primary-color) 10%, var(--card-background-color, #fff)); border-color: color-mix(in srgb, var(--primary-color) 30%, transparent); }
  ul.thread.chat .threadrow.here { box-shadow: 0 0 0 2px var(--primary-color); border-color: transparent; }
  /* the quoted history and the signature fold away */
  details.fold { margin-top: 10px; }
  details.fold > summary { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; list-style: none; font-size: 13px; color: var(--secondary-text-color); padding: 4px 10px 4px 8px; border-radius: 12px; background: var(--secondary-background-color, #f0f0f0); --mdc-icon-size: 16px; }
  details.fold > summary::-webkit-details-marker { display: none; }
  details.fold[open] > summary { margin-bottom: 8px; }
  details.fold .body.quoted { border-left: 3px solid var(--divider-color, #e0e0e0); padding-left: 12px; color: var(--secondary-text-color); }
  /* links name their real destination */
  .lchip { display: inline-flex; align-items: center; gap: 4px; max-width: 100%; vertical-align: baseline; padding: 1px 8px 1px 6px; margin: 1px 0; border-radius: 10px; font-size: .92em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-decoration: none; color: var(--primary-color); background: color-mix(in srgb, var(--primary-color) 9%, transparent); --mdc-icon-size: 14px; }
  .lchip span { color: var(--secondary-text-color); overflow: hidden; text-overflow: ellipsis; }
  .lchip:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 1px; }
  /* category colours */
  .cdot { display: inline-block; flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--cat, var(--secondary-text-color)); margin: 0 2px; vertical-align: middle; }
  .cdot.big { width: 10px; height: 10px; margin: 0 2px 0 0; }

  /* ---------------------------------------------------------------- B: the command palette */
  .palette-host .modal-backdrop { z-index: 40; }
  .modal.palette { z-index: 41; top: 12vh; transform: translateX(-50%); width: min(560px, calc(100vw - 24px)); padding: 0; overflow: hidden; display: grid; }
  .palin { display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-bottom: 1px solid var(--divider-color, #e0e0e0); --mdc-icon-size: 20px; color: var(--secondary-text-color); }
  .palin input { flex: 1; min-width: 0; border: 0; outline: 0; background: none; font: inherit; font-size: 16px; color: var(--primary-text-color); padding: 4px 0; }
  #pal-list { list-style: none; margin: 0; padding: 6px; max-height: min(52vh, 420px); overflow: auto; }
  #pal-list .palgroup { padding: 8px 10px 4px; font-size: 11px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: var(--secondary-text-color); }
  #pal-list [role="option"] { display: flex; align-items: center; gap: 10px; padding: 9px 10px; border-radius: 8px; cursor: pointer; --mdc-icon-size: 18px; }
  #pal-list [role="option"] ha-icon { color: var(--secondary-text-color); }
  #pal-list [role="option"] .pl { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #pal-list [role="option"] small { color: var(--secondary-text-color); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 40%; }
  #pal-list [role="option"][aria-selected="true"] { background: color-mix(in srgb, var(--primary-color) 12%, transparent); }
  #pal-list .palnone { padding: 14px 10px; color: var(--secondary-text-color); }
  .palfoot { margin: 0; padding: 8px 16px; border-top: 1px solid var(--divider-color, #e0e0e0); font-size: 12px; color: var(--secondary-text-color); }

  /* ---------------------------------------------------------------- B: the rule editor's sentence and preview, dragging rules */
  .rsentence { margin: 2px 0 12px; padding: 10px 12px; border-radius: 10px; background: var(--secondary-background-color, #f0f0f0); font-size: 14px; line-height: 1.45; }
  .rpreview:empty { display: none; }
  .rpreview { margin: 8px 0 14px; padding: 10px 12px; border: 1px dashed var(--divider-color, #d0d0d0); border-radius: 10px; }
  .rpreview h4 { display: flex; align-items: center; gap: 6px; margin: 0 0 4px; font-size: 13px; font-weight: 600; --mdc-icon-size: 16px; }
  .rpreview p { margin: 2px 0; font-size: 13px; }
  .rpreview ul { list-style: none; margin: 6px 0 2px; padding: 0; display: grid; gap: 4px; }
  .rpreview li { display: grid; grid-template-columns: minmax(0, 11em) minmax(0, 1fr) auto; gap: 8px; align-items: baseline; font-size: 13px; }
  .rpreview li strong, .rpreview li span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rpreview li small { color: var(--secondary-text-color); }
  .rpreview .note { display: flex; gap: 6px; align-items: flex-start; --mdc-icon-size: 15px; }
  tr.rrow[draggable] { cursor: grab; }
  tr.rrow .grip { display: inline-flex; vertical-align: middle; margin-right: 2px; color: var(--secondary-text-color); opacity: .55; --mdc-icon-size: 16px; }
  tr.rrow.dragging { opacity: .45; }
  tr.rrow.drop-before td { box-shadow: inset 0 2px 0 var(--primary-color); }
  tr.rrow.drop-after td { box-shadow: inset 0 -2px 0 var(--primary-color); }

  /* ---------------------------------------------------------------- D: the AI's overview */
  .aistats { margin: 2px 0 14px; }
  .aistats-row { display: flex; flex-wrap: wrap; gap: 18px 28px; align-items: flex-start; }
  .aicats { display: flex; gap: 14px; align-items: center; min-width: 0; }
  .aidonut { width: 92px; height: 92px; flex: none; }
  .aidonut text { font-size: 8px; font-weight: 600; fill: var(--primary-text-color); }
  .legend { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; font-size: 13px; }
  .legend li { display: flex; align-items: center; gap: 6px; min-width: 0; }
  .legend .nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .legend .n { font-weight: 600; }
  .legend .wrong { font-size: 12px; color: var(--frieda-text-warn); }
  .aiweeks h4 { margin: 0 0 6px; font-size: 12px; font-weight: 500; color: var(--secondary-text-color); }
  .bars { display: flex; align-items: flex-end; gap: 6px; height: 74px; }
  .bars .bar { display: grid; grid-template-rows: 1fr auto; gap: 3px; width: 22px; height: 100%; text-align: center; }
  .bars .bar i { align-self: end; display: block; border-radius: 4px 4px 2px 2px; background: color-mix(in srgb, var(--primary-color) 45%, transparent); }
  .bars .bar.now i { background: var(--primary-color); }
  .bars .bar small { font-size: 10px; color: var(--secondary-text-color); }

  /* ---------------------------------------------------------------- C: phones */
  .ptr { display: flex; align-items: flex-end; justify-content: center; gap: 6px; overflow: hidden; font-size: 13px; color: var(--secondary-text-color); --mdc-icon-size: 16px; }
  .ptr .spinner { width: 14px; height: 14px; }
  @media (max-width: 600px) {
    /* the tabs at the bottom, within reach of the thumb */
    .tabsbar { position: fixed; z-index: 15; left: 0; right: 0; bottom: 0; justify-content: space-around; gap: 0; padding: 4px 4px calc(4px + env(safe-area-inset-bottom, 0px)); background: var(--card-background-color, #fff); color: var(--primary-text-color); border-top: 1px solid var(--divider-color, #e0e0e0); border-bottom: 0; box-shadow: 0 -4px 16px rgba(0,0,0,.06); }
    .tabsbar button[role="tab"] { flex: 1 1 0; min-width: 0; flex-direction: column; gap: 2px; padding: 6px 2px; min-height: 52px; border-bottom: 0; border-radius: 12px; font-size: 11px; opacity: .7; --mdc-icon-size: 22px; }
    .tabsbar button[role="tab"] .tl { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .tabsbar button[role="tab"][aria-selected="true"] { color: var(--primary-color); opacity: 1; background: color-mix(in srgb, var(--primary-color) 10%, transparent); }
    .tabsbar .tbadge { position: absolute; top: 4px; right: calc(50% - 22px); }
    .content.widgets { padding-bottom: calc(76px + env(safe-area-inset-bottom, 0px)); }
    .undobar { bottom: calc(76px + env(safe-area-inset-bottom, 0px)); }
    /* the open mail fills the screen; back with the gesture, a swipe from the left edge or down */
    .sheet.mailsheet { top: 0; max-height: none; height: 100%; border-radius: 0; z-index: 25; }
    .sheet-backdrop { z-index: 24; }
    .modal.palette { top: 8px; }
    .rpreview li { grid-template-columns: minmax(0, 1fr) auto; }
    .rpreview li span { grid-column: 1 / -1; grid-row: 2; }
  }
  @media (pointer: coarse) {
    /* fingers need room */
    button.icon, .seg, .pill, button.secondary.small, button.link.small, .lchip { min-height: 40px; }
    .mlist li.m { padding-top: 12px; padding-bottom: 12px; }
    #pal-list [role="option"] { padding: 12px 10px; }
  }
`;
