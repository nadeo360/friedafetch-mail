/* Panel styles (Home Assistant theme variables, mobile layout). Loaded by panel.js. */

export const STYLE = `
  :host { display: block; height: 100%; color: var(--primary-text-color); background: var(--primary-background-color); }
  .toolbar { display: flex; align-items: center; gap: 12px; height: 56px; padding: 0 16px; background: var(--app-header-background-color, var(--primary-color)); color: var(--app-header-text-color, #fff); font-size: 20px; }
  .toolbar .grow { flex: 1; }
  .toolbar select { background: rgba(255,255,255,.15); color: inherit; border: 1px solid rgba(255,255,255,.4); border-radius: 6px; padding: 4px 8px; font-size: 14px; }
  .content { padding: 16px; max-width: 1100px; margin: 0 auto; display: grid; gap: 16px; }
  .card { background: var(--card-background-color, #fff); border-radius: var(--ha-card-border-radius, 12px); box-shadow: var(--ha-card-box-shadow, 0 2px 2px rgba(0,0,0,.14)); border: var(--ha-card-border-width, 1px) solid var(--ha-card-border-color, var(--divider-color, #e0e0e0)); padding: 16px; }
  .card h2 { margin: 0 0 12px; font-size: 18px; font-weight: 500; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  .card h2 .grow { flex: 1; }
  button { font: inherit; border: none; border-radius: 6px; padding: 8px 14px; cursor: pointer; background: var(--primary-color); color: var(--text-primary-color, #fff); }
  button.secondary { background: transparent; color: var(--primary-color); border: 1px solid var(--primary-color); }
  button.danger { background: var(--error-color, #db4437); }
  button.icon { background: transparent; color: var(--secondary-text-color); padding: 4px 8px; font-size: 16px; }
  .modal-backdrop { position: fixed; inset: 0; z-index: 20; background: rgba(0,0,0,.45); }
  .modal { position: fixed; z-index: 21; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(420px, calc(100vw - 32px)); box-sizing: border-box; padding: 20px; background: var(--card-background-color, #fff); color: var(--primary-text-color); border-radius: var(--ha-dialog-border-radius, 16px); box-shadow: 0 12px 40px rgba(0,0,0,.3); }
  .modal-head { display: flex; align-items: center; gap: 12px; }
  .modal-head h3 { margin: 0; font-size: 18px; font-weight: 500; line-height: 1.3; text-transform: none; letter-spacing: normal; color: var(--primary-text-color); }
  .modal-icon { flex: none; display: inline-grid; place-items: center; width: 40px; height: 40px; border-radius: 50%; background: color-mix(in srgb, var(--error-color, #db4437) 14%, transparent); color: var(--error-color, #db4437); --mdc-icon-size: 22px; }
  .modal p { margin: 14px 0 0; font-size: 14px; line-height: 1.45; }
  .modal .modal-warn { margin-top: 8px; color: var(--error-color, #db4437); font-size: 13px; font-weight: 500; }
  .modal-actions { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 8px; margin-top: 20px; }
  .modal-actions button { font-size: 14px; padding: 8px 18px; border-radius: 18px; }
  .modal button:focus-visible, .modal button:focus { outline: 2px solid var(--primary-color); outline-offset: 2px; }
  ha-icon { --mdc-icon-size: 18px; display: inline-flex; flex: none; }
  button.ib { display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px 6px 10px; font-size: 14px; }
  button.icon { display: inline-grid; place-items: center; }
  button.secondary.danger { background: transparent; color: var(--error-color, #db4437); border-color: color-mix(in srgb, var(--error-color, #db4437) 60%, transparent); }
  /* data tables (rules, AI log): one line per item, details on click, row menu */
  .vh { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  tr[hidden] { display: none !important; }
  .tbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin: 4px 0 8px; }
  .tbar .segs { margin-top: 0; }
  label.search { display: inline-flex; align-items: center; gap: 6px; flex: 1 1 220px; max-width: 360px; height: 36px; box-sizing: border-box; padding: 0 10px; border-radius: 10px; background: var(--secondary-background-color, #f0f0f0); color: var(--secondary-text-color); }
  label.search input { flex: 1; min-width: 0; border: none; background: transparent; color: var(--primary-text-color); font: inherit; font-size: 14px; outline: none; padding: 0; }
  label.search:focus-within { box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary-color) 45%, transparent); }
  table.dtable { font-size: 14px; }
  table.dtable thead th { position: sticky; top: 0; z-index: 1; background: var(--card-background-color, #fff); font-size: 12px; font-weight: 500; letter-spacing: .02em; color: var(--secondary-text-color); white-space: nowrap; padding: 6px 8px; }
  table.dtable td { padding: 7px 8px; vertical-align: middle; }
  table.dtable tbody tr.rrow:hover > td, table.dtable tbody tr.arow:hover > td { background: color-mix(in srgb, var(--primary-text-color) 3%, transparent); }
  table.dtable tr.open > td { border-bottom-color: transparent; background: color-mix(in srgb, var(--primary-color) 5%, transparent); }
  table.dtable tr.rdetail > td, table.dtable tr.adetail > td { background: color-mix(in srgb, var(--primary-color) 5%, transparent); padding: 2px 12px 12px 12px; }
  table.dtable .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  th button.sort { display: inline-flex; align-items: center; gap: 3px; background: none; color: inherit; font: inherit; padding: 0; min-height: 0; }
  th button.sort ha-icon { --mdc-icon-size: 14px; opacity: .45; }
  th button.sort.on { color: var(--primary-text-color); }
  th button.sort.on ha-icon { opacity: 1; }
  th.num button.sort { flex-direction: row-reverse; }
  button.rname { display: flex; align-items: center; gap: 6px; width: 100%; background: none; color: inherit; padding: 0; text-align: left; font: inherit; min-height: 0; }
  button.rname > ha-icon { --mdc-icon-size: 18px; color: var(--secondary-text-color); transition: transform .15s; }
  tr.open button.rname > ha-icon { transform: rotate(90deg); }
  .nm { display: grid; min-width: 0; }
  .nm strong { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .nm small { font-size: 12px; color: var(--secondary-text-color); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rtable .c-pos { width: 28px; color: var(--secondary-text-color); font-size: 12px; }
  .rtable .c-on { width: 40px; }
  .rtable .c-name { min-width: 180px; max-width: 320px; }
  .rtable .c-cond { cursor: pointer; color: var(--secondary-text-color); font-size: 13px; max-width: 320px; }
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
  .rule-new { margin-bottom: 10px; border: 1px solid color-mix(in srgb, var(--primary-color) 45%, var(--divider-color, #e0e0e0)); border-radius: 12px; }
  input.switch { appearance: none; -webkit-appearance: none; width: 32px; height: 18px; border-radius: 9px; background: color-mix(in srgb, var(--secondary-text-color) 35%, transparent); position: relative; cursor: pointer; margin: 0; transition: background .15s; vertical-align: middle; }
  input.switch::after { content: ""; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.25); transition: transform .15s; }
  input.switch:checked { background: var(--primary-color); }
  input.switch:checked::after { transform: translateX(14px); }
  input.switch:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
  details.rowmenu { display: inline-block; }
  details.menu.rowmenu > summary { list-style: none; cursor: pointer; display: inline-grid; place-items: center; width: 32px; height: 32px; padding: 0; border-radius: 50%; background: transparent; color: var(--secondary-text-color); --mdc-icon-size: 20px; }
  .scroll.menus { overflow: visible; }
  details.rowmenu > summary::-webkit-details-marker { display: none; }
  details.menu.rowmenu > summary:hover, details.menu.rowmenu[open] > summary { filter: none;  background: var(--secondary-background-color, #f0f0f0); }
  details.rowmenu .menu-list { min-width: 220px; text-align: left; }
  details.menu .menu-list hr { border: none; border-top: 1px solid var(--divider-color, #e0e0e0); margin: 4px 2px; }
  details.menu .menu-list button.danger-item, details.menu .menu-list button.danger-item ha-icon { color: var(--error-color, #db4437); }
  .atable .c-st { width: 40px; }
  .atable .c-st .aiu-st { width: 30px; height: 30px; --mdc-icon-size: 16px; }
  .atable .c-time { width: 70px; color: var(--secondary-text-color); font-size: 13px; text-align: left; }
  .atable .c-subj { min-width: 220px; max-width: 420px; }
  .atable .c-kind, .atable .c-ent { font-size: 12px; color: var(--secondary-text-color); white-space: nowrap; }
  .atable .fields { display: inline-flex; gap: 3px; }
  .atable .fi { display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 6px; background: var(--secondary-background-color, #f0f0f0); --mdc-icon-size: 14px; }
  .atable .fi.hot, .chip.hot { background: color-mix(in srgb, var(--warning-color, #ffa600) 18%, transparent); }
  .atable tr.held .aiu-st { background: color-mix(in srgb, var(--success-color, #43a047) 16%, transparent); color: var(--success-color, #43a047); }
  .atable tr.err .aiu-st { background: color-mix(in srgb, var(--error-color, #db4437) 14%, transparent); color: var(--error-color, #db4437); }
  .aiu-scroll { max-height: 560px; overflow-y: auto; }
  button:disabled { opacity: .5; cursor: default; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th, td { text-align: left; padding: 8px 6px; border-bottom: 1px solid var(--divider-color, #e0e0e0); vertical-align: top; }
  th { color: var(--secondary-text-color); font-weight: 500; }
  tr.disabled td { opacity: .5; }
  .muted { color: var(--secondary-text-color); font-size: 13px; }
  .chip { display: inline-block; padding: 2px 8px; border-radius: 10px; background: var(--secondary-background-color, #f0f0f0); font-size: 12px; margin: 2px 4px 2px 0; }
  .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 10px; }
  .row label { min-width: 170px; color: var(--secondary-text-color); font-size: 14px; }
  input[type=text], select { font: inherit; padding: 7px 10px; border: 1px solid var(--divider-color, #ccc); border-radius: 6px; background: var(--card-background-color, #fff); color: var(--primary-text-color); min-width: 160px; }
  input[type=text].grow { flex: 1; min-width: 200px; }
  .cond { display: grid; grid-template-columns: 150px 150px 1fr 40px; gap: 8px; margin-bottom: 8px; align-items: center; }
  .error { background: color-mix(in srgb, var(--error-color, #db4437) 12%, transparent); color: var(--error-color, #db4437); padding: 10px 12px; border-radius: 8px; }
  .ok { background: color-mix(in srgb, var(--success-color, #43a047) 12%, transparent); padding: 10px 12px; border-radius: 8px; }
  .actionsbar { display: flex; gap: 8px; flex-wrap: wrap; }
  .tabs { display: flex; gap: 10px; flex-wrap: wrap; }
  .tab { flex: 1 1 240px; text-align: left; background: var(--card-background-color, #fff); color: var(--primary-text-color); border: 2px solid var(--divider-color, #e0e0e0); border-radius: var(--ha-card-border-radius, 12px); padding: 12px 14px; display: grid; gap: 4px; }
  .tab.active { border-color: var(--primary-color); box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary-color) 18%, transparent); }
  .tab .label { font-weight: 600; font-size: 15px; display: flex; align-items: center; gap: 8px; }
  .tab .label .dot { width: 10px; height: 10px; border-radius: 50%; background: var(--success-color, #43a047); display: inline-block; }
  .tab .label .dot.off { background: var(--secondary-text-color); }
  .tab .meta { color: var(--secondary-text-color); font-size: 12.5px; }
  .tab .badges { display: flex; gap: 6px; flex-wrap: wrap; }
  .badge { font-size: 11px; padding: 1px 7px; border-radius: 8px; background: var(--secondary-background-color, #eee); color: var(--secondary-text-color); }
  .badge.warn { background: color-mix(in srgb, var(--warning-color, #ffa600) 20%, transparent); color: var(--primary-text-color); }
  select.copy { min-width: 0; max-width: 120px; padding: 3px 6px; font-size: 12px; }
  .scroll { overflow-x: auto; }
  code { font-size: 12px; background: var(--secondary-background-color, #f0f0f0); padding: 1px 5px; border-radius: 4px; }
  .info { background: color-mix(in srgb, var(--primary-color) 10%, transparent); padding: 10px 12px; border-radius: 8px; font-size: 13px; }
  .toolbar img { width: 28px; height: 28px; border-radius: 7px; }
  table.stack { width: 100%; }
  .editor { padding: 12px 14px; scroll-margin-top: 16px; }
  button.round { width: 36px; height: 36px; padding: 0; border-radius: 50%; font-size: 22px; line-height: 1; display: inline-grid; place-items: center; flex: none; }
  button.round.small { width: 28px; height: 28px; font-size: 18px; }
  h3.with-add { display: flex; align-items: center; gap: 10px; }
  .mode { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; border-radius: 10px; background: var(--secondary-background-color, #f5f5f5); margin-bottom: 12px; }
  .mode.warn { background: color-mix(in srgb, var(--warning-color, #ffa600) 14%, transparent); }
  .mode .ic { font-size: 18px; line-height: 1.2; }
  .mode .tx { display: grid; gap: 2px; flex: 1; min-width: 0; }
  .mode .tx strong { font-weight: 600; }
  .mode .tx .muted { font-size: 12.5px; }
  .subbar { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin: -4px 0 10px; }
  .subbar .grow { flex: 1; }
  details.menu { position: relative; }
  details.menu > summary { list-style: none; cursor: pointer; user-select: none; display: inline-flex; align-items: center; gap: 6px; box-sizing: border-box; height: 36px; padding: 0 16px 0 12px; border-radius: 18px; background: var(--primary-color); color: var(--text-primary-color, #fff); font-size: 14px; font-weight: 500; }
  details.menu > summary::-webkit-details-marker { display: none; }
  details.menu > summary ha-icon { --mdc-icon-size: 18px; }
  details.menu > summary:hover, details.menu[open] > summary { filter: brightness(.92); }
  details.menu > summary:focus-visible, button.round:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
  details.menu .menu-list { position: absolute; right: 0; top: calc(100% + 4px); z-index: 5; min-width: 270px; background: var(--card-background-color, #fff); border: 1px solid var(--divider-color, #e0e0e0); border-radius: 10px; box-shadow: 0 6px 20px rgba(0,0,0,.18); padding: 6px; display: grid; gap: 2px; }
  details.menu .menu-list button { background: none; color: var(--primary-text-color); text-align: left; display: grid; grid-template-columns: 20px minmax(0, 1fr); column-gap: 12px; align-items: start; padding: 9px 10px; border-radius: 8px; font-size: 14px; font-weight: 400; line-height: 1.35; min-height: 0; }
  details.menu .menu-list button ha-icon { --mdc-icon-size: 20px; color: var(--secondary-text-color); margin-top: 1px; }
  details.menu .menu-list .mi { display: grid; gap: 2px; }
  details.menu .menu-list .mi > span { font-weight: 500; }
  details.menu .menu-list button:hover:not(:disabled) { background: var(--secondary-background-color, #f0f0f0); }
  details.menu .menu-list button small { color: var(--secondary-text-color); font-size: 12px; }
  .ai-cats { display: grid; gap: 6px; }
  .ai-cat { border: 1px solid var(--divider-color, #e0e0e0); border-radius: 10px; padding: 8px 10px; display: flex; gap: 10px; align-items: center; }
  .ai-cat .tx { flex: 1; min-width: 0; display: grid; gap: 2px; }
  .ai-cat .tx .muted { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ai-edit { border: 1px solid color-mix(in srgb, var(--primary-color) 45%, var(--divider-color, #e0e0e0)); border-radius: 10px; padding: 12px; }
  .ai-rates { display: grid; }
  .ai-rate { display: grid; grid-template-columns: 44px minmax(0, 1fr) auto; gap: 2px 10px; padding: 9px 2px; border-bottom: 1px solid var(--divider-color, #e0e0e0); align-items: start; }
  .ai-rate .imp { grid-row: span 3; width: 38px; height: 38px; border-radius: 50%; display: grid; place-items: center; font-weight: 600; font-size: 15px; background: var(--secondary-background-color, #eee); color: var(--secondary-text-color); }
  .ai-rate .imp.i5 { background: color-mix(in srgb, var(--error-color, #db4437) 18%, transparent); color: var(--error-color, #db4437); }
  .ai-rate .imp.i4 { background: color-mix(in srgb, var(--warning-color, #ffa600) 22%, transparent); color: var(--primary-text-color); }
  .ai-rate .imp.i3 { background: color-mix(in srgb, var(--primary-color) 14%, transparent); color: var(--primary-color); }
  .ai-rate .subj { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ai-rate .meta { font-size: 12.5px; color: var(--secondary-text-color); }
  .ai-rate .side { grid-row: span 3; display: grid; gap: 4px; justify-items: end; }
  .ai-rate select { min-width: 0; max-width: 180px; padding: 3px 6px; font-size: 12.5px; }
  .ai-rate .why { font-size: 12.5px; }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; }
  .stat { background: var(--secondary-background-color, #f5f5f5); border-radius: 10px; padding: 10px 12px; }
  .stat .k { font-size: 12px; color: var(--secondary-text-color); }
  .stat .v { font-size: 24px; font-weight: 500; line-height: 1.25; }
  .stat .v small { font-size: 12px; font-weight: 400; }
  .stat .s { font-size: 12px; color: var(--secondary-text-color); }
  .stat .facts { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 4px; font-size: 12px; color: var(--secondary-text-color); }
  .fact { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
  .fact ha-icon { --mdc-icon-size: 15px; opacity: .85; }
  .fact.hot, .fi.hot { color: var(--warning-color, #ffa600); }
  .fact.err { color: var(--error-color, #db4437); }
  .chip.ic { display: inline-flex; align-items: center; gap: 4px; }
  .chip.ic ha-icon { --mdc-icon-size: 14px; }
  .chip.held { background: color-mix(in srgb, var(--success-color, #43a047) 14%, transparent); white-space: nowrap; }
  .segs { display: inline-flex; flex-wrap: wrap; gap: 4px; margin-top: 14px; padding: 3px; border-radius: 10px; background: var(--secondary-background-color, #f0f0f0); }
  button.seg { display: inline-flex; align-items: center; gap: 6px; background: transparent; color: var(--secondary-text-color); padding: 5px 12px; border-radius: 8px; font-size: 13px; min-height: 0; }
  button.seg ha-icon { --mdc-icon-size: 16px; }
  button.seg .n { font-size: 11px; padding: 0 6px; border-radius: 8px; background: color-mix(in srgb, var(--secondary-text-color) 14%, transparent); }
  button.seg.on { background: var(--card-background-color, #fff); color: var(--primary-text-color); box-shadow: 0 1px 3px rgba(0,0,0,.12); }
  .aiu-st { display: inline-grid; place-items: center; width: 34px; height: 34px; border-radius: 50%; --mdc-icon-size: 18px; background: color-mix(in srgb, var(--primary-color) 14%, transparent); color: var(--primary-color); }
  .aiu-error { display: flex; gap: 4px; align-items: center; font-size: 12px; color: var(--error-color, #db4437); overflow-wrap: anywhere; }
  .pill { display: inline-flex; align-items: center; gap: 6px; height: 36px; padding: 0 16px 0 12px; border-radius: 18px; font-size: 14px; font-weight: 500; }
  .empty { text-align: center; padding: 18px 8px; display: grid; gap: 10px; justify-items: center; }
  .editor h3.title { margin: 0 0 12px; font-size: 16px; font-weight: 500; }
  .fbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 6px; }
  .fbar .grow { flex: 1; }
  button.link { background: none; color: var(--primary-color); padding: 2px 4px; min-height: 0; }
  button.ftoggle { display: none; }
  thead tr.filters th { padding: 4px 6px 8px; font-weight: 400; }
  thead tr.filters input, thead tr.filters select { width: 100%; min-width: 0; box-sizing: border-box; padding: 4px 6px; font-size: 12.5px; }
  thead tr.filters .active { border-color: var(--primary-color); box-shadow: 0 0 0 1px var(--primary-color); }
  tr.fhide { display: none !important; }
  @media (max-width: 760px) {
    .toolbar { height: 52px; padding: 0 10px; font-size: 18px; }
    .content { padding: 10px; gap: 10px; }
    .card { padding: 12px; }
    .card h2 { font-size: 17px; }
    .card h2 button { flex: 1 1 auto; }
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
    .card h2 button.round { flex: none; }
    details.menu .menu-list { right: 0; left: auto; min-width: min(280px, calc(100vw - 48px)); }
    /* phones: table rows become compact two-line entries */
    table.dtable thead { display: none; }
    table.dtable, table.dtable tbody { display: block; }
    table.dtable tr.rrow { display: grid; grid-template-columns: 40px minmax(0, 1fr) auto 36px; grid-template-areas: "on name hits menu" ". cond cond cond" ". act act act"; align-items: center; column-gap: 6px; padding: 6px 0; border-bottom: 1px solid var(--divider-color, #e0e0e0); }
    table.dtable tr.rrow > td { display: block; border: none; padding: 1px 0; max-width: none; min-width: 0; }
    table.dtable tr.rrow > td.c-pos { display: none; }
    table.dtable input.switch { width: 32px; min-width: 32px; height: 18px; min-height: 0; padding: 0; }
    table.dtable tr.open, table.dtable tr.rdetail, table.dtable tr.adetail { background: color-mix(in srgb, var(--primary-color) 5%, transparent); }
    table.dtable tr.open > td, table.dtable tr.rdetail > td, table.dtable tr.adetail > td, table.dtable tbody tr:hover > td { background: none !important; }
    table.dtable tr.open { border-radius: 10px 10px 0 0; padding-left: 4px; padding-right: 4px; }
    table.dtable tr.rdetail, table.dtable tr.adetail { border-radius: 0 0 10px 10px; padding: 0 4px 4px; margin-bottom: 6px; }
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
    .atable .c-time { grid-area: time; width: auto; text-align: right; }
    .atable .c-kind, .atable .c-fields, .atable .c-chars, .atable .c-ent { grid-row: 2; display: inline-flex !important; align-items: center; }
    .atable tr.arow { grid-template-areas: "st subj time"; grid-auto-flow: row; }
    .atable .c-kind { grid-column: 2 / 4; }
    .atable .c-fields, .atable .c-chars, .atable .c-ent { display: none !important; }
    table.dtable tr.rdetail, table.dtable tr.adetail { display: block; }
    table.dtable tr.rdetail > td, table.dtable tr.adetail > td { display: block; border: none; }
    .rdet, .adet { padding-left: 0; }
    label.search { max-width: none; flex-basis: 100%; }
    .actionsbar button { width: 100%; }
    .tabs .tab { flex-basis: 100%; }
    .cond { grid-template-columns: 1fr; gap: 6px; padding: 8px; border: 1px solid var(--divider-color, #e0e0e0); border-radius: 10px; }
    .cond button.icon { justify-self: end; }
    button { min-height: 44px; }
    button.icon { min-width: 44px; min-height: 44px; font-size: 18px; }
    button.round { min-height: 0; width: 42px; height: 42px; }
    details.menu > summary { height: 42px; border-radius: 21px; }
    .pill { height: 42px; border-radius: 21px; }
    .card h2 button.pill { flex: none; }
    .ai-rate { grid-template-columns: 40px minmax(0, 1fr); }
    .ai-rate .imp { grid-row: span 4; }
    .ai-rate > :not(.imp) { grid-column: 2; }
    .ai-rate .side { grid-row: auto; justify-items: start; display: flex; flex-wrap: wrap; gap: 4px; }
    .ai-cat { flex-wrap: wrap; }
    .ai-cat .tx { flex: 1 1 calc(100% - 60px); }
    .ai-rate select { max-width: none; width: 100%; }
    button.round.small { width: 36px; height: 36px; }
    input[type=text], select, select.copy { width: 100%; max-width: none; min-width: 0; box-sizing: border-box; min-height: 44px; font-size: 16px; }
    .row { gap: 4px; }
    .row label { min-width: 100%; }
    .row label:has(input[type=checkbox]) { display: flex; align-items: center; gap: 10px; min-height: 44px; }
    input[type=checkbox] { width: 22px; height: 22px; }
  }
`;
