/* Frieda Postfach – Posteingangsregeln, Läufe und Verlauf (ohne Build-Schritt, ohne Abhängigkeiten). */

const ICON_URL = new URL("icon.svg", import.meta.url).href;

const FIELDS = ["from", "to", "cc", "subject", "any"];
const OPS = ["contains", "equals", "starts_with", "ends_with", "domain", "regex"];

// Texts and styles live in their own modules; they are loaded with the same ?v= as this file so that
// a browser never combines a new panel with old texts after an update.
const VERSION_QUERY = new URL(import.meta.url).search;
const [{ I18N }, { STYLE }] = await Promise.all([import(`./i18n.js${VERSION_QUERY}`), import(`./styles.js${VERSION_QUERY}`)]);

// Frieda's design library, served by Frieda itself, so both panels look and behave the same.
const UI_API = 4;
let W = null;
try {
  W = await import(`/friedafetch_static/ui.js${VERSION_QUERY}`);
  if ((W.UI_API ?? 0) < UI_API) W = null;
} catch (err) {
  W = null; // Frieda too old or not loaded: the panel shows a hint instead
}
const plain = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const { esc, fmt, parseTime, fmtDateTime, fmtClock, fmtShort, ico } = W || { esc: plain, fmt: String, parseTime: () => null, fmtDateTime: String, fmtClock: String, fmtShort: String, ico: () => "" };

// Time with seconds for the details (timeline, a pass in progress): only the time today, otherwise date and time.
const fmtSeconds = (iso) => {
  const d = parseTime(iso);
  if (!d || isNaN(d)) return "–";
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return d.toDateString() === new Date().toDateString() ? time : `${d.toLocaleDateString([], { day: "2-digit", month: "2-digit" })} ${time}`;
};

const trigLabel = (t, trig) =>
  ({ auto: t.triggerAuto, push: t.triggerPush, assistant: t.triggerAssistant, rerate: t.triggerRerate, test: t.triggerTest, panel: t.triggerPanel })[trig] ||
  t.triggerManual;

// Sortable column header; sort = { key, dir }.
const sortTh = (action, sort, key, label, cls = "") => {
  const active = sort.key === key;
  const icon = active ? (sort.dir < 0 ? "arrow-down" : "arrow-up") : "swap-vertical";
  return `<th class="${cls}" aria-sort="${active ? (sort.dir < 0 ? "descending" : "ascending") : "none"}"><button class="sort ${active ? "on" : ""}" data-action="${action}" data-k="${key}">${esc(label)}${ico(icon)}</button></th>`;
};
const nextSort = (cur, key, firstDir) => (cur.key === key ? { key, dir: -cur.dir } : { key, dir: firstDir });

// a websocket command this backend does not know (an older Frieda Postfach): that part is left out
const gone = (err) => err?.code === "unknown_command";

const ACT_PAGE = 50; // mails per page of the activity list; more load while scrolling
const PULL_AT = 70; // px the list is pulled down before it reloads (phones)
const HOLD_MS = 500; // a long press picks a mail (phones)
// Calm colours for the AI categories, the same in the list, the reading pane and the charts
const CAT_COLORS = ["#5b8def", "#d97757", "#3fa66b", "#9a6dd7", "#c99a16", "#2f9fa3", "#c75b8f", "#7d8b99"];
const catColor = (name) => {
  if (!name || name === "other") return "var(--secondary-text-color)";
  let h = 0;
  for (const ch of String(name)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return CAT_COLORS[h % CAT_COLORS.length];
};
// A mail's text in three parts: what is new, what it quotes (a reply's history) and the signature
const QUOTE_START = [
  /^(am|on)\s.{4,160}(schrieb|wrote)[^:]{0,60}:\s*$/i,
  /^-{2,}\s*(original message|ursprüngliche nachricht|original-nachricht)\s*-{0,}\s*$/i,
  /^_{8,}\s*$/,
];
export function splitMail(text) {
  const lines = String(text || "").split("\n");
  let quote = -1;
  for (let i = 0; i < lines.length && quote < 0; i++) {
    const line = lines[i].trim();
    const two = `${line} ${(lines[i + 1] || "").trim()}`; // "Am …, schrieb" broken over two lines
    if (QUOTE_START.some((re) => re.test(line))) quote = i;
    else if (/^(am|on)\s/i.test(line) && QUOTE_START[0].test(two)) quote = i;
    else if (/^(von|from):\s/i.test(line) && lines.slice(i + 1, i + 5).some((l) => /^(gesendet|sent|datum|date):\s/i.test(l.trim()))) quote = i;
    else if (/^>/.test(line) && lines.slice(i).every((l) => !l.trim() || /^>/.test(l.trim()))) quote = i;
  }
  const head = quote < 0 ? lines : lines.slice(0, quote);
  const sig = head.findIndex((l) => l === "-- " || l === "--");
  const trim = (part) => part.join("\n").replace(/^\n+|\s+$/g, "");
  return {
    main: trim(sig < 0 ? head : head.slice(0, sig)),
    signature: sig < 0 ? "" : trim(head.slice(sig + 1)),
    quoted: quote < 0 ? "" : trim(lines.slice(quote)),
  };
}
// Text with its web links as chips that name the real destination (only http/https; everything else stays text)
const linkify = (text, t) =>
  String(text || "")
    .split(/(https?:\/\/[^\s<>"')\]]+)/g)
    .map((part, i) => {
      if (i % 2 === 0) return esc(part);
      let url;
      try {
        url = new URL(part.replace(/[.,;:!?]+$/, ""));
      } catch (err) {
        return esc(part);
      }
      if (!/^https?:$/.test(url.protocol)) return esc(part);
      const rest = part.slice(url.href.length - (url.href.endsWith("/") && !part.endsWith("/") ? 1 : 0));
      const path = `${url.pathname}${url.search}`.replace(/^\/$/, "");
      const shown = path.length > 24 ? `${path.slice(0, 22)}…` : path;
      return `<a class="lchip" href="${esc(url.href)}" target="_blank" rel="noopener noreferrer nofollow" aria-label="${esc(fmt(t.linkTo, url.hostname, url.href))}">${ico("link-variant")}<strong>${esc(url.hostname)}</strong>${shown ? `<span>${esc(shown)}</span>` : ""}</a>${esc(rest)}`;
    })
    .join("");
const UNDO_MS = 8000; // how long "Undo" stays after an action (it waits while the pointer or the focus is on it)
const SWIPE_AT = 80; // px a mail in the list is swiped before it acts
const ASSIST_ROUNDS = 5; // rounds of the category assistant, then the proposal is edited by hand
const initials = (name) =>
  String(name || "")
    .replace(/@.*/, "")
    .split(/[\s._-]+/)
    .filter((w) => /^\p{L}/u.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("") || "?";
// the activity tab: view (all, k:<kind>, f:<folder>), search, the loaded mails, the open one, the selection
const newActivity = () => ({
  view: "all",
  query: "",
  items: [],
  total: 0,
  days: [],
  counts: {},
  loaded: false,
  open: null,
  picking: false,
  sel: new Map(),
  anchor: null,
  folded: new Set(),
  runs: false,
  batch: null,
  loadingMore: false,
  jump: false,
});

const SEARCH_KEYS = { rules: "searchRules", aiu: "searchAiu", runs: "searchRuns" };
const PAGE_DEFAULT = { rules: 25, aiu: 10, runs: 10 }; // rows per page until the user picks another size
const FILTER_TABLE = { "rule-filter": "rules", "aiu-filter": "aiu", "run-filter": "runs" };

// Widgets and the optional columns of their tables (true = shown by default).
const WIDGETS = [{ id: "rules" }, { id: "ai" }, { id: "aiu" }, { id: "history" }];
const TABLE_COLUMNS = {
  rules: { pos: true, cond: true, act: true, hits: true },
  aiu: { time: true, kind: true, fields: true, chars: true, ent: true },
  runs: { trig: true, scope: true, checked: true, matched: true, rules: true, ai: true, res: true },
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

class FriedaPostfachPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._layout = new W.Layout("friedafetch_mail_panel", WIDGETS, TABLE_COLUMNS);
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
      historyLimit: 200, // everything that is kept; the table pages it
      ai: null,
      aiEdit: null,
      aiuFilter: "",
      act: newActivity(),
      loc: new Map(), // Message-ID -> where the mail really is (looked up when it is opened)
      assist: null, // the category assistant, while it is open
      check: null, // the accuracy check: { busy, entity, result, err }
      texts: new Map(), // Message-ID -> the mail's text, loaded on request: { busy, data, err }
      applyAsk: null, // after a correction: { ratingId, category } – run the new category's actions?
      expanded: new Set(),
      focusEditor: false,
      scrollTo: null,
      busy: false,
      loaded: false,
    };
  }

  connectedCallback() {
    // Home Assistant may create this element and set hass/narrow/panel/route before the module has finished
    // loading (it awaits its texts and styles). Those values then sit on the element as plain properties and hide
    // the setters, so the panel would never start. Hand them to the setters now.
    for (const prop of ["panel", "narrow", "route", "hass"]) {
      if (Object.prototype.hasOwnProperty.call(this, prop)) {
        const value = this[prop];
        delete this[prop];
        this[prop] = value;
      }
    }
    this._onVisible = () => {
      if (document.visibilityState === "visible") this._autoRefresh();
    };
    document.addEventListener("visibilitychange", this._onVisible);
    this._onDocClick = (ev) => {
      const menu = this.shadowRoot.querySelector("details.menu[open]");
      if (menu && !ev.composedPath().includes(menu)) menu.removeAttribute("open");
    };
    document.addEventListener("click", this._onDocClick);
    // live updates arrive through the subscription; the slow timer keeps relative times fresh and is the fallback
    this._timer = setInterval(() => this._autoRefresh(), 60000);
    this._onKey = (ev) => this._shortcut(ev);
    this.addEventListener("keydown", this._onKey);
    // a key the panel handled is not also one of Home Assistant's own shortcuts (e: entities, c: commands, …)
    this._onKeyStop = (ev) => ev.defaultPrevented && ev.stopPropagation();
    this.addEventListener("keydown", this._onKeyStop);
    // ⌘K / Ctrl+K also when the focus is outside the panel (after a click on an empty spot)
    this._onWinKey = (ev) => {
      if ((ev.metaKey || ev.ctrlKey) && String(ev.key).toLowerCase() === "k" && !ev.composedPath().includes(this) && this.isConnected) this._shortcut(ev);
    };
    window.addEventListener("keydown", this._onWinKey);
    this._onPop = () => {
      // the phone's back gesture closes the open mail first
      if (!this._sheetBack) return;
      this._sheetBack = false;
      if (this._s.sheet && !this._s.sheet.inline) this._closeTimeline();
    };
    window.addEventListener("popstate", this._onPop);
    this._subscribe();
    this._openLinked(); // the panel may come back from Home Assistant's cache with a new link
  }

  disconnectedCallback() {
    clearInterval(this._timer);
    clearTimeout(this._undoTimer);
    this._paletteClose();
    this.removeEventListener("keydown", this._onKey);
    this.removeEventListener("keydown", this._onKeyStop);
    window.removeEventListener("keydown", this._onWinKey);
    window.removeEventListener("popstate", this._onPop);
    clearTimeout(this._liveTimer);
    clearTimeout(this._retryTimer);
    document.removeEventListener("visibilitychange", this._onVisible);
    document.removeEventListener("click", this._onDocClick);
    this._unsubscribe();
  }

  // A redraw now would get in the way: the user is editing, choosing, typing, deciding or has a menu open.
  _canRefresh() {
    const s = this._s;
    if (!this._hass || !s.loaded || !s.entryId || s.busy || s.confirm || s.editing || s.aiEdit || s.assist || document.visibilityState !== "visible") return false;
    const active = this.shadowRoot.activeElement;
    if (active && ["SELECT", "INPUT", "TEXTAREA"].includes(active.tagName)) return false;
    return !this.shadowRoot.querySelector("details.menu[open]");
  }

  // ------------------------------------------------------------ live updates
  async _subscribe() {
    if (!W || this._unsub || this._subscribing || !this._hass?.connection || !this.isConnected) return;
    this._subscribing = true;
    try {
      this._unsub = await this._hass.connection.subscribeMessage((ev) => this._onLive(ev), { type: "friedafetch_mail/subscribe" });
      if (!this.isConnected) this._unsubscribe();
    } catch (err) {
      this._unsub = null; // older backend: the timer keeps the panel current
    }
    this._subscribing = false;
  }

  _unsubscribe() {
    const unsub = this._unsub;
    this._unsub = null;
    if (unsub) Promise.resolve(unsub()).catch(() => {});
  }

  // Collects the changed parts for a moment, then reloads only those.
  _onLive(ev) {
    if (!ev || ev.entry_id !== this._s.entryId) {
      if (ev?.topic === "rules") (this._live ||= new Set()).add("accounts"); // counts of another account
      else return;
    } else (this._live ||= new Set()).add(ev.topic);
    clearTimeout(this._liveTimer);
    this._liveTimer = setTimeout(() => this._flushLive(), 400);
  }

  async _flushLive() {
    if (!this._live?.size) return;
    if (!this._canRefresh()) {
      this._liveTimer = setTimeout(() => this._flushLive(), 1500); // try again once the user is done
      return;
    }
    const topics = this._live;
    this._live = new Set();
    const jobs = [];
    if (topics.has("rules")) jobs.push(this._loadRules(), this._loadHistory(true));
    if (topics.has("rules") || topics.has("accounts")) jobs.push(this._loadAccounts());
    if (topics.has("ai")) jobs.push(this._ws({ type: "friedafetch_mail/ai", entry_id: this._s.entryId }).then((ai) => (this._s.ai = ai)));
    if (topics.has("activity") || topics.has("ai")) jobs.push(this._loadActivity());
    if (topics.has("insights") || topics.has("ai") || topics.has("activity")) jobs.push(this._loadInsights());
    if (this._s.sheet && (topics.has("rules") || topics.has("ai") || topics.has("activity"))) jobs.push(this._loadTimeline());
    await Promise.all(jobs.map((j) => j.catch(() => null)));
    this._render();
    this._fresh = null; // the highlight plays once
  }

  async _loadRules() {
    const list = await this._ws({ type: "friedafetch_mail/rules/list", entry_id: this._s.entryId });
    this._s.rules = list.rules;
    this._s.lastRun = list.last_run;
    this._s.automation = list.automation || null;
  }

  // Back from the background (or the connection came back): everything again. The app reconnects first, so the
  // first attempt may fail; it is repeated a few times, and what the panel shows stays until it worked.
  async _autoRefresh(attempt = 0) {
    clearTimeout(this._retryTimer);
    if (!this._canRefresh()) return;
    this._subscribe(); // a subscription lost with the connection
    try {
      await this._reload();
      this._render();
    } catch (err) {
      if (attempt < 5) this._retryTimer = setTimeout(() => this._autoRefresh(attempt + 1), 2000 * (attempt + 1));
    }
  }

  set hass(hass) {
    const first = !this._hass;
    const conn = hass?.connection;
    this._hass = hass;
    if (first) this._init();
    if (first) this._subscribe();
    if (conn && conn !== this._conn) {
      // after a lost connection (the app in the background, a restart) the panel loads everything again
      this._conn?.removeEventListener?.("ready", this._onReady);
      this._onReady ||= () => {
        this._unsub = null; // the server forgot the old subscription
        this._autoRefresh();
      };
      conn.addEventListener?.("ready", this._onReady);
      this._conn = conn;
    }
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
      const [{ accounts, version }] = await Promise.all([this._ws({ type: "friedafetch_mail/accounts" }), this._layout.load(this._hass)]);
      this._s.serverVersion = version || null;
      this._s.accounts = accounts;
      const linked = this._linkedAccount();
      this._s.entryId = (linked || accounts[0])?.entry_id || null;
      if (this._s.entryId) await this._reload();
    } catch (err) {
      this._s.error = err.message || String(err);
    }
    this._s.loaded = true;
    this._render();
    if (this._tab(this._tabs()) === "activity") this._actAutoOpen();
    this._openLinked();
  }

  // A link from Frieda's change log: /frieda-postfach?mail=<Message-ID>&account=<Frieda account>
  _linkedAccount() {
    const id = new URLSearchParams(window.location.search).get("account");
    return id ? this._s.accounts.find((a) => a.core_entry_id === id || a.entry_id === id) || null : null;
  }

  async _openLinked() {
    const params = new URLSearchParams(window.location.search);
    const mail = params.get("mail");
    if (!mail || !this._s.loaded) return;
    const account = this._linkedAccount();
    params.delete("mail");
    params.delete("account");
    const rest = params.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${rest ? `?${rest}` : ""}`);
    if (account && account.entry_id !== this._s.entryId) await this._switchAccount(account.entry_id);
    this._openTimeline({ message_id: mail, subject: "", sender: "" });
  }

  async _reload() {
    const entryId = this._s.entryId;
    // the mailbox names may need iCloud: fetch them alongside, never block the page on them
    this._ws({ type: "friedafetch_mail/mailboxes", entry_id: entryId })
      .then((res) => {
        if (this._s.entryId !== entryId) return;
        this._s.mailboxes = res.mailboxes;
        // an open editor keeps what was typed; it shows the names the next time it opens
        if (this._s.loaded && !this._s.editing && !this._s.aiEdit) this._render();
      })
      .catch(() => {});
    const [list] = await Promise.all([
      this._ws({ type: "friedafetch_mail/rules/list", entry_id: entryId }),
      this._loadAccounts().catch(() => {}),
      this._loadHistory().catch(() => {}),
      this._ws({ type: "friedafetch_mail/ai", entry_id: entryId })
        .then((ai) => (this._s.ai = ai))
        .catch((err) => {
          // an older backend has no AI sorting; a connection that is just coming back keeps what is shown
          if (gone(err)) this._s.ai = null;
          else throw err;
        }),
      this._loadActivity(),
      this._loadInsights(),
    ]);
    this._s.rules = list.rules;
    this._s.lastRun = list.last_run;
    this._s.automation = list.automation || null;
  }

  // --------------------------------------------------------------- AI sorting
  async _aiRun() {
    await this._call(async () => {
      const res = await this._ws({ type: "friedafetch_mail/ai/run", entry_id: this._s.entryId, count: 10 });
      this._s.ai = res;
      this._s.notice = fmt(this.t.aiRated, res.report?.rated ?? 0);
      if (res.report?.errors?.length) this._s.error = res.report.errors.join("; ");
    });
  }

  async _aiSaveCategories(categories) {
    await this._call(async () => {
      this._s.ai = await this._ws({ type: "friedafetch_mail/ai/categories", entry_id: this._s.entryId, categories });
      this._s.aiEdit = null;
    });
  }

  _aiReadEdit() {
    const root = this.shadowRoot;
    const e = this._s.aiEdit;
    if (!e) return null;
    e.data = {
      ...e.data,
      name: root.querySelector("#ai-name")?.value ?? e.data.name,
      description: root.querySelector("#ai-desc")?.value ?? e.data.description,
      move_to: root.querySelector("#ai-move")?.value || null,
      mark_seen: !!root.querySelector("#ai-seen")?.checked,
      flag: !!root.querySelector("#ai-flag")?.checked,
    };
    return e;
  }

  async _aiCorrect(ratingId, category) {
    const cat = (this._s.ai?.categories || []).find((c) => c.name === category);
    const acc = this._account();
    // the new category moves, marks or flags: ask whether to do that now (Frieda would only do it for new mail)
    this._s.applyAsk = cat && (cat.move_to || cat.mark_seen || cat.flag) && !acc?.read_only ? { ratingId, category } : null;
    await this._call(async () => {
      await this._ws({ type: "friedafetch_mail/ai/correct", entry_id: this._s.entryId, rating_id: ratingId, category });
      this._s.ai = await this._ws({ type: "friedafetch_mail/ai", entry_id: this._s.entryId });
      await Promise.all([this._loadActivity().catch(() => {}), this._s.sheet ? this._loadTimeline() : null]);
    });
  }

  async _applyCategory(run) {
    const ask = this._s.applyAsk;
    this._s.applyAsk = null;
    if (!run || !ask) return this._render();
    await this._call(async () => {
      await this._ws({ type: "friedafetch_mail/ai/apply", entry_id: this._s.entryId, rating_id: ask.ratingId });
      this._s.ai = await this._ws({ type: "friedafetch_mail/ai", entry_id: this._s.entryId });
      await Promise.all([this._loadActivity().catch(() => {}), this._s.sheet ? this._loadTimeline() : null]);
    });
  }

  // ------------------------------------------------------------ acting on mails (like a mail program)
  // undoing: the reverse the backend named for the last action (only the mails that changed, back to their folders)
  async _mailAct(keys, action, { to = null, undoing = false } = {}) {
    const t = this.t;
    if (!keys.length) return;
    let res = null;
    await this._call(async () => {
      res = await this._ws({ type: "friedafetch_mail/mail/act", entry_id: this._s.entryId, keys, action, ...(to ? { to } : {}) });
      await Promise.all([this._loadActivity().catch(() => {}), this._s.sheet ? this._loadTimeline() : null]);
    });
    if (!res || undoing) return;
    const text = res.failed?.length ? fmt(t.mactFailed, res.failed.length) : fmt(t[`mactDone_${action}`], res.done);
    const undo = res.undo;
    if (undo) this._offerUndo(text, () => this._mailAct(undo.keys, undo.action, { to: undo.to || null, undoing: true }));
    else W.announce(this.shadowRoot, text, 0);
  }

  // The actions for one mail (reading pane) or the picked ones (action bar), as fits their state now
  _mailActions(items) {
    const t = this.t;
    const acc = this._account();
    if (acc?.read_only || !items.length) return "";
    const one = items.length === 1;
    const st = one ? items[0].state || {} : {};
    const where = one ? st.mailbox || (items[0].folder === "INBOX" ? "INBOX" : null) : null;
    const btn = (action, icon, label) =>
      `<button class="secondary small ib mact" data-action="mail-act" data-v="${action}" aria-label="${esc(label)}" ${this._s.busy ? "disabled" : ""}>${ico(icon)}<span class="lb">${esc(label)}</span></button>`;
    return [
      one && st.seen === true ? btn("unseen", "email-outline", t.mactUnseen) : btn("seen", "email-open-outline", t.mactSeen),
      one && st.flagged ? btn("unflag", "flag-off-outline", t.mactUnflag) : btn("flag", "flag-outline", t.mactFlag),
      where && where !== "INBOX" ? btn("inbox", "inbox-arrow-down", t.mactInbox) : btn("archive", "archive-arrow-down-outline", t.mactArchive),
      acc?.allow_delete && !(st.mailbox && st.mailbox === "Deleted Messages") ? btn("trash", "delete-outline", t.mactTrash) : "",
    ].join("");
  }

  // Keyboard like a mail program (nothing typed into a field): ? the overview, z undo, 1–5 tabs; in the activity
  // / search, j/k next/previous mail, u read, s flag, e archive, # or Delete trash
  _shortcut(ev) {
    if ((ev.metaKey || ev.ctrlKey) && !ev.altKey && String(ev.key).toLowerCase() === "k" && !this._s.confirm && !this._s.assist) {
      ev.preventDefault();
      ev.stopPropagation();
      if (this._pal) this._paletteClose();
      else this._paletteOpen();
      return;
    }
    if (ev.ctrlKey || ev.metaKey || ev.altKey || this._s.confirm || this._s.assist || this._s.keys || this._pal) return;
    const target = ev.composedPath()[0];
    if (target?.closest?.("input, select, textarea, [contenteditable]")) return;
    const tabs = this._tabs();
    if (ev.key === "?") {
      ev.preventDefault();
      this._keysOpen();
      return;
    }
    if (ev.key === "z" && this._undoRun) {
      ev.preventDefault();
      this._undoNow();
      return;
    }
    if (/^[1-9]$/.test(ev.key) && W.renderTabs) {
      const tab = tabs[Number(ev.key) - 1];
      if (tab) {
        ev.preventDefault();
        this._setTab(tab.id);
        this.shadowRoot.querySelector(`#tab-${tab.id}`)?.focus({ preventScroll: true });
      }
      return;
    }
    if (this._tab(tabs) !== "activity" || this._s.act.runs) return;
    if (ev.key === "/") {
      const q = this.shadowRoot.querySelector("#act-q");
      if (q) {
        ev.preventDefault();
        q.focus();
        q.select();
      }
      return;
    }
    const a = this._s.act;
    if (ev.key === "j" || ev.key === "k") {
      const i = a.items.findIndex((x) => x.key === a.open);
      const next = a.items[Math.max(0, Math.min(a.items.length - 1, i + (ev.key === "j" ? 1 : -1)))];
      if (next && next.key !== a.open) {
        ev.preventDefault();
        this._actOpen(next.key);
      }
      return;
    }
    const keys = a.picking ? [...a.sel.keys()] : a.open ? [a.open] : [];
    const acc = this._account();
    if (!keys.length || acc?.read_only) return;
    const item = keys.length === 1 ? this._actItem(keys[0]) : null;
    const action = {
      u: item?.state?.seen ? "unseen" : "seen",
      s: item?.state?.flagged ? "unflag" : "flag",
      e: "archive",
      "#": "trash",
      Delete: "trash",
    }[ev.key];
    if (!action || (action === "trash" && !acc?.allow_delete)) return;
    ev.preventDefault();
    this._mailAct(keys, action);
  }

  // The text of the mail, on request (cleaned, plain; reading it does not mark the mail read)
  async _loadText(mid) {
    const texts = this._s.texts;
    texts.set(mid, { busy: true });
    this._render();
    try {
      texts.set(mid, { busy: false, data: await this._ws({ type: "friedafetch_mail/mail/text", entry_id: this._s.entryId, message_id: mid }) });
    } catch (err) {
      texts.set(mid, { busy: false, err: err.message || String(err) });
    }
    this._renderWhenFree();
  }

  async _loadThread(mid) {
    const threads = (this._s.threads ||= new Map());
    threads.set(mid, { busy: true });
    try {
      threads.set(mid, { data: await this._ws({ type: "friedafetch_mail/mail/thread", entry_id: this._s.entryId, message_id: mid }) });
    } catch (err) {
      threads.set(mid, { err: err.message || String(err) });
    }
    this._renderWhenFree();
  }

  // The conversation of the open mail: its mails in the activity and your answers from the sent mail, oldest first.
  _threadHtml(mid, item) {
    const t = this.t;
    if (!item || !(item.thread_count > 1)) return "";
    const threads = (this._s.threads ||= new Map());
    const x = threads.get(mid);
    if (!x) {
      this._loadThread(mid);
      return "";
    }
    if (x.busy || x.err || !x.data) return "";
    const rows = x.data.items
      .map((m) => {
        const me = m.message_id === mid;
        const who = m.mine ? fmt(t.threadYou, m.name || m.from || "–") : m.name || m.from || "–";
        const body = `<span class="tw">${m.mine ? ico("reply") : ""}<strong>${esc(who)}</strong><span class="muted">${esc(fmtShort(m.date))}</span></span><span class="ts">${esc(m.subject || "–")}</span>`;
        return m.key && !me
          ? `<li class="${m.mine ? "mine" : ""}"><button class="threadrow ${m.seen === false ? "unread" : ""} ${m.mine ? "mine" : ""}" data-action="thread-open" data-id="${esc(m.key)}">${body}</button></li>`
          : `<li class="${m.mine ? "mine" : ""}"><div class="threadrow ${me ? "here" : ""} ${m.mine ? "mine" : ""}" ${me ? 'aria-current="true"' : ""}>${body}</div></li>`;
      })
      .join("");
    return `<h3 class="sect">${esc(fmt(t.thread, x.data.items.length))}</h3><ul class="thread chat">${rows}</ul>`;
  }

  _textHtml(mid) {
    const t = this.t;
    const x = this._s.texts.get(mid);
    if (!x) return `<button class="link small ib" data-action="mail-text" data-id="${esc(mid)}">${ico("text-box-outline")}${esc(t.textShow)}</button>`;
    if (x.busy) return `<p class="working"><span class="spinner" aria-hidden="true"></span>${esc(t.textLoading)}</p>`;
    if (x.err) return `<div class="error">${esc(x.err)}</div>`;
    const d = x.data || {};
    if (!d.found) return `<p class="muted">${esc(t.textGone)}</p>`;
    const files = (d.attachments || []).filter(Boolean);
    return `<div class="mtext">
        ${d.suspicious ? `<p class="warnline">${ico("alert-outline")}<span>${esc(t.textSuspicious)}</span></p>` : ""}
        ${this._mailBody(d.text || t.textEmpty)}
        ${d.truncated ? `<p class="muted">${esc(t.textTruncated)}</p>` : ""}
        ${files.length ? `<p class="muted files">${ico("paperclip")}<span>${esc(files.join(", "))}</span></p>` : ""}
      </div>`;
  }

  _mailBody(text) {
    const t = this.t;
    const part = splitMail(text);
    return `<div class="body">${linkify(part.main || text, t)}</div>
      ${part.signature ? `<details class="fold sig"><summary>${ico("signature-freehand")}${esc(t.sigShow)}</summary><div class="body">${linkify(part.signature, t)}</div></details>` : ""}
      ${part.quoted ? `<details class="fold"><summary>${ico("format-quote-open")}${esc(t.quoteShow)}</summary><div class="body quoted">${linkify(part.quoted, t)}</div></details>` : ""}`;
  }

  async _aiClear() {
    const t = this.t;
    if (!(await this._confirm({ title: t.aiConfirmClearTitle, text: t.aiConfirmClear, ok: t.clearOk }))) return;
    await this._call(async () => {
      this._s.ai = await this._ws({ type: "friedafetch_mail/ai/clear", entry_id: this._s.entryId });
    });
  }

  async _aiUsageClear() {
    const t = this.t;
    if (!(await this._confirm({ title: t.aiuConfirmClearTitle, text: t.aiuConfirmClear, ok: t.clearOk }))) return;
    await this._call(async () => {
      this._s.ai = await this._ws({ type: "friedafetch_mail/ai/usage/clear", entry_id: this._s.entryId });
    });
  }

  // ------------------------------------------------------------ undo instead of asking first
  // A calm bar at the bottom after an action that can be taken back ("Archived · Undo"). It lives outside the
  // redrawn frame, so it keeps its place while the panel renders, and it waits while the pointer or the focus is on it.
  _undoBar() {
    let bar = this.shadowRoot.querySelector(".undobar");
    if (!bar) {
      bar = document.createElement("div");
      bar.className = "undobar";
      bar.setAttribute("role", "status");
      bar.hidden = true;
      const hold = () => clearTimeout(this._undoTimer);
      const resume = () => this._undoLater();
      bar.addEventListener("pointerenter", hold);
      bar.addEventListener("focusin", hold);
      bar.addEventListener("pointerleave", resume);
      bar.addEventListener("focusout", resume);
      this.shadowRoot.append(bar);
    }
    return bar;
  }

  _undoLater() {
    clearTimeout(this._undoTimer);
    if (this._undoRun) this._undoTimer = setTimeout(() => this._hideUndo(), UNDO_MS);
  }

  _offerUndo(text, run) {
    const t = this.t;
    const bar = this._undoBar();
    this._undoRun = run;
    bar.innerHTML = `${ico("check-circle-outline")}<span class="ut">${esc(text)}</span><button class="link" data-undo>${esc(t.undo)}</button><button class="icon" data-undo-close aria-label="${esc(t.undoClose)}">${ico("close")}</button>`;
    bar.querySelector("[data-undo]").addEventListener("click", () => this._undoNow());
    bar.querySelector("[data-undo-close]").addEventListener("click", () => this._hideUndo());
    bar.hidden = false;
    bar.classList.remove("show");
    void bar.offsetWidth; // the slide-in starts again for the next action
    bar.classList.add("show");
    W.announce(this.shadowRoot, `${text}. ${t.undoKey}`, 0);
    this._undoLater();
  }

  _hideUndo() {
    clearTimeout(this._undoTimer);
    this._undoRun = null;
    const bar = this.shadowRoot.querySelector(".undobar");
    if (bar) bar.hidden = true;
  }

  async _undoNow() {
    const run = this._undoRun;
    this._hideUndo();
    if (!run) return;
    await run();
    if (!this._s.error) W.announce(this.shadowRoot, this.t.undoDone, 0);
  }

  // ------------------------------------------------------------ the command palette (⌘K / Ctrl+K)
  _paletteOpen() {
    if (this._pal) return;
    const t = this.t;
    const host = document.createElement("div");
    host.className = "palette-host";
    host.innerHTML = `<div class="modal-backdrop pal-back"></div>
      <div class="modal palette" role="dialog" aria-modal="true" aria-label="${esc(t.palTitle)}">
        <div class="palin">${ico("magnify")}<input id="pal-q" type="text" role="combobox" aria-expanded="true" aria-controls="pal-list" aria-autocomplete="list" autocomplete="off" spellcheck="false" placeholder="${esc(t.palPlaceholder)}" aria-label="${esc(t.palTitle)}"></div>
        <ul id="pal-list" role="listbox" aria-label="${esc(t.palTitle)}"></ul>
        <p class="palfoot">${esc(t.palHint)}</p>
      </div>`;
    this.shadowRoot.append(host);
    const frame = this.shadowRoot.querySelector("[data-frame]");
    if (frame) frame.inert = true;
    this._pal = { host, q: "", sel: 0, items: [], mails: [], opener: this.shadowRoot.activeElement };
    const input = host.querySelector("#pal-q");
    input.addEventListener("input", () => {
      this._pal.q = input.value;
      this._pal.sel = 0;
      this._pal.mails = [];
      this._paletteFill();
      clearTimeout(this._palTimer);
      this._palTimer = setTimeout(() => this._paletteMails(), 250);
    });
    input.addEventListener("keydown", (ev) => {
      const p = this._pal;
      if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
        ev.preventDefault();
        p.sel = (p.sel + (ev.key === "ArrowDown" ? 1 : -1) + p.items.length) % Math.max(1, p.items.length);
        this._paletteFill();
      } else if (ev.key === "Enter") {
        ev.preventDefault();
        this._paletteRun(p.items[p.sel]);
      } else if (ev.key === "Escape") {
        ev.preventDefault();
        this._paletteClose();
      }
      ev.stopPropagation(); // typing here is not a shortcut of the panel (nor of Home Assistant)
    });
    host.querySelector(".pal-back").addEventListener("click", () => this._paletteClose());
    this._paletteFill();
    input.focus();
  }

  _paletteClose() {
    const p = this._pal;
    if (!p) return;
    clearTimeout(this._palTimer);
    p.host.remove();
    this._pal = null;
    const frame = this.shadowRoot.querySelector("[data-frame]");
    if (frame) frame.inert = false;
    p.opener?.focus?.({ preventScroll: true });
  }

  // Everything the palette offers for the words typed so far: places, actions, rules, categories (mails come later)
  _paletteEntries(q) {
    const t = this.t;
    const s = this._s;
    const has = (...words) => !q || words.some((w) => String(w || "").toLowerCase().includes(q));
    const out = [];
    for (const tab of this._tabs()) if (has(tab.label, t.palGo)) out.push({ group: t.palGo, icon: tab.icon, label: tab.label, run: () => this._setTab(tab.id) });
    const actions = [
      [t.palNewRule, "filter-plus-outline", () => (this._setTab("rules"), (this._s.editing = this._blankRule()), (this._s.focusEditor = true), this._render())],
      s.insights && [t.palRefresh, "refresh", () => (this._setTab("foryou"), this._fyCall({ type: "friedafetch_mail/insights/refresh" }))],
      s.ai?.status?.active && [t.palNewCat, "shape-plus-outline", () => (this._setTab("ai"), (this._s.aiEdit = { index: -1, data: { name: "", description: "", move_to: null, mark_seen: false, flag: false } }), this._render())],
      s.ai?.status?.active && [t.palAssist, "creation", () => (this._setTab("ai"), this._assistOpen())],
      [t.palKeys, "keyboard-outline", () => this._keysOpen()],
    ].filter(Boolean);
    for (const [label, icon, run] of actions) if (has(label, t.palActions)) out.push({ group: t.palActions, icon, label, run });
    for (const rule of s.rules) {
      if (!q || !has(rule.name, ...rule.conditions.map((c) => c.value))) continue;
      out.push({
        group: t.palRules,
        icon: "filter-outline",
        label: rule.name,
        run: () => {
          this._s.expanded.add(rule.id);
          this._s.scrollTo = rule.id;
          this._setTab("rules");
        },
      });
    }
    (s.ai?.categories || []).forEach((c, i) => {
      if (!q || !has(c.name, c.description)) return;
      out.push({ group: t.palCats, icon: "shape-outline", color: catColor(c.name), label: c.name, run: () => (this._setTab("ai"), (this._s.aiEdit = { index: i, data: { ...c } }), this._render()) });
    });
    return out.slice(0, 14);
  }

  _paletteFill() {
    const p = this._pal;
    if (!p) return;
    const t = this.t;
    const q = p.q.trim().toLowerCase();
    const mails = p.mails.map((m) => ({
      group: t.palMails,
      icon: "email-outline",
      label: m.subject || "–",
      hint: m.name || m.from || "",
      run: () => {
        this._setTab("activity");
        if (this._actItem(m.key)) this._actOpen(m.key);
        else this._openTimeline({ message_id: m.message_id || null, subject: m.subject || "", sender: m.from || "" });
      },
    }));
    p.items = [...this._paletteEntries(q), ...mails];
    p.sel = Math.min(p.sel, Math.max(0, p.items.length - 1));
    let group = null;
    const html = p.items
      .map((it, i) => {
        const head = it.group !== group ? `<li class="palgroup" role="presentation">${esc((group = it.group))}</li>` : "";
        return `${head}<li id="pal-opt-${i}" role="option" aria-selected="${i === p.sel}" data-i="${i}">${it.color ? `<i class="cdot" style="--cat:${it.color}"></i>` : ico(it.icon)}<span class="pl">${esc(it.label)}</span>${it.hint ? `<small>${esc(it.hint)}</small>` : ""}</li>`;
      })
      .join("");
    const list = p.host.querySelector("#pal-list");
    list.innerHTML = html || `<li class="palnone" role="presentation">${esc(t.palNone)}</li>`;
    list.querySelectorAll('[role="option"]').forEach((li) => li.addEventListener("click", () => this._paletteRun(p.items[Number(li.dataset.i)])));
    const input = p.host.querySelector("#pal-q");
    if (p.items.length) input.setAttribute("aria-activedescendant", `pal-opt-${p.sel}`);
    else input.removeAttribute("aria-activedescendant");
    list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }

  // Mails are searched on the server (all of the activity, not only the loaded ones)
  async _paletteMails() {
    const p = this._pal;
    const q = p?.q.trim();
    if (!p || q.length < 2) return;
    try {
      const res = await this._ws({ type: "friedafetch_mail/activity/list", entry_id: this._s.entryId, query: q, limit: 6 });
      if (this._pal !== p || p.q.trim() !== q) return;
      p.mails = res.items || [];
      this._paletteFill();
    } catch (err) {
      /* the other entries stay */
    }
  }

  _paletteRun(item) {
    if (!item) return;
    this._paletteClose();
    item.run();
  }

  _keysOpen() {
    this._s.keys = true;
    this._render();
    this.shadowRoot.querySelector('.keys [data-action="keys-close"]')?.focus({ preventScroll: true });
  }

  _keysClose() {
    this._s.keys = false;
    this._render();
  }

  _renderKeys() {
    if (!this._s.keys) return "";
    const t = this.t;
    return `<div class="modal-backdrop" data-action="keys-close"></div>
      <div class="modal neutral keys" role="dialog" aria-modal="true" aria-labelledby="keys-title">
        <div class="modal-head"><span class="modal-icon">${ico("keyboard-outline")}</span><h3 id="keys-title">${esc(t.keysTitle)}</h3></div>
        <dl class="keylist">${t.keysList.map(([k, v]) => `<div><dt><kbd>${esc(k)}</kbd></dt><dd>${esc(v)}</dd></div>`).join("")}</dl>
        <div class="modal-actions"><button data-action="keys-close">${esc(t.keysClose)}</button></div>
      </div>`;
  }

  // Confirmation in the panel's own design (window.confirm looks foreign and is not shown by every app).
  _confirm({ title, text, ok, irreversible = true, tone, icon, note, option }) {
    if (this._confirmResolve) this._confirmResolve(false);
    this._confirmOption = false;
    return new Promise((resolve) => {
      this._confirmResolve = resolve;
      this._s.confirm = { title, text, ok, irreversible, tone, icon, note, option };
      this._render();
      this.shadowRoot.querySelector('.modal [data-action="confirm-no"]')?.focus({ preventScroll: true });
    });
  }

  _confirmDone(value) {
    // the dialog's switch (e.g. "run the actions of the new category"), read before the dialog goes away
    this._confirmOption = value && !!this.shadowRoot.querySelector("#confirm-option")?.checked;
    const resolve = this._confirmResolve;
    this._confirmResolve = null;
    this._s.confirm = null;
    this._render();
    if (resolve) resolve(value);
  }

  _renderConfirm() {
    return W.renderConfirm(this._s.confirm, this.t);
  }


  _renderAiUsage() {
    const t = this.t;
    const s = this._s;
    const u = s.ai?.usage;
    if (!u) return "";
    const st = s.ai.status || {};
    const log = u.log || [];
    if (!st.active && !log.length) return "";
    const num = (n) => Number(n || 0).toLocaleString();
    // the tip also names the figure for screen readers (unless the value already says it)
    const fact = (icon, value, tip, cls = "") =>
      `<span class="fact ${cls}" title="${esc(tip)}">${tip && !String(tip).includes(String(value)) ? `<span class="vh">${esc(tip)}: </span>` : ""}${ico(icon)}${esc(value)}</span>`;
    const charts = this._layout.opt("aiu", "charts", false);
    const COLORS = { sent: "var(--info-color, #039be5)", held: "var(--success-color, #43a047)", err: "var(--error-color, #db4437)" };
    const pie = (w) => {
      const errors = Number(w.errors || 0);
      const parts = [
        { value: Math.max(Number(w.calls || 0) - errors, 0), color: COLORS.sent, label: t.aiuSent },
        { value: Number(w.held_back || 0), color: COLORS.held, label: t.aiuHeldBack },
        { value: errors, color: COLORS.err, label: t.resError },
      ];
      return W.donut(parts, { size: 52 });
    };
    const stat = (label, w) => `<div class="stat ${charts ? "with-chart" : ""}"><div class="stat-tx"><div class="k">${esc(label)}</div><div class="v">${esc(num(w.calls))} <small class="muted">${esc(t.aiuCalls)}</small></div>
      <div class="facts">${fact("format-text", num(w.chars), t.aiuTipChars)}${fact("text-long", num(w.body), t.aiuTipBody, w.body ? "hot" : "")}${fact("shield-check-outline", num(w.held_back), t.aiuTipHeld)}${w.errors ? fact("alert-circle-outline", num(w.errors), t.aiuTipErrors, "err") : ""}${w.local ? fact("account-check-outline", num(w.local), t.aiuTipLocal) : ""}</div></div>${charts ? pie(w) : ""}</div>`;
    const legend = charts
      ? `<div class="legend" style="margin-top:8px"><span><i style="background:${COLORS.sent}"></i>${esc(t.aiuSent)}</span><span><i style="background:${COLORS.held}"></i>${esc(t.aiuHeldBack)}</span><span><i style="background:${COLORS.err}"></i>${esc(t.resError)}</span></div>`
      : "";
    const m = u.month || {};
    const chips = [
      ...Object.entries(m.entities || {}).map(([e, n]) => `<span class="chip ic">${ico("robot-outline")}${esc(e.replace(/^ai_task\./, ""))} · ${esc(n)}</span>`),
      m.sort ? `<span class="chip ic">${ico("sort-variant")}${esc(t.aiuKindSort)} · ${esc(m.sort)}</span>` : "",
      m.digest ? `<span class="chip ic">${ico("newspaper-variant-outline")}${esc(t.aiuKindDigest)} · ${esc(m.digest)}</span>` : "",
      m.assist ? `<span class="chip ic">${ico("creation")}${esc(t.aiuKindAssist)} · ${esc(m.assist)}</span>` : "",
    ].filter(Boolean);
    const FIELD_ICONS = {
      from: "account-outline",
      to: "account-multiple-outline",
      subject: "format-title",
      date: "calendar-outline",
      body: "text-long",
      unread: "email-outline",
      events: "calendar-month-outline",
      birthdays: "cake-variant-outline",
      rules: "filter-outline",
      conversation: "chat-outline",
      categories: "tag-multiple-outline",
      folders: "folder-outline",
    };
    const reasons = (held) =>
      (Array.isArray(held) ? held : held === "sender" ? [{ type: "sender", value: "" }] : [{ type: "term", value: String(held || "").replace(/^term:/, "") }])
        .map((r) => {
          const where = (r.where || []).map((w) => t.aiuWhere[w] || w).join(", ");
          const text = r.type === "sender" ? (r.value ? fmt(t.aiuHeldSenderV, r.value) : t.aiuHeldSender) : fmt(t.aiuHeldTerm, r.value);
          return `<span class="chip ic held">${ico(r.type === "sender" ? "account-cancel-outline" : "text-search")}${esc(where && r.type !== "sender" ? `${text} (${where})` : text)}</span>`;
        })
        .join("");
    const f = s.aiuFilter || "";
    const sort = s.aiuSort || { key: "time", dir: -1 };
    const entities = new Set(log.map((e) => e.entity).filter(Boolean));
    const showEntity = entities.size > 1;
    const value = (e) => (sort.key === "chars" ? Number(e.chars || 0) : sort.key === "subject" ? String(e.subject || e.sender || "").toLowerCase() : parseTime(e.time)?.getTime() || 0);
    const list = log
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => !f || (f === "sent" ? e.sent : !e.sent))
      .sort((x, y) => {
        const a = value(x.e);
        const b = value(y.e);
        return (a < b ? -1 : a > b ? 1 : 0) * sort.dir || x.i - y.i;
      });
    const cols = 7 + (showEntity ? 1 : 0);
    const aiuCols = [
      { key: "time", label: t.colTime },
      { key: "sender", label: t.colSender },
      { key: "kind", label: t.aiuTipKind },
      { key: "fields", label: t.colFields },
      { key: "chars", label: t.colChars },
      ...(showEntity ? [{ key: "ent", label: t.colEntity }] : []),
    ];
    const rows = list
      .map(({ e, i }) => {
        const state = !e.sent ? "held" : e.ok ? "sent" : "err";
        const stIcon = { sent: "send-outline", held: "shield-check-outline", err: "alert-circle-outline" }[state];
        const stText = { sent: t.aiuSent, held: t.aiuHeldBack, err: t.resError }[state];
        const assist = e.kind === "assist";
        const digest = e.kind === "digest" || assist; // no mail: opens its details instead of a timeline
        const title = e.subject || (assist ? t.aiuKindAssist : digest ? t.aiuKindDigest : "–");
        const open = digest && s.aiuOpen === i; // a sorted mail opens its timeline, the daily overview its details
        const fields = (e.fields || [])
          .map((x) => `<span class="fi ${x === "body" ? "hot" : ""}" role="img" aria-label="${esc(t.aiuFields[x] || x)}" title="${esc(t.aiuFields[x] || x)}">${ico(FIELD_ICONS[x] || "circle-small")}</span>`)
          .join("");
        const heldCount = Array.isArray(e.held_back) ? e.held_back.length : e.held_back ? 1 : 0;
        const fieldsCell = e.sent
          ? `<span class="fields">${fields}</span>`
          : `<span class="chip ic held">${ico("shield-check-outline")}${esc(heldCount > 1 ? fmt(t.aiuReasonsN, heldCount) : t.aiuKill)}</span>`;
        const detail = `<div class="adet">
            ${!e.sent ? `<div><div class="lbl">${esc(t.aiuWhy)}</div>${reasons(e.held_back)}</div>` : ""}
            ${e.sent ? `<div><div class="lbl">${esc(t.aiuTipFields)}</div>${(e.fields || []).map((x) => `<span class="chip ic ${x === "body" ? "hot" : ""}">${ico(FIELD_ICONS[x] || "circle-small")}${esc(t.aiuFields[x] || x)}</span>`).join("")}</div>` : ""}
            ${e.error ? `<div class="aiu-error">${ico("alert-circle-outline")}${esc(e.error)}</div>` : ""}
            <div class="muted adet-meta">${esc([fmtDateTime(e.time), e.trigger ? trigLabel(t, e.trigger) : "", e.entity || "", e.items != null ? fmt(t.aiuItems, e.items) : ""].filter(Boolean).join(" · "))}</div>
          </div>`;
        const search = [e.subject, e.sender, e.entity, e.kind].join(" ").toLowerCase();
        return `<tr class="arow ${state} ${state === "err" ? "row-err" : ""} ${open ? "open" : ""}" data-search="${esc(search)}">
            <td class="c-st"><span class="aiu-st" role="img" title="${esc(stText)}" aria-label="${esc(stText)}">${ico(stIcon)}</span></td>
            <td class="c-time num dim"><time datetime="${esc(e.time || "")}" title="${esc(fmtDateTime(e.time))}">${esc(fmtShort(e.time))}</time></td>
            <td class="c-subj">${
              digest
                ? `<button class="rtext" data-action="aiu-open" data-i="${i}" aria-expanded="${open}" title="${esc(title)}">${esc(title)}</button>`
                : `<button class="rtext go" data-action="aiu-mail" data-i="${i}" aria-haspopup="dialog" title="${esc(title)}"><span class="rt">${esc(title)}</span>${ico("chevron-right")}</button>`
            }</td>
            <td class="c-sender dim" title="${esc(e.sender || "")}">${esc(e.sender || "–")}</td>
            <td class="c-kind dim">${assist ? fact("creation", t.aiuKindAssist, t.aiuTipKind) : fact(digest ? "newspaper-variant-outline" : "sort-variant", digest ? t.aiuKindDigest : t.aiuKindSort, t.aiuTipKind)}</td>
            <td class="c-fields">${fieldsCell}</td>
            <td class="c-chars num">${e.sent ? esc(num(e.chars)) : "–"}</td>
            ${showEntity ? `<td class="c-ent dim">${fact("robot-outline", (e.entity || "–").replace(/^ai_task\./, ""), e.entity || "")}</td>` : ""}
          </tr>${open ? `<tr class="detail adetail"><td colspan="${cols}">${detail}</td></tr>` : ""}`;
      })
      .join("");
    const sentCount = log.filter((e) => e.sent).length;
    const seg = (val, icon, label, count) =>
      `<button class="seg ${f === val ? "on" : ""}" data-action="aiu-filter" data-v="${val}" aria-pressed="${f === val}">${ico(icon)}${esc(label)}<span class="n">${esc(count)}</span></button>`;
    const th = (key, label, cls = "") => {
      const active = sort.key === key;
      const icon = active ? (sort.dir < 0 ? "arrow-down" : "arrow-up") : "swap-vertical";
      return `<th class="${cls}" aria-sort="${active ? (sort.dir < 0 ? "descending" : "ascending") : "none"}"><button class="sort ${active ? "on" : ""}" data-action="aiu-sort" data-k="${key}">${esc(label)}${ico(icon)}</button></th>`;
    };
    return `<div class="card" id="ai-usage">
      <div class="chead"><h2>${esc(t.aiu)}</h2>${W.cardMenu(
        [
          { action: "aiu-charts", icon: charts ? "chart-donut-variant" : "chart-donut", label: charts ? t.chartsHide : t.chartsShow },
          log.length && { action: "aiu-clear", icon: "delete-sweep-outline", label: t.aiuClear, danger: true },
        ],
        t
      )}</div>
      <p class="muted" style="margin:0 0 10px">${esc(t.aiuHint)}</p>
      <div class="stats">${stat(t.aiuToday, u.today || {})}${stat(t.aiuWeek, u.week || {})}${stat(t.aiuMonth, u.month || {})}</div>${legend}
      ${chips.length ? `<div style="margin-top:10px">${chips.join("")}</div>` : ""}
      ${
        log.length
          ? `<div class="tbar">
               <label class="search">${ico("magnify")}<input type="search" data-search-table="aiu" value="${esc(s.searchAiu || "")}" placeholder="${esc(t.searchAi)}" aria-label="${esc(t.searchAi)}"></label>
               <div class="segs" role="group">${seg("", "format-list-bulleted", t.aiuAll, log.length)}${seg("sent", "send-outline", t.aiuOnlySent, sentCount)}${seg("held", "shield-check-outline", t.aiuOnlyHeld, log.length - sentCount)}</div>
               <span class="grow"></span>${W.columnMenu(this._layout, "aiu", aiuCols, t)}
             </div>${W.columnStyle(this._layout, "aiu", aiuCols)}
             <div class="scroll aiu-scroll"><table class="dtable atable" data-table="aiu"><thead><tr>
               <th class="c-st"><span class="vh">${esc(t.colStatus)}</span></th>${th("time", t.colTime, "c-time num")}${th("subject", t.colSubjectOnly)}<th class="c-sender">${esc(t.colSender)}</th><th class="c-kind">${esc(t.aiuTipKind)}</th><th class="c-fields">${esc(t.colFields)}</th>${th("chars", t.colChars, "c-chars num")}${showEntity ? `<th class="c-ent">${esc(t.colEntity)}</th>` : ""}
             </tr></thead><tbody>${rows || `<tr><td colspan="${cols}" class="muted">${esc(t.aiuEmpty)}</td></tr>`}</tbody></table></div>${W.pagerSlot ? W.pagerSlot("aiu") : ""}
             <p class="muted nomatch" hidden>${esc(t.noMatches)}</p>`
          : `<p class="muted" style="margin-top:12px">${esc(t.aiuEmpty)}</p>`
      }
    </div>`;
  }

  // A re-rating runs, or waits for the next hour of the hourly limit.
  _batchBusy() {
    const st = this._s.ai?.batch?.state;
    return st === "running" || st === "waiting";
  }

  // Progress of a re-rating, or its result (until hidden; for half an hour).
  _renderBatch(ai) {
    const t = this.t;
    const b = ai.batch;
    if (!b) return "";
    // "Cancel" shows at once; the backend stops without waiting for the AI's answer
    const cancelBtn = b.cancelling
      ? `<button class="secondary small" disabled>${esc(t.rerateCancelling)}</button>`
      : `<button class="secondary small" data-action="rerate-cancel">${esc(t.rerateCancel)}</button>`;
    if (b.state === "waiting") {
      const pct = b.total ? Math.round((b.done / b.total) * 100) : 0;
      return `<div class="batch wait" role="status">${ico("timer-sand")}<div class="bt"><strong>${esc(fmt(t.rerateWaiting, b.done, b.total))}</strong><span class="muted">${esc(fmt(t.rerateWaitingSub, fmtClock(b.resume_at)))}</span><div class="bar" aria-hidden="true"><span style="width:${pct}%"></span></div></div>${cancelBtn}</div>`;
    }
    if (b.state === "running") {
      const pct = b.total ? Math.round((b.done / b.total) * 100) : 0;
      return `<div class="batch"><span class="spinner" aria-hidden="true"></span><div class="bt"><strong>${esc(fmt(t.rerateRunning, b.done, b.total))}</strong><div class="bar" aria-hidden="true"><span style="width:${pct}%"></span></div></div>${cancelBtn}</div>`;
    }
    const age = Date.now() - (parseTime(b.finished)?.getTime() || 0);
    // closed by the user: remembered per user in Home Assistant, so it stays closed after reopening the panel
    if (this._s.batchHidden === b.started || this._layout.opt("batch", "hidden", null) === b.started || age > 30 * 60000) return "";
    const head = { cancelled: t.rerateCancelled, limit: t.rerateLimit }[b.state] || t.rerateDone;
    const parts = [
      fmt(t.rerateRated, b.rated),
      b.held ? fmt(t.rerateHeld, b.held) : "",
      b.missing ? fmt(t.rerateMissing, b.missing) : "",
      b.applied ? fmt(t.rerateApplied, b.applied) : "",
    ].filter(Boolean);
    const err = (b.errors || [])[0];
    return `<div class="batch done ${err ? "err" : ""}" data-announce>${ico(err ? "alert-circle-outline" : "check-circle-outline")}<div class="bt"><strong>${esc(head)}</strong><span class="muted">${esc(parts.join(" · "))}</span>${err ? `<span class="aiu-error">${esc(err)}</span>` : ""}</div><button class="icon" data-action="batch-hide" aria-label="${esc(t.close)}" title="${esc(t.close)}">${ico("close")}</button></div>`;
  }

  // Rate chosen messages again (ratings by id, or messages by Message-ID); asks first.
  async _rerate({ ratingIds = [], messages = [] }) {
    const t = this.t;
    const st = this._s.ai?.status || {};
    const n = ratingIds.length + messages.length;
    if (!n) return;
    const left = Math.max(0, Number(st.limit || 0) - Number(st.used_this_hour || 0));
    const act = st.mode === "act";
    const ok = await this._confirm({
      tone: "neutral",
      icon: "refresh",
      title: n === 1 ? t.rerateTitleOne : fmt(t.rerateTitle, n),
      text: t.rerateText,
      note: left < n ? fmt(t.rerateNoteLimit, left, n - left) : fmt(t.rerateNote, left),
      ok: t.rerate,
      irreversible: false,
      option: act ? { label: t.rerateApply, checked: false } : null,
    });
    if (!ok) return false;
    const apply = act && this._confirmOption;
    await this._call(async () => {
      this._s.ai = await this._ws({ type: "friedafetch_mail/ai/rerate", entry_id: this._s.entryId, rating_ids: ratingIds, messages, apply });
      this._s.batchHidden = null;
    });
    return true;
  }

  _renderAi() {
    const t = this.t;
    const s = this._s;
    const ai = s.ai;
    if (!ai) return "";
    const st = ai.status || {};
    if (!st.active) {
      return `<div class="card"><div class="chead"><h2>${esc(t.ai)}</h2><span class="badge">${esc(t.aiOff)}</span></div>
        <div class="info">${esc(st.enabled ? t.aiNoEntity : t.aiOffHint)}</div></div>`;
    }
    const acc = this._account();
    const act = st.mode === "act";
    const sub = [
      st.entity,
      st.include_body ? fmt(t.aiSendsBody, st.body_chars) : t.aiSendsHeaders,
      fmt(t.aiUsage, st.used_this_hour, st.limit),
      st.excluded ? fmt(t.aiExcluded, st.excluded) : "",
      st.block_terms ? fmt(t.aiBlockTerms, st.block_terms) : "",
      act && st.notify ? fmt(t.aiNotify, st.notify) : "",
      ai.examples ? fmt(t.aiExamples, ai.examples) : "",
      st.known && st.known_senders ? fmt(t.aiKnown, st.known_senders) : "",
    ].filter(Boolean);
    const warn = !st.entity_ok ? fmt(t.aiEntityMissing, st.entity) : st.last_error ? fmt(t.aiError, st.last_error) : "";
    const cats = ai.categories || [];
    const opt = (val, label, cur) => `<option value="${esc(val)}" ${String(cur ?? "") === String(val) ? "selected" : ""}>${esc(label)}</option>`;
    const edit = s.aiEdit;
    const editor = (e) => `<div class="ai-edit" id="ai-editor">
        <div class="row"><label for="ai-name">${esc(t.aiCatName)}</label><input type="text" id="ai-name" class="grow" value="${esc(e.data.name)}" maxlength="40"></div>
        <div class="row"><label for="ai-desc">${esc(t.aiCatDesc)}</label><input type="text" id="ai-desc" class="grow" value="${esc(e.data.description)}" maxlength="300"></div>
        <div class="row"><label for="ai-move">${esc(t.aiCatMove)}</label><select id="ai-move">${opt("", t.noMove, e.data.move_to || "")}${s.mailboxes.map((b) => opt(b, b, e.data.move_to || "")).join("")}</select></div>
        <div class="row"><label></label><label class="opt"><input type="checkbox" class="switch" id="ai-seen" ${e.data.mark_seen ? "checked" : ""}><span>${esc(t.aiCatSeen)}</span></label></div>
        <div class="row"><label></label><label class="opt"><input type="checkbox" class="switch" id="ai-flag" ${e.data.flag ? "checked" : ""}><span>${esc(t.aiCatFlag)}</span></label></div>
        ${act ? "" : `<p class="muted" style="margin:0 0 10px">${esc(t.aiCatActionsObserve)}</p>`}
        <div class="actionsbar"><button data-action="ai-cat-save" ${s.busy ? "disabled" : ""}>${esc(t.save)}</button><button class="secondary" data-action="ai-cat-cancel">${esc(t.cancel)}</button>
          ${e.index >= 0 ? `<button class="secondary ib danger" data-action="ai-cat-delete">${ico("delete-outline")}${esc(t.aiCatDelete)}</button>` : ""}</div>
      </div>`;
    const catRows = cats
      .map((c, i) => {
        if (edit && edit.index === i) return editor(edit);
        const acts = [c.move_to ? `→ ${c.move_to}` : "", c.mark_seen ? t.aSeen : "", c.flag ? t.aFlag : ""].filter(Boolean);
        return `<div class="ai-cat"><i class="cdot big" style="--cat:${catColor(c.name)}" aria-hidden="true"></i><span class="tx"><strong>${esc(c.name)}</strong><span class="muted">${esc(c.description)}</span></span>
          <span>${acts.map((a) => `<span class="chip">${esc(a)}</span>`).join("")}</span>
          <button class="icon" data-action="ai-cat-edit" data-index="${i}" ${edit ? "disabled" : ""} title="${esc(t.edit)}" aria-label="${esc(t.edit)}: ${esc(c.name)}">${ico("pencil-outline")}</button></div>`;
      })
      .join("");
    return `<div class="card" id="ai">
      <div class="chead"><h2>${esc(t.ai)} <span class="badge ${act ? "warn" : ""}">${esc(act ? t.aiModeActShort : t.aiModeObserveShort)}</span></h2>
        <button class="pill" data-action="ai-run" ${s.busy ? "disabled" : ""} title="${esc(t.aiRunHint)}">${ico("play")}${esc(t.aiRun)}</button>
        ${W.cardMenu([(ai.ratings || []).length && { action: "ai-clear", icon: "delete-sweep-outline", label: t.aiClear, danger: true, disabled: s.busy }], t)}</div>
      <div class="mode ${warn ? "warn" : ""}"><span class="ic" aria-hidden="true">${act ? "✦" : "👁"}</span><span class="tx"><strong>${esc(act ? t.aiAct : t.aiObserve)}</strong><span class="muted">${esc(sub.join(" · "))}</span>${warn ? `<span class="muted">${esc(warn)}</span>` : ""}</span></div>
      ${acc && !acc.rules_auto ? `<p class="muted" style="margin:-4px 0 10px">${esc(t.aiManualOnly)}</p>` : ""}
      ${this._aiStats(ai)}
      <div class="with-add"><h3 class="muted">${esc(t.aiCategories)}</h3><button class="round small" data-action="ai-cat-new" ${edit ? "disabled" : ""} title="${esc(t.aiNewCategory)}" aria-label="${esc(t.aiNewCategory)}">+</button>
        <button class="secondary small ib" data-action="assist-open" ${edit || s.busy ? "disabled" : ""}>${ico("creation")}${esc(t.assistOpen)}</button></div>
      <p class="muted" style="margin:-4px 0 8px">${esc(t.aiCategoriesHint)}</p>
      <div class="ai-cats">${catRows}${edit && edit.index < 0 ? editor(edit) : ""}</div>
      ${this._renderCheck(st)}
    </div>`;
  }

  // What the AI decided lately: its categories (with the corrections) and how often it was right per week.
  // Plain SVG with an accessible name, no tooltips.
  _aiStats(ai) {
    const t = this.t;
    const ratings = (ai.ratings || []).filter((r) => r.category);
    if (ratings.length < 3) return "";
    const counts = new Map();
    for (const r of ratings) {
      const final = r.corrected || r.category;
      const c = counts.get(final) || { n: 0, wrong: 0 };
      c.n += 1;
      counts.set(final, c);
      if (r.corrected && r.corrected !== r.category) {
        const o = counts.get(r.category) || { n: 0, wrong: 0 };
        o.wrong += 1;
        counts.set(r.category, o);
      }
    }
    const cat = (c) => (c === "other" ? t.aiOther : c);
    const list = [...counts].filter(([, c]) => c.n || c.wrong).sort((a, b) => b[1].n - a[1].n);
    const total = list.reduce((n, [, c]) => n + c.n, 0);
    let at = 0;
    const R = 15.9155;
    const rings = list
      .filter(([, c]) => c.n)
      .map(([name, c]) => {
        const share = (c.n / total) * 100;
        const ring = `<circle r="${R}" cx="21" cy="21" fill="none" stroke="${catColor(name)}" stroke-width="6" stroke-dasharray="${Math.max(share - 0.8, 0.4).toFixed(2)} ${(100 - share + 0.8).toFixed(2)}" stroke-dashoffset="${(25 - at).toFixed(2)}"></circle>`;
        at += share;
        return ring;
      })
      .join("");
    const label = list.map(([name, c]) => `${cat(name)}: ${c.n}${c.wrong ? `, ${fmt(t.aiStatsCorr, c.wrong)}` : ""}`).join("; ");
    const donut = `<svg class="aidonut" viewBox="0 0 42 42" role="img" aria-label="${esc(`${fmt(t.aiStatsCats, ratings.length)}: ${label}`)}"><circle r="${R}" cx="21" cy="21" fill="none" stroke="var(--divider-color, #e0e0e0)" stroke-width="6"></circle>${rings}<text x="21" y="21" text-anchor="middle" dominant-baseline="central">${esc(ratings.length)}</text></svg>`;
    const legend = list
      .map(([name, c]) => `<li><i class="cdot" style="--cat:${catColor(name)}"></i><span class="nm">${esc(cat(name))}</span><span class="n">${esc(c.n)}</span>${c.wrong ? `<span class="wrong">${esc(fmt(t.aiStatsCorr, c.wrong))}</span>` : ""}</li>`)
      .join("");
    const weeks = (this._s.insights?.week?.trend || []).filter((w) => w.accuracy != null);
    const bars = weeks.length >= 2
      ? `<div class="aiweeks"><h4>${esc(t.aiStatsWeeks)}</h4><div class="bars" role="img" aria-label="${esc(fmt(t.aiStatsWeeksLabel, weeks.map((w) => `${w.week === "now" ? t.aiStatsNow : fmt(t.aiStatsWeek, Number(w.week.replace(/^\d+-W/, "")))} ${w.accuracy} %`).join(", ")))}">${weeks
          .map((w) => `<span class="bar ${w.week === "now" ? "now" : ""}"><i style="height:${Math.max(4, w.accuracy)}%"></i><small>${esc(w.week === "now" ? t.aiStatsNow : w.week.replace(/^\d+-W/, ""))}</small></span>`)
          .join("")}</div></div>`
      : "";
    return `<div class="aistats"><h3 class="muted">${esc(t.aiStats)}</h3><div class="aistats-row"><div class="aicats">${donut}<ul class="legend">${legend}</ul></div>${bars}</div></div>`;
  }

  // Accuracy check: your corrected mails go to the AI again – with the current categories, optionally another entity.
  _renderCheck(st) {
    const t = this.t;
    const s = this._s;
    const n = Math.min(Number(s.ai?.corrected || 0), 20);
    const c = s.check || {};
    const head = `<h3 class="muted check-h">${esc(t.checkTitle)}</h3>`;
    if (!n) return `${head}<p class="muted">${esc(t.checkNone)}</p>`;
    const entities = Object.keys(this._hass?.states || {}).filter((id) => id.startsWith("ai_task.")).sort();
    const entity = c.entity || st.entity;
    const pick = entities.length > 1
      ? `<select class="fsel" data-action="check-entity" aria-label="${esc(t.checkEntity)}">${entities.map((id) => `<option value="${esc(id)}" ${id === entity ? "selected" : ""}>${esc(this._hass.states[id]?.attributes?.friendly_name || id)}</option>`).join("")}</select>`
      : "";
    const cat = (x) => (x === "other" ? t.aiOther : x);
    const r = c.result;
    let out = "";
    if (c.busy) out = `<p class="working"><span class="spinner" aria-hidden="true"></span>${esc(fmt(t.checkRunning, n))}</p>`;
    else if (c.err) out = `<div class="error">${esc(c.err)}</div>`;
    else if (r) {
      const misses = r.results.filter((x) => x.after !== x.expected);
      const pct = r.tested ? Math.round((r.hits / r.tested) * 100) : 0;
      const notes = [
        r.held ? fmt(t.checkHeld, r.held) : "",
        r.missing ? fmt(t.checkMissing, r.missing) : "",
        r.limit ? t.checkLimit : "",
        r.errors?.[0] || "",
      ].filter(Boolean);
      out = `<div class="check-res" role="status">
          <p><strong>${esc(r.tested ? fmt(t.checkResult, r.hits, r.tested, pct) : t.checkNothing)}</strong> <span class="muted">${esc(String(r.entity || "").replace(/^ai_task\./, ""))}</span></p>
          ${notes.length ? `<p class="muted">${esc(notes.join(" · "))}</p>` : ""}
          ${misses.length ? `<p class="muted">${esc(t.checkMisses)}</p><ul class="check-list">${misses.map((x) => `<li><span>${esc(x.subject || "–")}</span><small>${esc(fmt(t.checkMiss, cat(x.expected), cat(x.after)))}</small></li>`).join("")}</ul>` : r.tested ? `<p class="muted">${esc(t.checkAllRight)}</p>` : ""}
        </div>`;
    }
    return `${head}<p class="muted">${esc(n === 1 ? t.checkHintOne : fmt(t.checkHint, n))}</p>
      <div class="check-row">${pick}<button class="secondary small ib" data-action="ai-check" ${c.busy || s.busy ? "disabled" : ""}>${ico("bullseye-arrow")}${esc(r ? t.checkAgain : t.checkRun)}</button></div>
      ${out}`;
  }

  async _check() {
    const s = this._s;
    const entity = s.check?.entity || null;
    s.check = { busy: true, entity, result: null, err: "" };
    this._render();
    try {
      const result = await this._ws({ type: "friedafetch_mail/ai/check", entry_id: s.entryId, ...(entity ? { entity } : {}) });
      s.check = { busy: false, entity, result, err: "" };
    } catch (err) {
      s.check = { busy: false, entity, result: null, err: err.message || String(err) };
    }
    this._renderWhenFree();
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
    const t = this.t;
    const name = this._s.rules.find((r) => r.id === id)?.name || "";
    let done = false;
    await this._call(async () => {
      await this._ws({ type: "friedafetch_mail/rules/delete", entry_id: this._s.entryId, rule_id: id });
      await this._reload();
      done = true;
    });
    if (!done) return;
    // the rule comes back as it was (same id, hits and place)
    this._offerUndo(fmt(t.ruleDeleted, name), () =>
      this._call(async () => {
        await this._ws({ type: "friedafetch_mail/rules/restore", entry_id: this._s.entryId, rule_id: id });
        this._s.scrollTo = id;
        await this._reload();
      })
    );
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
    const { accounts, version } = await this._ws({ type: "friedafetch_mail/accounts" });
    this._s.serverVersion = version || null;
    this._s.accounts = accounts;
    if (!accounts.some((a) => a.entry_id === this._s.entryId)) this._s.entryId = accounts[0]?.entry_id || null;
  }

  // live: runs that were not there before are highlighted briefly (merged runs keep their id and stay calm)
  async _loadHistory(live = false) {
    const res = await this._ws({ type: "friedafetch_mail/rules/history", entry_id: this._s.entryId, limit: this._s.historyLimit });
    this._s.historyCurrent = res.current || null;
    const known = new Set((this._s.history || []).map((h) => h.id));
    this._s.history = res.runs || [];
    if (live && known.size) this._fresh = new Set(this._s.history.filter((h) => !known.has(h.id)).map((h) => h.id));
    this._s.historyTotal = res.total || 0;
  }

  async _clearHistory() {
    const t = this.t;
    if (!(await this._confirm({ title: t.confirmClearHistoryTitle, text: t.confirmClearHistory, ok: t.clearOk }))) return;
    await this._call(async () => {
      await this._ws({ type: "friedafetch_mail/rules/history/clear", entry_id: this._s.entryId });
      await this._loadHistory();
    });
  }

  // Search over table rows without re-rendering, so the input keeps its focus.
  _applySearch(key) {
    const table = this.shadowRoot.querySelector(`table[data-table="${key}"]`);
    if (!table) return;
    const q = String(this._s[SEARCH_KEYS[key]] || "").toLowerCase().trim();
    let shown = 0;
    const paged = !!W.applyPaging;
    table.querySelectorAll("tbody tr[data-search]").forEach((tr) => {
      // everything shown in the row is searchable, plus the extra terms in data-search (e.g. all conditions)
      const hay = `${tr.dataset.search} ${tr.textContent.replace(/\s+/g, " ")}`.toLowerCase();
      const ok = !q || hay.includes(q);
      tr.dataset.nomatch = ok ? "0" : "1";
      if (!paged) {
        tr.hidden = !ok;
        const next = tr.nextElementSibling;
        if (next && !next.dataset.search && next.matches(".rdetail, .adetail")) next.hidden = !ok;
      }
      if (ok) shown++;
    });
    // the matching rows, a page at a time (an older Frieda without paging shows them all)
    if (paged) W.applyPaging(this.shadowRoot, this._layout, key, (this._s.pages ||= {}), this.t, PAGE_DEFAULT[key]);
    let hint = table.closest(".scroll")?.nextElementSibling;
    while (hint && !hint.classList.contains("nomatch") && hint.classList.contains("pager")) hint = hint.nextElementSibling;
    if (hint?.classList.contains("nomatch")) hint.hidden = shown > 0 || !q;
    return shown;
  }

  // Messages a run handled, for the info popup and the expanded row.
  // Messages of one pass: what the rules did, what the AI decided, or that nothing applied.
  _mailList(mails, more = 0, runId = null) {
    const t = this.t;
    const ruleKind = (m) =>
      m.delete
        ? { icon: "delete-outline", tone: "err", label: t.aDelete }
        : m.move_to
          ? { icon: "folder-move-outline", tone: "move", label: `→ ${m.move_to}` }
          : m.flag
            ? { icon: "flag-outline", tone: "warn", label: t.aFlag }
            : m.seen === true
              ? { icon: "email-open-outline", tone: "", label: t.aSeen }
              : m.seen === false
                ? { icon: "email-mark-as-unread", tone: "", label: t.aUnseen }
                : { icon: "check", tone: "", label: "" };
    const aiText = (a) => {
      const moved = (a.applied || []).find((x) => String(x).startsWith("moved:"));
      return [a.category === "other" ? t.aiOther : a.category, a.importance ? `${a.importance}/5` : "", moved ? `→ ${moved.slice(6)}` : ""]
        .filter(Boolean)
        .join(" · ");
    };
    const items = mails
      .map((m, idx) => {
        const ai = m.ai || null;
        const ruled = (m.rules || []).length > 0;
        let k;
        if (ruled) k = ruleKind(m);
        else if (ai && ai.held) k = { icon: "shield-check-outline", tone: "held", label: t.aiuKill };
        else if (ai && ai.category) k = { icon: "creation", tone: "ai", label: aiText(ai) };
        else k = { icon: "minus", tone: "none", label: t.runNoAction };
        const source = ruled ? (m.rules || []).join(", ") : ai ? t.ai : "";
        const extra = ruled && ai && ai.category ? `${t.ai}: ${aiText(ai)}` : "";
        const go = runId != null ? `role="button" tabindex="0" aria-haspopup="dialog" data-action="mail-open" data-i="${esc(`${runId}:${idx}`)}"` : "";
        return `<li class="tone-${k.tone || "plain"} ${go ? "go" : ""}" ${go}>
            <span class="i-ic">${ico(k.icon)}</span>
            <span class="i-main" title="${esc(m.subject || "")}">${esc(m.subject || "–")}</span>
            ${k.label ? `<span class="i-chip">${esc(k.label)}</span>` : ""}
            <span class="i-sub">${esc([m.from, source, extra].filter(Boolean).join(" · "))}</span>
          </li>`;
      })
      .join("");
    return `<ul class="ilist">${items}${more ? `<li class="i-more">${esc(fmt(t.runMailsMore, more))}</li>` : ""}</ul>`;
  }

  // ------------------------------------------------------------ timeline of one message
  // key: { message_id, subject, sender } – the Message-ID links everything; subject and sender find older entries
  async _openTimeline(key, { inline = false, hint = null } = {}) {
    if (!inline && !this._sheetBack && window.matchMedia?.("(max-width: 600px)").matches) {
      // on phones the open mail is a page of its own: the back gesture (or button) closes it
      window.history.pushState({ ...(window.history.state || {}), friedaMail: true }, "");
      this._sheetBack = true;
    }
    this._s.sheet = { key, data: null, loading: true, error: null, inline };
    this._render();
    await this._loadTimeline();
    const d = this._s.sheet?.data || {};
    const mid = d.message_id || key.message_id;
    if (mid && !this._s.loc.has(mid)) this._locate(mid, hint || d.location || d.mailbox || "INBOX");
  }

  async _loadTimeline() {
    const sheet = this._s.sheet;
    if (!sheet) return;
    try {
      const data = await this._ws({ type: "friedafetch_mail/mail/timeline", entry_id: this._s.entryId, ...sheet.key });
      if (this._s.sheet !== sheet) return;
      sheet.data = data;
      sheet.error = null;
    } catch (err) {
      if (this._s.sheet !== sheet) return;
      sheet.error = err.message || String(err);
    }
    sheet.loading = false;
    this._renderWhenFree();
  }

  // A redraw replaces every control; an open dropdown would close under the finger. Results that arrive in the
  // background (timeline, location) therefore wait until the dropdown is left.
  _renderWhenFree() {
    const active = this.shadowRoot.activeElement;
    if (active?.tagName !== "SELECT") return this._render();
    if (this._waitingSelect === active) return;
    this._waitingSelect = active;
    const go = () => {
      if (this._waitingSelect !== active) return;
      clearInterval(timer);
      active.removeEventListener("blur", go);
      active.removeEventListener("change", go);
      this._waitingSelect = null;
      this._render();
    };
    // blur is not always reported (e.g. when the window itself loses the focus): look again every half second
    const timer = setInterval(() => this.shadowRoot.activeElement !== active && go(), 500);
    active.addEventListener("blur", go);
    active.addEventListener("change", go);
  }

  // Swipe down on the sheet: on its head at any time, in the list once it is scrolled to the top.
  _bindSwipe(sheet) {
    const body = sheet.querySelector(".rbody");
    let y0 = null;
    let t0 = 0;
    let dy = 0;
    // from the left edge to the right: back, like in a mail app
    let x0 = null;
    let dx = 0;
    sheet.addEventListener(
      "touchstart",
      (ev) => {
        if (ev.touches.length === 1 && ev.touches[0].clientX < 28) {
          x0 = ev.touches[0].clientX;
          dx = 0;
          sheet.style.transition = "none";
        }
      },
      { passive: true }
    );
    sheet.addEventListener(
      "touchmove",
      (ev) => {
        if (x0 === null) return;
        dx = Math.max(0, ev.touches[0].clientX - x0);
        if (dx > 0) {
          ev.preventDefault();
          sheet.style.transform = `translateX(${dx}px)`;
        }
      },
      { passive: false }
    );
    const back = () => {
      if (x0 === null) return;
      x0 = null;
      sheet.style.transition = "transform .2s ease-out";
      if (dx > 100) {
        sheet.style.transform = "translateX(100%)";
        setTimeout(() => this._closeTimeline(), 180);
      } else sheet.style.transform = "";
    };
    sheet.addEventListener("touchend", back);
    sheet.addEventListener("touchcancel", back);
    sheet.addEventListener(
      "touchstart",
      (ev) => {
        if (ev.touches.length !== 1 || x0 !== null) return;
        if (body?.contains(ev.target) && body.scrollTop > 0) return; // the list scrolls first
        y0 = ev.touches[0].clientY;
        t0 = Date.now();
        dy = 0;
        sheet.style.transition = "none";
      },
      { passive: true }
    );
    sheet.addEventListener(
      "touchmove",
      (ev) => {
        if (y0 === null || x0 !== null) return;
        dy = Math.max(0, ev.touches[0].clientY - y0);
        if (dy > 0) {
          ev.preventDefault(); // drag the sheet instead of the page
          sheet.style.transform = `translateY(${dy}px)`;
        }
      },
      { passive: false }
    );
    const end = () => {
      if (y0 === null) return;
      const fast = dy / Math.max(1, Date.now() - t0) > 0.6;
      y0 = null;
      sheet.style.transition = "transform .2s ease-out";
      if (dy > 110 || (dy > 40 && fast)) {
        sheet.style.transform = "translateY(100%)";
        setTimeout(() => this._closeTimeline(), 180);
      } else {
        sheet.style.transform = "";
      }
    };
    sheet.addEventListener("touchend", end);
    sheet.addEventListener("touchcancel", end);
  }

  _closeTimeline() {
    if (!this._s.sheet) return;
    this._s.sheet = null;
    if (this._sheetBack) {
      this._sheetBack = false;
      window.history.back(); // takes back the step the open mail added
    }
    this._render();
  }

  _renderSheet() {
    const sheet = this._s.sheet;
    if (!sheet || sheet.inline) return "";
    const t = this.t;
    const item = this._s.act.open ? this._actItem(this._s.act.open) : null;
    const mid = sheet.data?.message_id || sheet.key.message_id;
    const mine = item && item.message_id && item.message_id === mid ? item : null;
    return `<div class="sheet-backdrop" data-action="sheet-close"></div>
      <aside class="sheet mailsheet" role="dialog" aria-modal="true" aria-labelledby="r-title">
        <span class="handle" aria-hidden="true"></span>
        <div class="sheet-top"><span class="ttl">${esc(t.tlTitle)}</span><button class="icon" data-action="sheet-close" aria-label="${esc(t.close)}" title="${esc(t.close)}">${ico("close")}</button></div>
        <div class="mailview">${this._renderMailView(sheet, mine)}</div>
      </aside>`;
  }

  // One step of the timeline: tinted symbol, what happened, details, time.
  _tlStep(e, last) {
    const t = this.t;
    const cat = (c) => (c === "other" ? t.aiOther : c);
    let tone = "none";
    let icon = "circle-small";
    let title = "";
    let sub = "";
    let quote = "";
    let minis = [];
    if (e.kind === "received") {
      icon = "email-arrow-left-outline";
      title = t.tlReceived;
      sub = e.mailbox || "";
    } else if (e.kind === "checked") {
      const hit = (e.rules || []).length > 0;
      const acts = [
        e.delete && t.aDelete,
        e.move_to && `→ ${e.move_to}`,
        e.seen === true && t.aSeen,
        e.seen === false && t.aUnseen,
        e.flag === true && t.aFlag,
        e.flag === false && t.aUnflag,
      ].filter(Boolean);
      icon = !hit ? "filter-outline" : e.delete ? "delete-outline" : e.move_to ? "folder-move-outline" : "filter-check-outline";
      tone = !hit ? "none" : e.delete ? "err" : "move";
      title = hit ? fmt(t.tlRuleHit, e.rules.join(", ")) : t.tlChecked;
      sub = [e.trigger ? trigLabel(t, e.trigger) : "", hit ? acts.join(", ") : t.tlNoRule, e.count > 1 ? fmt(t.tlTimes, e.count) : ""].filter(Boolean).join(" · ");
    } else if (e.kind === "ai_sent") {
      icon = "creation";
      tone = e.ok === false ? "err" : "ai";
      title = e.ok === false ? t.tlAiError : t.tlAiSent;
      sub = [
        String(e.entity || "").replace(/^ai_task\./, ""),
        e.chars ? fmt(t.tlChars, Number(e.chars).toLocaleString()) : "",
        e.duration != null ? fmt(t.tlDuration, Number(e.duration).toLocaleString(undefined, { maximumFractionDigits: 1 })) : "",
        e.error || "",
      ]
        .filter(Boolean)
        .join(" · ");
      minis = (e.fields || []).map((f) => t.aiuFields[f] || f);
    } else if (e.kind === "ai_held") {
      icon = "shield-check-outline";
      tone = "held";
      title = t.tlHeld;
      sub = t.tlHeldSub;
      minis = (e.reasons || []).map((r) => (r.type === "sender" ? (r.value ? fmt(t.aiuHeldSenderV, r.value) : t.aiuHeldSender) : fmt(t.aiuHeldTerm, r.value)));
    } else if (e.kind === "rated") {
      icon = e.local ? "account-check-outline" : "tag-outline";
      tone = "ai";
      title = fmt(e.local ? t.tlRatedLocal : e.again ? t.tlRatedAgain : t.tlRated, cat(e.category));
      sub = [e.importance ? fmt(t.tlImportance, e.importance) : "", e.confidence ? t[`tlConf_${e.confidence}`] || "" : ""].filter(Boolean).join(" · ");
      quote = e.reason || "";
      if (e.suspicious) minis = [t.aiSuspicious];
    } else if (e.kind === "ai_applied") {
      const applied = e.applied || [];
      const moved = applied.find((a) => String(a).startsWith("moved:"));
      const quota = applied.includes("quota");
      icon = moved ? "folder-move-outline" : quota ? "timer-sand" : "check";
      tone = quota ? "warn" : "move";
      title = moved ? fmt(t.tlMoved, moved.slice(6)) : quota ? t.aiApplied_quota : t.tlApplied;
      sub = applied
        .filter((a) => !String(a).startsWith("moved:") && a !== "quota")
        .map((a) => t[`aiApplied_${a}`] || a)
        .join(", ") || t.tlAppliedSub;
    } else if (e.kind === "acted") {
      icon = { seen: "email-open-outline", unseen: "email-outline", flag: "flag-outline", unflag: "flag-off-outline", archive: "archive-arrow-down-outline", inbox: "inbox-arrow-down", trash: "delete-outline", return: "undo-variant" }[e.action] || "gesture-tap";
      tone = "you";
      title = t[`tlActed_${e.action}`] || e.action;
      sub = e.mailbox && ["archive", "inbox", "trash", "return"].includes(e.action) ? this._folderName(e.mailbox) : "";
    } else if (e.kind === "corrected") {
      icon = e.by === "move" ? "folder-move-outline" : "pencil-outline";
      tone = "you";
      title = e.by === "move" ? t.tlCorrectedByMove : t.tlCorrected;
      sub = fmt(t.tlCorrectedSub, cat(e.before), cat(e.after));
    } else if (e.kind === "event_proposed") {
      icon = "calendar-clock";
      tone = "ai";
      title = t.tlEventProposed;
      sub = [e.title, e.start ? this._fyWhen({ start: e.start, all_day: String(e.start).length <= 10 }) : ""].filter(Boolean).join(" · ");
    } else if (e.kind === "event_added") {
      icon = "calendar-check";
      tone = "you";
      title = fmt(t.tlEventAdded, e.calendar || "");
      sub = [e.title, e.start ? this._fyWhen({ start: e.start, all_day: String(e.start).length <= 10 }) : ""].filter(Boolean).join(" · ");
    } else if (e.kind === "event_dismissed") {
      icon = "calendar-remove-outline";
      tone = "you";
      title = t.tlEventDismissed;
    } else if (e.kind === "event_restored") {
      icon = "calendar-refresh-outline";
      tone = "you";
      title = t.tlEventRestored;
    } else if (e.kind === "vip_notified") {
      icon = "star-outline";
      tone = "ai";
      title = t.tlVipNotified;
    }
    return `<li class="t-${tone} ${last ? "now" : ""}">
        <span class="dot">${ico(icon)}</span>
        <div class="what"><strong>${esc(title)}</strong>${sub ? `<span class="sub">${esc(sub)}</span>` : ""}${quote ? `<span class="quote">${esc(quote)}</span>` : ""}${
          minis.length ? `<span class="chips">${minis.map((m) => `<span class="mini">${esc(m)}</span>`).join("")}</span>` : ""
        }</div>
        <span class="when">${e.time ? `<time datetime="${esc(e.time)}" title="${esc(fmtDateTime(e.time))}">${esc(fmtSeconds(e.time))}</time>` : ""}</span>
      </li>`;
  }

  // After an update Home Assistant keeps the old code of an open panel until it is reloaded.
  _renderUpdateHint() {
    const loaded = new URLSearchParams(VERSION_QUERY).get("v");
    const server = this._s.serverVersion;
    if (!loaded || !server || loaded === server) return "";
    const t = this.t;
    return `<div class="info update-hint" data-announce>${ico("update")}<span class="grow">${esc(t.updateReady)}</span><button class="small" data-action="reload">${esc(t.reloadNow)}</button></div>`;
  }

  _renderHistory() {
    const t = this.t;
    const s = this._s;
    const time = (h) => {
      if ((h.runs || 1) > 1) {
        const a = parseTime(h.started);
        const b = parseTime(h.finished);
        const sameDay = a && b && a.toDateString() === b.toDateString();
        return `${fmtShort(h.started)} – ${sameDay ? fmtClock(h.finished) : fmtShort(h.finished)}`;
      }
      return fmtShort(h.finished || h.started);
    };
    const aiOf = (h) => h.ai || null;
    const errorsOf = (h) => [...(h.errors || []), ...(aiOf(h)?.errors || [])];
    const didSomething = (h) => h.matched > 0 || (aiOf(h) && (aiOf(h).applied > 0 || aiOf(h).rated > 0));
    const kinds = {
      "": () => true,
      hits: (h) => didSomething(h),
      ai: (h) => !!aiOf(h) && (aiOf(h).rated > 0 || aiOf(h).held > 0 || aiOf(h).errors.length > 0),
      errors: (h) => errorsOf(h).length > 0,
    };
    const f = kinds[s.runFilter] ? s.runFilter : "";
    const trigIcon = { auto: "timer-outline", push: "lightning-bolt", assistant: "robot-outline", manual: "gesture-tap", rerate: "refresh" };
    const sort = s.runsSort || { key: "time", dir: -1 };
    const mailCount = (h) => Math.max(Number(h.checked || 0), (h.mails || []).length + Number(h.mails_more || 0));
    const runValue = (h) =>
      ({
        time: parseTime(h.finished || h.started)?.getTime() || 0,
        trig: trigLabel(t, h.trigger),
        checked: mailCount(h),
        matched: Number(h.matched || 0),
        ai: Number(aiOf(h)?.rated || 0) + Number(aiOf(h)?.held || 0),
        res: errorsOf(h).length ? 2 : didSomething(h) ? 1 : 0,
      })[sort.key];
    const rows = s.history
      .map((h, i) => ({ h, i }))
      .filter(({ h }) => kinds[f](h))
      .sort((x, y) => {
        const a = runValue(x.h);
        const b = runValue(y.h);
        return (a < b ? -1 : a > b ? 1 : 0) * sort.dir || x.i - y.i;
      })
      .map(({ h }) => {
        const trig = trigLabel(t, h.trigger);
        const scope = h.scope === "all" ? t.scopeAll : t.scopeNew;
        const errors = errorsOf(h);
        const ai = aiOf(h);
        const res = errors.length ? t.resError : didSomething(h) ? t.resOk : t.resIdle;
        const resIcon = errors.length ? "alert-circle-outline" : didSomething(h) ? "check-circle-outline" : "minus-circle-outline";
        const rules = Object.entries(h.rules || {});
        const mails = h.mails || [];
        const mailList = mails.length ? this._mailList(mails, h.mails_more, h.id) : "";
        const open = s.runOpen === h.id && mailList;
        const aiCell = ai && (ai.rated || ai.held || ai.errors.length)
          ? `<span class="tchip t-ai" title="${esc(fmt(t.runAiTip, ai.rated, ai.applied, ai.held))}"><span class="vh">${esc(fmt(t.runAiTip, ai.rated, ai.applied, ai.held))}</span>${ico("creation")}<span aria-hidden="true">${esc(ai.rated)}</span>${ai.applied ? `<span class="sub" aria-hidden="true">· ${esc(fmt(t.runAiApplied, ai.applied))}</span>` : ""}${ai.held ? `<span class="sub" aria-hidden="true">· ${ico("shield-check-outline")}${esc(ai.held)}</span>` : ""}</span>`
          : `<span class="muted">–</span>`;
        const search = [
          time(h), trig, scope, ...rules.map(([n]) => n), res, ...errors,
          ...mails.map((m) => `${m.subject} ${m.from} ${m.ai?.category || ""}`),
          ai ? t.ai : "",
        ].join(" ").toLowerCase();
        return `<tr data-search="${esc(search)}" class="${errors.length ? "err row-err" : didSomething(h) ? "hit" : "idle"} ${mailList ? "expandable" : ""} ${open ? "open" : ""} ${this._fresh?.has(h.id) ? "fresh" : ""}">
            <td class="c-time"><span class="nm"><strong>${esc(time(h))}</strong>${(h.runs || 1) > 1 ? `<small>${esc(fmt(t.runsMerged, h.runs))}</small>` : ""}</span></td>
            <td class="c-trig"><span class="tchip t-${esc(trigIcon[h.trigger] ? h.trigger : "manual")}" title="${esc(trig)}">${ico(trigIcon[h.trigger] || trigIcon.manual)}<span class="tl">${esc(trig)}</span></span></td>
            <td class="c-scope dim"><span class="scope">${ico(h.scope === "all" ? "email-multiple-outline" : "email-arrow-left-outline")}<span class="sc-txt">${esc(scope)}</span>${(h.mailboxes || []).map((b) => `<span class="chip ic mbox">${ico("inbox-outline")}${esc(b)}</span>`).join("")}</span></td>
            <td class="c-checked num" title="${esc(t.colMails)}">${mailList ? `<button class="hitchip" data-action="run-open" data-id="${esc(h.id)}" aria-expanded="${!!open}" aria-label="${esc(`${t.runMails}: ${mailCount(h)}`)}" title="${esc(t.runMails)}">${ico("email-multiple-outline")}<strong>${esc(mailCount(h))}</strong></button>` : esc(mailCount(h))}</td>
            <td class="c-matched num" title="${esc(t.colMatched)}">${h.matched ? `<strong>${esc(h.matched)}</strong>` : "0"}</td>
            <td class="c-rules">${rules.length ? rules.map(([n, c]) => `<span class="chip">${esc(n)} · ${esc(c)}</span>`).join("") : `<span class="muted">–</span>`}</td>
            <td class="c-ai">${aiCell}</td>
            <td class="c-res"><span class="fact res" title="${esc(errors.length ? errors.join("; ") : res)}">${ico(resIcon)}${esc(res)}</span>${errors.length ? `<div class="muted">${esc(errors.join("; "))}</div>` : ""}</td>
          </tr>${open ? `<tr class="detail"><td colspan="8"><div class="det"><div class="lbl">${esc(t.runMails)}</div>${mailList}</div></td></tr>` : ""}`;
      })
      .join("");
    const cols = [
      { key: "trig", label: t.colTrigger },
      { key: "scope", label: t.colScope },
      { key: "checked", label: t.colMails },
      { key: "matched", label: t.colMatched },
      { key: "rules", label: t.colRules },
      { key: "ai", label: t.colAi },
      { key: "res", label: t.colResult },
    ];
    const count = (k) => s.history.filter(kinds[k]).length;
    const seg = (val, icon, label) => {
      const n = count(val);
      if (val && !n && f !== val) return "";
      return `<button class="seg ${f === val ? "on" : ""}" data-action="run-filter" data-v="${val}" aria-pressed="${f === val}">${ico(icon)}${esc(label)}<span class="n">${n}</span></button>`;
    };
    const more = s.historyTotal > s.history.length;
    // a push pass that is still running (rules and AI rating take a few seconds)
    const cur = s.historyCurrent;
    const curLine = cur
      ? `<span class="working pending-run" role="status"><span class="spinner" aria-hidden="true"></span><strong>${esc(fmtSeconds(cur.started))}</strong><span class="tchip t-${esc(trigIcon[cur.trigger] ? cur.trigger : "manual")}">${ico(trigIcon[cur.trigger] || trigIcon.manual)}<span class="tl">${esc(trigLabel(t, cur.trigger))}</span></span><span>${esc(cur.ai ? t.runPendingAi : t.runPending)}</span></span>`
      : "";
    return `<div class="card">
      <div class="chead"><h2>${esc(t.history)}</h2>
        ${W.cardMenu([s.history.length && { action: "history-clear", icon: "delete-sweep-outline", label: t.clearHistory, danger: true, disabled: s.busy }], t)}</div>
      <p class="muted" style="margin:0 0 10px">${esc(t.historyHint)}</p>
      ${
        s.history.length
          ? `<div class="tbar">
              <label class="search">${ico("magnify")}<input type="search" data-search-table="runs" value="${esc(s.searchRuns || "")}" placeholder="${esc(t.searchRuns)}" aria-label="${esc(t.searchRuns)}"></label>
              <div class="segs" role="group">${seg("", "format-list-bulleted", t.filterAllRules)}${seg("hits", "check-circle-outline", t.runsWithHits)}${seg("ai", "creation", t.ai)}${seg("errors", "alert-circle-outline", t.resError)}</div>
              <span class="grow"></span>${W.columnMenu(this._layout, "runs", cols, t)}
            </div>${W.columnStyle(this._layout, "runs", cols)}
            <div class="scroll menus"><table class="dtable htable" data-table="runs"><thead><tr>
              ${sortTh("runs-sort", sort, "time", t.colTime, "c-time")}${sortTh("runs-sort", sort, "trig", t.colTrigger, "c-trig")}<th class="c-scope">${esc(t.colScope)}</th>${sortTh("runs-sort", sort, "checked", t.colMails, "c-checked num")}${sortTh("runs-sort", sort, "matched", t.colMatched, "c-matched num")}<th class="c-rules">${esc(t.colRules)}</th>${sortTh("runs-sort", sort, "ai", t.colAi, "c-ai")}${sortTh("runs-sort", sort, "res", t.colResult, "c-res")}
            </tr></thead><tbody>${curLine ? `<tr class="pending"><td colspan="8">${curLine}</td></tr>` : ""}${rows || `<tr><td colspan="8" class="muted">${esc(t.noMatches)}</td></tr>`}</tbody></table></div>${W.pagerSlot ? W.pagerSlot("runs") : ""}
            <p class="muted nomatch" hidden>${esc(t.noMatches)}</p>`
          : curLine || `<p class="muted">${esc(t.noHistory)}</p>`
      }
      ${more ? `<button class="morelink" data-action="history-more" ${s.busy ? "disabled" : ""}>${ico("chevron-down")}${esc(t.showMore)}</button>` : ""}
    </div>`;
  }

  async _switchAccount(entryId) {
    this._s.entryId = entryId;
    this._s.act = newActivity();
    this._s.sheet = null;
    this._s.editing = null;
    this._s.report = null;
    this._s.notice = null;
    await this._call(() => this._reload());
  }

  async _run(scope, dryRun, ruleIds = null) {
    if (
      !dryRun &&
      scope === "all" &&
      !(await this._confirm({ title: this.t.confirmRunTitle, text: this.t.confirmRun, ok: this.t.confirmRunOk, irreversible: false }))
    )
      return;
    await this._call(async () => {
      const msg = { type: "friedafetch_mail/rules/run", entry_id: this._s.entryId, scope, dry_run: dryRun };
      if (ruleIds) msg.rule_ids = ruleIds;
      this._s.report = await this._ws(msg);
      this._s.scrollToReport = true;
      await this._reload();
    });
  }

  // ---------------------------------------------------------------- render
  _condText(c) {
    const t = this.t;
    return `${t.fields[c.field] || c.field} ${t.ops[c.op] || c.op} „${c.value}“`;
  }

  // Actions as small chips with icons (also used in the expanded row).
  _actionChips(a) {
    const t = this.t;
    const chip = (icon, text) => `<span class="chip ic">${ico(icon)}${esc(text)}</span>`;
    const out = [];
    if (a.move_to) out.push(chip("folder-move-outline", a.move_to));
    if (a.delete) out.push(chip("delete-outline", t.aDelete));
    if (a.mark_seen === true) out.push(chip("email-open-outline", t.aSeen));
    if (a.mark_seen === false) out.push(chip("email-mark-as-unread", t.aUnseen));
    if (a.flag === true) out.push(chip("flag-outline", t.aFlag));
    if (a.flag === false) out.push(chip("flag-off-outline", t.aUnflag));
    if (a.save_attachments) out.push(chip("paperclip", t.aSave + (a.attachments_folder ? ` → ${a.attachments_folder}` : "")));
    return out.join("");
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
    return `<div class="card"><div class="chead"><h2>${esc(t.accounts)}</h2><span class="muted">${s.accounts.length}</span></div>
      <div class="tabs">${tabs}</div>
      <p class="muted" style="margin:10px 0 0">${esc(t.switchHint)}</p></div>`;
  }

  // Rules as a compact table. The order decides which rule acts first, so it is shown and not sortable.
  _renderRules() {
    const t = this.t;
    const s = this._s;
    const newEditor = s.editing && !s.editing.id ? `<div class="rule-new">${this._renderEditor()}</div>` : "";
    if (!s.rules.length)
      return (
        newEditor ||
        `<div class="empty"><p class="muted" style="margin:0">${esc(t.noRules)}</p><button data-action="new">+ ${esc(t.firstRule)}</button></div>`
      );
    const multiBox = new Set(s.rules.map((r) => r.mailbox)).size > 1;
    const ruleCols = [
      { key: "pos", label: t.colPos },
      { key: "cond", label: t.conditions },
      { key: "act", label: t.actions },
      { key: "hits", label: t.hits },
    ];
    const tests = { "": () => true, on: (r) => r.enabled, off: (r) => !r.enabled, delete: (r) => !!r.actions.delete, move: (r) => !!r.actions.move_to };
    const f = tests[s.ruleFilter] ? s.ruleFilter : "";
    const count = (k) => s.rules.filter(tests[k]).length;
    const seg = (val, icon, label) => {
      const n = count(val);
      if (val && !n && f !== val) return "";
      return `<button class="seg ${f === val ? "on" : ""}" data-action="rule-filter" data-v="${val}" aria-pressed="${f === val}">${ico(icon)}${esc(label)}<span class="n">${n}</span></button>`;
    };
    const others = s.accounts.filter((a) => a.entry_id !== s.entryId);
    const item = (action, id, icon, label, extra = "", cls = "") =>
      `<button class="${cls}" data-action="${action}" data-id="${esc(id)}" ${extra}>${ico(icon)}<span class="mi"><span>${esc(label)}</span></span></button>`;
    const sort = s.rulesSort || { key: "pos", dir: 1 };
    const sorted = sort.key !== "pos" || sort.dir !== 1;
    const ruleValue = (r, i) => ({ pos: i, name: String(r.name || "").toLowerCase(), hits: Number(r.hits || 0) })[sort.key];
    const rows = s.rules
      .map((r, i) => ({ r, i }))
      .sort((x, y) => {
        const a = ruleValue(x.r, x.i);
        const b = ruleValue(y.r, y.i);
        return (a < b ? -1 : a > b ? 1 : 0) * sort.dir || x.i - y.i;
      })
      .map(({ r, i }) => {
        if (!tests[f](r)) return "";
        const editingThis = s.editing && s.editing.id === r.id;
        const open = editingThis || s.expanded.has(r.id);
        const conds = r.conditions.map((c) => this._condText(c));
        const n = conds.length;
        const acts = this._actionChips(r.actions);
        const menu = `<details class="menu rowmenu"><summary aria-label="${esc(t.moreActions)}" title="${esc(t.moreActions)}">${ico("dots-vertical")}</summary><div class="menu-list">
            ${item("edit", r.id, "pencil-outline", t.edit, s.editing ? "disabled" : "")}
            ${item("test", r.id, "play-outline", t.testRuleHint, s.busy ? "disabled" : "")}
            ${item("up", r.id, "arrow-up", t.up, i === 0 || sorted ? "disabled" : "")}
            ${item("down", r.id, "arrow-down", t.down, i === s.rules.length - 1 || sorted ? "disabled" : "")}
            ${others.map((a) => item("copy-to", r.id, "content-copy", fmt(t.copyToAccount, a.label), `data-target="${esc(a.entry_id)}"`)).join("")}
            <hr>
            ${item("delete", r.id, "delete-outline", t.remove, "", "danger-item")}
          </div></details>`;
        const detail = editingThis
          ? this._renderEditor()
          : `<div class="rdet">
              <div><div class="lbl">${esc(t.conditions)}${n > 1 ? ` · ${esc(r.match === "any" ? t.matchAnyShort : t.matchAllShort)}` : ""}</div>${conds.map((c) => `<span class="chip">${esc(c)}</span>`).join("")}</div>
              <div><div class="lbl">${esc(t.actions)}</div>${acts || `<span class="muted">${esc(t.noActions)}</span>`}${r.actions.stop === false ? `<div class="muted">${ico("arrow-down")} ${esc(t.continueRules)}</div>` : ""}</div>
              <div class="rdet-tools">
                <button class="secondary ib" data-action="edit" data-id="${esc(r.id)}" ${s.editing ? "disabled" : ""}>${ico("pencil-outline")}${esc(t.edit)}</button>
                <button class="secondary ib" data-action="test" data-id="${esc(r.id)}" ${s.busy ? "disabled" : ""} title="${esc(t.testRuleHint)}">${ico("play-outline")}${esc(t.testRule)}</button>
              </div>
            </div>`;
        const search = [r.name, r.mailbox, ...conds, r.actions.move_to || ""].join(" ").toLowerCase();
        const drag = !sorted && !f && !s.editing && s.rules.length > 1;
        return `<tr class="rrow ${open ? "open" : ""} ${r.enabled ? "" : "off"}" data-rule-id="${esc(r.id)}" data-search="${esc(search)}" ${drag ? `draggable="true" data-pos="${i}"` : ""}>
            <td class="c-pos num">${drag ? `<span class="grip" aria-hidden="true">${ico("drag-vertical")}</span>` : ""}${i + 1}</td>
            <td class="c-on"><input type="checkbox" class="switch" data-action="toggle" data-id="${esc(r.id)}" ${r.enabled ? "checked" : ""} title="${esc(t.enabled)}" aria-label="${esc(t.enabled)}: ${esc(r.name)}"></td>
            <td class="c-name"><button class="rname" data-action="expand" data-id="${esc(r.id)}" aria-expanded="${open}" ${editingThis ? "disabled" : ""}>${ico("chevron-right")}<span class="nm"><strong>${esc(r.name)}</strong>${multiBox ? `<small>${esc(r.mailbox)}</small>` : ""}</span></button></td>
            <td class="c-cond dim" data-action="expand" data-id="${esc(r.id)}" title="${esc(conds.join("\n"))}"><span class="ctext">${esc(conds[0] || "")}</span>${n > 1 ? `<span class="more">+${n - 1}</span>` : ""}</td>
            <td class="c-act">${acts || `<span class="muted">${esc(t.noActions)}</span>`}</td>
            <td class="c-hits num" title="${esc(t.hits)}">${esc(r.hits ?? 0)}</td>
            <td class="c-menu">${menu}</td>
          </tr>${open ? `<tr class="detail rdetail" data-detail-for="${esc(r.id)}"><td colspan="7">${detail}</td></tr>` : ""}`;
      })
      .join("");
    return `${newEditor}<div class="tbar">
        <label class="search">${ico("magnify")}<input type="search" data-search-table="rules" value="${esc(s.searchRules || "")}" placeholder="${esc(t.searchRules)}" aria-label="${esc(t.searchRules)}"></label>
        <div class="segs" role="group">${seg("", "format-list-bulleted", t.filterAllRules)}${seg("on", "check-circle-outline", t.enabled)}${seg("off", "pause-circle-outline", t.inactive)}${seg("delete", "delete-outline", t.aDelete)}${seg("move", "folder-move-outline", t.moves)}</div>
        <span class="grow"></span>${W.columnMenu(this._layout, "rules", ruleCols, t)}
      </div>${W.columnStyle(this._layout, "rules", ruleCols)}
      ${sorted ? `<p class="sortnote">${ico("information-outline")}<span>${esc(t.sortedView)}</span><button class="link" data-action="rules-sort" data-k="pos">${esc(t.showOrder)}</button></p>` : ""}
      <div class="scroll menus"><table class="dtable rtable" data-table="rules"><thead><tr>
        ${sortTh("rules-sort", sort, "pos", "#", "c-pos num")}<th class="c-on"><span class="vh">${esc(t.enabled)}</span></th>${sortTh("rules-sort", sort, "name", t.name)}<th class="c-cond">${esc(t.conditions)}</th><th class="c-act">${esc(t.actions)}</th>${sortTh("rules-sort", sort, "hits", t.hits, "c-hits num")}<th class="c-menu"><span class="vh">${esc(t.moreActions)}</span></th>
      </tr></thead><tbody>${rows || `<tr><td colspan="7" class="muted">${esc(t.noMatches)}</td></tr>`}</tbody></table></div>${W.pagerSlot ? W.pagerSlot("rules") : ""}
      <p class="muted nomatch" hidden>${esc(t.noMatches)}</p>`;
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
          <select class="c-field" aria-label="${esc(fmt(t.condField, i + 1))}">${FIELDS.map((f) => opt(f, t.fields[f], c.field)).join("")}</select>
          <select class="c-op" aria-label="${esc(fmt(t.condOp, i + 1))}">${OPS.map((o) => opt(o, t.ops[o], c.op)).join("")}</select>
          <input type="text" class="c-value" value="${esc(c.value)}" placeholder="${esc(t.value)}" aria-label="${esc(fmt(t.condValue, i + 1))}">
          <button class="icon" data-action="remove-cond" data-index="${i}" ${e.conditions.length === 1 ? "disabled" : ""} title="${esc(t.remove)}" aria-label="${esc(fmt(t.condRemove, i + 1))}">${ico("close")}</button>
        </div>`
      )
      .join("");
    const a = e.actions;
    const tri = (val) => (val === null || val === undefined ? "" : String(val));
    return `<div class="editor" id="editor">
      <h3 class="title">${esc(e.id ? t.editRule : t.newRule)}</h3>
      <div class="row"><label for="f-name">${esc(t.name)}</label><input type="text" id="f-name" class="grow" value="${esc(e.name)}"></div>
      <div class="row"><label for="f-mailbox">${esc(t.mailbox)}</label><select id="f-mailbox">${boxes.map((b) => opt(b, b, e.mailbox)).join("")}</select></div>
      <div class="row"><label for="f-match">${esc(t.match)}</label><select id="f-match">${opt("all", t.all, e.match)}${opt("any", t.any, e.match)}</select></div>
      <p class="rsentence" id="rule-sentence" aria-live="polite">${esc(this._ruleSentence(e))}</p>
      <div class="with-add"><h3 class="muted">${esc(t.conditions)}</h3><button class="round small" data-action="add-cond" title="${esc(t.addCondition)}" aria-label="${esc(t.addCondition)}">+</button></div>
      ${conds}
      <div class="rpreview" id="rule-preview" aria-live="polite"></div>
      <h3 class="muted">${esc(t.actions)}</h3>
      <div class="row"><label for="f-move">${esc(t.moveTo)}</label><select id="f-move">${opt("", t.noMove, a.move_to || "")}${this._s.mailboxes.map((b) => opt(b, b, a.move_to || "")).join("")}</select></div>
      <div class="row"><label for="f-seen">${esc(t.markSeen)}</label><select id="f-seen">${opt("", t.unchanged, tri(a.mark_seen))}${opt("true", t.seen, tri(a.mark_seen))}${opt("false", t.unseen, tri(a.mark_seen))}</select></div>
      <div class="row"><label for="f-flag">${esc(t.flag)}</label><select id="f-flag">${opt("", t.unchanged, tri(a.flag))}${opt("true", t.flagSet, tri(a.flag))}${opt("false", t.flagClear, tri(a.flag))}</select></div>
      <div class="row"><label></label><label class="opt"><input type="checkbox" class="switch" id="f-delete" ${a.delete ? "checked" : ""}><span>${esc(t.delete)}</span></label></div>
      <div class="row"><label></label><label class="opt"><input type="checkbox" class="switch" id="f-save" ${a.save_attachments ? "checked" : ""}><span>${esc(t.saveAttachments)}</span></label></div>
      <div class="row"><label for="f-save-folder">${esc(t.attachmentsFolder)}</label><input type="text" id="f-save-folder" class="grow" value="${esc(a.attachments_folder || "")}" placeholder="${esc(t.attachmentsHint)}"></div>
      <div class="row"><label></label><label class="opt"><input type="checkbox" class="switch" id="f-stop" ${a.stop !== false ? "checked" : ""}><span>${esc(t.stop)}</span></label></div>
      <div class="row"><label></label><label class="opt"><input type="checkbox" class="switch" id="f-enabled" ${e.enabled ? "checked" : ""}><span>${esc(t.enabled)}</span></label></div>
      <div class="actionsbar"><button data-action="save" ${this._s.busy ? "disabled" : ""}>${esc(t.save)}</button><button class="secondary" data-action="cancel">${esc(t.cancel)}</button></div>
    </div>`;
  }

  // The rule in one sentence: "If the sender contains …, then: move to Archive."
  _ruleSentence(e) {
    const t = this.t;
    const conds = (e.conditions || []).filter((c) => String(c.value || "").trim()).map((c) => this._condText(c));
    const plain = (x) => x.replace(/<[^>]*>/g, "").replace(/&(amp|lt|gt|quot|#39);/g, (m, k) => ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" })[k]).trim();
    const acts = this._actionChips(e.actions || {})
      .split("</span>")
      .map(plain)
      .filter(Boolean);
    if (e.actions?.stop === false) acts.push(t.rsStop);
    return fmt(t.rsIf, conds.join(e.match === "any" ? t.rsOr : t.rsAnd) || "…", acts.join(", ") || t.rsNothing);
  }

  // While the editor is open: the sentence follows every change, the preview asks the server a moment later
  _ruleLive() {
    const root = this.shadowRoot;
    const e = this._s.editing ? this._readForm() : null;
    if (!e) return;
    const sentence = root.querySelector("#rule-sentence");
    if (sentence) sentence.textContent = this._ruleSentence(e);
    const conditions = (e.conditions || []).filter((c) => String(c.value || "").trim());
    const box = root.querySelector("#rule-preview");
    if (box && this._previewCache?.ask === JSON.stringify([conditions, e.match])) box.innerHTML = this._previewCache.html;
    clearTimeout(this._previewTimer);
    this._previewTimer = setTimeout(() => this._rulePreview(e), 350);
  }

  async _rulePreview(e) {
    const t = this.t;
    const box = this.shadowRoot.querySelector("#rule-preview");
    const conditions = (e.conditions || []).filter((c) => String(c.value || "").trim());
    if (!box) return;
    if (!conditions.length) return void (box.innerHTML = "");
    const ask = JSON.stringify([conditions, e.match]);
    if (this._previewCache?.ask === ask) return void (box.innerHTML = this._previewCache.html); // a redraw: same answer
    this._previewAsk = ask;
    if (!box.innerHTML) box.innerHTML = `<p class="muted">${esc(t.rpChecking)}</p>`;
    let res;
    try {
      res = await this._ws({ type: "friedafetch_mail/rules/preview", entry_id: this._s.entryId, conditions, match: e.match || "all" });
    } catch (err) {
      if (this._previewAsk === ask) box.innerHTML = `<p class="muted">${esc(fmt(t.rpError, err.message || err))}</p>`;
      return;
    }
    if (this._previewAsk !== ask || !this.shadowRoot.contains(box)) return;
    const rows = res.matches
      .map((m) => `<li><strong>${esc(m.name || m.from || "–")}</strong><span>${esc(m.subject || "–")}</span><small>${esc(fmtShort(m.time))}</small></li>`)
      .join("");
    box.innerHTML = `<h4>${ico("eye-outline")}${esc(t.rpTitle)}</h4>
      <p class="muted">${esc(res.total ? fmt(t.rpSome, res.total, res.checked) : fmt(t.rpNone, res.checked))}</p>
      ${rows ? `<ul>${rows}</ul>` : ""}${res.total > res.matches.length ? `<p class="muted">${esc(fmt(t.rpMore, res.total - res.matches.length))}</p>` : ""}
      ${res.unknown ? `<p class="muted note">${ico("information-outline")}<span>${esc(t.rpUnknown)}</span></p>` : ""}`;
    this._previewCache = { ask, html: box.innerHTML };
  }

  // Drag a rule to its new place (the menu's up/down stays for keyboards)
  async _moveTo(id, position) {
    const t = this.t;
    const name = this._s.rules.find((r) => r.id === id)?.name || "";
    await this._call(async () => {
      await this._ws({ type: "friedafetch_mail/rules/update", entry_id: this._s.entryId, rule_id: id, changes: { position } });
      await this._reload();
    });
    if (!this._s.error) W.announce(this.shadowRoot, fmt(t.ruleMoved, name, position + 1), 0);
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
      .map((s) => `<li>${esc(t[s.code] ? fmt(t[s.code], s.count ?? "") : s.reason)}${s.uid ? ` (UID ${s.uid})` : ""}${s.rule ? ` – ${esc(s.rule)}` : ""}${s.mailbox ? ` – ${esc(s.mailbox)}` : ""}</li>`)
      .join("");
    const errors = (r.errors || []).map((e) => `<li>${esc(e.error)}</li>`).join("");
    return `<div class="card" id="report">
      <div class="chead"><h2>${esc(t.report)}${r.dry_run ? ` <span class="chip">${esc(t.dryRun)}</span>` : ""}</h2><span class="muted">${r.checked} ${esc(t.checked)} · ${r.matched} ${esc(t.matched)}</span></div>
      ${errors ? `<div class="error"><strong>${esc(t.errors)}</strong><ul>${errors}</ul></div>` : ""}
      ${skipped ? `<div class="muted"><strong>${esc(t.skipped)}</strong><ul>${skipped}</ul></div>` : ""}
      ${rows ? `<div class="scroll"><table class="stack"><thead><tr><th>${esc(t.uid)}</th><th>${esc(t.subject)}</th><th>${esc(t.from)}</th><th>${esc(t.rule)}</th><th>${esc(t.action)}</th></tr></thead><tbody>${withLabels(rows, [t.uid, t.subject, t.from, t.rule, t.action])}</tbody></table></div>` : ""}
    </div>`;
  }

  // ------------------------------------------------------------ activity (a mail program: views, mails, the mail)
  // The list comes from the server page by page (50 at a time, more while scrolling); views, search and the days are
  // counted there. On wide screens the chosen mail opens in the reading pane, on phones in the sheet.
  async _loadActivity({ more = false } = {}) {
    const a = this._s.act;
    const offset = more ? a.items.length : 0;
    const limit = more ? ACT_PAGE : Math.max(ACT_PAGE, Math.min(a.items.length, 500));
    const threads = this._layout.opt("act", "threads", true); // one line per conversation, like a mail program
    const res = await this._ws({ type: "friedafetch_mail/activity/list", entry_id: this._s.entryId, view: a.view, query: a.query.trim(), offset, limit, threads });
    a.items = more ? [...a.items, ...res.items] : res.items;
    a.total = res.total;
    a.days = res.days || [];
    a.counts = res.counts || {};
    a.loaded = true;
  }

  async _actMore() {
    const a = this._s.act;
    if (a.loadingMore || a.items.length >= a.total) return;
    a.loadingMore = true;
    try {
      await this._loadActivity({ more: true });
    } catch (err) {
      this._s.error = err.message || String(err);
    }
    a.loadingMore = false;
    this._render();
  }

  // Phones and narrow windows have no reading pane: a mail opens in the sheet over the list.
  _actNarrow() {
    const w = this.shadowRoot.querySelector(".mcwrap")?.clientWidth || this.clientWidth || window.innerWidth;
    return w <= 720;
  }

  async _actView(view) {
    const a = this._s.act;
    a.view = view;
    a.runs = false;
    a.folded = new Set();
    try {
      await this._loadActivity();
    } catch (err) {
      this._s.error = err.message || String(err);
    }
    // a wide screen shows the newest mail of the view, never one that is not in the list
    if (!a.picking && !this._actNarrow()) {
      const first = a.items[0];
      if (first) this._actOpen(first.key);
      else this._s.sheet = null;
    }
    this._render();
  }

  _actItem(key) {
    return this._s.act.items.find((i) => i.key === key) || null;
  }

  _actOpen(key) {
    const item = this._actItem(key);
    if (!item) return;
    if (this._s.act.open !== key && !this._actNarrow()) this._enter = "reader";
    this._s.act.open = key;
    this._s.act.jump = true;
    this._openTimeline({ message_id: item.message_id || null, subject: item.subject || "", sender: item.from || "" }, { inline: !this._actNarrow(), hint: item.folder });
  }

  // Select one mail; with Shift every loaded mail between the last chosen one and this one.
  _actToggle(key, ev) {
    const a = this._s.act;
    const item = this._actItem(key);
    if (!item?.selectable) return;
    const pick = (i) => a.sel.set(i.key, { message_id: i.message_id, mailbox: i.mailbox });
    if (ev?.shiftKey && a.anchor && this._actItem(a.anchor)) {
      const keys = a.items.map((i) => i.key);
      const [from, to] = [keys.indexOf(a.anchor), keys.indexOf(key)].sort((x, y) => x - y);
      a.items.slice(from, to + 1).filter((i) => i.selectable).forEach(pick);
    } else if (a.sel.has(key)) a.sel.delete(key);
    else pick(item);
    a.anchor = key;
    a.picking = true;
    this._render();
  }

  // "Select all" and the day boxes pick on the server: also the mails that are not loaded yet.
  async _actPickMany(day = null, on = true) {
    const a = this._s.act;
    const res = await this._ws({ type: "friedafetch_mail/activity/select", entry_id: this._s.entryId, view: a.view, query: a.query.trim(), ...(day ? { day } : {}) });
    for (const m of res.messages || []) {
      if (on) a.sel.set(m.key, { message_id: m.message_id, mailbox: m.mailbox });
      else a.sel.delete(m.key);
    }
    this._render();
  }

  _actStopPicking() {
    const a = this._s.act;
    a.picking = false;
    a.sel = new Map();
    a.anchor = null;
    this._render();
  }

  // Asks first (the panel's dialog); while the batch runs, every chosen mail shows where it stands.
  async _actRerate(keys, known = {}) {
    const a = this._s.act;
    const order = [...keys].sort((x, y) => {
      const ix = a.items.findIndex((i) => i.key === x);
      const iy = a.items.findIndex((i) => i.key === y);
      return (ix < 0 ? 1e9 : ix) - (iy < 0 ? 1e9 : iy);
    });
    const fromItem = (i) => i && { message_id: i.message_id, mailbox: i.mailbox };
    const messages = order.map((k) => a.sel.get(k) || fromItem(this._actItem(k)) || known[k] || {}).filter((m) => m.message_id);
    const before = this._s.ai?.batch?.started;
    await this._rerate({ messages });
    const b = this._s.ai?.batch;
    if (!b || b.started === before) return;
    a.batch = { started: b.started, keys: order };
    a.picking = false;
    a.sel = new Map();
    this._render();
  }

  _actRowBatch(key) {
    const a = this._s.act;
    const b = this._s.ai?.batch;
    const t = this.t;
    if (!a.batch || !b || b.started !== a.batch.started) return "";
    const k = a.batch.keys.indexOf(key);
    if (k < 0) return "";
    if (k < b.done) return `<span class="rr done">${ico("check")}${esc(t.rowDone)}</span>`;
    if (!this._batchBusy()) return "";
    return k === b.done && b.state === "running"
      ? `<span class="rr work"><span class="spinner" aria-hidden="true"></span>${esc(t.rowWorking)}</span>`
      : `<span class="rr wait">${ico("clock-outline")}${esc(t.rowWaiting)}</span>`;
  }

  _folderName(f) {
    const t = this.t;
    return { trash: t.folderTrash, INBOX: t.folderInbox, "Deleted Messages": t.folderTrash, Archive: t.folderArchive, Junk: t.folderJunk }[f] || f;
  }

  _folderIcon(f) {
    return f === "trash" || f === "Deleted Messages" ? "delete-outline" : f === "INBOX" ? "inbox" : "folder-outline";
  }

  _dayLabel(day) {
    const t = this.t;
    if (!day) return "–";
    const d = new Date(`${day}T12:00:00`);
    const today = new Date();
    const diff = Math.round((new Date(today.toDateString()) - new Date(d.toDateString())) / 86400000);
    if (diff === 0) return t.dayToday;
    if (diff === 1) return t.dayYesterday;
    return d.toLocaleDateString(this._lang(), { weekday: "long", day: "numeric", month: "long" });
  }

  _lang() {
    return (this._hass?.locale?.language || this._hass?.language || "en").toLowerCase();
  }

  // The quiet one-line result: grey text, only the small symbol carries the colour; the folder only when moved.
  _actMeta(item, full = false) {
    const t = this.t;
    const ai = item.ai || {};
    const cat = (c) => (c === "other" ? t.aiOther : c);
    const [label, icon, cls] = {
      rule: [(item.rules || []).join(", "), "filter-check-outline", "rule"],
      held: [t.actHeld, "shield-check-outline", "held"],
      ai: [`${cat(ai.category)}${ai.importance ? ` · ${ai.importance}/5` : ""}`, item.corrected ? "pencil-outline" : ai.local ? "account-check-outline" : "creation", "ai"],
      none: [t.actNone, "minus-circle-outline", ""],
    }[item.kind] || ["–", "circle-small", ""];
    const moved = item.folder !== "INBOX";
    const unsure = `${item.vip ? `<span class="vip" role="img" aria-label="${esc(t.actVip)}">${ico("star")}</span>` : ""}${item.unsure ? `<span class="uns">${esc(t.actUnsureMark)}</span>` : ""}`;
    const where = full || moved ? `<span class="mv">${ico(full ? this._folderIcon(item.folder) : "arrow-right")}${esc(this._folderName(item.folder))}</span>` : "";
    const dot = item.kind === "ai" && ai.category ? `<i class="cdot" style="--cat:${catColor(ai.category)}" aria-hidden="true"></i>` : "";
    return `<span class="meta ${cls}">${ico(icon)}${dot}<span class="rl">${esc(label)}</span></span>${unsure}${where}`;
  }

  _actViews() {
    const t = this.t;
    const c = this._s.act.counts || {};
    const kinds = c.kinds || {};
    const kindViews = [
      ["all", t.actAll, "email-multiple-outline", c.all || 0],
      ["k:ai", t.actKindAi, "creation", kinds.ai || 0],
      ["unsure", t.actUnsure, "help-circle-outline", c.unsure || 0],
      ["k:rule", t.actKindRule, "filter-outline", kinds.rule || 0],
      ["k:held", t.actKindHeld, "shield-check-outline", kinds.held || 0],
      ["k:none", t.actKindNone, "minus-circle-outline", kinds.none || 0],
    ].filter(([id, , , n]) => id === "all" || n);
    // as the mailbox has it now (read / flagged, kept current in the background)
    const stateViews = [
      ["unread", t.actUnread, "email-outline", c.unread || 0],
      ["flagged", t.actFlagged, "flag-outline", c.flagged || 0],
    ].filter(([, , , n]) => n);
    const folders = Object.entries(c.folders || {})
      .sort(([a], [b]) => (a === "INBOX" ? -1 : b === "INBOX" ? 1 : this._folderName(a).localeCompare(this._folderName(b))))
      .map(([f, n]) => [`f:${f}`, this._folderName(f), this._folderIcon(f), n]);
    return { kindViews, stateViews, folders };
  }

  _actStatus() {
    const t = this.t;
    const s = this._s;
    const au = s.automation || {};
    const st = s.ai?.status || {};
    const push = au.push?.state === "listening";
    return [
      push ? `<button class="st ok" data-action="tab" data-v="rules">${ico("lightning-bolt")}${esc(t.actStatusPush)}</button>` : "",
      au.enabled && au.interval ? `<button class="st" data-action="tab" data-v="rules">${ico("timer-outline")}${esc(fmt(push ? t.actStatusEvery : t.actStatusEveryOnly, au.interval))}</button>` : "",
      st.active ? `<button class="st ai" data-action="tab" data-v="ai">${ico("creation")}${esc(st.mode === "act" ? t.actStatusAiAct : t.actStatusAiObserve)}</button>` : "",
    ].join("");
  }

  _renderActivityTab() {
    const t = this.t;
    const s = this._s;
    const a = s.act;
    if (a.runs) {
      return `<section class="widget w-full" data-widget="runsbar"><div class="card"><div class="runsbar">
          <button class="secondary small ib" data-action="act-runs-back">${ico("chevron-left")}${esc(t.actRunsBack)}</button><span class="muted">${esc(t.actRunsHint)}</span></div></div></section>
        <section class="widget w-full" data-widget="history">${this._renderHistory()}</section>`;
    }
    const { kindViews, stateViews, folders } = this._actViews();
    const box = ([id, label, icon, n]) =>
      `<button class="box" data-action="act-view" data-v="${esc(id)}" aria-current="${a.view === id}">${ico(icon)}<span class="lbl">${esc(label)}</span><span class="n">${esc(n)}</span></button>`;
    const rail = `<nav class="rail" aria-label="${esc(t.actViews)}">
        <h3>${esc(t.actGroupResult)}</h3>${kindViews.map(box).join("")}
        ${stateViews.length ? `<h3>${esc(t.actGroupState)}</h3>${stateViews.map(box).join("")}` : ""}
        ${folders.length ? `<h3>${esc(t.actGroupFolder)}</h3>${folders.map(box).join("")}` : ""}
        <h3>${esc(t.actGroupTech)}</h3><button class="box" data-action="act-runs">${ico("format-list-numbered")}<span class="lbl">${esc(t.actRuns)}</span></button>
        <span class="grow"></span><div class="status">${this._actStatus()}</div>
      </nav>`;
    return `<section class="widget w-full" data-widget="activity"><div class="mcwrap"><div class="mc">${rail}${this._actList(kindViews, folders, stateViews)}${this._actReader()}</div></div></section>`;
  }

  _actList(kindViews, folders, stateViews = []) {
    const t = this.t;
    const s = this._s;
    const a = s.act;
    const views = [...kindViews, ...stateViews, ...folders];
    const label = (views.find(([id]) => id === a.view) || [null, t.actAll])[1];
    const days = new Map((a.days || []).map((d) => [d.day, d]));
    const selectable = (a.days || []).reduce((n, d) => n + d.selectable, 0);
    const allOn = selectable > 0 && a.sel.size >= selectable && a.items.filter((i) => i.selectable).every((i) => a.sel.has(i.key));
    const dayHead = (day) => {
      const d = days.get(day) || { total: 0, selectable: 0 };
      const dayItems = a.items.filter((i) => i.day === day && i.selectable);
      const on = d.selectable > 0 && dayItems.length === d.selectable && dayItems.every((i) => a.sel.has(i.key));
      const folded = a.folded.has(day) && !a.picking;
      const boxEl = a.picking
        ? `<input type="checkbox" class="selbox" data-action="act-day" data-v="${esc(day)}" ${on ? "checked" : ""} ${d.selectable ? "" : "disabled"} aria-label="${esc(fmt(t.actPickDay, this._dayLabel(day), d.selectable))}">`
        : "";
      return `<li class="day">${boxEl}<button class="dayfold" data-action="act-fold" data-v="${esc(day)}" aria-expanded="${!folded}" ${a.picking ? "disabled" : ""}>${a.picking ? "" : ico(folded ? "chevron-right" : "chevron-down")}<span>${esc(this._dayLabel(day))}</span><span class="dn">${esc(d.total)}</span></button></li>`;
    };
    let day = null;
    const parts = [];
    for (const item of a.items) {
      if (item.day !== day) {
        day = item.day;
        parts.push(dayHead(day));
      }
      if (a.folded.has(day) && !a.picking) continue;
      const picked = a.sel.has(item.key);
      const name = item.name || item.from || "–";
      const when = fmtClock(item.time);
      // read / flagged as the mailbox has it now (kept current in the background; CONDSTORE where the server has it);
      // a mail that left the inbox keeps its last state – flags travel with a moved mail
      const st = item.state && item.state.seen != null ? item.state : null;
      const unread = st?.seen === false;
      const flag = st?.flagged ? `<span class="fl" aria-hidden="true">${ico("flag")}</span>` : "";
      const aria = `${name}, ${item.subject || "–"}, ${this._dayLabel(item.day)} ${when}${unread ? `, ${t.stUnread}` : ""}${st?.flagged ? `, ${t.stFlagged}` : ""}${item.thread_count > 1 ? `, ${fmt(t.actThreadCount, item.thread_count)}` : ""}`;
      const role = a.picking
        ? item.selectable
          ? `role="checkbox" aria-checked="${picked}" aria-label="${esc(aria)}"`
          : `aria-disabled="true" aria-label="${esc(`${aria} – ${item.kind === "rule" ? t.actRuleNotAi : t.actNotSelectable}`)}"`
        : `aria-current="${a.open === item.key}" aria-label="${esc(aria)}"`;
      const av = a.picking ? `<span class="av ${item.selectable ? "pick" : "off"}" aria-hidden="true">${picked ? ico("check") : ""}</span>` : "";
      parts.push(`<li class="m ${!a.picking && a.open === item.key ? "open" : ""} ${picked ? "picked" : ""} ${a.picking && !item.selectable ? "dim" : ""} ${this._fresh?.has?.(item.key) ? "fresh" : ""} ${unread ? "unread" : ""}">
          ${av}<button class="mitem" data-action="act-open" data-id="${esc(item.key)}" ${role}>
            <span class="r1">${unread ? `<span class="ud" aria-hidden="true"></span>` : ""}<span class="from">${esc(name)}</span>${item.thread_count > 1 ? `<span class="thr">${ico("forum-outline")}${esc(item.thread_count)}</span>` : ""}${flag}<span class="time">${esc(when)}</span></span>
            <span class="subj">${esc(item.subject || "–")}</span>
            <span class="r3">${this._actMeta(item)}${this._actRowBatch(item.key)}</span>
          </button></li>`);
    }
    const left = a.total - a.items.length;
    const more = left > 0
      ? `<div class="lmore" data-more-sentinel>${a.loadingMore ? `<span class="spinner" aria-hidden="true"></span>` : ""}<button class="link small" data-action="act-more" ${a.loadingMore ? "disabled" : ""}>${esc(fmt(t.actMore, Math.min(ACT_PAGE, left)))}</button><span class="muted">${esc(fmt(t.actLeft, left))}</span></div>`
      : "";
    // the rare "clear" sits next to the title on wide screens, next to the search on narrow ones
    const grouped = this._layout.opt("act", "threads", true);
    const menu = W.cardMenu(
      [
        { action: "act-threads", icon: grouped ? "format-list-bulleted" : "forum-outline", label: grouped ? t.actThreadsOff : t.actThreadsOn },
        a.counts?.all && { action: "act-clear", icon: "delete-sweep-outline", label: t.actClear, danger: true, disabled: s.busy },
      ],
      t
    );
    const opts = (group, list) => `<optgroup label="${esc(group)}">${list.map(([id, l, , n]) => `<option value="${esc(id)}" ${a.view === id ? "selected" : ""}>${esc(l)} (${esc(n)})</option>`).join("")}</optgroup>`;
    const tools = a.picking
      ? `<div class="pickbar">
          <label class="pickall"><input type="checkbox" class="selbox" data-action="act-all" ${allOn ? "checked" : ""} ${selectable ? "" : "disabled"}><span>${esc(t.actPickAll)} <span class="muted">(${esc(selectable)})</span></span></label>
          <span class="grow"></span><button class="link" data-action="act-pick-done">${esc(t.actPickDone)}</button>
        </div>
        ${(a.days || []).length > 1 ? `<div class="daypicks" role="group" aria-label="${esc(t.actPickByDay)}">${(a.days || []).slice(0, 3).map((d) => {
          const dayItems = a.items.filter((i) => i.day === d.day && i.selectable);
          const on = d.selectable > 0 && dayItems.length === d.selectable && dayItems.every((i) => a.sel.has(i.key));
          return `<button class="seg ${on ? "on" : ""}" data-action="act-day" data-v="${esc(d.day)}" aria-pressed="${on}" ${d.selectable ? "" : "disabled"}>${esc(this._dayLabel(d.day))}<span class="n">${esc(d.selectable)}</span></button>`;
        }).join("")}</div>` : ""}`
      : `<div class="lrow">
          <select class="fsel boxsel" data-action="act-viewsel" aria-label="${esc(t.actViews)}">${opts(t.actGroupResult, kindViews)}${stateViews.length ? opts(t.actGroupState, stateViews) : ""}${folders.length ? opts(t.actGroupFolder, folders) : ""}<optgroup label="${esc(t.actGroupTech)}"><option value="runs">${esc(t.actRuns)}</option></optgroup></select>
          <label class="search">${ico("magnify")}<input type="search" id="act-q" value="${esc(a.query)}" placeholder="${esc(t.actSearch)}" aria-label="${esc(t.actSearchLabel)}"></label>
          ${s.ai?.status?.active ? `<button class="secondary small ib pickbtn" data-action="act-pick" ${selectable ? "" : "disabled"}>${ico("checkbox-multiple-marked-outline")}<span>${esc(t.actPick)}</span></button>` : ""}
          <span class="narrow-menu">${menu}</span>
        </div>`;
    const lastRun = (s.history || [])[0];
    const err = lastRun?.errors?.length && !a.picking
      ? `<div class="errline">${ico("alert-circle-outline")}<span>${esc(fmt(t.actError, fmtClock(lastRun.started), lastRun.errors[0]))}</span><button data-action="act-runs">${esc(t.actErrorDetails)}</button></div>`
      : "";
    const batch = s.ai?.batch ? this._renderBatch(s.ai) : "";
    const actbar = a.picking
      ? `<div class="actbar"><span>${esc(fmt(t.selected, a.sel.size))}</span><span class="grow"></span>${a.sel.size ? `<span class="macts">${this._mailActions([...a.sel.keys()].map((k) => this._actItem(k)).filter(Boolean))}</span>` : ""}<button class="pill" data-action="act-rerate" ${a.sel.size && !this._batchBusy() && !s.busy ? "" : "disabled"}>${ico("refresh")}${esc(t.rerate)}</button></div>`
      : "";
    const empty = !a.loaded ? `<p class="lempty">${esc(t.loading)}</p>` : `<p class="lempty">${esc(a.counts?.all ? t.actEmptyView : t.actEmpty)}</p>`;
    return `<div class="listpane ${a.picking ? "picking" : ""}">
        <div class="lhead">
          <div class="ttl"><h2>${esc(label)}</h2><span class="cnt">${esc(a.total || 0)}</span>${menu}</div>
          ${tools}
          ${a.picking ? "" : `<div class="lstatus">${this._actStatus()}</div>`}
          ${err}${batch}
        </div>
        <div class="lscroll">${parts.length ? `<ul class="mlist" aria-label="${esc(t.actMails)}">${parts.join("")}</ul>${more}` : empty}</div>
        ${actbar}
      </div>`;
  }

  _actReader() {
    const t = this.t;
    const s = this._s;
    const a = s.act;
    if (a.picking) {
      const picked = [...a.sel.keys()].map((k) => this._actItem(k)).filter(Boolean);
      const n = a.sel.size;
      return `<section class="reader" aria-label="${esc(t.actSelection)}"><div class="rempty pickinfo">
          ${ico("checkbox-multiple-marked-outline")}
          <strong>${esc(n === 0 ? t.actPickInfo0 : n === 1 ? t.actPickInfo1 : fmt(t.actPickInfoN, n))}</strong>
          <span>${esc(t.actPickHint)}</span>
          ${picked.length ? `<ul class="picklist">${picked.slice(0, 6).map((i) => `<li><span>${esc(i.subject || "–")}</span><small>${esc(i.name || i.from || "")}</small></li>`).join("")}${n > 6 ? `<li class="muted">${esc(fmt(t.actPickMore, n - Math.min(6, picked.length)))}</li>` : ""}</ul>` : ""}
          ${n ? `<button class="pill" data-action="act-rerate" ${this._batchBusy() || s.busy ? "disabled" : ""}>${ico("refresh")}${esc(n === 1 ? t.rerate : fmt(t.actRerateN, n))}</button>` : ""}
        </div></section>`;
    }
    const sheet = s.sheet?.inline ? s.sheet : null;
    const item = a.open ? this._actItem(a.open) : null;
    if (!sheet || !item) {
      return `<section class="reader" aria-label="${esc(t.actMail)}"><div class="rempty">${ico("email-open-outline")}<span>${esc(t.actReaderEmpty)}</span></div></section>`;
    }
    return `<section class="reader" aria-label="${esc(t.actMail)}">${this._renderMailView(sheet, item)}</section>`;
  }

  // The mail with its timeline: the reading pane (wide screens) and the sheet (phones) share it.
  _renderMailView(sheet, item = null) {
    const t = this.t;
    const s = this._s;
    const d = sheet.data || {};
    const subject = d.subject || sheet.key.subject || item?.subject || "–";
    const name = item?.name || d.sender || sheet.key.sender || "";
    const address = item?.from || d.sender || "";
    const mid = d.message_id || sheet.key.message_id;
    const events = d.events || [];
    const body = sheet.loading
      ? `<p class="working"><span class="spinner" aria-hidden="true"></span>${esc(t.tlLoading)}</p>`
      : sheet.error
        ? `<div class="error">${esc(sheet.error)}</div>`
        : !d.found
          ? `<p class="muted">${esc(t.tlEmpty)}</p>`
          : `<ol class="tl">${events.map((e, i) => this._tlStep(e, i === events.length - 1)).join("")}</ol>`;
    // the category itself is the place to correct it (as in the former "recently rated" list)
    const cats = s.ai?.categories || [];
    const cat = (c) => (c === "other" ? t.aiOther : c);
    const imp = d.importance ?? item?.ai?.importance;
    let meta;
    if (d.rating_id && cats.length && !d.held) {
      const options = [...cats.map((c) => c.name), "other"].map((c) => `<option value="${esc(c)}" ${c === d.category ? "selected" : ""}>${esc(cat(c))}</option>`).join("");
      meta = `<span class="meta ai">${ico(d.corrected ? "pencil-outline" : "creation")}<i class="cdot" style="--cat:${catColor(d.category)}" aria-hidden="true"></i><select class="catsel" data-action="ai-correct" data-id="${esc(d.rating_id)}" aria-label="${esc(t.actCorrect)}">${options}</select>${imp ? `<span class="rl">· ${esc(imp)}/5</span>` : ""}</span>${d.confidence && !d.corrected ? this._confMeter(d.confidence) : ""}`;
    } else if (item) meta = this._actMeta(item);
    else if (d.held) meta = `<span class="meta held">${ico("shield-check-outline")}<span class="rl">${esc(t.actHeld)}</span></span>`;
    else meta = d.category ? `<span class="meta ai">${ico(d.corrected ? "pencil-outline" : "creation")}<span class="rl">${esc(cat(d.category))}</span></span>` : "";
    const canRerate = mid && s.ai?.status?.active && (!item || item.selectable);
    const rerate = canRerate
      ? `<button class="secondary small ib" data-action="tl-rerate" aria-label="${esc(t.rerate)}" ${s.busy || this._batchBusy() ? "disabled" : ""}>${ico("refresh")}<span class="lb">${esc(t.rerate)}</span></button>`
      : "";
    const who = name && address && name !== address ? `<strong>${esc(name)}</strong><small>${esc(address)}</small>` : `<strong>${esc(name || address || "–")}</strong>`;
    const ruleBtn = address.includes("@")
      ? `<button class="secondary small ib" data-action="rule-from-mail" data-from="${esc(address)}" data-name="${esc(name)}" aria-label="${esc(t.ruleFromMail)}">${ico("filter-plus-outline")}<span class="lb">${esc(t.ruleFromMail)}</span></button>`
      : "";
    const ask = this._s.applyAsk && this._s.applyAsk.ratingId === d.rating_id ? this._s.applyAsk : null;
    const askCat = ask ? (s.ai?.categories || []).find((c) => c.name === ask.category) : null;
    const askHtml = askCat
      ? `<div class="askline" role="status">${ico("help-circle-outline")}<span>${esc(fmt(t.applyAsk, cat(askCat.name), [askCat.move_to ? `→ ${this._folderName(askCat.move_to)}` : "", askCat.mark_seen ? t.aSeen : "", askCat.flag ? t.aFlag : ""].filter(Boolean).join(", ")))}</span>
          <span class="askbtns"><button class="small" data-action="apply-yes">${esc(t.applyYes)}</button><button class="secondary small" data-action="apply-no">${esc(t.applyNo)}</button></span></div>`
      : "";
    const acts = item && mid ? `<div class="macts">${this._mailActions([item])}</div>` : "";
    return `<div class="rtop">${acts}<span class="grow"></span>${ruleBtn}${rerate}</div>
      <div class="rbody">
        <div class="rhead">
          <h2 tabindex="-1" id="r-title">${esc(subject)}</h2>
          <span class="av" aria-hidden="true">${esc(initials(name || address))}</span>
          <span class="who">${who}</span>
          <span class="date">${esc(d.date ? fmtDateTime(d.date) : item ? fmtDateTime(item.time) : "")}</span>
          <div class="chips">${meta}${this._stateChips(item)}${this._actRowBatch(item ? item.key : mid)}</div>
          ${mid ? this._locHtml(mid, item?.folder || d.location || d.mailbox) : ""}
          ${askHtml}
        </div>
        ${mid ? `<div class="mtextwrap">${this._textHtml(mid)}</div>` : ""}
        ${mid ? this._threadHtml(mid, item) : ""}
        <h3 class="sect">${esc(t.actHistory)}</h3>
        ${body}
      </div>
      <div class="rfoot">${esc(mid ? t.tlFoot : t.tlFootOld)}${!this._actNarrow() && item && !this._account()?.read_only ? `<span class="keys">${esc(t.keysHint)}</span>` : ""}</div>`;
  }

  _bindPull(scroller) {
    const t = this.t;
    let y0 = null;
    let dy = 0;
    let tip = null;
    const page = () => (scroller.scrollHeight > scroller.clientHeight + 4 ? scroller.scrollTop : document.scrollingElement?.scrollTop || 0);
    scroller.addEventListener(
      "touchstart",
      (ev) => {
        if (ev.touches.length !== 1 || page() > 0 || this._s.act.picking) return;
        y0 = ev.touches[0].clientY;
        dy = 0;
      },
      { passive: true }
    );
    scroller.addEventListener(
      "touchmove",
      (ev) => {
        if (y0 === null) return;
        dy = ev.touches[0].clientY - y0;
        if (dy <= 0) return;
        if (!tip) {
          tip = document.createElement("div");
          tip.className = "ptr";
          tip.setAttribute("aria-hidden", "true");
          scroller.prepend(tip);
        }
        const far = dy >= PULL_AT;
        tip.style.height = `${Math.min(dy, PULL_AT + 20) * 0.6}px`;
        tip.innerHTML = `${ico(far ? "arrow-up" : "arrow-down")}<span>${esc(far ? t.ptrRelease : t.ptrPull)}</span>`;
      },
      { passive: true }
    );
    const end = async () => {
      if (y0 === null) return;
      y0 = null;
      const far = dy >= PULL_AT;
      if (!far) {
        tip?.remove();
        tip = null;
        return;
      }
      if (tip) tip.innerHTML = `<span class="spinner"></span><span>${esc(t.ptrLoading)}</span>`;
      W.announce(this.shadowRoot, t.ptrLoading, 0);
      await this._loadActivity().catch(() => {});
      tip?.remove();
      tip = null;
      this._render();
    };
    scroller.addEventListener("touchend", end);
    scroller.addEventListener("touchcancel", end);
  }

  _bindRuleDrag(tr) {
    const id = tr.dataset.ruleId;
    const body = tr.closest("tbody");
    const clear = () => body.querySelectorAll(".drop-before, .drop-after").forEach((n) => n.classList.remove("drop-before", "drop-after"));
    tr.addEventListener("dragstart", (ev) => {
      if (ev.target.closest?.("button, input, select, details")) return ev.preventDefault();
      ev.dataTransfer.effectAllowed = "move";
      ev.dataTransfer.setData("text/plain", id);
      this._dragRule = id;
      tr.classList.add("dragging");
    });
    tr.addEventListener("dragend", () => {
      tr.classList.remove("dragging");
      clear();
      this._dragRule = null;
    });
    tr.addEventListener("dragover", (ev) => {
      if (!this._dragRule || this._dragRule === id) return;
      ev.preventDefault();
      const r = tr.getBoundingClientRect();
      clear();
      tr.classList.add(ev.clientY < r.top + r.height / 2 ? "drop-before" : "drop-after");
    });
    tr.addEventListener("drop", (ev) => {
      ev.preventDefault();
      const moving = this._dragRule;
      const before = tr.classList.contains("drop-before");
      clear();
      if (!moving || moving === id) return;
      const from = this._s.rules.findIndex((x) => x.id === moving);
      let to = Number(tr.dataset.pos) + (before ? 0 : 1);
      if (from < to) to -= 1;
      if (to !== from) this._moveTo(moving, Math.max(0, Math.min(this._s.rules.length - 1, to)));
    });
  }

  // The two actions a swipe does: [read or unread, archive or back to the inbox] as [action, icon, label]
  _swipeActions(item) {
    const t = this.t;
    const st = item?.state || {};
    const where = st.mailbox || (item?.folder === "INBOX" ? "INBOX" : null);
    return [
      st.seen ? ["unseen", "email-outline", t.mactUnseen] : ["seen", "email-open-outline", t.mactSeen],
      where && where !== "INBOX" ? ["inbox", "inbox-arrow-down", t.mactInbox] : ["archive", "archive-arrow-down-outline", t.mactArchive],
    ];
  }

  // Touch only (a mouse selects text); the list keeps scrolling up and down (touch-action: pan-y).
  _bindRowSwipe(li) {
    const btn = li.querySelector(".mitem");
    const key = btn?.dataset.id;
    if (!key) return;
    let x0 = 0;
    let y0 = 0;
    let dx = 0;
    let on = false;
    let id = null;
    const reset = () => {
      li.classList.remove("swiping", "sw-l", "sw-r", "sw-go");
      btn.style.transform = "";
    };
    let hold = null;
    const canPick = () => this._s.ai?.status?.active && this._actItem(key)?.selectable;
    btn.addEventListener("pointerdown", (ev) => {
      if (ev.pointerType !== "touch" || !ev.isPrimary) return;
      [x0, y0, dx, on, id] = [ev.clientX, ev.clientY, 0, false, ev.pointerId];
      clearTimeout(hold);
      if (canPick()) {
        // a long press picks the mail (and starts picking), like a mail app
        hold = setTimeout(() => {
          hold = null;
          id = null;
          this._swiped = true;
          setTimeout(() => (this._swiped = false), 600);
          navigator.vibrate?.(10);
          this._actToggle(key);
        }, HOLD_MS);
      }
    });
    btn.addEventListener("pointermove", (ev) => {
      if (ev.pointerId !== id) return;
      const mx = ev.clientX - x0;
      const my = ev.clientY - y0;
      if (hold && Math.hypot(mx, my) > 10) {
        clearTimeout(hold);
        hold = null;
      }
      if (!on) {
        if (Math.abs(my) > 10 && Math.abs(my) > Math.abs(mx)) return void (id = null); // scrolling the list
        if (Math.abs(mx) < 12) return;
        on = true;
        const [read, move] = this._swipeActions(this._actItem(key));
        if (!li.querySelector(".swbg")) {
          li.insertAdjacentHTML("afterbegin", `<span class="swbg l" aria-hidden="true">${ico(read[1])}<span>${esc(read[2])}</span></span><span class="swbg r" aria-hidden="true"><span>${esc(move[2])}</span>${ico(move[1])}</span>`);
        }
        li.classList.add("swiping");
        btn.setPointerCapture?.(ev.pointerId);
      }
      dx = Math.max(-140, Math.min(140, mx));
      btn.style.transform = `translateX(${dx}px)`;
      li.classList.toggle("sw-r", dx > 0);
      li.classList.toggle("sw-l", dx < 0);
      li.classList.toggle("sw-go", Math.abs(dx) >= SWIPE_AT);
    });
    btn.addEventListener("pointerup", (ev) => {
      clearTimeout(hold);
      hold = null;
      if (ev.pointerId !== id) return;
      id = null;
      if (!on) return;
      this._swiped = true; // the click that follows the swipe does not open the mail
      setTimeout(() => (this._swiped = false), 400);
      const far = Math.abs(dx) >= SWIPE_AT;
      reset();
      if (!far) return;
      const [read, move] = this._swipeActions(this._actItem(key));
      this._mailAct([key], (dx > 0 ? read : move)[0]);
    });
    btn.addEventListener("pointercancel", (ev) => {
      clearTimeout(hold);
      hold = null;
      if (ev.pointerId !== id) return;
      id = null;
      reset();
    });
  }

  // The AI's confidence as a quiet three-step meter (sure, fairly sure, unsure)
  _confMeter(level) {
    const t = this.t;
    const n = { low: 1, medium: 2, high: 3 }[level];
    if (!n) return "";
    const word = t[`conf_${level}`];
    return `<span class="conf c-${level}" role="img" aria-label="${esc(fmt(t.confLabel, word))}"><span class="cbar" aria-hidden="true">${[1, 2, 3].map((i) => `<i class="${i <= n ? "on" : ""}"></i>`).join("")}</span><span aria-hidden="true">${esc(word)}</span></span>`;
  }

  // Read / flagged as the mailbox has it now (for a mail that left the inbox: as last seen there)
  _stateChips(item) {
    const t = this.t;
    const st = item?.state;
    if (!st || st.seen == null) return "";
    return `<span class="mv">${ico(st.seen ? "email-open-outline" : "email-outline")}${esc(st.seen ? t.stRead : t.stUnread)}</span>${st.flagged ? `<span class="mv fl">${ico("flag")}${esc(t.stFlagged)}</span>` : ""}`;
  }

  // ------------------------------------------------------------ where a mail really is (on opening, once)
  async _locate(mid, hint) {
    const loc = this._s.loc;
    if (!mid || loc.get(mid)?.busy) return;
    loc.set(mid, { ...(loc.get(mid) || {}), busy: true, hint });
    this._render();
    try {
      const hints = [hint === "INBOX" ? null : hint].filter(Boolean);
      const res = await this._ws({ type: "friedafetch_mail/mail/locate", entry_id: this._s.entryId, message_id: mid, hints });
      loc.set(mid, { ...res, busy: false, hint, error: null });
    } catch (err) {
      loc.set(mid, { busy: false, hint, error: err.message || String(err), checked: new Date().toISOString() });
    }
    this._renderWhenFree();
  }

  _locHtml(mid, frieda) {
    const t = this.t;
    const l = this._s.loc.get(mid);
    if (!l) return "";
    if (l.busy && !l.checked) return `<div class="loc"><span class="li"><span class="spinner" aria-hidden="true"></span></span><span class="lt">${esc(t.locSearching)}</span></div>`;
    const again = `<button class="link" data-action="loc-again" data-id="${esc(mid)}" ${l.busy ? "disabled" : ""}>${esc(l.busy ? t.locBusy : t.locAgain)}</button>`;
    const at = fmt(t.locChecked, fmtClock(l.checked));
    if (l.error) return `<div class="loc gone" role="status"><span class="li">${ico("alert-circle-outline")}</span><span class="lt">${esc(fmt(t.locError, l.error))}<small>${esc(at)}</small></span>${again}</div>`;
    // the trash has many names (Deleted Messages, Papierkorb …): Frieda's place and the found one compare as "trash"
    const place = /^(deleted messages|trash|papierkorb|gelöschte objekte|deleted items)$/i.test(frieda || "") ? "trash" : frieda || "INBOX";
    const friedaText = place === "INBOX" ? fmt(t.locFriedaLeft, this._folderName("INBOX")) : fmt(t.locFriedaMoved, this._folderName(place));
    if (!l.found) {
      return `<div class="loc gone" role="status"><span class="li">${ico("help-circle-outline")}</span><span class="lt">${esc(t.locGone)}<small>${esc(at)}</small></span>${again}<span class="note">${esc(fmt(t.locGoneNote, friedaText))}</span></div>`;
    }
    const now = l.trash ? "trash" : l.mailbox;
    const same = now === place || (place === "trash" && l.trash);
    return `<div class="loc ${same ? "same" : "moved"}" role="status"><span class="li">${ico(same ? "check-circle-outline" : "folder-swap-outline")}</span><span class="lt">${esc(fmt(t.locHere, this._folderName(now)))}<small>${esc(at)}</small></span>${again}${same ? "" : `<span class="note">${esc(fmt(t.locMovedNote, friedaText))}</span>`}</div>`;
  }

  // ------------------------------------------------------------ category assistant
  _assistOpen() {
    this._s.assist = { turns: [], proposal: null, overlap: null, busy: false, view: "chat", test: null, testBusy: false, err: "", draft: "", changed: [], scroll: true };
    this._render();
    this.shadowRoot.querySelector("#as-input")?.focus();
  }

  _assistClose() {
    this._s.assist = null;
    this._render();
    this.shadowRoot.querySelector('[data-action="assist-open"]')?.focus();
  }

  async _assistSend(text) {
    const t = this.t;
    const as = this._s.assist;
    text = String(text || "").trim();
    if (!as || !text || as.busy) return;
    as.turns.push({ role: "user", text });
    as.draft = "";
    as.err = "";
    as.scroll = true;
    if (as.proposal && text === t.assistOk) {
      as.turns.push({ role: "assistant", text: t.assistOkReply });
      if (window.matchMedia?.("(max-width: 760px)").matches) as.view = "card";
      this._render();
      return;
    }
    as.busy = true;
    this._render();
    try {
      const res = await this._ws({ type: "friedafetch_mail/ai/assist", entry_id: this._s.entryId, conversation: as.turns.map(({ role, text: x }) => ({ role, text: x })), proposal: as.proposal });
      const before = as.proposal || {};
      as.changed = Object.keys(res.proposal || {}).filter((k) => JSON.stringify(res.proposal[k]) !== JSON.stringify(before[k]));
      as.proposal = res.proposal;
      as.overlap = res.overlap || null;
      as.test = null;
      as.turns.push({ role: "assistant", text: res.reply || t.assistUpdated, changed: as.proposal && before.name ? as.changed : [] });
      if (window.matchMedia?.("(max-width: 760px)").matches && as.view === "chat") as.dot = true;
    } catch (err) {
      as.turns.pop();
      as.draft = text;
      as.err = err.message || String(err);
    }
    as.busy = false;
    as.scroll = true;
    if (this._s.assist === as) this._render();
    this.shadowRoot.querySelector("#as-input")?.focus({ preventScroll: true });
    // the proposal fields that changed light up briefly
    setTimeout(() => (as.changed = []), 1700);
  }

  async _assistTest() {
    const as = this._s.assist;
    if (!as?.proposal || as.testBusy) return;
    as.testBusy = true;
    as.err = "";
    this._render();
    try {
      as.test = await this._ws({ type: "friedafetch_mail/ai/assist/test", entry_id: this._s.entryId, proposal: as.proposal });
      this._s.ai = await this._ws({ type: "friedafetch_mail/ai", entry_id: this._s.entryId }).catch(() => this._s.ai);
    } catch (err) {
      as.err = err.message || String(err);
    }
    as.testBusy = false;
    if (this._s.assist === as) this._render();
  }

  // The same checks as the form; then the normal save with its server checks.
  async _assistApply() {
    const t = this.t;
    const as = this._s.assist;
    const p = as?.proposal;
    if (!p) return;
    const name = String(p.name || "").trim();
    const cats = this._s.ai?.categories || [];
    as.err = !name ? t.assistNameMissing : cats.some((c) => c.name.toLowerCase() === name.toLowerCase()) ? fmt(t.assistNameUsed, name) : "";
    if (as.err) return this._render();
    const cat = { name, description: String(p.description || "").trim().slice(0, 300), move_to: p.move_to || null, mark_seen: !!p.mark_seen, flag: !!p.flag };
    await this._aiSaveCategories([...cats, cat]);
    if (this._s.error) {
      as.err = this._s.error;
      this._s.error = null;
      return this._render();
    }
    this._s.assist = null;
    this._render();
    W.toast(this, fmt(t.assistDone, name));
  }

  _renderAssist() {
    const t = this.t;
    const s = this._s;
    const as = s.assist;
    if (!as) return "";
    const p = as.proposal;
    const users = as.turns.filter((x) => x.role === "user").length;
    const done = users >= ASSIST_ROUNDS;
    const label = { name: t.assistName, description: t.assistDescShort, move_to: p?.move_to ? `→ ${this._folderName(p.move_to)}` : t.assistNoMove, flag: p?.flag ? t.assistFlag : t.assistNoFlag, mark_seen: p?.mark_seen ? t.assistSeen : t.assistNoSeen };
    const msg = (m) =>
      m.role === "user"
        ? `<div class="msg me">${esc(m.text)}</div>`
        : `<div class="msg ai"><span class="who">${ico("creation")}Frieda</span>${esc(m.text)}${(m.changed || []).length ? `<div class="changes">${m.changed.map((k) => `<span>${esc(label[k] || k)}</span>`).join("")}</div>` : ""}</div>`;
    const chips = !p
      ? t.assistExamples
      : done
        ? []
        : [t.assistOk, p.move_to ? t.assistChipNoMove : null, !p.flag ? t.assistChipFlag : null, !p.mark_seen ? t.assistChipSeen : null].filter(Boolean);
    const fl = (k) => (as.changed.includes(k) ? "flash" : "");
    const opt = (v, l) => `<option value="${esc(v)}" ${String(p?.move_to || "") === v ? "selected" : ""}>${esc(l)}</option>`;
    const boxes = (s.mailboxes || []).filter((b) => b !== "INBOX");
    const test = as.testBusy
      ? `<div class="working"><span class="spinner" aria-hidden="true"></span>${esc(t.assistTesting)}</div>`
      : as.test
        ? `<p>${esc(as.test.tested ? fmt(t.assistTestResult, as.test.hits, as.test.tested, as.test.name) : t.assistTestNothing)}</p>
           ${as.test.limit ? `<p class="muted">${esc(t.assistTestLimit)}</p>` : ""}
           ${as.test.tested && !as.test.hits ? `<p class="muted">${esc(t.assistTestNone)}</p>` : ""}
           <ul>${as.test.results.filter((r) => r.after === as.test.name).map((r) => `<li>${esc(r.subject || "–")}<small>${esc([r.from, r.before ? fmt(t.assistTestBefore, r.before === "other" ? t.aiOther : r.before) : ""].filter(Boolean).join(" · "))}</small></li>`).join("")}</ul>
           <button class="link small" data-action="assist-test">${esc(t.assistTestAgain)}</button>`
        : `<p>${esc(t.assistTestIntro)}</p><button class="secondary small ib" data-action="assist-test">${ico("play-outline")}${esc(t.assistTestBtn)}</button>`;
    const card = p
      ? `<h3>${esc(t.assistProposal)}</h3>
        <label class="f ${fl("name")}"><span>${esc(t.assistName)}</span><input type="text" id="as-name" data-f="name" maxlength="40" value="${esc(p.name)}"></label>
        <label class="f ${fl("description")}"><span>${esc(t.assistDesc)}</span><textarea id="as-desc" data-f="description" maxlength="300">${esc(p.description)}</textarea><span class="count">${esc((p.description || "").length)} / 300</span></label>
        <label class="f ${fl("move_to")}"><span>${esc(t.assistMove)}</span><select id="as-move" data-f="move_to">${opt("", t.assistNoMove)}${boxes.map((b) => opt(b, this._folderName(b))).join("")}</select></label>
        <label class="opt ${fl("flag")}"><input type="checkbox" class="switch" id="as-flag" data-f="flag" ${p.flag ? "checked" : ""}><span>${esc(t.assistFlag)}</span></label>
        <label class="opt ${fl("mark_seen")}"><input type="checkbox" class="switch" id="as-seen" data-f="mark_seen" ${p.mark_seen ? "checked" : ""}><span>${esc(t.assistSeen)}</span></label>
        ${as.overlap ? `<p class="overlap">${ico("information-outline")}<span>${esc(fmt(t.assistOverlap, as.overlap))}</span></p>` : ""}
        ${s.ai?.status?.mode !== "act" ? `<p class="muted">${esc(t.aiCatActionsObserve)}</p>` : ""}
        <div class="test">${test}</div>`
      : `<h3>${esc(t.assistProposal)}</h3><p class="empty">${esc(t.assistEmpty)}</p>`;
    return `<div class="sheet-backdrop assist-bd" data-action="assist-close"></div>
      <section class="sheet assist" role="dialog" aria-modal="true" aria-labelledby="as-title">
        <div class="as-top">${ico("creation")}<h2 id="as-title">${esc(t.assistTitle)}</h2>
          <button class="icon" data-action="assist-close" aria-label="${esc(t.close)}" title="${esc(t.close)}">${ico("close")}</button>
          <div class="as-views"><div class="segs" role="group" aria-label="${esc(t.assistViews)}">
            <button class="seg ${as.view === "chat" ? "on" : ""}" data-action="assist-view" data-v="chat" aria-pressed="${as.view === "chat"}">${ico("chat-outline")}${esc(t.assistChat)}</button>
            <button class="seg ${as.view === "card" ? "on" : ""} ${as.dot ? "pulse" : ""}" data-action="assist-view" data-v="card" aria-pressed="${as.view === "card"}" ${p ? "" : "disabled"}>${ico("tag-outline")}${esc(t.assistProposal)}</button></div></div>
        </div>
        <div class="as-body" data-view="${esc(as.view)}">
          <div class="as-chat">
            <div class="as-log" role="log" aria-live="polite" aria-label="${esc(t.assistChat)}">
              <div class="msg ai"><span class="who">${ico("creation")}Frieda</span>${esc(t.assistHello)}</div>
              ${as.turns.map(msg).join("")}
              ${as.busy ? `<div class="typing"><span class="spinner" aria-hidden="true"></span>${esc(t.assistThinking)}</div>` : ""}
              ${done && !as.busy ? `<div class="msg ai"><span class="who">${ico("creation")}Frieda</span>${esc(t.assistTurnsDone)}</div>` : ""}
            </div>
            <div class="compose">
              ${as.err ? `<div class="error" role="alert">${esc(as.err)}</div>` : ""}
              ${chips.length && !as.busy ? `<div class="chips" role="group" aria-label="${esc(t.assistChips)}">${chips.map((c) => `<button data-action="assist-chip" data-v="${esc(c)}">${esc(c)}</button>`).join("")}</div>` : ""}
              <div class="row"><textarea id="as-input" rows="1" placeholder="${esc(t.assistPlaceholder)}" aria-label="${esc(t.assistInput)}" ${as.busy || done ? "disabled" : ""}>${esc(as.draft)}</textarea>
                <button class="send" data-action="assist-send" aria-label="${esc(t.assistSend)}" title="${esc(t.assistSend)}" ${as.busy || done ? "disabled" : ""}>${ico("send")}</button></div>
              <div class="privacy">${ico("shield-lock-outline")}<span>${esc(t.assistPrivacy)}</span></div>
            </div>
          </div>
          <div class="as-pane"><div class="prop">${card}</div>
            <div class="acts"><button class="secondary" data-action="assist-close">${esc(t.cancel)}</button><button data-action="assist-apply" ${p && !s.busy ? "" : "disabled"}>${esc(t.assistApply)}</button></div></div>
        </div>
      </section>`;
  }

  _bindAssist() {
    const root = this.shadowRoot;
    const as = this._s.assist;
    const dlg = root.querySelector(".sheet.assist");
    if (!as || !dlg) return;
    const input = root.querySelector("#as-input");
    const grow = () => {
      input.style.height = "auto";
      input.style.height = `${Math.min(120, input.scrollHeight)}px`;
    };
    if (input) {
      grow();
      input.addEventListener("input", () => {
        as.draft = input.value;
        grow();
      });
      input.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" && !ev.shiftKey && !ev.isComposing) {
          ev.preventDefault();
          this._assistSend(input.value);
        }
      });
    }
    // edits of the proposal stay in the state without a redraw (the fields keep focus and caret)
    root.querySelectorAll(".sheet.assist [data-f]").forEach((n) =>
      n.addEventListener(n.type === "checkbox" || n.tagName === "SELECT" ? "change" : "input", () => {
        const key = n.dataset.f;
        as.proposal[key] = n.type === "checkbox" ? n.checked : key === "move_to" ? n.value || null : n.value;
        if (key === "description") n.parentElement.querySelector(".count").textContent = `${n.value.length} / 300`;
        as.test = null;
      })
    );
    dlg.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") this._assistClose();
    });
    const log = root.querySelector(".as-log");
    if (log && as.scroll) {
      log.scrollTop = log.scrollHeight;
      as.scroll = false;
    }
  }

  // Keeps the scroll position of the list and the reading pane across a redraw (the page itself is kept by keepScroll).
  _keepInner(draw) {
    const root = this.shadowRoot;
    const saved = [".lscroll", ".rbody", ".as-log", ".prop"].map((sel) => [sel, root.querySelector(sel)?.scrollTop]);
    draw();
    const jump = this._s.act?.jump;
    this._s.act && (this._s.act.jump = false);
    for (const [sel, y] of saved) {
      const el = root.querySelector(sel);
      if (!el || y == null) continue;
      if (jump && sel === ".rbody") continue; // a newly opened mail starts at its top
      el.scrollTop = y;
    }
  }

  // Loads the next mails shortly before the end of the list (the button stays for keyboards).
  _observeMore() {
    this._moreObserver?.disconnect();
    const sentinel = this.shadowRoot.querySelector("[data-more-sentinel]");
    if (!sentinel || !("IntersectionObserver" in window)) return;
    const root = this._actNarrow() ? null : this.shadowRoot.querySelector(".lscroll");
    this._moreObserver = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        this._moreObserver.disconnect();
        this._actMore();
      },
      { root, rootMargin: "300px" }
    );
    this._moreObserver.observe(sentinel);
  }

  // Tabs: the activity (a mail program), the rules, the AI sorting and its log.
  // ------------------------------------------------------------------ For you
  async _loadInsights() {
    try {
      this._s.insights = await this._ws({ type: "friedafetch_mail/insights", entry_id: this._s.entryId });
    } catch (err) {
      if (gone(err)) this._s.insights = null; // older backend; a connection coming back keeps the tab
      else throw err;
    }
  }

  // undoText: the change can be taken back ("Undo" while nothing else changed the lists)
  async _fyCall(msg, after, undoText = "") {
    let token = null;
    await this._call(async () => {
      const res = await this._ws({ entry_id: this._s.entryId, ...msg });
      if (res && res.week) this._s.insights = res;
      else await this._loadInsights();
      token = res?.undo || null;
      if (after) after(res);
    });
    if (undoText && token && !this._s.error) this._offerUndo(undoText, () => this._fyCall({ type: "friedafetch_mail/insights/undo", token }));
  }

  _fyWhen(p) {
    const lang = this._lang();
    const d = parseTime(p.start);
    if (!d || isNaN(d)) return p.start;
    const day = d.toLocaleDateString(lang, { weekday: "short", day: "numeric", month: "short" });
    if (p.all_day) return day;
    const end = p.end ? parseTime(p.end) : null;
    const clock = (x) => x.toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" });
    return `${day}, ${clock(d)}${end && !isNaN(end) ? `–${clock(end)}` : ""}`;
  }

  _renderForYou() {
    const t = this.t;
    const s = this._s;
    const fy = s.insights;
    if (!fy) return `<section class="widget w-full"><div class="card"><p class="muted">${esc(t.loading)}</p></div></section>`;
    const w = fy.week || {};
    const trend = w.mails_before ? Math.round(((w.mails - w.mails_before) / w.mails_before) * 100) : null;
    const tile = (icon, value, label, sub = "", action = "", line = "") =>
      `<${action ? `button class="fy-tile" data-action="${action}"` : `div class="fy-tile"`}>${ico(icon)}${line}<span class="fy-v">${esc(value)}</span><span class="fy-l">${esc(label)}</span>${sub ? `<span class="fy-s">${esc(sub)}</span>` : ""}</${action ? "button" : "div"}>`;
    // the weeks before and these seven days as a small line (from three known points on; no tooltip, the numbers are read out)
    const spark = (key, unit = "") => {
      const points = (w.trend || []).map((x) => x[key]);
      const known = points.filter((v) => v != null);
      if (known.length < 3) return "";
      const [min, max] = [Math.min(...known), Math.max(...known)];
      const y = (v) => (max === min ? 9 : 16 - ((v - min) / (max - min)) * 13);
      const xy = points.map((v, i) => (v == null ? null : [2 + (i * 60) / (points.length - 1), y(v)])).filter(Boolean);
      const [lx, ly] = xy[xy.length - 1];
      return `<svg class="spark" viewBox="0 0 64 18" role="img" aria-label="${esc(fmt(t.trendLabel, points.length, known.map((v) => `${v}${unit}`).join(", ")))}"><polyline points="${xy.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(" ")}"/><circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="1.8"/></svg>`;
    };
    const tiles = [
      tile("email-multiple-outline", w.mails ?? 0, t.fyMails, trend == null ? "" : fmt(trend >= 0 ? t.fyMore : t.fyLess, Math.abs(trend)), "", spark("mails")),
      w.by_rules ? tile("filter-check-outline", w.by_rules, t.fyByRules, "", "", spark("rules")) : "",
      (w.by_rules || 0) + (w.by_ai || 0) ? tile("timer-sand-complete", (w.by_rules || 0) + (w.by_ai || 0), t.fyHandled, fmt(t.fyHandledSub, w.by_rules || 0, w.by_ai || 0, Math.round((((w.by_rules || 0) + (w.by_ai || 0)) * 10) / 60))) : "",
      w.rated ? tile("creation", w.accuracy == null ? "–" : `${w.accuracy} %`, t.fyAccuracy, fmt(t.fyRated, w.rated, w.corrected), "", spark("accuracy", " %")) : "",
      tile("email-mark-as-unread", w.unread ?? 0, t.fyUnread),
      fy.followup_days ? tile("reply-outline", w.waiting ?? 0, t.fyWaiting) : "",
      w.parcels ? tile("truck-delivery-outline", w.parcels, t.fyParcelsTile) : "",
      w.proposals ? tile("calendar-plus", w.proposals, t.fyProposals) : "",
      w.never_opened ? tile("email-off-outline", w.never_opened, t.fyNeverOpened) : "",
    ].join("");
    const vip = fy.vip || {};
    const vipText = vip.groups?.length || vip.senders
      ? fmt(t.fyVipOn, [...(vip.groups || []).map((g) => (g === "*" ? t.fyAllContacts : g)), vip.senders ? fmt(vip.senders === 1 ? t.fyVipSender : t.fyVipSenders, vip.senders) : ""].filter(Boolean).join(", "))
      : t.fyVipOff;
    const checked = fy.followups_checked ? fmt(t.fyChecked, fmtDateTime(fy.followups_checked)) : t.fyNotChecked;
    const week = `<div class="card">
        <div class="chead"><h2>${esc(t.fyWeek)}</h2><span class="grow"></span>
          <button class="pill" data-action="fy-refresh" ${s.busy ? "disabled" : ""}>${ico("refresh")}${esc(t.fyRefresh)}</button></div>
        <div class="fy-tiles">${tiles}</div>
        <p class="muted fy-foot">${ico("star-outline")}<span>${esc(vipText)} · ${esc(checked)}${fy.weekly_day ? ` · ${esc(fmt(t.fyWeekly, t.fyDays[fy.weekly_day] || fy.weekly_day))}` : ""}</span></p>
        ${fy.error ? `<p class="muted">${esc(fmt(t.fyError, fy.error))}</p>` : ""}
      </div>`;
    return [
      `<section class="widget w-full" data-widget="fy-week">${week}</section>`,
      (fy.parcels || []).length || (fy.parcel_ignored || []).length ? `<section class="widget w-full" data-widget="fy-parcels">${this._fyParcels(fy)}</section>` : "",
      `<section class="widget w-full" data-widget="fy-events">${this._fyEvents(fy)}</section>`,
      `<section class="widget w-full" data-widget="fy-replies">${this._fyReplies(fy)}</section>`,
      `<section class="widget w-full" data-widget="fy-rules">${this._fySuggestions(fy)}</section>`,
      `<section class="widget w-full" data-widget="fy-subs">${this._fySubs(fy)}</section>`,
    ].join("");
  }

  _fyParcels(fy) {
    const t = this.t;
    const icons = { ordered: "cart-outline", out_for_delivery: "truck-delivery-outline", pickup: "store-marker-outline", problem: "package-variant-remove", delivered: "package-variant-closed-check", in_transit: "package-variant-closed" };
    const day = (iso) => {
      if (!iso) return "";
      const d = new Date(`${iso}T12:00:00`);
      const today = new Date();
      const diff = Math.round((new Date(d.toDateString()) - new Date(today.toDateString())) / 86400000);
      return diff === 0 ? t.fyToday : diff === 1 ? t.fyTomorrow : d.toLocaleDateString(this._lang(), { weekday: "short", day: "numeric", month: "short" });
    };
    const rows = (fy.parcels || [])
      .map((p) => {
        const when = p.status === "delivered" ? "" : [day(p.eta), p.window ? fmt(t.fyWindow, p.window) : ""].filter(Boolean).join(" ");
        const who = [p.carrier, p.number].filter(Boolean).join(" · ");
        const warn = p.status === "problem" || p.status === "out_for_delivery" || p.status === "pickup";
        return `<div class="ai-cat fy-row"><span class="fy-ic ${warn ? "warn" : ""}">${ico(icons[p.status] || "package-variant-closed")}</span>
          <span class="tx"><strong>${esc(p.shop || p.carrier || p.subject || "–")}</strong><span>${esc(t.fyParcel[p.status] || p.status)}${when ? ` · ${esc(when)}` : ""}</span>
            <span class="muted">${esc(who || p.subject || "")}</span>${this._parcelItems(p)}${this._parcelSteps(p)}</span>
          ${p.url ? `<button class="secondary small ib" data-action="fy-track" data-url="${esc(p.url)}">${ico(p.link === "shop" ? "shopping-outline" : "open-in-new")}${esc(p.link === "shop" ? t.fyOrderPage : t.fyTrack)}</button>` : ""}
          <button class="icon" data-action="fy-parcel-open" data-id="${esc(p.id)}" aria-expanded="${this._s.fyParcel === p.id}" aria-label="${esc(t.fyWhere)}: ${esc(p.shop || p.carrier || "")}">${ico(this._s.fyParcel === p.id ? "chevron-up" : "information-outline")}</button>
          <button class="icon" data-action="fy-dismiss" data-kind="package" data-id="${esc(p.id)}" aria-label="${esc(t.fyHide)}: ${esc(p.shop || p.carrier || "")}">${ico("close")}</button></div>
          ${this._s.fyParcel === p.id ? this._fyParcelWhere(p, fy) : ""}`;
      })
      .join("");
    const open = (fy.parcels || []).filter((p) => p.status !== "delivered" && p.status !== "ordered").length;
    const ignored = (fy.parcel_ignored || []).length
      ? `<div class="subbar"><span class="muted">${esc(fmt(t.fyIgnored, fy.parcel_ignored.join(", ")))}</span><button class="link" data-action="fy-restore" data-kind="parcel">${esc(t.fyIgnoredUndo)}</button></div>`
      : "";
    return `<div class="card"><div class="chead"><h2>${esc(t.fyParcels)}</h2>${open ? `<span class="badge">${open}</span>` : ""}</div>
      <p class="muted" style="margin:-4px 0 10px">${esc(t.fyParcelsHint)}</p>
      <div class="ai-cats">${rows}</div>${ignored}</div>`;
  }

  // What is in a parcel: from its shipping mails, or (until one comes) the order's items
  _parcelItems(p) {
    const t = this.t;
    const items = p.items || [];
    if (!items.length) return "";
    const names = items.slice(0, 2).map((i) => `${i.qty > 1 ? `${i.qty} × ` : ""}${i.name}`);
    const more = Math.max(0, items.length - 2) + (p.items_more || 0); // not shown here, and only counted in the mail
    const label = [names.join(", "), more > 0 ? fmt(t.fyItemsMore, more) : ""].filter(Boolean).join(" ");
    return `<span class="fy-items ${p.items_from === "order" ? "ordered" : ""}" aria-label="${esc(fmt(t.fyItemsLabel, label))}">${ico(p.items_from === "order" ? "cart-outline" : "package-variant")}<span>${esc(label)}</span></span>`;
  }

  // Where a parcel is: ordered → on its way → today (or ready for pick-up) → delivered; a problem shows at "today"
  _parcelSteps(p) {
    const t = this.t;
    const steps = p.status === "pickup" ? [t.pstepOrdered, t.pstepTransit, t.pstepPickup, t.pstepPicked] : [t.pstepOrdered, t.pstepTransit, t.pstepToday, t.pstepDelivered];
    const at = { ordered: 0, in_transit: 1, out_for_delivery: 2, pickup: 2, problem: 2, delivered: 3 }[p.status] ?? 1;
    const problem = p.status === "problem";
    const label = problem ? t.pstepProblem : steps[at];
    const parts = steps
      .map((name, i) => `<span class="ps ${i < at || p.status === "delivered" ? "done" : i === at ? "now" : ""}"><i></i><small>${esc(i === at && problem ? t.pstepProblem : name)}</small></span>`)
      .join("");
    return `<span class="pstep ${problem ? "warn" : ""}" role="img" aria-label="${esc(fmt(t.pstepLabel, label))}">${parts}</span>${this._parcelWindow(p)}`;
  }

  // Arriving today with a time window: the window on the day from 6 to 22 o'clock, and where now is
  _parcelWindow(p) {
    const m = /^(\d{1,2}):(\d{2})–(\d{1,2}):(\d{2})$/.exec(p.window || "");
    if (p.status !== "out_for_delivery" || !m) return "";
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    if (p.eta && p.eta !== today) return "";
    const [from, to] = [6, 22];
    const pos = (h) => Math.max(0, Math.min(100, ((h - from) / (to - from)) * 100));
    const a = Number(m[1]) + Number(m[2]) / 60;
    const b = Number(m[3]) + Number(m[4]) / 60;
    const clock = now.toLocaleTimeString(this._lang(), { hour: "2-digit", minute: "2-digit" });
    return `<span class="pwin" role="img" aria-label="${esc(fmt(this.t.windowLabel, p.window, clock))}"><span class="pw" style="left:${pos(a).toFixed(1)}%;width:${Math.max(2, pos(b) - pos(a)).toFixed(1)}%"></span><span class="pn" style="left:${pos(now.getHours() + now.getMinutes() / 60).toFixed(1)}%"></span><small class="p0">${from}</small><small class="p1">${to}</small></span>`;
  }

  // "Where from?": the mails a parcel was read from and what each one said; merge, split off, not a parcel
  _fyParcelWhere(p, fy) {
    const t = this.t;
    const s = this._s;
    const sources = (p.sources || [])
      .slice()
      .reverse()
      .map((x) => {
        const said = [
          t.fyParcel[x.status] || x.status,
          x.number ? fmt(t.fyFoundNumber, x.number) : "",
          x.order ? fmt(t.fyFoundOrder, x.order) : "",
          x.eta ? fmt(t.fyFoundEta, fmtShort(x.eta)) : "",
          x.shop_hint ? fmt(t.fyFoundHint, x.shop_hint) : "",
          (x.items || []).length ? fmt(t.fyFoundItems, x.items.length) : "",
        ].filter(Boolean);
        const split = (p.sources || []).length > 1
          ? `<button class="link small" data-action="fy-parcel-split" data-id="${esc(p.id)}" data-mid="${esc(x.message_id)}">${esc(t.fySplit)}</button>`
          : "";
        return `<li><span class="tw"><strong>${esc(x.subject || "–")}</strong><span class="muted">${esc(fmtShort(x.date))}</span></span><span class="ts">${esc(said.join(" · "))}</span>${split}</li>`;
      })
      .join("");
    const others = (fy.parcels || []).filter((o) => o.id !== p.id);
    const merge = others.length
      ? `<label class="fy-merge"><span>${esc(t.fyMergeInto)}</span><select id="fy-merge-${esc(p.id)}">${others
          .map((o) => `<option value="${esc(o.id)}">${esc([o.shop || o.carrier || o.subject || "–", t.fyParcel[o.status] || o.status].join(" · "))}</option>`)
          .join("")}</select><button class="secondary small" data-action="fy-parcel-merge" data-id="${esc(p.id)}" ${s.busy ? "disabled" : ""}>${esc(t.fyMerge)}</button></label>`
      : "";
    const senders = (p.senders || []).join(", ");
    const contents = (p.items || []).length
      ? `<div class="fy-contents"><h4>${ico(p.items_from === "order" ? "cart-outline" : "package-variant")}${esc(p.items_from === "order" ? t.fyItemsOrder : t.fyItems)}</h4>
          <ul>${p.items.map((i) => `<li><span class="q">${esc(i.qty)} ×</span> <span class="nm">${esc(i.name)}</span>${i.price ? ` <span class="pr">${esc(i.price)}</span>` : ""}</li>`).join("")}</ul>
          ${p.items_more ? `<p class="muted">${esc(fmt(t.fyItemsMore, p.items_more))}</p>` : ""}${p.items_from === "order" ? `<p class="muted">${esc(t.fyItemsOrderHint)}</p>` : ""}</div>`
      : "";
    return `<div class="fy-where">${contents}<p class="muted">${esc(t.fyWhereHint)}</p><ul class="thread">${sources}</ul>${merge}
      <div class="actionsbar"><button class="secondary small" data-action="fy-parcel-ignore" data-id="${esc(p.id)}">${esc(t.fyNoParcel)}</button>
        ${senders ? `<button class="secondary small danger" data-action="fy-parcel-ignore" data-id="${esc(p.id)}" data-sender="1" data-who="${esc(senders)}">${esc(fmt(t.fyNeverFrom, senders))}</button>` : ""}</div></div>`;
  }

  _fyEvents(fy) {
    const t = this.t;
    const s = this._s;
    const list = fy.proposals || [];
    const edit = s.fyEdit;
    const aiOn = !!s.ai?.status?.active;
    const cals = s.fyCals || [];
    const editor = (p) => {
      const local = (iso) => (p.all_day ? String(iso || "").slice(0, 10) : String(iso || "").slice(0, 16));
      const type = p.all_day ? "date" : "datetime-local";
      return `<div class="fy-edit" id="fy-editor">
          <div class="row"><label for="fy-title">${esc(t.fyTitle)}</label><input type="text" id="fy-title" class="grow" maxlength="120" value="${esc(p.title)}"></div>
          <div class="row"><label for="fy-start">${esc(t.fyStart)}</label><input type="${type}" id="fy-start" value="${esc(local(p.start))}"></div>
          <div class="row"><label for="fy-end">${esc(t.fyEnd)}</label><input type="${type}" id="fy-end" value="${esc(local(p.end))}"></div>
          <div class="row"><label for="fy-cal">${esc(t.fyCalendar)}</label><select id="fy-cal">${
            cals.length
              ? cals.map((c) => `<option value="${esc(c.id)}" ${c.id === (s.fyCalDefault || cals[0].id) ? "selected" : ""}>${esc(c.name)}</option>`).join("")
              : `<option value="">${esc(t.loading)}</option>`
          }</select></div>
          <div class="actionsbar"><button class="ib" data-action="fy-event-save" data-id="${esc(p.id)}" ${s.busy || !cals.length ? "disabled" : ""}>${ico("calendar-check")}${esc(t.fyAdd)}</button>
            <button class="secondary" data-action="fy-event-cancel">${esc(t.cancel)}</button></div>
        </div>`;
    };
    const rows = list
      .map((p) =>
        edit === p.id
          ? editor(p)
          : `<div class="ai-cat fy-row"><span class="fy-ic ${p.kind === "deadline" ? "warn" : ""}">${ico(p.kind === "deadline" ? "calendar-alert" : "calendar-clock")}</span>
          <span class="tx"><strong>${esc(p.title)}</strong><span>${esc(this._fyWhen(p))}${p.kind === "deadline" ? ` · ${esc(t.fyDeadline)}` : ""}${p.location ? ` · ${esc(p.location)}` : ""}</span>
            <span class="muted">${esc(fmt(t.fyFromMail, p.from || "?", p.subject || "–"))}</span></span>
          <button class="secondary small ib" data-action="fy-event-edit" data-id="${esc(p.id)}" ${edit || s.busy ? "disabled" : ""}>${ico("calendar-plus")}${esc(t.fyAddShort)}</button>
          <button class="icon" data-action="fy-dismiss" data-kind="proposal" data-id="${esc(p.id)}" title="${esc(t.fyDismiss)}" aria-label="${esc(t.fyDismiss)}: ${esc(p.title)}">${ico("close")}</button></div>`
      )
      .join("");
    const empty = !aiOn ? t.fyEventsNeedAi : s.ai?.status?.events === false ? t.fyEventsOff : t.fyEventsNone;
    return `<div class="card"><div class="chead"><h2>${esc(t.fyEvents)}</h2>${list.length ? `<span class="badge">${list.length}</span>` : ""}</div>
      <p class="muted" style="margin:-4px 0 10px">${esc(t.fyEventsHint)}</p>
      <div class="ai-cats">${rows || `<p class="muted">${esc(empty)}</p>`}</div></div>`;
  }

  _fyReplies(fy) {
    const t = this.t;
    const list = fy.followups || [];
    const rows = list
      .map(
        (f) => `<div class="ai-cat fy-row"><span class="fy-ic">${ico("reply-outline")}</span>
          <span class="tx"><strong>${esc(f.subject || "–")}</strong><span class="muted">${esc(fmt(t.fyTo, f.to.map((p) => p.name || p.email).join(", ") + (f.more ? ` +${f.more}` : "")))} · ${esc(fmt(t.fyDaysAgo, f.days))}</span></span>
          <button class="secondary small ib" data-action="fy-dismiss" data-kind="followup" data-id="${esc(f.id)}">${ico("check")}${esc(t.fyDone)}</button></div>`
      )
      .join("");
    const empty = !fy.followup_days ? t.fyRepliesOff : fy.followups_checked ? t.fyRepliesNone : t.fyNotChecked;
    const restore = fy.dismissed?.followup ? `<button class="link" data-action="fy-restore" data-kind="followup">${esc(fmt(t.fyRestore, fy.dismissed.followup))}</button>` : "";
    return `<div class="card"><div class="chead"><h2>${esc(t.fyReplies)}</h2>${list.length ? `<span class="badge">${list.length}</span>` : ""}</div>
      <p class="muted" style="margin:-4px 0 10px">${esc(fy.followup_days ? fmt(t.fyRepliesHint, fy.followup_days) : t.fyRepliesOff)}</p>
      <div class="ai-cats">${rows || `<p class="muted">${esc(empty)}</p>`}</div>${restore ? `<div class="subbar">${restore}</div>` : ""}</div>`;
  }

  _fySuggestions(fy) {
    const t = this.t;
    const s = this._s;
    const list = fy.suggestions || [];
    const where = (g) => (g.folder === "trash" ? t.fyToTrash : fmt(t.fyToFolder, this._folderName(g.folder)));
    const rows = list
      .map(
        (g) => `<div class="ai-cat fy-row"><span class="fy-ic">${ico(g.folder === "trash" ? "delete-outline" : "folder-move-outline")}</span>
          <span class="tx"><strong>${esc(fmt(t.fySuggest, g.name || g.sender, where(g)))}</strong><span class="muted">${esc(fmt(t.fySuggestCount, g.count, g.total))} · ${esc(g.sender)}</span>
            ${g.subjects?.length ? `<span class="muted fy-subj">${esc(g.subjects.join(" · "))}</span>` : ""}</span>
          <button class="secondary small ib" data-action="fy-rule" data-id="${esc(g.id)}" ${s.editing ? "disabled" : ""}>${ico("filter-plus-outline")}${esc(t.fyMakeRule)}</button>
          <button class="icon" data-action="fy-dismiss" data-kind="rule" data-id="${esc(g.id)}" title="${esc(t.fyNoSuggest)}" aria-label="${esc(t.fyNoSuggest)}">${ico("close")}</button></div>`
      )
      .join("");
    const restore = fy.dismissed?.rule ? `<button class="link" data-action="fy-restore" data-kind="rule">${esc(fmt(t.fyRestore, fy.dismissed.rule))}</button>` : "";
    return `<div class="card"><div class="chead"><h2>${esc(t.fySuggestions)}</h2>${list.length ? `<span class="badge">${list.length}</span>` : ""}</div>
      <p class="muted" style="margin:-4px 0 10px">${esc(t.fySuggestionsHint)}</p>
      <div class="ai-cats">${rows || `<p class="muted">${esc(t.fySuggestionsNone)}</p>`}</div>${restore ? `<div class="subbar">${restore}</div>` : ""}</div>`;
  }

  _fySubs(fy) {
    const t = this.t;
    const s = this._s;
    const acc = this._account();
    const all = fy.subscriptions || [];
    // unsubscribed ones move into their own folded list – unless they keep sending after a few days
    const list = all.filter((n) => !n.unsubscribed || n.after > 0);
    const gone = all.filter((n) => n.unsubscribed && !(n.after > 0));
    const unsubBtn = (n, label = t.fyUnsub) =>
      `<button class="secondary small ib" data-action="fy-unsub" data-sender="${esc(n.sender)}" data-name="${esc(n.name || n.sender)}" ${s.busy || acc?.read_only ? "disabled" : ""}>${ico("email-remove-outline")}${esc(label)}</button>`;
    const who = (n) => [fmt(t.fySubCount, n.count, n.unread), (n.senders || []).length > 1 ? fmt(t.fySenders, n.senders.length) : n.sender].join(" · ");
    const rows = list
      .map(
        (n) => `<div class="ai-cat fy-row fy-sub"><span class="fy-ic ${n.never_opened || n.after ? "warn" : ""}">${ico(n.never_opened ? "email-off-outline" : "newspaper-variant-outline")}</span>
          <span class="tx"><strong>${esc(n.name || n.sender)}</strong><span class="muted">${esc(who(n))}</span>
            ${n.after ? `<span class="warnline small">${ico("alert-outline")}<span>${esc(fmt(t.fyStillSending, n.after))}</span></span>` : ""}</span>
          ${n.never_opened && !n.after ? `<span class="chip hot">${esc(t.fyNeverOpenedChip)}</span>` : ""}
          ${unsubBtn(n, n.after ? t.fyAgain : t.fyUnsub)}
          <button class="icon" data-action="fy-dismiss" data-kind="subscription" data-id="${esc(n.id)}" aria-label="${esc(t.fyHide)}: ${esc(n.name || n.sender)}">${ico("eye-off-outline")}</button></div>`
      )
      .join("");
    // two tabs: what you get, and what you unsubscribed from
    const view = gone.length && s.subsView === "gone" ? "gone" : "on";
    const tabs = gone.length
      ? `<div class="segs fy-subtabs" role="group" aria-label="${esc(t.fySubs)}">
          <button class="seg ${view === "on" ? "on" : ""}" aria-pressed="${view === "on"}" data-action="fy-subs-view" data-v="on">${ico("newspaper-variant-outline")}${esc(t.fySubsOn)}<span class="n">${list.length}</span></button>
          <button class="seg ${view === "gone" ? "on" : ""}" aria-pressed="${view === "gone"}" data-action="fy-subs-view" data-v="gone">${ico("email-check-outline")}${esc(t.fySubsGone)}<span class="n">${gone.length}</span></button>
        </div>`
      : "";
    const goneList = gone.length
      ? `<div class="ai-cats fy-gone">${gone
          .map(
            (n) => `<div class="ai-cat fy-row fy-sub done"><span class="fy-ic">${ico("email-check-outline")}</span>
              <span class="tx"><strong>${esc(n.name || n.sender)}</strong><span class="muted">${esc(who(n))}</span></span>
              <span class="chip">${esc(fmt(t.fyUnsubscribed, fmtShort(n.unsubscribed)))}</span>
              <button class="icon" data-action="fy-dismiss" data-kind="subscription" data-id="${esc(n.id)}" aria-label="${esc(t.fyHide)}: ${esc(n.name || n.sender)}">${ico("eye-off-outline")}</button></div>`
          )
          .join("")}</div>`
      : "";
    const empty = fy.subscriptions_checked ? t.fySubsNone : t.fyNotChecked;
    const restore = fy.dismissed?.subscription ? `<button class="link" data-action="fy-restore" data-kind="subscription">${esc(fmt(t.fyRestore, fy.dismissed.subscription))}</button>` : "";
    return `<div class="card"><div class="chead"><h2>${esc(t.fySubs)}</h2>${list.length ? `<span class="badge">${list.length}</span>` : ""}</div>
      <p class="muted" style="margin:-4px 0 10px">${esc(t.fySubsHint)}</p>
      ${tabs}${view === "gone" ? goneList : `<div class="ai-cats">${rows || `<p class="muted">${esc(gone.length ? t.fySubsNone : empty)}</p>`}</div>`}${restore ? `<div class="subbar">${restore}</div>` : ""}</div>`;
  }

  async _fyOpenEditor(id) {
    this._s.fyEdit = id;
    this._render();
    if (!this._s.fyCals) {
      try {
        const res = await this._ws({ type: "friedafetch_mail/insights/calendars", entry_id: this._s.entryId });
        this._s.fyCals = res.calendars;
        this._s.fyCalDefault = res.default;
      } catch (err) {
        this._s.error = err.message || String(err);
      }
      this._render();
    }
    this.shadowRoot.querySelector("#fy-title")?.focus({ preventScroll: true });
  }

  async _fySaveEvent(id) {
    const root = this.shadowRoot;
    const p = (this._s.insights?.proposals || []).find((x) => x.id === id);
    const val = (sel) => root.querySelector(sel)?.value?.trim() || "";
    const msg = { type: "friedafetch_mail/insights/event", proposal_id: id, calendar_id: val("#fy-cal") };
    const title = val("#fy-title");
    const start = val("#fy-start");
    const end = val("#fy-end");
    if (title) msg.title = title;
    if (start) msg.start = start;
    if (end) msg.end = end;
    await this._fyCall(msg, (res) => {
      this._s.fyEdit = null;
      this._s.notice = fmt(this.t.fyAdded, res?.proposal?.title || p?.title || "", res?.proposal?.calendar || "");
    });
  }

  _fyRule(id) {
    const g = (this._s.insights?.suggestions || []).find((x) => x.id === id);
    if (!g) return;
    const rule = this._blankRule();
    rule.name = fmt(this.t.ruleFromMailName, g.name || g.sender);
    rule.conditions = [{ field: "from", op: "contains", value: g.sender }];
    const trash = (this._s.mailboxes || []).find((b) => /^(deleted messages|trash|papierkorb)$/i.test(b));
    rule.actions.move_to = g.folder === "trash" ? trash || "Deleted Messages" : g.folder;
    this._s.editing = rule;
    this._s.focusEditor = true;
    this._setTab("rules");
  }

  async _fyUnsub(sender, name) {
    const t = this.t;
    let manual = false;
    if (!(await this._confirm({ title: fmt(t.fyUnsubTitle, name), text: t.fyUnsubText, ok: t.fyUnsub, irreversible: true, icon: "email-remove-outline" }))) return;
    await this._call(async () => {
      const res = await this._ws({ type: "friedafetch_mail/insights/unsubscribe", entry_id: this._s.entryId, sender });
      if (res.method === "manual") {
        this._s.notice = fmt(t.fyUnsubManual, name);
        window.open(res.url, "_blank", "noopener,noreferrer");
        manual = true;
      } else this._s.notice = fmt(t.fyUnsubDone, name);
      await this._loadInsights();
    });
    // a web page to unsubscribe: Frieda cannot see whether it worked, so it asks (and then notes it)
    if (manual && (await this._confirm({ title: t.fyManualAskTitle, text: fmt(t.fyManualAskText, name), ok: t.fyManualYes, irreversible: false, tone: "neutral", icon: "email-check-outline" }))) {
      await this._call(async () => {
        await this._ws({ type: "friedafetch_mail/insights/unsubscribe", entry_id: this._s.entryId, sender, done: true });
        this._s.notice = fmt(t.fyUnsubDone, name);
        await this._loadInsights();
      });
    }
  }

  _tabs() {
    const t = this.t;
    return [
      { id: "activity", label: t.tabActivity, icon: "email-outline" },
      this._s.insights && { id: "foryou", label: t.tabForYou, icon: "star-four-points-outline" },
      { id: "rules", label: t.tabRules, icon: "filter-outline" },
      this._s.ai && { id: "ai", label: t.tabAi, icon: "creation" },
      this._renderAiUsage() && { id: "aiu", label: t.tabAiu, icon: "shield-lock-outline" },
    ].filter(Boolean);
  }

  _tab(tabs) {
    const id = this._s.tab || this._layout.opt("tabs", "current", "activity");
    return tabs.some((x) => x.id === id) ? id : "activity";
  }

  _setTab(id) {
    if (this._s.tab !== id) this._enter = "tab";
    this._s.tab = id;
    this._layout.setOpt("tabs", "current", id);
    this._render();
    if (id === "activity") this._actAutoOpen();
  }

  // wide screens open the newest mail, like a mail program
  _actAutoOpen() {
    const a = this._s.act;
    if (a.picking || a.runs || this._actNarrow() || (a.open && this._actItem(a.open) && this._s.sheet?.inline)) return;
    if (a.items[0]) this._actOpen(a.items[0].key);
  }

  async _actClear() {
    const t = this.t;
    if (!(await this._confirm({ title: t.actConfirmClearTitle, text: t.actConfirmClear, ok: t.clearOk }))) return;
    await this._call(async () => {
      await this._ws({ type: "friedafetch_mail/activity/clear", entry_id: this._s.entryId });
      this._s.act = newActivity();
      this._s.sheet = null;
      await this._loadActivity();
    });
  }

  _render() {
    const s = this._s;
    // a deliberate jump (to the report or the editor) wins over keeping the position
    const draw = () => this._keepInner(() => W.keepFocus(this.shadowRoot, () => this._draw()));
    if (s.scrollToReport || s.focusEditor || s.scrollTo) draw();
    else W.keepScroll(this, draw);
  }

  _draw() {
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
    const runItem = (scope, dry, icon, label, hint, disabled) =>
      `<button data-action="run" data-scope="${scope}" data-dry="${dry ? 1 : 0}" ${s.busy || disabled ? "disabled" : ""}>${ico(icon)}<span class="mi"><span>${esc(label)}</span><small>${esc(hint)}</small></span></button>`;
    const runMenu = `<details class="menu run" id="run-menu"><summary role="button">${ico("play")}${esc(t.runMenu)}</summary><div class="menu-list">
        ${runItem("all", true, "eye-outline", t.dryRunAll, t.dryRunHint, false)}
        ${runItem("all", false, "playlist-play", t.runAll, t.runAllHint, readOnly)}
        ${runItem("new", false, "email-arrow-right-outline", t.runNew, t.runNewHint, readOnly)}
      </div></details>`;
    const rulesHtml = `
      <div class="card">
        <div class="chead"><h2>${esc(t.rules)}${s.accounts.length > 1 && acc ? ` <span class="chip">${esc(acc.label)}</span>` : ""}</h2>
          ${s.rules.length ? runMenu : ""}
          <button class="round" data-action="new" ${s.editing ? "disabled" : ""} title="${esc(t.newRule)}" aria-label="${esc(t.newRule)}">+</button></div>
        <div class="mode ${m.cls}"><span class="ic" aria-hidden="true">${esc(m.ic)}</span><span class="tx"><strong>${esc(m.title)}</strong>${m.sub ? `<span class="muted">${esc(m.sub)}</span>` : ""}</span></div>
        <div class="subbar"><span class="muted">${esc([last, ...extra].join(" · "))}</span><span class="grow"></span>
          ${s.rules.length > 1 ? `<button class="link" data-action="expand-all" data-open="${allOpen ? "0" : "1"}">${esc(allOpen ? t.collapseAll : t.expandAll)}</button>` : ""}</div>
        ${this._renderRules()}
      </div>`;
    const ready = s.loaded && s.entryId;
    const tabbed = !!W.renderTabs; // Frieda older than 2.0.15: no tabs, everything one below the other
    const tabs = ready ? this._tabs() : [];
    const tab = this._tab(tabs);
    const single = (id, html) => (html ? `<section class="widget w-full" data-widget="${id}">${html}</section>` : "");
    const content = {
      activity: () => this._renderActivityTab(),
      rules: () => `${this._renderReport()}${single("rules", rulesHtml)}`,
      foryou: () => this._renderForYou(),
      ai: () => single("ai", this._renderAi()),
      aiu: () => single("aiu", this._renderAiUsage()),
    };
    const elsewhere = ready && s.ai?.batch && (tab !== "activity" || s.act.runs || !tabbed) ? this._renderBatch(s.ai) : "";
    const main = !ready ? "" : `${elsewhere ? `<section class="widget w-full" data-widget="batch">${elsewhere}</section>` : ""}${tabbed ? content[tab]() : tabs.map((x) => content[x.id]()).join("")}`;
    const body = !s.loaded
      ? `<p class="muted">${esc(t.loading)}</p>`
      : !s.entryId
        ? `<div class="card"><p>${esc(t.noAccount)}</p></div>`
        : `
      ${this._renderUpdateHint()}
      ${s.error ? `<div class="error" data-announce>${esc(s.error)}</div>` : ""}
      ${s.notice ? `<div class="ok" data-announce>${esc(s.notice)}</div>` : ""}
      ${this._renderAccounts()}
      ${main}`;
    W.mount(
      this.shadowRoot,
      `<style>${W.UI_STYLE}${STYLE}</style>
      <div class="toolbar"><ha-menu-button></ha-menu-button><img src="${esc(ICON_URL)}" alt=""><span>${esc(t.title)}</span><span class="grow"></span></div>
      ${ready && tabbed ? W.renderTabs(tabs, tab, t.tabsLabel) : ""}
      <div class="content widgets" ${ready && tabbed ? `role="tabpanel" id="tabpanel" aria-labelledby="tab-${tab}"` : ""}>${body}</div>${this._renderSheet()}${this._renderConfirm()}${this._renderKeys()}${this._renderAssist()}`
    );
    // a short glide where something new comes in: another tab, another mail in the reading pane
    if (this._enter && !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      this.shadowRoot.querySelector(this._enter === "tab" ? ".content" : ".reader .rbody")?.classList.add("enter");
    }
    this._enter = null;
    const menu = this.shadowRoot.querySelector("ha-menu-button");
    if (menu && this._hass) {
      menu.hass = this._hass;
      menu.narrow = this._narrow;
    }
    this._bind();
    W.bindWidgets(this.shadowRoot, this._layout, () => this._render());
    if (tabbed) W.bindTabs(this.shadowRoot, (id) => this._setTab(id));
    this._bindAssist();
    for (const key of Object.keys(SEARCH_KEYS)) this._applySearch(key);
    this._observeMore();
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
      const el = [...root.querySelectorAll("tr.rrow[data-rule-id]")].find((n) => n.dataset.ruleId === id);
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
    if (!this._pageReset) {
      // phones and tablets open a dropdown again as soon as it gets the focus: after a choice it keeps none, so the
      // redraw that follows does not hand it back (capture phase, before the choice redraws)
      root.addEventListener(
        "change",
        (ev) => {
          if (ev.target?.tagName === "SELECT" && window.matchMedia?.("(pointer: coarse)").matches) ev.target.blur();
        },
        true
      );
      // a filter shows other rows: start on the first page (capture phase, before the filter redraws)
      this._pageReset = true;
      root.addEventListener(
        "click",
        (ev) => {
          const el = ev.target.closest?.("[data-action]");
          const table = el && FILTER_TABLE[el.dataset.action];
          if (table) (this._s.pages ||= {})[table] = 0;
        },
        true
      );
    }
    root.querySelector(".modal")?.addEventListener("keydown", (ev) => {
      if (ev.key !== "Escape") return;
      if (this._s.keys) this._keysClose();
      else this._confirmDone(false);
    });
    root.querySelectorAll("[data-action]").forEach((el) => {
      const action = el.dataset.action;
      const handler = {
        "fy-refresh": () => this._fyCall({ type: "friedafetch_mail/insights/refresh" }),
        "keys-close": () => this._keysClose(),
        "fy-subs-view": () => {
          this._s.subsView = el.dataset.v;
          this._render();
        },
        "fy-dismiss": () => this._fyCall({ type: "friedafetch_mail/insights/dismiss", kind: el.dataset.kind, item_id: el.dataset.id }, null, this.t[`fyDone_${el.dataset.kind}`] || this.t.undoDone),
        "fy-restore": () => this._fyCall({ type: "friedafetch_mail/insights/restore", kind: el.dataset.kind }),
        "fy-event-edit": () => this._fyOpenEditor(el.dataset.id),
        "fy-event-cancel": () => {
          this._s.fyEdit = null;
          this._render();
        },
        "fy-event-save": () => this._fySaveEvent(el.dataset.id),
        "fy-rule": () => this._fyRule(el.dataset.id),
        "fy-unsub": () => this._fyUnsub(el.dataset.sender, el.dataset.name),
        "fy-tab": () => this._setTab(el.dataset.v),
        "act-threads": async () => {
          this._layout.setOpt("act", "threads", !this._layout.opt("act", "threads", true));
          await this._loadActivity().catch(() => {});
          this._render();
        },
        "thread-open": () => this._actOpen(el.dataset.id),
        "fy-parcel-open": () => {
          this._s.fyParcel = this._s.fyParcel === el.dataset.id ? null : el.dataset.id;
          this._render();
        },
        "fy-parcel-split": () =>
          this._fyCall({ type: "friedafetch_mail/insights/parcel", action: "split", parcel_id: el.dataset.id, message_id: el.dataset.mid }, null, this.t.fyDone_split),
        "fy-parcel-merge": () => {
          const into = this.shadowRoot.querySelector(`#fy-merge-${CSS.escape(el.dataset.id)}`)?.value;
          this._s.fyParcel = into || null;
          return this._fyCall({ type: "friedafetch_mail/insights/parcel", action: "merge", parcel_id: el.dataset.id, into }, null, this.t.fyDone_merge);
        },
        "fy-parcel-ignore": async () => {
          // no question first: "Undo" takes it back, and "No parcels from" in the card later on
          const sender = el.dataset.sender === "1";
          this._s.fyParcel = null;
          const text = sender ? fmt(this.t.fyDone_never, el.dataset.who) : this.t.fyDone_ignore;
          await this._fyCall({ type: "friedafetch_mail/insights/parcel", action: "ignore", parcel_id: el.dataset.id, sender }, null, text);
        },
        "fy-track": () => window.open(el.dataset.url, "_blank", "noopener,noreferrer"),
        // a new rule for mails like this one: the sender as its condition, to be changed in the editor
        "rule-from-mail": () => {
          const rule = this._blankRule();
          rule.name = fmt(this.t.ruleFromMailName, el.dataset.name || el.dataset.from);
          rule.conditions = [{ field: "from", op: "contains", value: el.dataset.from }];
          this._s.editing = rule;
          this._s.focusEditor = true;
          this._s.sheet = null;
          this._setTab("rules");
        },
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
        "runs-sort": () => {
          const key = el.dataset.k;
          this._s.runsSort = nextSort(this._s.runsSort || { key: "time", dir: -1 }, key, key === "trig" ? 1 : -1);
          this._render();
        },
        "rules-sort": () => {
          const key = el.dataset.k;
          const cur = this._s.rulesSort || { key: "pos", dir: 1 };
          // the note's "show order" link always returns to the execution order
          this._s.rulesSort = el.closest(".sortnote") ? { key: "pos", dir: 1 } : nextSort(cur, key, key === "hits" ? -1 : 1);
          this._render();
        },
        "run-open": () => {
          const id = Number(el.dataset.id);
          this._s.runOpen = this._s.runOpen === id ? null : id;
          this._render();
        },
        "run-filter": () => {
          this._s.runFilter = el.dataset.v;
          this._render();
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
        "ai-run": () => this._aiRun(),
        "aiu-clear": () => this._aiUsageClear(),
        "ai-clear": () => this._aiClear(),
        "ai-cat-new": () => {
          this._s.aiEdit = { index: -1, data: { name: "", description: "", move_to: null, mark_seen: false, flag: false } };
          this._render();
          this.shadowRoot.querySelector("#ai-name")?.focus();
        },
        "ai-cat-edit": () => {
          const i = Number(el.dataset.index);
          this._s.aiEdit = { index: i, data: { ...this._s.ai.categories[i] } };
          this._render();
          this.shadowRoot.querySelector("#ai-name")?.focus();
        },
        "ai-cat-cancel": () => {
          this._s.aiEdit = null;
          this._render();
        },
        "ai-cat-save": () => {
          const e = this._aiReadEdit();
          const cats = [...this._s.ai.categories];
          if (e.index >= 0) cats[e.index] = e.data;
          else cats.push(e.data);
          this._aiSaveCategories(cats);
        },
        "ai-cat-delete": async () => {
          const e = this._s.aiEdit;
          const before = this._s.ai.categories;
          const name = before[e.index]?.name || "";
          await this._aiSaveCategories(before.filter((_, i) => i !== e.index));
          if (!this._s.error) this._offerUndo(fmt(this.t.catDeleted, name), () => this._aiSaveCategories(before));
        },
        "confirm-yes": () => this._confirmDone(true),
        "confirm-no": () => this._confirmDone(false),
        "rule-filter": () => {
          this._s.ruleFilter = el.dataset.v;
          this._render();
        },
        "copy-to": () => this._copy(el.dataset.id, el.dataset.target),
        "aiu-sort": () => {
          const key = el.dataset.k;
          const cur = this._s.aiuSort || { key: "time", dir: -1 };
          this._s.aiuSort = cur.key === key ? { key, dir: -cur.dir } : { key, dir: key === "subject" ? 1 : -1 };
          this._render();
        },
        "aiu-mail": () => {
          const e = (this._s.ai?.usage?.log || [])[Number(el.dataset.i)];
          if (e) this._openTimeline({ message_id: e.message_id || null, subject: e.subject || "", sender: e.sender || "" });
        },
        "mail-open": () => {
          const [runId, idx] = String(el.dataset.i).split(":");
          const m = (this._s.history || []).find((h) => String(h.id) === runId)?.mails?.[Number(idx)];
          if (m) this._openTimeline({ message_id: m.message_id || null, subject: m.subject || "", sender: m.from || "" });
        },
        "sheet-close": () => this._closeTimeline(),
        tab: () => this._setTab(el.dataset.v),
        "act-view": () => this._actView(el.dataset.v),
        "act-runs": () => {
          this._s.act.runs = true;
          this._render();
        },
        "act-runs-back": () => {
          this._s.act.runs = false;
          this._render();
        },
        "act-open": (ev) => {
          if (this._swiped) return; // the end of a swipe, not a click
          const a = this._s.act;
          // like a mail program: Cmd/Ctrl adds one mail, Shift a range; while picking every click selects
          if (a.picking || ev.metaKey || ev.ctrlKey || ev.shiftKey) this._actToggle(el.dataset.id, ev);
          else this._actOpen(el.dataset.id);
        },
        "act-fold": () => {
          const f = this._s.act.folded;
          if (f.has(el.dataset.v)) f.delete(el.dataset.v);
          else f.add(el.dataset.v);
          this._render();
        },
        "act-more": () => this._actMore(),
        "act-pick": () => {
          this._s.act.picking = true;
          this._render();
          this.shadowRoot.querySelector('[data-action="act-all"]')?.focus();
        },
        "act-pick-done": () => {
          this._actStopPicking();
          this.shadowRoot.querySelector('[data-action="act-pick"]')?.focus();
        },
        "act-rerate": () => this._actRerate([...this._s.act.sel.keys()]),
        "act-clear": () => this._actClear(),
        "loc-again": () => this._locate(el.dataset.id, this._s.loc.get(el.dataset.id)?.hint),
        "assist-open": () => this._assistOpen(),
        "assist-close": () => this._assistClose(),
        "assist-send": () => this._assistSend(this.shadowRoot.querySelector("#as-input")?.value),
        "assist-chip": () => this._assistSend(el.dataset.v),
        "assist-view": () => {
          const as = this._s.assist;
          as.view = el.dataset.v;
          if (as.view === "card") as.dot = false;
          this._render();
        },
        "assist-test": () => this._assistTest(),
        "ai-check": () => this._check(),
        "mail-act": () => {
          const a = this._s.act;
          const keys = el.closest(".actbar") ? [...a.sel.keys()] : a.open ? [a.open] : [];
          this._mailAct(keys, el.dataset.v);
        },
        "mail-text": () => this._loadText(el.dataset.id),
        "apply-yes": () => this._applyCategory(true),
        "apply-no": () => this._applyCategory(false),
        "assist-apply": () => this._assistApply(),
        "tl-rerate": () => {
          // one way for every opened mail (activity, AI log, runs, a link): the mail and the list show the progress
          const sheet = this._s.sheet;
          const mid = sheet?.data?.message_id || sheet?.key?.message_id;
          if (!mid) return;
          const open = this._actItem(this._s.act.open);
          const key = open?.message_id === mid ? open.key : mid; // the activity keys a mail by its Message-ID
          this._actRerate([key], { [key]: { message_id: mid, mailbox: sheet.data?.mailbox || "INBOX" } });
        },
        "rerate-cancel": () =>
          this._call(async () => {
            this._s.ai = await this._ws({ type: "friedafetch_mail/ai/rerate/cancel", entry_id: this._s.entryId });
          }),
        "batch-hide": () => {
          this._s.batchHidden = this._s.ai?.batch?.started;
          this._layout.setOpt("batch", "hidden", this._s.batchHidden || null);
          this._render();
        },
        reload: () => window.location.reload(),
        "aiu-charts": () => {
          this._layout.setOpt("aiu", "charts", !this._layout.opt("aiu", "charts", false));
          this._render();
        },
        "aiu-open": () => {
          const i = Number(el.dataset.i);
          this._s.aiuOpen = this._s.aiuOpen === i ? null : i;
          this._render();
        },
      }[action];
      if (action === "aiu-filter") {
        el.addEventListener("click", () => {
          this._s.aiuFilter = el.dataset.v;
          this._render();
        });
      } else if (action === "act-all") {
        el.addEventListener("change", () => this._actPickMany(null, el.checked));
      } else if (action === "act-day") {
        const box = el.tagName === "INPUT";
        el.addEventListener(box ? "change" : "click", () => this._actPickMany(el.dataset.v, box ? el.checked : el.getAttribute("aria-pressed") !== "true"));
      } else if (action === "act-viewsel") {
        el.addEventListener("change", () => {
          if (el.value !== "runs") return this._actView(el.value);
          this._s.act.runs = true;
          this._render();
        });
      } else if (action === "check-entity") {
        el.addEventListener("change", () => {
          this._s.check = { ...(this._s.check || {}), entity: el.value, result: null, err: "" };
          this._render();
        });
      } else if (action === "ai-correct") {
        el.addEventListener("change", () => this._aiCorrect(el.dataset.id, el.value));
      } else if (action === "toggle") {
        el.addEventListener("change", () => this._toggle(el.dataset.id, el.checked));
      } else if (action === "copy") {
        el.addEventListener("change", () => el.value && this._copy(el.dataset.id, el.value));
      } else if (action === "account") {
        el.addEventListener("click", () => this._switchAccount(el.dataset.id));
      } else if (handler) {
        el.addEventListener("click", handler);
      }
    });
    // the whole row opens its details (AI log, ratings, runs with handled mails)
    root.querySelectorAll("tr.arow, tr.expandable").forEach((tr) =>
      tr.addEventListener("click", (ev) => {
        if (ev.target.closest("button, a, input, select, details")) return;
        tr.querySelector('[data-action="aiu-open"], [data-action="aiu-mail"], [data-action="run-open"]')?.click();
      })
    );
    // touch screens: a mail of the list is swiped right to read/unread and left to archive (or back to the inbox)
    if (!this._account()?.read_only && !this._s.act.picking) root.querySelectorAll(".mlist li.m").forEach((li) => this._bindRowSwipe(li));
    // phones: pull the list down to load it again
    const scroller = root.querySelector(".lscroll");
    if (scroller && window.matchMedia?.("(pointer: coarse)").matches) this._bindPull(scroller);
    // the rule editor: its sentence and preview follow every change
    const editor = root.querySelector("#editor");
    if (editor) {
      editor.addEventListener("input", () => this._ruleLive());
      editor.addEventListener("change", () => this._ruleLive());
      this._ruleLive();
    }
    // drag a rule to its place
    root.querySelectorAll("tr.rrow[draggable]").forEach((tr) => this._bindRuleDrag(tr));
    // list entries that act as buttons (the mails of a run) also answer to Enter and Space
    root.querySelectorAll('li[role="button"][data-action]').forEach((li) =>
      li.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          li.click();
        }
      })
    );
    // the timeline closes with Escape
    root.querySelector(".sheet.mailsheet")?.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") this._closeTimeline();
    });
    // phones: the timeline comes from the bottom and closes with a swipe down
    const sheet = root.querySelector(".sheet.mailsheet");
    if (sheet && window.matchMedia?.("(max-width: 600px)").matches) this._bindSwipe(sheet);
    // an item of a row menu closes the menu
    root.querySelectorAll("details.rowmenu .menu-list button").forEach((b) => b.addEventListener("click", () => b.closest("details")?.removeAttribute("open")));
    // the activity search asks the server (all mails, not only the loaded ones)
    root.querySelector("#act-q")?.addEventListener("input", (ev) => {
      this._s.act.query = ev.target.value;
      clearTimeout(this._actSearchTimer);
      this._actSearchTimer = setTimeout(async () => {
        try {
          await this._loadActivity();
        } catch (err) {
          /* keep the list */
        }
        this._render();
        W.announce(this.shadowRoot, fmt(this.t.searchHits, this._s.act.total), 300);
      }, 300);
    });
    // arrow keys move through the mails like in a mail program (and open them on wide screens)
    root.querySelector(".mlist")?.addEventListener("keydown", (ev) => {
      if (!["ArrowDown", "ArrowUp"].includes(ev.key) || !ev.target.matches?.('[data-action="act-open"]')) return;
      const all = [...root.querySelectorAll('.mlist [data-action="act-open"]')];
      const next = all[all.indexOf(ev.target) + (ev.key === "ArrowDown" ? 1 : -1)];
      if (!next) return;
      ev.preventDefault();
      next.focus();
      next.scrollIntoView({ block: "nearest" });
      const a = this._s.act;
      if (ev.shiftKey && a.picking) this._actToggle(next.dataset.id, ev);
      else if (!a.picking && !this._actNarrow()) this._actOpen(next.dataset.id);
    });
    root.querySelectorAll("[data-search-table]").forEach((el) => {
      el.addEventListener("input", () => {
        this._s[SEARCH_KEYS[el.dataset.searchTable]] = el.value;
        (this._s.pages ||= {})[el.dataset.searchTable] = 0;
        const shown = this._applySearch(el.dataset.searchTable);
        if (shown !== undefined) W.announce(this.shadowRoot, fmt(this.t.searchHits, shown), 700);
      });
    });
  }
}

// Shown instead of the panel when Frieda is too old to provide the design library.
class FriedaUpdateHint extends HTMLElement {
  connectedCallback() {
    if (Object.prototype.hasOwnProperty.call(this, "hass")) {
      const value = this.hass;
      delete this.hass;
      this.hass = value;
    }
    this._draw();
  }
  set hass(hass) {
    this._lang = (hass?.locale?.language || hass?.language || "en").toLowerCase().startsWith("de") ? "de" : "en";
    this._draw();
  }
  _draw() {
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    const de = this._lang === "de";
    this.shadowRoot.innerHTML = `<div style="padding:24px;max-width:640px;margin:0 auto;font-family:inherit;color:var(--primary-text-color)">
      <h2 style="font-weight:500">Frieda Postfach</h2>
      <p>${plain(de ? "Diese Version von Frieda Postfach braucht eine neuere Version von Frieda (mit der gemeinsamen Design-Bibliothek). Bitte aktualisiere Frieda über HACS und lade die Seite neu." : "This version of Frieda Postfach needs a newer version of Frieda (with the shared design library). Please update Frieda via HACS and reload the page.")}</p></div>`;
  }
}

if (!customElements.get("friedafetch-mail-panel")) {
  customElements.define("friedafetch-mail-panel", W ? FriedaPostfachPanel : FriedaUpdateHint);
}
