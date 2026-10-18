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
    input[type=checkbox]:not(.switch) { width: 22px; height: 22px; }
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
    .sheet { top: auto; left: 0; width: 100vw; max-height: 92vh; border-radius: 16px 16px 0 0; box-shadow: 0 -10px 40px rgba(0,0,0,.25); }
    .sheet .handle { width: 36px; height: 4px; border-radius: 2px; background: var(--divider-color, #e0e0e0); margin: 8px auto 0; }
    .sheet-top { padding-top: 6px; }
    .sheet-head h2 { font-size: 17px; }
    .sheet-foot { padding-bottom: calc(16px + env(safe-area-inset-bottom)); }
  }

`;
