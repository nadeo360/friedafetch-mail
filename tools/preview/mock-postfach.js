// Example backend for the Frieda Postfach preview: activity, timeline, location, correction, category assistant.
// Example data only (example.* addresses); the answers of the "AI" are scripted.

const SENDERS = [
  ["Gartenmarkt", "news@gartenmarkt.example", "news", ["Herbstpflanzen jetzt 20 % günstiger", "Ihr Wochenangebot", "Nur heute: Gratis-Versand"]],
  ["Möbelhaus", "newsletter@moebel.example", "news", ["Neue Kollektion ist da", "Sofa-Wochen: bis zu 40 %", "Ihr persönlicher Gutschein"]],
  ["Shop Versand", "versand@shop.example", "bill", ["Ihre Bestellung ist unterwegs", "Rechnung zu Ihrer Bestellung", "Zustellung heute zwischen 10 und 14 Uhr"]],
  ["Stadtwerke", "rechnung@stadtwerke.example", "bill", ["Ihre Abschlagsrechnung", "Zählerstand bitte melden"]],
  ["Erika Mustermann", "erika@example.com", "personal", ["Kurze Frage zu Samstag", "Fotos vom Wochenende", "Re: Termin nächste Woche"]],
  ["Anna Beispiel", "anna@example.com", "personal", ["Treffen am Donnerstag?", "Danke dir!"]],
  ["Verein Vorstand", "vorstand@verein.example", "personal", ["Einladung zur Mitgliederversammlung", "Protokoll der Sitzung"]],
  ["CI-Server", "ci@code.example", "ci", ["Run failed: CI - main", "Run failed: nightly", "[bot] Bump dependency"]],
  ["Werbung", "promo@werbung.example", "promo", ["Rabatt-Code nur heute", "Sie haben gewonnen!", "Letzte Chance"]],
  ["Reiseportal", "noreply@reiseportal.example", "bill", ["Ihre Buchungsbestätigung", "Check-in jetzt möglich"]],
  ["Praxis Dr. Beispiel", "praxis@example.com", "held", ["Befund", "Terminerinnerung"]],
];
const CATS = { news: ["Newsletter & Werbung", 1, ["moved:Deleted Messages"], "Werblicher Newsletter."], bill: ["Rechnungen & Belege", 3, [], "Beleg oder Versandinformation."], personal: ["Persönlich & wichtig", 4, ["flagged", "notified"], "Persönliche Nachricht eines Kontakts."] };
const TRASH = "trash";
const pad = (n) => String(n).padStart(2, "0");
const dayOf = (iso) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

function makeRows(volume) {
  const now = Date.now();
  const at = (min) => new Date(now - min * 60000).toISOString();
  const base = [
    { id: "test-frieda", min: 2, name: "Erika Mustermann", from: "erika@example.com", subject: "Test Frieda", type: "personal", importance: 5 },
    { id: "nur-ein-test", min: 5, name: "Anna Beispiel", from: "anna@example.com", subject: "Nur ein Test", type: "none" },
    { id: "befund", min: 40, name: "Praxis Dr. Beispiel", from: "praxis@example.com", subject: "Befund", type: "held" },
    { id: "gartenmarkt-rabatt", min: 40, name: "Gartenmarkt", from: "news@gartenmarkt.example", subject: "🍁 Nur noch 6 Tage: 15% Rabatt mit Code OKT06 bei Gartenmarkt", type: "news" },
    { id: "ci-run-failed", min: 40, name: "CI-Server", from: "ci@code.example", subject: "[nadeo360/friedafetch] Run failed: CI - main", type: "ci" },
    { id: "ratenkredit", min: 90, name: "Kundenservice Bank", from: "service@bank.example", subject: "Ihr Ratenkredit - letzte Rate im November", type: "bill", importance: 4, corrected: "Persönlich & wichtig" },
    { id: "karte-belasten", min: 90, name: "Reiseportal", from: "noreply@reiseportal.example", subject: "Wir werden Ihre Karte bald belasten", type: "bill", importance: 4, confidence: "low" },
    { id: "bestellung-unterwegs", min: 60 * 15, name: "Shop Versand", from: "versand@shop.example", subject: "Ihre Bestellung ist unterwegs", type: "bill", confidence: "low" },
    { id: "moebel-wochenende", min: 60 * 17, name: "Möbelhaus", from: "newsletter@moebel.example", subject: "Wochenend-Angebote: bis zu 40 % auf Sofas", type: "news", local: true },
    { id: "elternabend-antwort", min: 60 * 18, name: "Schule Sekretariat", from: "sekretariat@schule.example", subject: "Re: Elternabend am Donnerstag", type: "personal", importance: 3, reply: "elternabend" },
    { id: "elternabend", min: 60 * 21, name: "Schule Sekretariat", from: "sekretariat@schule.example", subject: "Elternabend am Donnerstag", type: "personal", importance: 4, gone: true },
    { id: "rabatt-code", min: 60 * 23, name: "Werbung", from: "promo@werbung.example", subject: "Rabatt-Code nur heute", type: "promo" },
  ].map((x) => ({ ...x, time: at(x.min) }));
  if (volume) {
    const midnight = new Date(new Date().toDateString()).getTime();
    let k = 0;
    for (const [daysAgo, n, span] of [[0, 100, now - midnight - 120000], [1, 60, 86400000], [2, 30, 86400000]]) {
      for (let j = 0; j < n; j++, k++) {
        const [name, from, type, subjects] = SENDERS[(k * 7 + j) % SENDERS.length];
        const kind = k % 17 === 0 && CATS[type] ? "none" : type;
        const corrected = kind === "bill" && k % 23 === 5 ? "Persönlich & wichtig" : undefined;
        base.push({ id: `vol-${k}`, name, from, type: kind, corrected, confidence: k % 9 === 4 ? "low" : "high", subject: subjects[(k + j) % subjects.length], time: new Date(midnight - daysAgo * 86400000 + Math.round(((j + 0.5) / n) * span)).toISOString() });
      }
    }
  }
  base.sort((a, b) => (a.time < b.time ? 1 : -1));
  const rows = base.map((x, i) => {
    const mid = `<${x.id}@example>`;
    const row = { key: mid, message_id: mid, mailbox: "INBOX", uid: 1000 - i, subject: x.subject, from: x.from, name: x.name, date: x.time, time: x.time, updated: x.time, trigger: "push", rules: [], move_to: null, delete: false, seen: null, flag: null, ai: null, day: dayOf(x.time) };
    if (x.type === "ci") Object.assign(row, { rules: ["CI-Meldungen löschen"], delete: true });
    else if (x.type === "promo") Object.assign(row, { rules: ["Werbung & Newsletter löschen"], delete: true });
    else if (x.type === "held") row.ai = { category: null, importance: null, confidence: null, applied: [], held: ["term"], local: null };
    else if (CATS[x.type]) {
      const [category, importance, applied, reason] = CATS[x.type];
      row.ai = { category: x.corrected || category, importance: x.importance || importance, confidence: x.confidence || "high", applied, held: null, local: !!x.local };
      row.reason = x.local ? "Bekannter Absender: von der KI 3-mal in Folge so eingeordnet." : reason;
      row.rating_id = `r${i}`;
      row.corrected = !!x.corrected;
      row.original = x.corrected ? category : null;
    }
    row.kind = row.rules.length ? "rule" : row.ai?.held ? "held" : row.ai?.category ? "ai" : "none";
    const moved = (row.ai?.applied || []).find((a) => a.startsWith("moved:"));
    row.folder = row.delete ? TRASH : moved ? (moved.slice(6) === "Deleted Messages" ? TRASH : moved.slice(6)) : "INBOX";
    row.selectable = !!row.message_id && row.kind !== "rule";
    row.vip = x.from === "erika@example.com"; // a contact of the group "Familie"
    row.in_reply_to = x.reply ? `<${x.reply}@example>` : null;
    row.thread = x.reply ? `<${x.reply}@example>` : mid; // one conversation: the school's answer to its invitation
    row.unsure = row.kind === "ai" && row.ai.confidence === "low" && !row.corrected;
    row.confirmed = false;
    // read / flagged as the mailbox has it (mailstate.py): the newest ones still unread, flagged personal mails
    // (one was moved to the archive on another device: followed there by its Message-ID)
    row.state = row.folder === "INBOX" ? { seen: i >= 2 && i !== 6, flagged: (row.ai?.applied || []).includes("flagged"), gone: false, mailbox: x.gone ? "Archive" : "INBOX", uid: x.gone ? 9000 + i : row.uid, searched: null, checked: new Date(now).toISOString() } : null;
    return row;
  });
  const sizes = {};
  for (const r of rows) sizes[r.thread] = (sizes[r.thread] || 0) + 1;
  for (const r of rows) r.thread_count = sizes[r.thread];
  return rows;
}

const matches = (row, view, query) => {
  if (view === "unsure" && !row.unsure) return false;
  if (view === "unread" && row.state?.seen !== false) return false;
  if (view === "flagged" && !row.state?.flagged) return false;
  if (view.startsWith("k:") && row.kind !== view.slice(2)) return false;
  if (view.startsWith("f:") && row.folder !== view.slice(2)) return false;
  if (!query) return true;
  const hay = [row.subject, row.from, row.name, row.ai?.category, ...(row.rules || [])].join(" ").toLowerCase();
  return query.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
};

// the scripted "AI" of the category assistant
const TOPICS = [
  { test: /steuer|finanzamt|elster|tax/, name: "Steuer & Finanzamt", description: "Mails vom Steuerberater und vom Finanzamt (auch ELSTER): Steuerbescheide, Rückfragen und Unterlagen für die Steuererklärung. Normale Rechnungen gehören nicht hierher.", overlap: "Rechnungen & Belege",
    sample: [["Ihr Steuerbescheid 2025", "Finanzamt Musterstadt", "Rechnungen & Belege"], ["ELSTER: Bestätigung Ihrer Übermittlung", "elster.example", "Persönlich & wichtig"], ["Rückfrage zu Ihren Belegen", "Kanzlei Beispiel", "Persönlich & wichtig"]] },
  { test: /paket|sendung|zustell|liefer|versand|parcel/, name: "Pakete & Lieferungen", description: "Versand- und Zustellnachrichten von Paketdiensten und Shops: Sendungsverfolgung, Zustellfenster, Abholung in der Filiale. Rechnungen gehören nicht hierher.", overlap: "Rechnungen & Belege",
    sample: [["Ihre Bestellung ist unterwegs", "Shop Versand", "Rechnungen & Belege"], ["Zustellung heute zwischen 10 und 14 Uhr", "Shop Versand", "Rechnungen & Belege"], ["Ihr Paket liegt in der Filiale", "Paketdienst", "Persönlich & wichtig"], ["Sendung zugestellt", "Paketdienst", "Rechnungen & Belege"]] },
  { test: /verein|vorstand|mitglied|club/, name: "Verein", description: "Mails vom Vorstand und von Mitgliedern des Vereins: Einladungen, Protokolle, Termine und Rundschreiben.", overlap: "Persönlich & wichtig",
    sample: [["Einladung zur Mitgliederversammlung", "Verein Vorstand", "Persönlich & wichtig"], ["Protokoll der Sitzung", "Verein Vorstand", "Newsletter & Werbung"]] },
];

function assist(m, mailboxes) {
  const turns = m.conversation || [];
  const said = turns.filter((x) => x.role === "user").map((x) => x.text);
  const last = (said[said.length - 1] || "").toLowerCase();
  const all = said.join(" ").toLowerCase();
  const topic = TOPICS.find((x) => x.test.test(all));
  const folderName = { Archive: "archiv", Junk: "werbung", "Deleted Messages": "papierkorb" };
  let p = m.proposal ? { ...m.proposal } : null;
  const first = !p;
  if (!p) {
    const words = said[0].replace(/[^\p{L}\p{N} ]/gu, " ").trim().split(/\s+/).slice(0, 3).join(" ");
    p = topic ? { name: topic.name, description: topic.description, move_to: null, mark_seen: false, flag: false } : { name: words.charAt(0).toUpperCase() + words.slice(1), description: `Mails zu: ${said[0]}`.slice(0, 300), move_to: null, mark_seen: false, flag: false };
  }
  if (/nicht (mehr )?(verschieb|ins|in den)|nur markier/.test(last)) p.move_to = null;
  else {
    const box = mailboxes.find((b) => b !== "INBOX" && (last.includes(b.toLowerCase()) || (folderName[b] && last.includes(folderName[b]))));
    if (box) p.move_to = box;
  }
  if (/nicht markier/.test(last)) p.flag = false;
  else if (/markier/.test(last) && !/gelesen/.test(last.split("markier")[0].slice(-20))) p.flag = true;
  if (/gelesen/.test(last)) p.mark_seen = !/nicht als gelesen|ungelesen/.test(last);
  if (/lohn|gehalt/.test(last) && !/Lohn/.test(p.description)) p.description = `${p.description} Auch Lohn- und Gehaltsabrechnungen.`.slice(0, 300);
  const what = [p.move_to ? `nach „${p.move_to === "Archive" ? "Archiv" : p.move_to}“ verschieben` : "", p.flag ? "markieren" : "", p.mark_seen ? "als gelesen markieren" : ""].filter(Boolean);
  const reply = first
    ? `Mein Vorschlag: eine Kategorie „${p.name}“. ${what.length ? `Solche Mails würde ich ${what.join(" und ")}.` : "Mit den Mails passiert erst einmal nichts – sie werden nur einsortiert."}${topic?.overlap ? ` „${topic.overlap}“ ist ähnlich; die Beschreibung grenzt die beiden ab.` : ""}`
    : "Angepasst – schau dir den Vorschlag an.";
  return { reply, proposal: p, overlap: topic?.overlap || null, topic };
}

// Runs, ratings and the AI log as the backend keeps them – built from the same mails as the activity.
function derive(data, rows) {
  const ai = data["friedafetch_mail/ai"];
  const account = data["friedafetch_mail/accounts"].accounts[0];
  const rules = data["friedafetch_mail/rules/list"].rules;
  const automation = { enabled: true, interval: 5, enabled_rules: rules.filter((r) => r.enabled).length, push: { state: "listening" }, next_run: null, last_check: { time: new Date().toISOString(), result: "ran", error: null }, idle_reason: null };
  Object.assign(data["friedafetch_mail/rules/list"], { entry_id: "e1", automation, daily_since: "2026-09-01" });
  for (const r of rules) Object.assign(r, { created: r.created || "2026-09-01T10:00:00+02:00", actions: { attachments_folder: null, ...r.actions } });
  // like the backend: hits per local day of the last 30 days, here from the activity's mails
  for (const r of rules) {
    r.daily = {};
    for (const row of rows) if (row.rules.includes(r.name)) r.daily[row.day] = (r.daily[row.day] || 0) + 1;
  }
  data["friedafetch_mail/accounts"].version = "__BUILD__"; // the panel's own build: no "new version" hint
  Object.assign(account, { automation, core_entry_id: "e1", rules_total: rules.length, rules_enabled: rules.filter((r) => r.enabled).length, digest_time: "07:30", last_run: data["friedafetch_mail/rules/list"].last_run });
  // iCloud's folders (the trash is "Deleted Messages"), plus two of the user's own
  data["friedafetch_mail/mailboxes"] = { mailboxes: ["INBOX", "Archive", "Belege", "Company", "Drafts", "Sent Messages", "Junk", "Deleted Messages"] };
  Object.assign(ai.status, { known: true, known_senders: 4, include_body: false, body_chars: 1000, excluded: 2, block_terms: 3, last_run: rows.find((r) => r.kind === "ai")?.time || null, last_error: null });
  ai.ratings = rows
    .filter((r) => r.kind === "ai")
    .map((r) => ({ id: r.rating_id, time: r.time, mailbox: "INBOX", uid: r.uid, message_id: r.message_id, subject: r.subject, from: r.name, from_domain: r.from.split("@")[1], email: r.from, local: !!r.ai.local, date: r.date, mode: "act", category: r.original || r.ai.category, importance: r.ai.importance, confidence: r.ai.confidence, reason: r.reason, applied: r.ai.applied, corrected: r.original ? r.ai.category : null, suspicious: false }))
    .reverse();
  ai.examples = rows.filter((r) => r.corrected).length;
  ai.corrected = ai.examples;
  ai.batch = ai.batch ?? null;
  // the AI log: one transmission per rated mail, one hold per kill-switch mail, the daily overview, one failure
  const sort = rows
    .filter((r) => r.kind === "ai" || r.kind === "held")
    .map((r) => (r.kind === "held"
      ? { time: r.time, kind: "sort", entity: "ai_task.mein_ki_modell", trigger: r.trigger, sent: false, ok: true, held_back: [{ type: "term", value: "Diagnose", where: ["subject"] }], fields: [], chars: 0, sender: r.from, subject: r.subject, message_id: r.message_id }
      : { time: r.time, kind: "sort", entity: "ai_task.mein_ki_modell", trigger: r.trigger, sent: true, ok: true, fields: ["from", "to", "subject", "date"], chars: 1300 + (r.subject.length * 7) % 400, duration: 3.4, sender: r.from, subject: r.subject, message_id: r.message_id }));
  const at = (min) => new Date(Date.now() - min * 60000).toISOString();
  const log = [...sort, { time: at(60 * 20), kind: "digest", entity: "ai_task.mein_ki_modell", trigger: "auto", sent: true, ok: true, fields: ["unread", "events", "birthdays", "rules"], chars: 3120, items: 14 },
    { time: at(60 * 26), kind: "sort", entity: "ai_task.mein_ki_modell", trigger: "push", sent: true, ok: false, error: "Quota exceeded for the Gemini API", fields: ["from", "to", "subject", "date"], chars: 1350, sender: "noreply@reiseportal.example", subject: "Sie haben eine Nachricht von Ihrem Hotel" }]
    .sort((a, b) => (a.time < b.time ? 1 : -1));
  const blank = { error: null, held_back: null, items: null, duration: null, message_id: null, sender: "", subject: "" };
  ai.usage = { ...usageWindows(log), log: log.map((e) => ({ ...blank, ...e })) };
  // known senders, sorted without the AI (nothing was sent for them)
  for (const w of ["today", "week", "month"]) ai.usage[w].local = rows.filter((r) => r.ai?.local).length;
  // the runs: one pass per arrival time (push), plus a merged idle stretch and a pass that failed
  const passes = new Map();
  for (const r of [...rows].reverse()) {
    if (!passes.has(r.time)) passes.set(r.time, []);
    passes.get(r.time).push(r);
  }
  const runs = [...passes.entries()].map(([time, mails]) => {
    const perRule = {};
    for (const m of mails) for (const rule of m.rules) perRule[rule] = (perRule[rule] || 0) + 1;
    const rated = mails.filter((m) => m.kind === "ai");
    return { started: time, finished: time, trigger: "push", scope: "new", mailboxes: ["INBOX"], checked: mails.length, matched: mails.filter((m) => m.rules.length).length, actions: mails.filter((m) => m.rules.length).length, rules: perRule,
      ai: rated.length || mails.some((m) => m.kind === "held") ? { rated: rated.length, applied: rated.filter((m) => m.ai.applied.length).length, held: mails.filter((m) => m.kind === "held").length, errors: [] } : null,
      mails: mails.map((m) => ({ subject: m.subject, from: m.from, name: m.name, mailbox: "INBOX", uid: m.uid, message_id: m.message_id, date: m.date, in_reply_to: m.in_reply_to ?? null, rules: m.rules, move_to: null, delete: m.delete, seen: null, flag: null, ai: m.ai ? { category: m.ai.category, importance: m.ai.importance, confidence: m.ai.confidence, applied: m.ai.applied, held: m.ai.held, local: m.ai.local ?? null } : null })),
      mails_more: 0, errors: [], skipped: 0, saved_files: 0, idle: false, runs: 1 };
  });
  runs.push({ started: at(300), finished: at(120), trigger: "auto", scope: "new", mailboxes: ["INBOX"], checked: 0, matched: 0, rules: {}, ai: null, mails: [], mails_more: 0, errors: [], idle: true, runs: 15 });
  runs.push({ started: at(900), finished: at(900), trigger: "auto", scope: "new", mailboxes: ["INBOX"], checked: 2, matched: 0, rules: {}, ai: null, mails: [], mails_more: 0, errors: ["IMAP operation failed: timeout"], idle: false, runs: 1 });
  for (const r of runs) Object.assign(r, { actions: r.actions ?? r.matched, skipped: r.skipped ?? 0, saved_files: r.saved_files ?? 0 });
  runs.sort((a, b) => (a.started < b.started ? 1 : -1));
  runs.forEach((r, i) => (r.id = runs.length - i));
  const history = data["friedafetch_mail/rules/history"];
  history.runs = runs.slice(0, 200);
  history.total = history.runs.length;
  history.current = history.current ?? null;
  data["friedafetch_mail/insights"] = insights(data, rows);
  // what each parcel was read from (the "Where from?" of the panel)
  const src = (mid, subject, minutes, status, extra = {}) => ({ message_id: mid, subject, date: new Date(Date.now() - minutes * 60000).toISOString(), status, number: null, order: null, eta: null, shop_hint: null, ...extra });
  const sources = {
    k1: [src("<k1a@example>", "Ihre Bestellung ist unterwegs", 60 * 20, "in_transit", { order: "4711-2026" }), src("<k1b@example>", "Ihre Sendung kommt heute", 6, "out_for_delivery", { number: "00340434161094000001", eta: new Date().toISOString().slice(0, 10), shop_hint: "SHOP VERSAND" })],
    k2: [src("<k2a@example>", "Ihre Bestellung ist unterwegs", 60 * 24, "in_transit", { number: "H1001234567890123456" })],
    k3: [src("<k3a@example>", "Ihr Paket wurde zugestellt", 36, "delivered", { number: "01234567890123" })],
    k4: [src("<k4a@example>", "Ihre Bestellung ist unterwegs", 48, "in_transit", { order: "12-34567-89012" })],
  };
  const senders = { k1: ["dhl.de", "shop.example"], k2: ["myhermes.de"], k3: ["dpd.de"], k4: ["ebay.com"], k5: ["amazon.de"], k6: ["huellen.example"], k7: ["tee.example"] };
  // what is in them: from the shipping mail (k1, k4), or as ordered (k5)
  const item = (name, qty = 1, price = null) => ({ name, qty, price });
  const contents = {
    k1: [[item("Sofa-Kissen Leinen, Salbeigrün", 2, "39,90 €"), item("Kuscheldecke Waffelpiqué 150 × 200 cm", 1, "49,00 €")], 0, "parcel"],
    k2: [[item("Esstisch Eiche massiv 180 cm", 1, "899,00 €")], 0, "parcel"],
    k3: [[], 0, null],
    k4: [[item("Schweberegal Wandregal Esche Whiskey")], 2, "parcel"],
    k5: [[item("Kabelmarkierungen 1,5 mm², 300 Stück", 1, "9.99 EUR"), item("Kabelkennzeichnung 0-9 (100Pcs 2.5mm²)", 2, "6.53 EUR")], 0, "order"],
  };
  sources.k6 = [src("<k6a@example>", "Ihre Bestellung ist auf dem Weg", 60 * 24 * 6, "in_transit", { number: "LX700399511DE", order: "1195235" })];
  sources.k7 = [src("<k7a@example>", "Ihr Tee ist unterwegs", 60 * 24 * 5, "in_transit", { number: "LX700399522DE", order: "88231" })];
  contents.k6 = [[item("Slice Case – Ink Black", 1, "29,95 €")], 0, "order"];
  contents.k7 = [[item("Grüner Tee Sencha, 250 g", 2, "12,50 €")], 0, "parcel"];
  sources.k5 = [src("<k5a@example>", "Bestellt: „Kabelmarkierungen…“ und 1 weiterer Artikel", 60 * 7, "ordered", { order: "304-1111111-2222222" })];
  for (const parcel of data["friedafetch_mail/insights"].parcels) {
    const [items, more, from] = contents[parcel.id] || [[], 0, null];
    const own = (sources[parcel.id] || []).map((x) => ({ ...x, items: x.status === "ordered" || x === sources[parcel.id].at(-1) ? items.map((i) => i.name) : [] }));
    Object.assign(parcel, { sources: own, senders: senders[parcel.id], items, items_more: more, items_from: from, quiet: parcel.quiet ?? null, arrived: parcel.arrived ?? null });
  }
}

// For you: the week, dates the AI read, sent mail without an answer, rule suggestions, newsletters
function insights(data, rows) {
  const ai = data["friedafetch_mail/ai"];
  const day = (n, time) => {
    const d = new Date(Date.now() + n * 86400000);
    const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    return time ? `${date}T${time}:00+02:00` : date;
  };
  const ago = (days) => new Date(Date.now() - days * 86400000).toISOString();
  const rated = ai.ratings.length;
  const corrected = ai.ratings.filter((r) => r.corrected).length;
  data["friedafetch_mail/ai"].status.events = true;
  const mails = rows.length;
  const accuracy = rated ? Math.round((100 * (rated - corrected)) / rated) : null;
  const byRules = rows.filter((r) => r.kind === "rule").length;
  const trend = [0.7, 0.9, 0.8, 1.1, 0.95, 1.2, 0.85].map((f, i) => ({ week: `2026-W${36 + i}`, mails: Math.round(mails * f), rules: Math.round(byRules * f), accuracy: accuracy == null ? null : Math.min(100, accuracy - 9 + i) }));
  trend.push({ week: "now", mails, rules: byRules, accuracy });
  return {
    undo: null,
    week: { from: ago(7), to: new Date().toISOString(), mails: rows.length, mails_before: Math.max(1, rows.length - 3), by_rules: rows.filter((r) => r.kind === "rule").length, by_ai: rows.filter((r) => r.kind === "ai").length, rated, corrected, accuracy: rated ? Math.round((100 * (rated - corrected)) / rated) : null, unread: rows.filter((r) => r.state?.seen === false).length, top_senders: [{ sender: "news@gartenmarkt.example", count: 3 }], waiting: 2, proposals: 2, never_opened: 1, parcels: 2, trend },
    parcels: [
      { id: "k1", carrier: "DHL", number: "00340434161094000001", url: "https://www.dhl.de/de/privatkunden/pakete-empfangen/verfolgen.html?piececode=00340434161094000001", shop: "Shop Versand", order: "4711-2026", status: "out_for_delivery", eta: day(0), window: "10:00–14:00", subject: "Ihre Sendung kommt heute", updated: ago(0.1), link: "carrier" },
      { id: "k2", carrier: "Hermes", number: "H1001234567890123456", url: "https://www.myhermes.de/empfangen/sendungsverfolgung/sendungsinformation/#H1001234567890123456", shop: "Möbelhaus", order: null, status: "in_transit", eta: day(3), window: null, subject: "Ihre Bestellung ist unterwegs", updated: ago(1), link: "carrier" },
      { id: "k3", carrier: "DPD", number: "01234567890123", url: "https://tracking.dpd.de/status/de_DE/parcel/01234567890123", shop: "Gartenmarkt", order: null, status: "delivered", eta: null, window: null, subject: "Ihr Paket wurde zugestellt", updated: ago(0.6), link: "carrier" },
      { id: "k4", carrier: null, number: null, url: "https://www.ebay.de/mye/myebay/purchase", shop: "eBay", order: "12-34567-89012", status: "in_transit", eta: day(2), window: null, subject: "Ihre Bestellung ist unterwegs", updated: ago(0.8), link: "shop" },
      // only ordered so far: the order's items, the parcel comes later
      { id: "k5", carrier: null, number: null, url: "https://www.amazon.de/gp/your-account/order-details?orderID=304-1111111-2222222", shop: "Amazon.de", order: "304-1111111-2222222", status: "ordered", eta: day(4), window: null, subject: "Bestellt: „Kabelmarkierungen…“ und 1 weiterer Artikel", updated: ago(0.3), link: "shop" },
      // no news for six days: the shop writes when a parcel leaves, never when it arrives – Frieda asks
      { id: "k6", carrier: "DHL", number: "LX700399511DE", url: "https://www.dhl.de/de/privatkunden/pakete-empfangen/verfolgen.html?piececode=LX700399511DE", shop: "Hüllenladen", order: "1195235", status: "in_transit", eta: null, window: null, subject: "Ihre Bestellung ist auf dem Weg", updated: ago(6), link: "carrier", quiet: 6 },
      // from a shop the user confirmed once: taken as delivered
      { id: "k7", carrier: "DHL", number: "LX700399522DE", url: "https://www.dhl.de/de/privatkunden/pakete-empfangen/verfolgen.html?piececode=LX700399522DE", shop: "Teeversand", order: "88231", status: "delivered", eta: null, window: null, subject: "Ihr Tee ist unterwegs", updated: ago(5), link: "carrier", arrived: "assumed" },
    ],
    proposals: [
      { id: "p1", status: "open", created: ago(0.1), rating_id: "r0", message_id: "<test-frieda@example>", subject: "Kurze Frage zu Samstag", from: "Erika Mustermann", kind: "appointment", title: "Grillen bei Erika", start: day(3, "18:00"), end: day(3, "22:00"), all_day: false, location: "Gartenweg 5" },
      { id: "p2", status: "open", created: ago(0.5), rating_id: "r5", message_id: "<ratenkredit@example>", subject: "Ihr Ratenkredit - letzte Rate im November", from: "Kundenservice Bank", kind: "deadline", title: "Letzte Rate überweisen", start: day(12), end: null, all_day: true, location: null },
    ],
    followups: [
      { id: "f1", message_id: "<angebot@example>", subject: "Angebot für die Küche", to: [{ name: "Tischlerei Holz", email: "info@tischlerei.example" }], more: 0, sent: ago(6), days: 6 },
      { id: "f2", message_id: "<termin@example>", subject: "Termin nächste Woche?", to: [{ name: "Anna Beispiel", email: "anna@example.com" }], more: 1, sent: ago(4), days: 4 },
    ],
    followups_checked: ago(0.05),
    followup_days: 3,
    suggestions: [
      { id: "s1", sender: "versand@shop.example", name: "Shop Versand", folder: "Archive", count: 5, total: 5, subjects: ["Ihre Bestellung ist unterwegs", "Zustellung heute zwischen 10 und 14 Uhr", "Rechnung zu Ihrer Bestellung"] },
    ],
    subscriptions: [
      { id: "n1", site: "moebel.example", sender: "newsletter@moebel.example", senders: ["newsletter@moebel.example", "info@moebel.example"], name: "Möbelhaus", count: 9, unread: 9, last: ago(1), mailbox: "INBOX", uid: 911, subject: "Sofa-Wochen", never_opened: true, unsubscribed: null, after: 0 },
      { id: "n2", site: "gartenmarkt.example", sender: "news@gartenmarkt.example", senders: ["news@gartenmarkt.example"], name: "Gartenmarkt", count: 6, unread: 2, last: ago(0.2), mailbox: "INBOX", uid: 912, subject: "Ihr Wochenangebot", never_opened: false, unsubscribed: null, after: 0 },
      // unsubscribed: one is quiet now, one keeps sending
      { id: "n3", site: "reiseportal.example", sender: "deals@reiseportal.example", senders: ["deals@reiseportal.example"], name: "Reiseportal", count: 3, unread: 3, last: ago(9), mailbox: "INBOX", uid: 913, subject: "Last-Minute", never_opened: true, unsubscribed: ago(8), after: 0 },
      { id: "n4", site: "schuhe.example", sender: "news@schuhe.example", senders: ["news@schuhe.example"], name: "Schuhhaus", count: 5, unread: 4, last: ago(0.5), mailbox: "INBOX", uid: 914, subject: "Neue Kollektion", never_opened: false, unsubscribed: ago(12), after: 2 },
    ],
    subscriptions_checked: ago(0.05),
    parcel_ignored: [],
    parcel_silent: ["tee.example"],
    vip: { groups: ["Familie"], senders: 1, known: 4, notify: true },
    weekly_day: "sun",
    events_calendar: null,
    dismissed: {},
    error: null,
  };
}

function usageWindows(log) {
  const win = (days) => {
    const since = Date.now() - days * 86400000;
    const w = { calls: 0, chars: 0, body: 0, held_back: 0, errors: 0, sort: 0, digest: 0, assist: 0, local: 0, entities: {} };
    for (const e of log) {
      if (new Date(e.time).getTime() < since) continue;
      if (!e.sent) { w.held_back += 1; continue; }
      w.calls += 1;
      w.chars += e.chars || 0;
      w[e.kind] = (w[e.kind] || 0) + 1;
      if ((e.fields || []).includes("body")) w.body += 1;
      if (e.ok === false) w.errors += 1;
      w.entities[e.entity] = (w.entities[e.entity] || 0) + 1;
    }
    return w;
  };
  return { today: win(1), week: win(7), month: win(30) };
}

// Hostile text where a mail's content shows up (?xss=1): the panel must show it as text, never run or render it.
const XSS = [`<img src=x onerror="window.__xss=1" data-xss>`, `"><svg onload="window.__xss=1" data-xss>`, `<script>window.__xss=1</script>`];
function poison(data, rows) {
  rows.forEach((r, i) => {
    r.subject = `${XSS[i % 3]} ${r.subject}`;
    r.name = `${XSS[(i + 1) % 3]}${r.name}`;
  });
  const fy = data["friedafetch_mail/insights"];
  for (const p of fy.parcels) Object.assign(p, { shop: `${XSS[0]}${p.shop || ""}`, subject: XSS[1] });
  for (const p of fy.proposals) Object.assign(p, { title: `${XSS[2]}${p.title}`, from: XSS[0], subject: XSS[1] });
  for (const f of fy.followups) Object.assign(f, { subject: XSS[0], to: [{ name: XSS[1], email: "x@example.com" }] });
  for (const n of fy.subscriptions) n.name = XSS[2];
  for (const g of fy.suggestions) Object.assign(g, { name: XSS[0], subjects: [XSS[1]] });
}

export function install({ data, q }) {
  const rows = makeRows(!!q.get("volume"));
  window.__rows = rows;
  derive(data, rows);
  if (q.get("xss")) poison(data, rows);
  const ai = data["friedafetch_mail/ai"];
  const live = (topic) => window.__live?.["friedafetch_mail/subscribe"]?.({ entry_id: "e1", topic });
  const rulesList = data["friedafetch_mail/rules/list"];
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const find = (mid) => rows.find((r) => r.message_id === mid);

  let deletedRule = null; // the last deleted rule, for "Undo"
  let fyUndo = null; // the last dismissal or parcel correction, for "Undo"
  // undo steps by token, as the backend keeps them (each runs once; categories only while unchanged)
  const undoBook = new Map();
  const undoAdd = (kind, data) => {
    const token = `undo-${undoBook.size + 1}-${Date.now().toString(36)}`;
    undoBook.set(token, { kind, data });
    return token;
  };
  return async function handle(m) {
    if (m.type === "friedafetch_mail/activity/list") {
      const view = m.view || "all";
      const query = (m.query || "").trim();
      const kinds = { ai: 0, rule: 0, held: 0, none: 0 };
      const folders = {};
      for (const r of rows) {
        kinds[r.kind] += 1;
        folders[r.folder] = (folders[r.folder] || 0) + 1;
      }
      const mails = rows.filter((r) => matches(r, view, query));
      let hits = mails;
      if (m.threads) {
        const seen = new Set();
        hits = mails.filter((r) => !seen.has(r.thread) && seen.add(r.thread)); // one line per conversation
      }
      const days = []; // like the backend: days and what can be picked count mails, also per conversation
      for (const r of mails) {
        let d = days.find((x) => x.day === r.day);
        if (!d) days.push((d = { day: r.day, total: 0, selectable: 0 }));
        d.total += 1;
        d.selectable += r.selectable ? 1 : 0;
      }
      const offset = m.offset || 0;
      const unsure = rows.filter((r) => r.unsure).length;
      const unread = rows.filter((r) => r.state?.seen === false).length;
      const flagged = rows.filter((r) => r.state?.flagged).length;
      return structuredClone({ items: hits.slice(offset, offset + (m.limit || 50)), total: hits.length, selectable: mails.filter((r) => r.selectable).length, days, counts: { all: rows.length, unsure, unread, flagged, kinds, folders } });
    }
    if (m.type === "friedafetch_mail/mail/thread") {
      const me = find(m.message_id);
      const items = rows
        .filter((r) => me && r.thread === me.thread)
        .map((r) => ({ key: r.key, message_id: r.message_id, from: r.from, name: r.name, subject: r.subject, date: r.date, mine: false, seen: r.state?.seen ?? null }));
      if (items.length > 1) {
        const first = items[items.length - 1];
        const at = new Date(new Date(first.date).getTime() + 3600000).toISOString();
        items.push({ key: null, message_id: "<antwort@example>", from: first.from, name: first.name, subject: `Re: ${first.subject}`, date: at, mine: true, seen: true });
      }
      return { items: items.sort((a, b) => (a.date < b.date ? -1 : 1)) };
    }
    if (m.type === "friedafetch_mail/activity/select") {
      return { messages: rows.filter((r) => matches(r, m.view || "all", (m.query || "").trim()) && r.selectable && (!m.day || r.day === m.day)).map((r) => ({ key: r.key, message_id: r.message_id, mailbox: r.mailbox })) };
    }
    if (m.type === "friedafetch_mail/activity/clear") {
      rows.length = 0;
      return { cleared: true };
    }
    if (m.type === "friedafetch_mail/mail/locate") {
      await wait(Number(q.get("locslow") || 700));
      const i = rows.findIndex((r) => r.message_id === m.message_id);
      const r = rows[i];
      const checked = new Date().toISOString();
      if (!r || i % 13 === 7) return { found: false, mailbox: null, uid: null, trash: false, checked };
      const place = i % 6 === 5 ? (r.folder === "Archive" ? "INBOX" : "Archive") : r.folder;
      const uid = place === "INBOX" ? r.uid : 9000 + i;
      return place === TRASH ? { found: true, mailbox: "Deleted Messages", uid, trash: true, checked } : { found: true, mailbox: place, uid, trash: false, checked };
    }
    if (m.type === "friedafetch_mail/mail/timeline") {
      await wait(Number(q.get("tlslow") || 50));
      const r = find(m.message_id) || rows.find((x) => x.subject === m.subject);
      if (!r) return { subject: m.subject, sender: m.sender, found: false, events: [] };
      const t0 = new Date(new Date(r.time).getTime() - 40000);
      const at = (s) => new Date(t0.getTime() + s * 1000).toISOString();
      const ev = [{ kind: "received", time: at(0), mailbox: "INBOX" }, { kind: "checked", time: at(2), trigger: r.trigger, rules: r.rules, delete: r.delete, move_to: r.move_to, count: 1 }];
      if (r.kind === "held") ev.push({ kind: "ai_held", time: at(3), reasons: [{ type: "term", value: "Diagnose", where: ["subject"] }] });
      if (r.kind === "ai") {
        ev.push({ kind: "ai_sent", time: at(3), entity: "ai_task.mein_ki_modell", ok: true, chars: 1480, duration: 3.4, fields: ["from", "to", "subject", "date"] });
        ev.push({ kind: "rated", time: at(7), category: r.original || r.ai.category, importance: r.ai.importance, confidence: r.ai.confidence, reason: r.reason || "" });
        if (r.ai.applied.length) ev.push({ kind: "ai_applied", time: at(8), applied: r.ai.applied });
        if (r.corrected) ev.push({ kind: "corrected", time: at(3600), before: r.original, after: r.ai.category });
        for (const x of r.acted || []) ev.push({ kind: "acted", time: x.time, action: x.action, mailbox: x.mailbox });
        if (r.rerated) ev.push({ kind: "rated", again: true, time: r.rerated, category: r.ai.category, importance: r.ai.importance, confidence: r.ai.confidence, reason: r.reason || "" });
      }
      return structuredClone({ message_id: r.message_id, subject: r.subject, sender: r.from, date: r.date, mailbox: "INBOX", location: r.folder === "INBOX" ? null : r.folder, category: r.ai?.category || null, importance: r.ai?.importance || null, confidence: r.ai?.confidence || null, rating_id: r.rating_id || null, corrected: !!r.corrected, held: r.kind === "held", found: true, events: ev });
    }
    if (m.type === "friedafetch_mail/ai/correct") {
      const r = rows.find((x) => x.rating_id === m.rating_id);
      if (r) {
        if (!r.original) r.original = r.ai.category;
        r.ai.category = m.category;
        r.corrected = m.category !== r.original;
        r.confirmed = m.by === "confirm"; // "Right" in the quick check: no longer unsure
        r.unsure = r.ai.confidence === "low" && !r.corrected && !r.confirmed;
        ai.corrected = rows.filter((x) => x.corrected).length;
      }
      return { rating: { id: m.rating_id, corrected: m.category } };
    }
    if (m.type === "friedafetch_mail/ai/categories") {
      const before = structuredClone(ai.categories);
      ai.categories = m.categories.map((c, i) => ({ id: c.id || `n${i}`, ...c }));
      return { ...structuredClone(ai), undo_token: undoAdd("cats", { before, after: JSON.stringify(ai.categories) }) };
    }
    if (m.type === "friedafetch_mail/undo") {
      const step = undoBook.get(m.token);
      undoBook.delete(m.token);
      if (!step) throw new Error("This can no longer be undone");
      if (step.kind === "mail") {
        const res = await handle({ type: "friedafetch_mail/mail/act", keys: step.data.keys, action: step.data.action, to: step.data.to });
        return { kind: "mail", done: res.done, failed: res.failed };
      }
      if (JSON.stringify(ai.categories) !== step.data.after) throw new Error("This can no longer be undone: the categories have changed since");
      ai.categories = step.data.before;
      return { kind: "cats", ...structuredClone(ai) };
    }
    if (m.type === "friedafetch_mail/ai/assist") {
      await wait(Number(q.get("aislow") || 900));
      const res = assist(m, data["friedafetch_mail/mailboxes"].mailboxes);
      ai.status.used_this_hour += 1;
      ai.usage.log.unshift({ time: new Date().toISOString(), kind: "assist", entity: "ai_task.mein_ki_modell", trigger: "panel", sent: true, ok: true, fields: ["conversation", "categories", "folders"], chars: 1210, duration: 2.1, sender: "", subject: "" });
      window.__assistTopic = res.topic;
      return { reply: res.reply, proposal: res.proposal, overlap: res.overlap };
    }
    if (m.type === "friedafetch_mail/ai/assist/test") {
      await wait(Number(q.get("aislow") || 1500));
      const name = m.proposal.name;
      const sample = (window.__assistTopic?.sample || []).slice(0, (m.proposal.description || "").toLowerCase().includes("lohn") ? 3 : 2);
      const results = [...sample.map(([subject, from, before]) => ({ subject, from, before, after: name })), ...Array.from({ length: 20 - sample.length }, (_, k) => ({ subject: `Mail ${k}`, from: "x", before: "Newsletter & Werbung", after: "Newsletter & Werbung" }))]
        .map((r) => ({ ...r, first: r.before, expected: null, confidence: "high" }));
      ai.status.used_this_hour += 20;
      return { name, tested: 20, held: 0, missing: 0, limit: false, errors: [], results, hits: sample.length };
    }
    if (m.type === "friedafetch_mail/mail/act") {
      // read / flag / archive / back / trash, like the real backend (moved mails are found again in the next look)
      await wait(Number(q.get("actslow") || 250));
      const common = { archive: "Archive", inbox: "INBOX", trash: "Deleted Messages" }[m.action] || null;
      const opposite = { seen: "unseen", unseen: "seen", flag: "unflag", unflag: "flag" }[m.action];
      const undo = {};
      let done = 0;
      for (const key of m.keys) {
        const r = rows.find((x) => x.key === key);
        if (!r) continue;
        r.state = r.state || { seen: true, flagged: false, gone: false, mailbox: "INBOX", uid: r.uid, searched: null, checked: new Date().toISOString() };
        const target = m.action === "return" ? m.to?.[key] : common;
        const from = r.state.mailbox || "INBOX";
        const already = (m.action === "seen" || m.action === "unseen") ? r.state.seen === (m.action === "seen") : (m.action === "flag" || m.action === "unflag") ? !!r.state.flagged === (m.action === "flag") : from === target;
        if (m.action === "seen" || m.action === "unseen") r.state.seen = m.action === "seen";
        if (m.action === "flag" || m.action === "unflag") r.state.flagged = m.action === "flag";
        if (target) Object.assign(r.state, { mailbox: target, uid: 9500 + done });
        (r.acted ||= []).push({ time: new Date().toISOString(), action: m.action, mailbox: target || null });
        done += 1;
        if (!already) undo[key] = from;
      }
      live("activity");
      const keys = Object.keys(undo);
      const back = keys.length ? (opposite ? { action: opposite, keys } : { action: "return", keys, to: undo }) : null;
      return { action: m.action, done, failed: [], skipped: 0, undo: back, ...(back ? { undo_token: undoAdd("mail", back) } : {}) };
    }
    if (m.type === "friedafetch_mail/mail/text") {
      await wait(Number(q.get("textslow") || 300));
      const r = find(m.message_id);
      if (!r) return { found: false };
      // with a link, a signature and the quoted history, as replies have them (folded away in the panel)
      const text = `Hallo,\n\nhier ist der Text zu „${r.subject}“ – Beispieltext der Vorschau. Mehr unter https://www.example.com/termine/2026?ref=mail.\n\nViele Grüße\n${r.name}\n-- \n${r.name} · Beispielweg 1 · 12345 Musterstadt\n\nAm 20.10.2026 um 09:12 schrieb Erika Mustermann <erika@example.com>:\n> Hallo, kurze Frage vorab.\n> Passt dir Samstag?${q.get("xss") ? `\nhttps://evil.example/"><img src=x onerror="window.__xss=1" data-xss> javascript:window.__xss=1 https://ok.example/a"onmouseover="window.__xss=1` : ""}`;
      return { found: true, mailbox: r.state?.mailbox || "INBOX", text, truncated: false, attachments: r.kind === "ai" && r.ai.category.startsWith("Rechnungen") ? ["Rechnung.pdf"] : [], suspicious: false };
    }
    if (m.type === "friedafetch_mail/ai/apply") {
      await wait(400);
      const r = rows.find((x) => x.rating_id === m.rating_id);
      return { rating: { id: m.rating_id, corrected: r?.ai?.category || null, applied: [] } };
    }
    if (m.type === "friedafetch_mail/ai/check") {
      await wait(Number(q.get("aislow") || 1500));
      const corrected = rows.filter((r) => r.corrected).slice(0, 20);
      // the scripted AI: every third one still lands in the category it picked first
      const results = corrected.map((r, i) => ({ subject: r.subject, from: r.name, before: r.ai.category, first: r.original, expected: r.ai.category, after: i % 3 === 2 ? r.original : r.ai.category, confidence: i % 3 === 2 ? "low" : "high" }));
      ai.status.used_this_hour += results.length;
      return { entity: m.entity || ai.status.entity, corrected: corrected.length, tested: results.length, held: 0, missing: 0, limit: false, errors: [], results, hits: results.filter((x) => x.after === x.expected).length };
    }
    if (m.type === "friedafetch_mail/ai/rerate") {
      // works through the messages, one per tick, and reports live – like the background task
      const keys = [...(m.rating_ids || []).map((id) => rows.find((r) => r.rating_id === id)?.message_id), ...(m.messages || []).map((x) => x.message_id)].filter(Boolean);
      ai.batch = { state: "running", cancelling: false, total: keys.length, done: 0, rated: 0, held: 0, missing: 0, applied: 0, errors: [], apply: !!m.apply, started: new Date().toISOString(), finished: null, resume_at: null };
      const waitAfter = Number(q.get("waitafter") || 0);
      let waited = 0;
      const tick = () => {
        const b = ai.batch;
        if (b.state === "waiting") {
          if (++waited < 3) return setTimeout(tick, Number(q.get("tick") || 1200));
          Object.assign(b, { state: "running", resume_at: null });
        }
        if (b.state !== "running") return;
        if (waitAfter && b.done === waitAfter && !waited) {
          const next = new Date();
          next.setHours(next.getHours() + 1, 0, 0, 0);
          Object.assign(b, { state: "waiting", resume_at: next.toISOString() });
          live("ai");
          return setTimeout(tick, Number(q.get("tick") || 1200));
        }
        const r = find(keys[b.done]);
        if (r?.kind === "held") b.held += 1;
        else if (r) {
          r.rerated = new Date().toISOString();
          b.rated += 1;
          if (m.apply && r.ai?.applied?.length) b.applied += 1;
        } else b.missing += 1;
        b.done += 1;
        if (b.done >= b.total) {
          b.state = "done";
          b.finished = new Date().toISOString();
          live("activity");
        }
        live("ai");
        if (b.state === "running") setTimeout(tick, Number(q.get("tick") || 1200));
      };
      setTimeout(tick, Number(q.get("tick") || 1200));
      return structuredClone(ai);
    }
    if (m.type === "friedafetch_mail/ai/rerate/cancel") {
      if (["running", "waiting"].includes(ai.batch?.state)) Object.assign(ai.batch, { state: "cancelled", finished: new Date().toISOString(), resume_at: null });
      return structuredClone(ai);
    }
    if (m.type === "friedafetch_mail/ai/run") {
      await wait(800);
      ai.status.used_this_hour += 1;
      return structuredClone({ report: { trigger: "manual", rated: 1, applied: 0, skipped: 0, errors: [], items: [] }, ...ai });
    }
    if (m.type === "friedafetch_mail/ai/clear") {
      ai.ratings = [];
      return structuredClone(ai);
    }
    if (m.type === "friedafetch_mail/ai/usage/clear") {
      ai.usage = { ...usageWindows([]), log: [] };
      return structuredClone(ai);
    }
    if (m.type === "friedafetch_mail/rules/create") {
      const rule = { ...m.rule, id: `r${Date.now().toString(36)}`, hits: 0, created: new Date().toISOString() };
      rulesList.rules.push(rule);
      return { rule };
    }
    if (m.type === "friedafetch_mail/rules/update") {
      const rule = rulesList.rules.find((r) => r.id === m.rule_id);
      const { position, ...changes } = m.changes;
      Object.assign(rule, changes);
      if (position != null) {
        // like the backend: the rule moves to its new place
        rulesList.rules = rulesList.rules.filter((r) => r !== rule);
        rulesList.rules.splice(Math.max(0, Math.min(rulesList.rules.length, position)), 0, rule);
      }
      return { rule };
    }
    if (m.type === "friedafetch_mail/rules/delete") {
      const at = rulesList.rules.findIndex((r) => r.id === m.rule_id);
      if (at >= 0) deletedRule = [rulesList.rules[at], at];
      rulesList.rules = rulesList.rules.filter((r) => r.id !== m.rule_id);
      return { deleted: true };
    }
    if (m.type === "friedafetch_mail/sender") {
      // like the backend: the sender's mails of the activity, what rules and the AI did, its newsletter and parcels
      const mine = rows.filter((r) => String(r.from).toLowerCase() === m.email.toLowerCase());
      const site = m.email.split("@")[1].split(".").slice(-2).join(".");
      const known = mine.filter((r) => r.state?.seen != null);
      const categories = {};
      const rules = {};
      for (const r of mine) {
        if (r.kind === "ai" && r.ai?.category) categories[r.ai.category] = (categories[r.ai.category] || 0) + 1;
        for (const n of r.rules || []) rules[n] = (rules[n] || 0) + 1;
      }
      const fy = data["friedafetch_mail/insights"];
      const sub = (fy.subscriptions || []).find((x) => x.site === site);
      return structuredClone({
        email: m.email.toLowerCase(), site, name: mine.find((r) => r.name)?.name || null, count: mine.length,
        unread: known.filter((r) => r.state.seen === false).length, read_share: known.length ? Math.round((100 * known.filter((r) => r.state.seen).length) / known.length) : null,
        flagged: mine.filter((r) => r.state?.flagged).length, kinds: { ai: mine.filter((r) => r.kind === "ai").length, rule: mine.filter((r) => r.kind === "rule").length, held: mine.filter((r) => r.kind === "held").length, none: mine.filter((r) => r.kind === "none").length },
        categories: Object.entries(categories).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })), corrected: mine.filter((r) => r.corrected).length, rules: Object.entries(rules).map(([name, count]) => ({ name, count })), vip: m.email.toLowerCase() === "erika@example.com", first: mine.at(-1)?.time || null,
        last: mine.slice(0, 5).map((r) => ({ key: r.key, subject: r.subject, time: r.time, kind: r.kind, folder: r.folder })),
        subscription: sub ? { id: sub.id, sender: sub.sender, name: sub.name, count: sub.count, unread: sub.unread, unsubscribed: sub.unsubscribed, after: sub.after } : null,
        parcels: (fy.parcels || []).filter((p) => (p.senders || []).some((d) => d.endsWith(site))).map((p) => ({ id: p.id, shop: p.shop, status: p.status, eta: p.eta, items: (p.items || []).slice(0, 3).map((i) => i.name) })),
      });
    }
    if (m.type === "friedafetch_mail/rules/preview") {
      // like the backend: sender and subject of the newest mails (To/Cc are not known to the activity)
      const test = (c, r) => {
        const v = String(c.value || "").trim().toLowerCase();
        const hay = { subject: [r.subject || ""], from: [`${r.name || ""} <${r.from || ""}>`], to: [], cc: [], any: [r.subject || "", `${r.name || ""} <${r.from || ""}>`] }[c.field] || [];
        return hay.some((h) => {
          const x = h.toLowerCase();
          if (c.op === "contains") return x.includes(v);
          if (c.op === "equals") return x === v;
          if (c.op === "starts_with") return x.startsWith(v);
          if (c.op === "ends_with") return x.endsWith(v);
          if (c.op === "domain") return (x.match(/@([^>\s]+)/)?.[1] || "") === v.replace(/^@/, "") || (x.match(/@([^>\s]+)/)?.[1] || "").endsWith(`.${v.replace(/^@/, "")}`);
          if (c.op === "regex") {
            try {
              return new RegExp(c.value, "i").test(h);
            } catch (err) {
              throw new Error("Invalid regular expression");
            }
          }
          return false;
        });
      };
      const lines = rows.slice(0, 300);
      const hits = lines.filter((r) => (m.match === "any" ? m.conditions.some((c) => test(c, r)) : m.conditions.every((c) => test(c, r))));
      return { checked: lines.length, total: hits.length, unknown: m.conditions.some((c) => c.field === "to" || c.field === "cc"), matches: hits.slice(0, 8).map((r) => ({ key: r.key, subject: r.subject, from: r.from, name: r.name, time: r.time })) };
    }
    if (m.type === "friedafetch_mail/rules/restore") {
      if (!deletedRule || deletedRule[0].id !== m.rule_id) throw new Error("This rule can no longer be restored");
      rulesList.rules.splice(deletedRule[1], 0, deletedRule[0]);
      const rule = deletedRule[0];
      deletedRule = null;
      return { rule };
    }
    if (m.type === "friedafetch_mail/rules/history/clear") {
      data["friedafetch_mail/rules/history"].runs = [];
      return { cleared: true };
    }
    const fy = data["friedafetch_mail/insights"];
    const UNDOABLE = ["parcels", "proposals", "followups", "suggestions", "subscriptions", "dismissed", "parcel_ignored", "parcel_silent", "week"];
    const remember = (before) => {
      fy.undo = `u${Date.now().toString(36)}`;
      fyUndo = { token: fy.undo, before };
    };
    const snapshot = () => structuredClone(Object.fromEntries(UNDOABLE.map((k) => [k, fy[k]])));
    if (m.type === "friedafetch_mail/insights/undo") {
      if (!fyUndo || fyUndo.token !== m.token) throw new Error("This can no longer be undone");
      Object.assign(fy, fyUndo.before);
      fy.undo = fyUndo = null;
      return fy;
    }
    if (m.type === "friedafetch_mail/insights/refresh") {
      await wait(500);
      fy.followups_checked = fy.subscriptions_checked = new Date().toISOString();
      return fy;
    }
    if (m.type === "friedafetch_mail/insights/dismiss") {
      remember(snapshot());
      const list = { rule: "suggestions", followup: "followups", subscription: "subscriptions", proposal: "proposals", package: "parcels" }[m.kind];
      fy[list] = fy[list].filter((x) => x.id !== m.item_id);
      if (m.kind !== "proposal" && m.kind !== "package") fy.dismissed[m.kind] = (fy.dismissed[m.kind] || 0) + 1;
      fy.week.parcels = fy.parcels.filter((x) => x.status !== "delivered" && x.status !== "ordered").length;
      fy.week.waiting = fy.followups.length;
      fy.week.proposals = fy.proposals.length;
      return fy;
    }
    if (m.type === "friedafetch_mail/insights/restore") {
      if (m.kind === "parcel") fy.parcel_ignored = [];
      if (m.kind === "silent") {
        // like the backend: parcels of those shops that went quiet are asked about again
        for (const p of fy.parcels) if (p.arrived === "assumed") Object.assign(p, { status: "in_transit", arrived: null, quiet: Math.max(1, Math.round((Date.now() - new Date(p.updated)) / 86400000)) });
        fy.parcel_silent = [];
      }
      delete fy.dismissed[m.kind];
      return fy;
    }
    if (m.type === "friedafetch_mail/insights/parcel") {
      remember(snapshot());
      const parcel = fy.parcels.find((x) => x.id === m.parcel_id);
      if (parcel && m.action === "merge") {
        const into = fy.parcels.find((x) => x.id === m.into);
        if (into && into !== parcel) {
          into.sources = [...into.sources, ...parcel.sources].sort((a, b) => (a.date < b.date ? -1 : 1));
          into.senders = [...new Set([...into.senders, ...parcel.senders])];
          into.shop ||= parcel.shop;
          fy.parcels = fy.parcels.filter((x) => x !== parcel);
        }
      } else if (parcel && m.action === "split" && parcel.sources.length > 1) {
        const moving = parcel.sources.filter((x) => x.message_id === m.message_id);
        parcel.sources = parcel.sources.filter((x) => x.message_id !== m.message_id);
        fy.parcels.push({ ...parcel, id: `split-${m.message_id}`, sources: moving, status: moving[0].status, number: moving[0].number, subject: moving[0].subject });
      } else if (parcel && m.action === "arrived") {
        const shop = parcel.senders.find((d) => !/(^|\.)(dhl\.de|dhl\.com|dpd\.de|myhermes\.de|ups\.com)$/.test(d));
        if (parcel.quiet && shop && !fy.parcel_silent.includes(shop)) fy.parcel_silent.push(shop);
        Object.assign(parcel, { status: "delivered", arrived: "you", quiet: null, window: null, updated: new Date().toISOString() });
      } else if (parcel && m.action === "waiting") {
        Object.assign(parcel, { status: "in_transit", arrived: null, quiet: null });
      } else if (parcel && m.action === "ignore") {
        if (m.sender) fy.parcel_ignored.push(...parcel.senders.filter((d) => !fy.parcel_ignored.includes(d)));
        fy.parcels = fy.parcels.filter((x) => x !== parcel);
      }
      fy.week.parcels = fy.parcels.filter((x) => x.status !== "delivered" && x.status !== "ordered").length;
      return fy;
    }
    if (m.type === "friedafetch_mail/insights/calendars") {
      return { calendars: [{ id: "home", name: "Zuhause", color: "#34c759" }, { id: "work", name: "Arbeit", color: "#007aff" }], default: null };
    }
    if (m.type === "friedafetch_mail/insights/event") {
      await wait(400);
      const p = fy.proposals.find((x) => x.id === (m.proposal_id || "p1")) || fy.proposals[0] || { id: "p1" };
      fy.proposals = fy.proposals.filter((x) => x !== p);
      fy.week.proposals = fy.proposals.length;
      const cal = m.calendar_id === "work" ? "Arbeit" : "Zuhause";
      return { proposal: { ...p, title: m.title || p.title, start: m.start || p.start, end: m.end || p.end, status: "added", calendar: cal, added: new Date().toISOString(), event_uid: "EV1" } };
    }
    if (m.type === "friedafetch_mail/insights/unsubscribe") {
      await wait(500);
      const n = fy.subscriptions.find((x) => x.sender === m.sender || (x.senders || []).includes(m.sender));
      if (n) Object.assign(n, { unsubscribed: new Date().toISOString(), after: 0 });
      if (m.done) return { sender: m.sender, method: "done" };
      // ?unsubpage=1: the newsletter only offers a web page
      if (q.get("unsubpage")) {
        if (n) Object.assign(n, { unsubscribed: null });
        return { method: "manual", url: "https://example.com/abmelden" };
      }
      return { sender: m.sender, method: "one_click", status: 200 };
    }
    if (m.type === "friedafetch_mail/rules/run") {
      // the example mails the enabled rules hit (all of them in a dry run, nothing changes here)
      await wait(600);
      const active = rulesList.rules.filter((r) => r.enabled && (!m.rule_ids || m.rule_ids.includes(r.id)));
      const actions = rows
        .filter((r) => r.rules.length)
        .flatMap((r) => active.filter((rule) => r.rules.includes(rule.name)).map((rule) => ({ uid: r.uid, mailbox: "INBOX", subject: r.subject, from: [r.from], message_id: r.message_id, rule: rule.name, rule_id: rule.id, ...rule.actions })));
      const now = new Date().toISOString();
      return { scope: m.scope || "all", trigger: "manual", dry_run: !!m.dry_run, started: now, finished: now, checked_mails: [], checked: m.scope === "new" ? 0 : rows.length, matched: m.scope === "new" ? 0 : actions.length, actions: m.scope === "new" ? [] : actions, skipped: [], errors: [] };
    }
    return undefined;
  };
}
