/* Frieda Postfach – Posteingangsregeln, Läufe und Verlauf (ohne Build-Schritt, ohne Abhängigkeiten). */

const ICON_URL = new URL("icon.svg", import.meta.url).href;

const FIELDS = ["from", "to", "cc", "subject", "any"];
const OPS = ["contains", "equals", "starts_with", "ends_with", "domain", "regex"];

const I18N = {
  de: {
    title: "Frieda Postfach",
    rules: "Regeln",
    newRule: "Neue Regel",
    noRules: "Noch keine Regeln. Lege die erste Regel an oder lass sie dir vom Assistenten anlegen.",
    name: "Name",
    mailbox: "Postfach (Quelle)",
    match: "Bedingungen verknüpfen",
    all: "alle müssen zutreffen",
    any: "eine muss zutreffen",
    conditions: "Bedingungen",
    addCondition: "Bedingung hinzufügen",
    value: "Wert",
    actions: "Aktionen",
    moveTo: "Verschieben nach",
    noMove: "– nicht verschieben –",
    markSeen: "Gelesen-Status",
    unchanged: "– unverändert –",
    seen: "als gelesen markieren",
    unseen: "als ungelesen markieren",
    flag: "Markierung",
    flagSet: "markieren",
    flagClear: "Markierung entfernen",
    delete: "In den Papierkorb verschieben",
    stop: "Danach keine weiteren Regeln prüfen",
    enabled: "Aktiv",
    save: "Speichern",
    cancel: "Abbrechen",
    edit: "Bearbeiten",
    remove: "Löschen",
    confirmDelete: "Regel wirklich löschen?",
    hits: "Treffer",
    up: "Nach oben",
    down: "Nach unten",
    run: "Regeln ausführen",
    dryRunAll: "Probelauf (gesamtes Postfach)",
    runAll: "Jetzt anwenden (gesamtes Postfach)",
    runNew: "Nur neue Mails",
    confirmRun: "Regeln jetzt auf das gesamte Postfach anwenden? Verschieben und Löschen werden sofort ausgeführt.",
    lastRun: "Letzter Lauf",
    never: "noch nie",
    report: "Bericht",
    checked: "geprüft",
    matched: "Treffer",
    dryRun: "Probelauf",
    skipped: "Übersprungen",
    errors: "Fehler",
    uid: "UID",
    subject: "Betreff",
    from: "Von",
    rule: "Regel",
    action: "Aktion",
    aMove: "→ {0}",
    aDelete: "Papierkorb",
    aSeen: "gelesen",
    aUnseen: "ungelesen",
    aFlag: "markiert",
    aUnflag: "Markierung weg",
    loading: "Lade …",
    noAccount: "Kein iCloud-Konto eingerichtet oder Mail-Tools deaktiviert.",
    fields: { from: "Absender", to: "Empfänger", cc: "Kopie", subject: "Betreff", any: "irgendwo" },
    ops: {
      contains: "enthält",
      equals: "ist gleich",
      starts_with: "beginnt mit",
      ends_with: "endet mit",
      domain: "Domain ist",
      regex: "Regex",
    },
    baseline: "Ausgangsbasis gesetzt – beim nächsten Lauf werden neue Mails verarbeitet.",
    delete_disabled: "Löschen ist in den Optionen deaktiviert.",
    triggerAuto: "automatisch",
    triggerManual: "manuell",
    accounts: "Konten",
    accountRules: "{0} Regeln, {1} aktiv",
    accountReadOnly: "Nur-Lesen",
    accountNoMail: "Mail-Tools deaktiviert",
    accountHits: "{0} Treffer gesamt",
    copyTo: "Kopieren nach …",
    copied: "Regel nach „{0}“ kopiert.",
    switchHint: "Regeln, Läufe und Berichte gelten je Konto. Wähle oben das Konto.",
    colTime: "Zeit",
    colResult: "Ergebnis",
    resOk: "ok",
    resError: "Fehler",
    showMore: "Mehr anzeigen",
    expandAll: "Alle aufklappen",
    collapseAll: "Alle zuklappen",
    nConditions: "{0} Bedingungen",
    oneCondition: "1 Bedingung",
    matchAnyShort: "eine muss zutreffen",
    matchAllShort: "alle müssen zutreffen",
    continueRules: "danach weitere Regeln prüfen",
    noActions: "keine Aktion",
    history: "Ausführungen",
    historyHint: "Manuelle und automatische Regelläufe, neueste zuerst. Aufeinanderfolgende automatische Läufe ohne Treffer werden zusammengefasst.",
    noHistory: "Noch keine Ausführungen aufgezeichnet.",
    clearHistory: "Verlauf leeren",
    confirmClearHistory: "Verlauf der Ausführungen wirklich leeren?",
    colTrigger: "Auslöser",
    colScope: "Umfang",
    colChecked: "Geprüft",
    colMatched: "Treffer",
    colRules: "Regeln",
    scopeNew: "neue Mails",
    scopeAll: "gesamtes Postfach",
    runsMerged: "{0} Läufe",
    resIdle: "keine Treffer",
    filter: "Filter",
    filterReset: "Filter zurücksetzen",
    filterCount: "{0} von {1} Einträgen",
    filterAll: "alle",
    filterPh: "filtern …",
    numPh: "z. B. >0",
    triggerPush: "Push",
    digestAt: "Tagesüberblick um {0}",
    pushError: "Push gestört: {0}",
    pushUnsupported: "Push nicht verfügbar",
    saveAttachments: "Anhänge speichern",
    attachmentsFolder: "Unterordner für Anhänge",
    attachmentsHint: "z. B. Belege – gespeichert unter <Anhang-Ordner>/<Unterordner>/<JJJJ-MM>/",
    aSave: "📎 Anhänge",
    attachments_unavailable: "Kein Anhang-Ordner eingerichtet (Frieda → Optionen → Tools und Konto).",
    runMenu: "Ausführen",
    dryRunHint: "zeigt nur, was passieren würde",
    runAllHint: "verschiebt und löscht sofort",
    runNewHint: "seit dem letzten Lauf eingetroffen",
    testRule: "Testen",
    testRuleHint: "Probelauf nur mit dieser Regel",
    firstRule: "Erste Regel anlegen",
    modePush: "Sofort per Push",
    modePushSub: "Neue Mails im Posteingang werden beim Eintreffen sortiert. Zusätzlich prüft Frieda alle {0} Min. – als Sicherheitsnetz und für Regeln auf anderen Postfächern.",
    modeConnecting: "Push verbindet …",
    modePushDown: "Push gestört – Prüfung alle {0} Min.",
    modePushDownSub: "{0} Die regelmäßige Prüfung läuft weiter, neue Mails werden spätestens nach {1} Min. sortiert.",
    modeTimer: "Prüfung alle {0} Min.",
    modeTimerSub: "Frieda sieht alle {0} Min. nach neuen Mails. Für sofortiges Sortieren schalte Push in den Optionen von Frieda Postfach ein.",
    modeOff: "Automatik aus",
    modeOffSub: "Regeln laufen nur, wenn du sie hier startest oder der Assistent sie ausführt. Einschalten: Optionen von Frieda Postfach.",
    modeIdle: "Keine aktive Regel – die Automatik läuft, hat aber nichts zu tun.",
    modeReadOnly: "Das Konto steht in Frieda auf Nur-Lesen – Regeln laufen nur als Probelauf.",
    modeNoMail: "Mail-Tools sind in Frieda deaktiviert.",
    nextAt: "nächste Prüfung {0}",
  },
  en: {
    title: "Frieda Postfach",
    rules: "Rules",
    newRule: "New rule",
    noRules: "No rules yet. Create the first one here or let the assistant create it.",
    name: "Name",
    mailbox: "Mailbox (source)",
    match: "Combine conditions",
    all: "all must match",
    any: "any may match",
    conditions: "Conditions",
    addCondition: "Add condition",
    value: "Value",
    actions: "Actions",
    moveTo: "Move to",
    noMove: "– do not move –",
    markSeen: "Read state",
    unchanged: "– unchanged –",
    seen: "mark as read",
    unseen: "mark as unread",
    flag: "Flag",
    flagSet: "flag",
    flagClear: "remove flag",
    delete: "Move to trash",
    stop: "Stop evaluating further rules",
    enabled: "Enabled",
    save: "Save",
    cancel: "Cancel",
    edit: "Edit",
    remove: "Delete",
    confirmDelete: "Delete this rule?",
    hits: "Hits",
    up: "Move up",
    down: "Move down",
    run: "Run rules",
    dryRunAll: "Dry run (whole mailbox)",
    runAll: "Apply now (whole mailbox)",
    runNew: "New mail only",
    confirmRun: "Apply the rules to the whole mailbox now? Moves and deletions are executed immediately.",
    lastRun: "Last run",
    never: "never",
    report: "Report",
    checked: "checked",
    matched: "matched",
    dryRun: "dry run",
    skipped: "Skipped",
    errors: "Errors",
    uid: "UID",
    subject: "Subject",
    from: "From",
    rule: "Rule",
    action: "Action",
    aMove: "→ {0}",
    aDelete: "trash",
    aSeen: "read",
    aUnseen: "unread",
    aFlag: "flagged",
    aUnflag: "unflagged",
    loading: "Loading …",
    noAccount: "No iCloud account configured or mail tools disabled.",
    fields: { from: "Sender", to: "Recipient", cc: "Cc", subject: "Subject", any: "anywhere" },
    ops: {
      contains: "contains",
      equals: "equals",
      starts_with: "starts with",
      ends_with: "ends with",
      domain: "domain is",
      regex: "regex",
    },
    baseline: "Baseline set – new mail will be processed on the next run.",
    delete_disabled: "Deleting is disabled in the options.",
    triggerAuto: "automatic",
    triggerManual: "manual",
    accounts: "Accounts",
    accountRules: "{0} rules, {1} enabled",
    accountReadOnly: "read-only",
    accountNoMail: "mail tools disabled",
    accountHits: "{0} hits in total",
    copyTo: "Copy to …",
    copied: "Rule copied to “{0}”.",
    switchHint: "Rules, runs and reports are per account. Pick the account above.",
    colTime: "Time",
    colResult: "Result",
    resOk: "ok",
    resError: "error",
    showMore: "Show more",
    expandAll: "Expand all",
    collapseAll: "Collapse all",
    nConditions: "{0} conditions",
    oneCondition: "1 condition",
    matchAnyShort: "any may match",
    matchAllShort: "all must match",
    continueRules: "then continue with further rules",
    noActions: "no action",
    history: "Runs",
    historyHint: "Manual and automatic rule runs, newest first. Consecutive automatic runs without hits are merged.",
    noHistory: "No runs recorded yet.",
    clearHistory: "Clear history",
    confirmClearHistory: "Really clear the run history?",
    colTrigger: "Trigger",
    colScope: "Scope",
    colChecked: "Checked",
    colMatched: "Hits",
    colRules: "Rules",
    scopeNew: "new mail",
    scopeAll: "whole mailbox",
    runsMerged: "{0} runs",
    resIdle: "no hits",
    filter: "Filter",
    filterReset: "Reset filters",
    filterCount: "{0} of {1} entries",
    filterAll: "all",
    filterPh: "filter …",
    numPh: "e.g. >0",
    triggerPush: "push",
    digestAt: "daily overview at {0}",
    pushError: "push disrupted: {0}",
    pushUnsupported: "push unavailable",
    saveAttachments: "Save attachments",
    attachmentsFolder: "Subfolder for attachments",
    attachmentsHint: "e.g. Receipts – stored as <attachment folder>/<subfolder>/<YYYY-MM>/",
    aSave: "📎 attachments",
    attachments_unavailable: "No attachment folder configured (Frieda → options → Tools and account).",
    runMenu: "Run",
    dryRunHint: "only shows what would happen",
    runAllHint: "moves and deletes right away",
    runNewHint: "arrived since the last run",
    testRule: "Test",
    testRuleHint: "Dry run with this rule only",
    firstRule: "Create the first rule",
    modePush: "Instant via push",
    modePushSub: "New mail in the inbox is sorted as it arrives. In addition Frieda checks every {0} min – as a safety net and for rules on other mailboxes.",
    modeConnecting: "Push connecting …",
    modePushDown: "Push interrupted – checking every {0} min",
    modePushDownSub: "{0} The regular check keeps running, so new mail is sorted within {1} min.",
    modeTimer: "Checking every {0} min",
    modeTimerSub: "Frieda looks for new mail every {0} min. For instant sorting turn on push in the options of Frieda Postfach.",
    modeOff: "Automation off",
    modeOffSub: "Rules only run when you start them here or the assistant runs them. Turn it on in the options of Frieda Postfach.",
    modeIdle: "No enabled rule – the automation runs but has nothing to do.",
    modeReadOnly: "The account is read-only in Frieda – rules only run as dry runs.",
    modeNoMail: "Mail tools are disabled in Frieda.",
    nextAt: "next check {0}",
  },
};

const trigLabel = (t, trig) => (trig === "auto" ? t.triggerAuto : trig === "push" ? t.triggerPush : t.triggerManual);

const fmt = (str, ...args) => String(str).replace(/\{(\d+)\}/g, (_, i) => args[Number(i)]);

// Numeric column filter: "5", "=5", ">0", ">=2", "<10", "<=3".
const numMatch = (value, query) => {
  const m = String(query).trim().match(/^(>=|<=|>|<|=)?\s*(-?\d+(?:[.,]\d+)?)$/);
  if (!m) return String(value).includes(String(query).trim());
  const v = Number(value);
  const q = Number(m[2].replace(",", "."));
  if (isNaN(v)) return false;
  return { ">": v > q, "<": v < q, ">=": v >= q, "<=": v <= q, "=": v === q }[m[1] || "="];
};

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);


// Parses ISO timestamps, including offsets without colon (+0200) that Safari rejects.
const parseTime = (iso) => (iso ? new Date(String(iso).replace(/([+-]\d{2})(\d{2})$/, "$1:$2")) : null);
const fmtDateTime = (iso) => {
  const d = parseTime(iso);
  return d && !isNaN(d) ? d.toLocaleString() : "–";
};
const fmtClock = (iso) => {
  const d = parseTime(iso);
  return d && !isNaN(d) ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "–";
};

// Adds data-label attributes to the cells of each row so the CSS can stack tables on phones.
const withLabels = (rowsHtml, labels) =>
  rowsHtml
    .split("<tr")
    .map((chunk, idx) => {
      if (idx === 0) return chunk;
      let i = 0;
      return chunk.replace(/<td(?![^>]*data-label)/g, () => `<td data-label="${esc(labels[i++] ?? "")}"`);
    })
    .join("<tr");

const STYLE = `
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
  .rules { display: grid; gap: 8px; }
  .rule { border: 1px solid var(--divider-color, #e0e0e0); border-radius: 10px; background: var(--card-background-color, #fff); scroll-margin-top: 16px; transition: box-shadow .4s; }
  .rule.open { border-color: color-mix(in srgb, var(--primary-color) 45%, var(--divider-color, #e0e0e0)); }
  .rule.flash { box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary-color) 35%, transparent); }
  .rule.disabled .rule-head .rule-title, .rule.disabled .rule-head .rule-side { opacity: .55; }
  .rule-head { display: flex; align-items: center; gap: 8px; padding: 6px 10px 6px 4px; }
  .rule-head .chev { transition: transform .15s; }
  .rule.open .rule-head .chev { transform: rotate(90deg); }
  .rule-title { flex: 1; min-width: 0; cursor: pointer; display: grid; gap: 1px; }
  .rule-title strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rule-side { display: flex; align-items: center; gap: 6px; max-width: 50%; }
  .rule-acts { display: flex; flex-wrap: wrap; justify-content: flex-end; }
  .rule-side .badge { white-space: nowrap; }
  .rule-body { padding: 4px 14px 12px 44px; display: grid; gap: 10px; border-top: 1px dashed var(--divider-color, #e0e0e0); }
  .rule-body .lbl { font-size: 12px; color: var(--secondary-text-color); margin-bottom: 2px; }
  .rule-tools { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
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
  details.menu > summary .play { font-size: 11px; }
  details.menu > summary:hover, details.menu[open] > summary { filter: brightness(.92); }
  details.menu > summary:focus-visible, button.round:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
  details.menu .menu-list { position: absolute; right: 0; top: calc(100% + 4px); z-index: 5; min-width: 270px; background: var(--card-background-color, #fff); border: 1px solid var(--divider-color, #e0e0e0); border-radius: 10px; box-shadow: 0 6px 20px rgba(0,0,0,.18); padding: 6px; display: grid; gap: 2px; }
  details.menu .menu-list button { background: none; color: var(--primary-text-color); text-align: left; display: grid; gap: 1px; padding: 8px 10px; border-radius: 6px; }
  details.menu .menu-list button:hover:not(:disabled) { background: var(--secondary-background-color, #f0f0f0); }
  details.menu .menu-list button small { color: var(--secondary-text-color); font-size: 12px; }
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
    .rule-head { flex-wrap: wrap; padding: 4px 8px 4px 2px; }
    .rule-side { max-width: none; flex-basis: 100%; padding-left: 92px; box-sizing: border-box; }
    .rule-acts { flex: 1; justify-content: flex-start; }
    .rule-body { padding: 6px 10px 10px; }
    .rule-tools select.copy { width: auto; flex: 1 1 140px; }
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
    details.menu .menu-list { right: auto; left: 0; min-width: min(270px, 80vw); }
    .actionsbar button { width: 100%; }
    .tabs .tab { flex-basis: 100%; }
    .cond { grid-template-columns: 1fr; gap: 6px; padding: 8px; border: 1px solid var(--divider-color, #e0e0e0); border-radius: 10px; }
    .cond button.icon { justify-self: end; }
    button { min-height: 44px; }
    button.icon { min-width: 44px; min-height: 44px; font-size: 18px; }
    button.round { min-height: 0; width: 42px; height: 42px; }
    details.menu > summary { height: 42px; border-radius: 21px; }
    button.round.small { width: 36px; height: 36px; }
    input[type=text], select, select.copy { width: 100%; max-width: none; min-width: 0; box-sizing: border-box; min-height: 44px; font-size: 16px; }
    .row { gap: 4px; }
    .row label { min-width: 100%; }
    .row label:has(input[type=checkbox]) { display: flex; align-items: center; gap: 10px; min-height: 44px; }
    input[type=checkbox] { width: 22px; height: 22px; }
  }
`;

class FriedaPostfachPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._s = {
      accounts: [],
      entryId: null,
      rules: [],
      lastRun: null,
      mailboxes: [],
      editing: null,
      report: null,
      error: null,
      notice: null,
      history: [],
      historyTotal: 0,
      historyLimit: 50,
      expanded: new Set(),
      filters: {},
      filterOpen: {},
      focusEditor: false,
      scrollTo: null,
      busy: false,
      loaded: false,
    };
  }

  connectedCallback() {
    this._onVisible = () => {
      if (document.visibilityState === "visible") this._autoRefresh();
    };
    document.addEventListener("visibilitychange", this._onVisible);
    this._onDocClick = (ev) => {
      const menu = this.shadowRoot.querySelector("details.menu[open]");
      if (menu && !ev.composedPath().includes(menu)) menu.removeAttribute("open");
    };
    document.addEventListener("click", this._onDocClick);
    this._timer = setInterval(() => this._autoRefresh(), 30000);
  }

  disconnectedCallback() {
    clearInterval(this._timer);
    document.removeEventListener("visibilitychange", this._onVisible);
    document.removeEventListener("click", this._onDocClick);
  }

  async _autoRefresh() {
    const s = this._s;
    if (!this._hass || !s.loaded || !s.entryId || s.busy || s.editing || document.visibilityState !== "visible") return;
    const active = this.shadowRoot.activeElement;
    if (active && ["SELECT", "INPUT", "TEXTAREA"].includes(active.tagName)) return;
    if (this.shadowRoot.querySelector("details.menu[open]")) return;
    try {
      await this._reload();
      this._render();
    } catch (err) {
      /* keep the last state on transient errors */
    }
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first) this._init();
    const menu = this.shadowRoot.querySelector("ha-menu-button");
    if (menu) {
      menu.hass = hass;
      menu.narrow = this._narrow;
    }
  }
  set narrow(v) {
    this._narrow = v;
  }
  set panel(p) {
    this._panel = p;
  }

  get t() {
    const lang = (this._hass?.locale?.language || this._hass?.language || "en").toLowerCase();
    return lang.startsWith("de") ? I18N.de : I18N.en;
  }

  async _ws(msg) {
    return this._hass.callWS(msg);
  }

  async _init() {
    this._render();
    try {
      const { accounts } = await this._ws({ type: "friedafetch_mail/accounts" });
      this._s.accounts = accounts;
      this._s.entryId = accounts[0]?.entry_id || null;
      if (this._s.entryId) await this._reload();
    } catch (err) {
      this._s.error = err.message || String(err);
    }
    this._s.loaded = true;
    this._render();
  }

  async _reload() {
    const [list, boxes] = await Promise.all([
      this._ws({ type: "friedafetch_mail/rules/list", entry_id: this._s.entryId }),
      this._ws({ type: "friedafetch_mail/mailboxes", entry_id: this._s.entryId }).catch(() => ({ mailboxes: [] })),
    ]);
    this._s.rules = list.rules;
    this._s.lastRun = list.last_run;
    this._s.automation = list.automation || null;
    this._s.mailboxes = boxes.mailboxes;
    try {
      await this._loadAccounts();
      await this._loadHistory();
    } catch (err) {
      /* account stats and history are optional */
    }
  }

  async _call(fn) {
    this._s.busy = true;
    this._s.error = null;
    this._render();
    try {
      await fn();
    } catch (err) {
      this._s.error = err.message || String(err);
    }
    this._s.busy = false;
    this._render();
  }

  // ------------------------------------------------------------ form state
  _blankRule() {
    return {
      name: "",
      mailbox: "INBOX",
      match: "all",
      enabled: true,
      conditions: [{ field: "from", op: "contains", value: "" }],
      actions: { move_to: null, mark_seen: null, flag: null, delete: false, stop: true, save_attachments: false, attachments_folder: null },
    };
  }

  _readForm() {
    const root = this.shadowRoot;
    const e = this._s.editing;
    if (!e) return null;
    const v = (id) => root.querySelector(`#${id}`)?.value;
    const c = (id) => root.querySelector(`#${id}`)?.checked;
    e.name = v("f-name") ?? e.name;
    e.mailbox = v("f-mailbox") ?? e.mailbox;
    e.match = v("f-match") ?? e.match;
    e.enabled = c("f-enabled") ?? e.enabled;
    e.conditions = [...root.querySelectorAll(".cond")].map((row) => ({
      field: row.querySelector(".c-field").value,
      op: row.querySelector(".c-op").value,
      value: row.querySelector(".c-value").value,
    }));
    const tri = (val) => (val === "" ? null : val === "true");
    e.actions = {
      move_to: v("f-move") || null,
      mark_seen: tri(v("f-seen") ?? ""),
      flag: tri(v("f-flag") ?? ""),
      delete: c("f-delete") ?? false,
      stop: c("f-stop") ?? true,
      save_attachments: c("f-save") ?? false,
      attachments_folder: (v("f-save-folder") || "").trim() || null,
    };
    return e;
  }

  async _save() {
    const rule = this._readForm();
    await this._call(async () => {
      let saved;
      if (rule.id) {
        const { id, hits, created, ...changes } = rule;
        saved = await this._ws({ type: "friedafetch_mail/rules/update", entry_id: this._s.entryId, rule_id: id, changes });
      } else {
        saved = await this._ws({ type: "friedafetch_mail/rules/create", entry_id: this._s.entryId, rule });
      }
      const savedId = saved?.rule?.id || rule.id;
      if (savedId) {
        this._s.expanded.add(savedId);
        this._s.scrollTo = savedId;
      }
      this._s.editing = null;
      await this._reload();
    });
  }

  async _delete(id) {
    if (!confirm(this.t.confirmDelete)) return;
    await this._call(async () => {
      await this._ws({ type: "friedafetch_mail/rules/delete", entry_id: this._s.entryId, rule_id: id });
      await this._reload();
    });
  }

  async _toggle(id, enabled) {
    await this._call(async () => {
      await this._ws({ type: "friedafetch_mail/rules/update", entry_id: this._s.entryId, rule_id: id, changes: { enabled } });
      await this._reload();
    });
  }

  async _move(id, delta) {
    const idx = this._s.rules.findIndex((r) => r.id === id);
    const position = Math.max(0, Math.min(this._s.rules.length - 1, idx + delta));
    if (position === idx) return;
    await this._call(async () => {
      await this._ws({ type: "friedafetch_mail/rules/update", entry_id: this._s.entryId, rule_id: id, changes: { position } });
      await this._reload();
    });
  }

  async _copy(id, targetEntryId) {
    const rule = this._s.rules.find((r) => r.id === id);
    const target = this._s.accounts.find((a) => a.entry_id === targetEntryId);
    if (!rule || !target) return;
    const { id: _id, hits, created, ...data } = rule;
    await this._call(async () => {
      await this._ws({ type: "friedafetch_mail/rules/create", entry_id: targetEntryId, rule: data });
      await this._loadAccounts();
      this._s.notice = this.t.copied.replace("{0}", target.label);
    });
  }

  async _loadAccounts() {
    const { accounts } = await this._ws({ type: "friedafetch_mail/accounts" });
    this._s.accounts = accounts;
    if (!accounts.some((a) => a.entry_id === this._s.entryId)) this._s.entryId = accounts[0]?.entry_id || null;
  }

  async _loadHistory() {
    const res = await this._ws({ type: "friedafetch_mail/rules/history", entry_id: this._s.entryId, limit: this._s.historyLimit });
    this._s.history = res.runs || [];
    this._s.historyTotal = res.total || 0;
  }

  async _clearHistory() {
    if (!confirm(this.t.confirmClearHistory)) return;
    await this._call(async () => {
      await this._ws({ type: "friedafetch_mail/rules/history/clear", entry_id: this._s.entryId });
      await this._loadHistory();
    });
  }

  // ------------------------------------------------------- filter tables
  // cols: [{ label, filter: "text" | "select" | "num" }]; rows: [[{ html, v }, ...]]
  _filterTable(key, cols, rows, emptyText) {
    const t = this.t;
    if (!rows.length) return `<p class="muted">${esc(emptyText)}</p>`;
    const f = this._s.filters[key] || {};
    const active = Object.values(f).some((v) => v);
    const filterCell = (c, i) => {
      const val = f[i] || "";
      const cls = val ? "active" : "";
      const aria = `aria-label="${esc(t.filter + ": " + c.label)}"`;
      if (c.filter === "select") {
        const values = [...new Set(rows.map((r) => r[i].v).filter((v) => v !== ""))].sort((a, b) => a.localeCompare(b));
        return `<th><select class="${cls}" data-ftable="${key}" data-col="${i}" ${aria}><option value="">${esc(c.label)}: ${esc(t.filterAll)}</option>${values
          .map((v) => `<option value="${esc(v)}" ${v === val ? "selected" : ""}>${esc(c.label)}: ${esc(v)}</option>`)
          .join("")}</select></th>`;
      }
      const ph = c.filter === "num" ? `${c.label} (${t.numPh})` : `${c.label} ${t.filterPh}`;
      return `<th><input type="text" class="${cls}" data-ftable="${key}" data-col="${i}" data-kind="${c.filter || "text"}" value="${esc(val)}" placeholder="${esc(ph)}" ${aria}></th>`;
    };
    const body = rows
      .map((r) => `<tr>${r.map((c, i) => `<td data-label="${esc(cols[i].label)}" data-v="${esc(c.v)}"${c.cls ? ` class="${c.cls}"` : ""}>${c.html}</td>`).join("")}</tr>`)
      .join("");
    return `<div class="ftable ${this._s.filterOpen[key] || active ? "fopen" : ""}" data-ftable-wrap="${key}">
      <div class="fbar"><span class="muted fcount"></span><span class="grow"></span>
        <button class="link ftoggle" data-action="filter-toggle" data-table="${key}">${esc(t.filter)}${active ? " •" : ""}</button>
        <button class="link" data-action="filter-reset" data-table="${key}" ${active ? "" : "hidden"}>${esc(t.filterReset)}</button></div>
      <div class="scroll"><table class="stack"><thead><tr class="head">${cols.map((c) => `<th>${esc(c.label)}</th>`).join("")}</tr>
        <tr class="filters">${cols.map(filterCell).join("")}</tr></thead><tbody>${body}</tbody></table></div></div>`;
  }

  _applyFilters(key) {
    const wrap = this.shadowRoot.querySelector(`[data-ftable-wrap="${key}"]`);
    if (!wrap) return;
    const f = this._s.filters[key] || {};
    const kinds = {};
    wrap.querySelectorAll("[data-ftable]").forEach((el) => (kinds[el.dataset.col] = el.tagName === "SELECT" ? "select" : el.dataset.kind));
    const rows = [...wrap.querySelectorAll("tbody tr")];
    let shown = 0;
    rows.forEach((tr) => {
      const ok = Object.entries(f).every(([col, q]) => {
        if (!q) return true;
        const v = tr.cells[Number(col)]?.dataset.v ?? "";
        if (kinds[col] === "select") return v === q;
        if (kinds[col] === "num") return numMatch(v, q);
        return v.toLowerCase().includes(String(q).toLowerCase().trim());
      });
      tr.classList.toggle("fhide", !ok);
      if (ok) shown++;
    });
    const active = Object.values(f).some((v) => v);
    const count = wrap.querySelector(".fcount");
    if (count) count.textContent = active ? fmt(this.t.filterCount, shown, rows.length) : "";
    const reset = wrap.querySelector('[data-action="filter-reset"]');
    if (reset) reset.hidden = !active;
    const toggle = wrap.querySelector('[data-action="filter-toggle"]');
    if (toggle) toggle.textContent = this.t.filter + (active ? " •" : "");
    wrap.querySelectorAll("[data-ftable]").forEach((el) => el.classList.toggle("active", !!f[el.dataset.col]));
  }

  _renderHistory() {
    const t = this.t;
    const s = this._s;
    const time = (h) => {
      if ((h.runs || 1) > 1) {
        const a = parseTime(h.started);
        const b = parseTime(h.finished);
        const sameDay = a && b && a.toDateString() === b.toDateString();
        return `${fmtDateTime(h.started)} – ${sameDay ? fmtClock(h.finished) : fmtDateTime(h.finished)}`;
      }
      return fmtDateTime(h.finished || h.started);
    };
    const rows = s.history.map((h) => {
      const trig = trigLabel(t, h.trigger);
      const scope = h.scope === "all" ? t.scopeAll : t.scopeNew;
      const ruleText = Object.entries(h.rules || {})
        .map(([name, n]) => `${name} (${n})`)
        .join(", ");
      const errors = (h.errors || []).length;
      const res = errors ? t.resError : h.matched ? t.resOk : t.resIdle;
      const timeText = time(h);
      return [
        { html: `<span style="white-space:nowrap">${esc(timeText)}</span>${(h.runs || 1) > 1 ? `<div class="muted">${esc(fmt(t.runsMerged, h.runs))}</div>` : ""}`, v: timeText },
        { html: esc(trig), v: trig },
        { html: esc(scope) + (h.mailboxes?.length ? `<div class="muted">${esc(h.mailboxes.join(", "))}</div>` : ""), v: scope },
        { html: esc(h.checked ?? 0), v: String(h.checked ?? 0) },
        { html: h.matched ? `<strong>${esc(h.matched)}</strong>` : "0", v: String(h.matched ?? 0) },
        { html: ruleText ? Object.entries(h.rules).map(([n, c]) => `<span class="chip">${esc(n)} · ${esc(c)}</span>`).join("") : "–", v: ruleText },
        {
          html: `<span class="badge ${errors ? "warn" : ""}">${esc(res)}</span>${errors ? `<div class="muted">${esc(h.errors.join("; "))}</div>` : ""}`,
          v: res,
        },
      ];
    });
    const cols = [
      { label: t.colTime, filter: "text" },
      { label: t.colTrigger, filter: "select" },
      { label: t.colScope, filter: "select" },
      { label: t.colChecked, filter: "num" },
      { label: t.colMatched, filter: "num" },
      { label: t.colRules, filter: "text" },
      { label: t.colResult, filter: "select" },
    ];
    const more = s.historyTotal > s.history.length;
    return `<div class="card">
      <h2><span class="grow">${esc(t.history)}</span>
        ${more ? `<button class="secondary" data-action="history-more" ${s.busy ? "disabled" : ""}>${esc(t.showMore)}</button>` : ""}
        <button class="secondary" data-action="history-clear" ${s.busy || !s.history.length ? "disabled" : ""}>${esc(t.clearHistory)}</button></h2>
      <p class="muted" style="margin:0 0 10px">${esc(t.historyHint)}</p>
      ${this._filterTable("runs", cols, rows, t.noHistory)}
    </div>`;
  }

  async _switchAccount(entryId) {
    this._s.entryId = entryId;
    this._s.editing = null;
    this._s.report = null;
    this._s.notice = null;
    await this._call(() => this._reload());
  }

  async _run(scope, dryRun, ruleIds = null) {
    if (!dryRun && scope === "all" && !confirm(this.t.confirmRun)) return;
    await this._call(async () => {
      const msg = { type: "friedafetch_mail/rules/run", entry_id: this._s.entryId, scope, dry_run: dryRun };
      if (ruleIds) msg.rule_ids = ruleIds;
      this._s.report = await this._ws(msg);
      this._s.scrollToReport = true;
      await this._reload();
    });
  }

  // ---------------------------------------------------------------- render
  _summary(rule) {
    const t = this.t;
    const conds = rule.conditions
      .map((c) => `<span class="chip">${esc(t.fields[c.field] || c.field)} ${esc(t.ops[c.op] || c.op)} „${esc(c.value)}“</span>`)
      .join(rule.match === "any" ? ` <span class="muted">${esc(t.any.split(" ")[0])}</span> ` : " ");
    const a = rule.actions;
    const acts = [];
    if (a.move_to) acts.push(t.aMove.replace("{0}", esc(a.move_to)));
    if (a.delete) acts.push(t.aDelete);
    if (a.mark_seen === true) acts.push(t.aSeen);
    if (a.mark_seen === false) acts.push(t.aUnseen);
    if (a.flag === true) acts.push(t.aFlag);
    if (a.flag === false) acts.push(t.aUnflag);
    if (a.save_attachments) acts.push(t.aSave + (a.attachments_folder ? ` → ${esc(a.attachments_folder)}` : ""));
    return { conds, acts: acts.map((x) => `<span class="chip">${x}</span>`).join(" ") };
  }

  _account() {
    return this._s.accounts.find((a) => a.entry_id === this._s.entryId) || null;
  }

  // How new mail is picked up: one clear statement instead of several badges.
  _mode(a, au) {
    const t = this.t;
    if (a && !a.mail_enabled) return { cls: "warn", ic: "⚠", title: t.modeNoMail, sub: "" };
    if (a && a.read_only) return { cls: "warn", ic: "🔒", title: t.accountReadOnly, sub: t.modeReadOnly };
    if (!au || !au.enabled) return { cls: "", ic: "⏸", title: t.modeOff, sub: t.modeOffSub };
    const n = au.interval;
    const idle = au.idle_reason === "no_enabled_rules" ? t.modeIdle : "";
    const ps = au.push?.state;
    if (ps === "listening" || ps === "connecting") {
      return { cls: idle ? "warn" : "", ic: "⚡", title: ps === "listening" ? t.modePush : t.modeConnecting, sub: idle || fmt(t.modePushSub, n) };
    }
    if (au.push) {
      const reason = ps === "unsupported" ? t.pushUnsupported + "." : fmt(t.pushError, au.push.error || ps) + ".";
      return { cls: "warn", ic: "⚠", title: fmt(t.modePushDown, n), sub: idle || fmt(t.modePushDownSub, reason, n) };
    }
    return { cls: idle ? "warn" : "", ic: "⏱", title: fmt(t.modeTimer, n), sub: idle || fmt(t.modeTimerSub, n) };
  }

  _renderAccounts() {
    const t = this.t;
    const s = this._s;
    if (s.accounts.length < 2) return "";
    const tabs = s.accounts
      .map((a) => {
        const active = a.entry_id === s.entryId;
        const m = this._mode(a, a.automation);
        return `<button class="tab ${active ? "active" : ""}" data-action="account" data-id="${esc(a.entry_id)}" aria-pressed="${active}">
          <span class="label"><span class="dot ${a.rules_enabled ? "" : "off"}"></span>${esc(a.label)}</span>
          <span class="meta">${esc(a.apple_id || a.title)}</span>
          <span class="meta">${esc(m.ic)} ${esc(m.title)}</span>
          <span class="meta">${esc(fmt(t.accountRules, a.rules_total, a.rules_enabled))} · ${esc(fmt(t.accountHits, a.hits))}</span>
        </button>`;
      })
      .join("");
    return `<div class="card"><h2><span class="grow">${esc(t.accounts)}</span><span class="muted">${s.accounts.length}</span></h2>
      <div class="tabs">${tabs}</div>
      <p class="muted" style="margin:10px 0 0">${esc(t.switchHint)}</p></div>`;
  }

  _renderRules() {
    const t = this.t;
    const s = this._s;
    const newEditor = s.editing && !s.editing.id ? `<div class="rule open" data-rule-id="">${this._renderEditor()}</div>` : "";
    if (!s.rules.length)
      return (
        newEditor ||
        `<div class="empty"><p class="muted" style="margin:0">${esc(t.noRules)}</p><button data-action="new">+ ${esc(t.firstRule)}</button></div>`
      );
    const items = s.rules
      .map((r, i) => {
        const { conds, acts } = this._summary(r);
        const editingThis = s.editing && s.editing.id === r.id;
        const open = editingThis || s.expanded.has(r.id);
        const n = r.conditions.length;
        const meta = [r.mailbox, n === 1 ? t.oneCondition : fmt(t.nConditions, n)];
        if (n > 1) meta.push(r.match === "any" ? t.matchAnyShort : t.matchAllShort);
        const copy =
          s.accounts.length > 1
            ? `<select class="copy" data-action="copy" data-id="${esc(r.id)}" title="${esc(t.copyTo)}"><option value="">${esc(t.copyTo)}</option>${s.accounts
                .filter((a) => a.entry_id !== s.entryId)
                .map((a) => `<option value="${esc(a.entry_id)}">${esc(a.label)}</option>`)
                .join("")}</select>`
            : "";
        const body = editingThis
          ? this._renderEditor()
          : open
            ? `<div class="rule-body">
                <div><div class="lbl">${esc(t.conditions)}</div>${conds}</div>
                <div><div class="lbl">${esc(t.actions)}</div>${acts || `<span class="muted">${esc(t.noActions)}</span>`}${r.actions.stop === false ? `<div class="muted">↓ ${esc(t.continueRules)}</div>` : ""}</div>
                <div class="rule-tools">
                  <button class="secondary" data-action="edit" data-id="${esc(r.id)}" ${s.editing ? "disabled" : ""}>✎ ${esc(t.edit)}</button>
                  <button class="secondary" data-action="test" data-id="${esc(r.id)}" ${s.busy ? "disabled" : ""} title="${esc(t.testRuleHint)}">▶ ${esc(t.testRule)}</button>
                  <button class="icon" data-action="up" data-id="${esc(r.id)}" ${i === 0 ? "disabled" : ""} title="${esc(t.up)}" aria-label="${esc(t.up)}">▲</button>
                  <button class="icon" data-action="down" data-id="${esc(r.id)}" ${i === s.rules.length - 1 ? "disabled" : ""} title="${esc(t.down)}" aria-label="${esc(t.down)}">▼</button>
                  <button class="icon" data-action="delete" data-id="${esc(r.id)}" title="${esc(t.remove)}" aria-label="${esc(t.remove)}">🗑</button>
                  ${copy}
                </div>
              </div>`
            : "";
        return `<div class="rule ${open ? "open" : ""} ${r.enabled ? "" : "disabled"}" data-rule-id="${esc(r.id)}">
          <div class="rule-head">
            <button class="icon chev" data-action="expand" data-id="${esc(r.id)}" aria-expanded="${open}" aria-label="${esc(r.name)}" ${editingThis ? "disabled" : ""}>▸</button>
            <input type="checkbox" data-action="toggle" data-id="${esc(r.id)}" ${r.enabled ? "checked" : ""} title="${esc(t.enabled)}" aria-label="${esc(t.enabled)}">
            <div class="rule-title" data-action="expand" data-id="${esc(r.id)}"><strong>${esc(r.name)}</strong><span class="muted">${esc(meta.join(" · "))}</span></div>
            <span class="rule-side"><span class="rule-acts">${acts}</span><span class="badge" title="${esc(t.hits)}">${esc(r.hits ?? 0)} ${esc(t.hits)}</span></span>
          </div>
          ${body}
        </div>`;
      })
      .join("");
    return `<div class="rules">${newEditor}${items}</div>`;
  }

  _renderEditor() {
    const t = this.t;
    const e = this._s.editing;
    if (!e) return "";
    const opt = (val, label, cur) => `<option value="${esc(val)}" ${String(cur) === String(val) ? "selected" : ""}>${esc(label)}</option>`;
    const boxes = [...new Set(["INBOX", ...this._s.mailboxes])];
    const conds = e.conditions
      .map(
        (c, i) => `<div class="cond" data-index="${i}">
          <select class="c-field">${FIELDS.map((f) => opt(f, t.fields[f], c.field)).join("")}</select>
          <select class="c-op">${OPS.map((o) => opt(o, t.ops[o], c.op)).join("")}</select>
          <input type="text" class="c-value" value="${esc(c.value)}" placeholder="${esc(t.value)}">
          <button class="icon" data-action="remove-cond" data-index="${i}" ${e.conditions.length === 1 ? "disabled" : ""}>✕</button>
        </div>`
      )
      .join("");
    const a = e.actions;
    const tri = (val) => (val === null || val === undefined ? "" : String(val));
    return `<div class="editor" id="editor">
      <h3 class="title">${esc(e.id ? t.edit : t.newRule)}</h3>
      <div class="row"><label for="f-name">${esc(t.name)}</label><input type="text" id="f-name" class="grow" value="${esc(e.name)}"></div>
      <div class="row"><label for="f-mailbox">${esc(t.mailbox)}</label><select id="f-mailbox">${boxes.map((b) => opt(b, b, e.mailbox)).join("")}</select></div>
      <div class="row"><label for="f-match">${esc(t.match)}</label><select id="f-match">${opt("all", t.all, e.match)}${opt("any", t.any, e.match)}</select></div>
      <h3 class="muted with-add">${esc(t.conditions)} <button class="round small" data-action="add-cond" title="${esc(t.addCondition)}" aria-label="${esc(t.addCondition)}">+</button></h3>
      ${conds}
      <h3 class="muted">${esc(t.actions)}</h3>
      <div class="row"><label for="f-move">${esc(t.moveTo)}</label><select id="f-move">${opt("", t.noMove, a.move_to || "")}${this._s.mailboxes.map((b) => opt(b, b, a.move_to || "")).join("")}</select></div>
      <div class="row"><label for="f-seen">${esc(t.markSeen)}</label><select id="f-seen">${opt("", t.unchanged, tri(a.mark_seen))}${opt("true", t.seen, tri(a.mark_seen))}${opt("false", t.unseen, tri(a.mark_seen))}</select></div>
      <div class="row"><label for="f-flag">${esc(t.flag)}</label><select id="f-flag">${opt("", t.unchanged, tri(a.flag))}${opt("true", t.flagSet, tri(a.flag))}${opt("false", t.flagClear, tri(a.flag))}</select></div>
      <div class="row"><label></label><label><input type="checkbox" id="f-delete" ${a.delete ? "checked" : ""}> ${esc(t.delete)}</label></div>
      <div class="row"><label></label><label><input type="checkbox" id="f-save" ${a.save_attachments ? "checked" : ""}> ${esc(t.saveAttachments)}</label></div>
      <div class="row"><label for="f-save-folder">${esc(t.attachmentsFolder)}</label><input type="text" id="f-save-folder" class="grow" value="${esc(a.attachments_folder || "")}" placeholder="${esc(t.attachmentsHint)}"></div>
      <div class="row"><label></label><label><input type="checkbox" id="f-stop" ${a.stop !== false ? "checked" : ""}> ${esc(t.stop)}</label></div>
      <div class="row"><label></label><label><input type="checkbox" id="f-enabled" ${e.enabled ? "checked" : ""}> ${esc(t.enabled)}</label></div>
      <div class="actionsbar"><button data-action="save" ${this._s.busy ? "disabled" : ""}>${esc(t.save)}</button><button class="secondary" data-action="cancel">${esc(t.cancel)}</button></div>
    </div>`;
  }

  _renderReport() {
    const t = this.t;
    const r = this._s.report;
    if (!r) return "";
    const actionText = (a) => {
      const parts = [];
      if (a.move_to) parts.push(t.aMove.replace("{0}", esc(a.move_to)));
      if (a.delete) parts.push(t.aDelete);
      if (a.mark_seen === true) parts.push(t.aSeen);
      if (a.mark_seen === false) parts.push(t.aUnseen);
      if (a.flag === true) parts.push(t.aFlag);
      if (a.flag === false) parts.push(t.aUnflag);
      if (a.save_attachments) parts.push(t.aSave);
      return parts.join(", ");
    };
    const rows = (r.actions || [])
      .slice(0, 200)
      .map(
        (a) => `<tr><td>${a.uid}</td><td>${esc(a.subject)}</td><td>${esc((a.from || []).join(", "))}</td><td>${esc(a.rule)}</td><td>${actionText(a)}</td></tr>`
      )
      .join("");
    const skipped = (r.skipped || [])
      .map((s) => `<li>${esc(t[s.code] || s.reason)}${s.uid ? ` (UID ${s.uid})` : ""}${s.rule ? ` – ${esc(s.rule)}` : ""}${s.mailbox ? ` – ${esc(s.mailbox)}` : ""}</li>`)
      .join("");
    const errors = (r.errors || []).map((e) => `<li>${esc(e.error)}</li>`).join("");
    return `<div class="card" id="report">
      <h2><span class="grow">${esc(t.report)}${r.dry_run ? ` <span class="chip">${esc(t.dryRun)}</span>` : ""}</span><span class="muted">${r.checked} ${esc(t.checked)} · ${r.matched} ${esc(t.matched)}</span></h2>
      ${errors ? `<div class="error"><strong>${esc(t.errors)}</strong><ul>${errors}</ul></div>` : ""}
      ${skipped ? `<div class="muted"><strong>${esc(t.skipped)}</strong><ul>${skipped}</ul></div>` : ""}
      ${rows ? `<div class="scroll"><table class="stack"><thead><tr><th>${esc(t.uid)}</th><th>${esc(t.subject)}</th><th>${esc(t.from)}</th><th>${esc(t.rule)}</th><th>${esc(t.action)}</th></tr></thead><tbody>${withLabels(rows, [t.uid, t.subject, t.from, t.rule, t.action])}</tbody></table></div>` : ""}
    </div>`;
  }

  _render() {
    const t = this.t;
    const s = this._s;
    const acc = this._account();
    const readOnly = !!acc?.read_only;
    const trig = s.lastRun ? trigLabel(t, s.lastRun.trigger) : "";
    const last = s.lastRun
      ? `${t.lastRun}: ${fmtDateTime(s.lastRun.finished || s.lastRun.started)} (${trig}) · ${s.lastRun.checked} ${t.checked} · ${s.lastRun.matched} ${t.matched}`
      : `${t.lastRun}: ${t.never}`;
    const au = s.automation;
    const m = this._mode(acc, au);
    const extra = [au?.enabled && au.next_run && au.push?.state !== "listening" ? fmt(t.nextAt, fmtClock(au.next_run)) : "", acc?.digest_time ? fmt(t.digestAt, acc.digest_time) : ""].filter(Boolean);
    const allOpen = s.rules.length > 0 && s.rules.every((r) => s.expanded.has(r.id));
    const runItem = (scope, dry, label, hint, disabled) =>
      `<button data-action="run" data-scope="${scope}" data-dry="${dry ? 1 : 0}" ${s.busy || disabled ? "disabled" : ""}><span>${esc(label)}</span><small>${esc(hint)}</small></button>`;
    const runMenu = `<details class="menu" id="run-menu"><summary role="button"><span class="play" aria-hidden="true">▶</span>${esc(t.runMenu)}</summary><div class="menu-list">
        ${runItem("all", true, t.dryRunAll, t.dryRunHint, false)}
        ${runItem("all", false, t.runAll, t.runAllHint, readOnly)}
        ${runItem("new", false, t.runNew, t.runNewHint, readOnly)}
      </div></details>`;
    const body = !s.loaded
      ? `<p class="muted">${esc(t.loading)}</p>`
      : !s.entryId
        ? `<div class="card"><p>${esc(t.noAccount)}</p></div>`
        : `
      ${s.error ? `<div class="error">${esc(s.error)}</div>` : ""}
      ${s.notice ? `<div class="ok">${esc(s.notice)}</div>` : ""}
      ${this._renderAccounts()}
      <div class="card">
        <h2><span class="grow">${esc(t.rules)}${s.accounts.length > 1 && acc ? ` <span class="chip">${esc(acc.label)}</span>` : ""}</span>
          ${s.rules.length ? runMenu : ""}
          <button class="round" data-action="new" ${s.editing ? "disabled" : ""} title="${esc(t.newRule)}" aria-label="${esc(t.newRule)}">+</button></h2>
        <div class="mode ${m.cls}"><span class="ic" aria-hidden="true">${esc(m.ic)}</span><span class="tx"><strong>${esc(m.title)}</strong>${m.sub ? `<span class="muted">${esc(m.sub)}</span>` : ""}</span></div>
        <div class="subbar"><span class="muted">${esc([last, ...extra].join(" · "))}</span><span class="grow"></span>
          ${s.rules.length > 1 ? `<button class="link" data-action="expand-all" data-open="${allOpen ? "0" : "1"}">${esc(allOpen ? t.collapseAll : t.expandAll)}</button>` : ""}</div>
        ${this._renderRules()}
      </div>
      ${this._renderReport()}
      ${this._renderHistory()}`;
    this.shadowRoot.innerHTML = `<style>${STYLE}</style>
      <div class="toolbar"><ha-menu-button></ha-menu-button><img src="${esc(ICON_URL)}" alt=""><span>${esc(t.title)}</span><span class="grow"></span></div>
      <div class="content">${body}</div>`;
    const menu = this.shadowRoot.querySelector("ha-menu-button");
    if (menu && this._hass) {
      menu.hass = this._hass;
      menu.narrow = this._narrow;
    }
    this._bind();
    this._applyFilters("runs");
    this._afterRender();
  }

  // Brings a freshly opened editor or a just-saved rule into view.
  _afterRender() {
    const root = this.shadowRoot;
    const smooth = !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (this._s.scrollToReport) {
      this._s.scrollToReport = false;
      const rep = root.querySelector("#report");
      if (rep) requestAnimationFrame(() => rep.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" }));
    }
    if (this._s.focusEditor) {
      this._s.focusEditor = false;
      const ed = root.querySelector("#editor");
      if (ed) {
        requestAnimationFrame(() => {
          ed.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
          root.querySelector("#f-name")?.focus({ preventScroll: true });
        });
      }
    } else if (this._s.scrollTo) {
      const id = this._s.scrollTo;
      this._s.scrollTo = null;
      const el = [...root.querySelectorAll(".rule[data-rule-id]")].find((n) => n.dataset.ruleId === id);
      if (el) {
        requestAnimationFrame(() => {
          el.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "nearest" });
          el.classList.add("flash");
          setTimeout(() => el.classList.remove("flash"), 1600);
        });
      }
    }
  }

  _bind() {
    const root = this.shadowRoot;
    root.querySelectorAll("[data-action]").forEach((el) => {
      const action = el.dataset.action;
      const handler = {
        new: () => {
          this._s.editing = this._blankRule();
          this._s.focusEditor = true;
          this._render();
        },
        edit: () => {
          const rule = this._s.rules.find((r) => r.id === el.dataset.id);
          this._s.editing = JSON.parse(JSON.stringify(rule));
          this._s.focusEditor = true;
          this._render();
        },
        expand: () => {
          const id = el.dataset.id;
          if (this._s.editing && this._s.editing.id === id) return;
          if (this._s.expanded.has(id)) this._s.expanded.delete(id);
          else this._s.expanded.add(id);
          this._render();
        },
        "expand-all": () => {
          this._s.expanded = el.dataset.open === "1" ? new Set(this._s.rules.map((r) => r.id)) : new Set();
          this._render();
        },
        "filter-toggle": () => {
          const key = el.dataset.table;
          this._s.filterOpen[key] = !this._s.filterOpen[key];
          this.shadowRoot.querySelector(`[data-ftable-wrap="${key}"]`)?.classList.toggle("fopen", this._s.filterOpen[key]);
        },
        "filter-reset": () => {
          const key = el.dataset.table;
          this._s.filters[key] = {};
          this.shadowRoot.querySelectorAll(`[data-ftable="${key}"]`).forEach((f) => (f.value = ""));
          this._applyFilters(key);
        },
        "history-more": () => {
          this._s.historyLimit = Math.min(200, this._s.historyLimit + 50);
          this._call(() => this._loadHistory());
        },
        "history-clear": () => this._clearHistory(),
        delete: () => this._delete(el.dataset.id),
        up: () => this._move(el.dataset.id, -1),
        down: () => this._move(el.dataset.id, 1),
        "add-cond": () => {
          this._readForm();
          this._s.editing.conditions.push({ field: "subject", op: "contains", value: "" });
          this._render();
        },
        "remove-cond": () => {
          this._readForm();
          this._s.editing.conditions.splice(Number(el.dataset.index), 1);
          this._render();
        },
        save: () => this._save(),
        cancel: () => {
          const id = this._s.editing?.id;
          this._s.editing = null;
          if (id) this._s.scrollTo = id;
          this._render();
        },
        run: () => {
          el.closest("details")?.removeAttribute("open");
          this._run(el.dataset.scope, el.dataset.dry === "1");
        },
        test: () => this._run("all", true, [el.dataset.id]),
      }[action];
      if (action === "toggle") {
        el.addEventListener("change", () => this._toggle(el.dataset.id, el.checked));
      } else if (action === "copy") {
        el.addEventListener("change", () => el.value && this._copy(el.dataset.id, el.value));
      } else if (action === "account") {
        el.addEventListener("click", () => this._switchAccount(el.dataset.id));
      } else if (handler) {
        el.addEventListener("click", handler);
      }
    });
    root.querySelectorAll("[data-ftable]").forEach((el) => {
      const update = () => {
        const key = el.dataset.ftable;
        this._s.filters[key] = { ...(this._s.filters[key] || {}), [el.dataset.col]: el.value };
        this._applyFilters(key);
      };
      el.addEventListener(el.tagName === "SELECT" ? "change" : "input", update);
    });
  }
}

if (!customElements.get("friedafetch-mail-panel")) {
  customElements.define("friedafetch-mail-panel", FriedaPostfachPanel);
}
