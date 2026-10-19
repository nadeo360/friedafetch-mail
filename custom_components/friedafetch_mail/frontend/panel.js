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
  trig === "auto"
    ? t.triggerAuto
    : trig === "push"
      ? t.triggerPush
      : trig === "assistant"
        ? t.triggerAssistant
        : trig === "rerate"
          ? t.triggerRerate
          : t.triggerManual;

// Sortable column header; sort = { key, dir }.
const sortTh = (action, sort, key, label, cls = "") => {
  const active = sort.key === key;
  const icon = active ? (sort.dir < 0 ? "arrow-down" : "arrow-up") : "swap-vertical";
  return `<th class="${cls}" aria-sort="${active ? (sort.dir < 0 ? "descending" : "ascending") : "none"}"><button class="sort ${active ? "on" : ""}" data-action="${action}" data-k="${key}">${esc(label)}${ico(icon)}</button></th>`;
};
const nextSort = (cur, key, firstDir) => (cur.key === key ? { key, dir: -cur.dir } : { key, dir: firstDir });

const SEARCH_KEYS = { rules: "searchRules", aiu: "searchAiu", runs: "searchRuns", rates: "searchRates" };
const PAGE_DEFAULT = { rules: 25, aiu: 10, runs: 10, rates: 10 }; // rows per page until the user picks another size
const FILTER_TABLE = { "rule-filter": "rules", "aiu-filter": "aiu", "rate-filter": "rates", "run-filter": "runs" };

// Widgets and the optional columns of their tables (true = shown by default).
const WIDGETS = [{ id: "rules" }, { id: "ai" }, { id: "aiu" }, { id: "history" }];
const TABLE_COLUMNS = {
  rules: { pos: true, cond: true, act: true, hits: true },
  aiu: { time: true, kind: true, fields: true, chars: true, ent: true },
  runs: { trig: true, scope: true, checked: true, matched: true, rules: true, ai: true, res: true },
  rates: { time: true, from: true, cat: true, applied: true },
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
    this._subscribe();
    this._openLinked(); // the panel may come back from Home Assistant's cache with a new link
  }

  disconnectedCallback() {
    clearInterval(this._timer);
    clearTimeout(this._liveTimer);
    document.removeEventListener("visibilitychange", this._onVisible);
    document.removeEventListener("click", this._onDocClick);
    this._unsubscribe();
  }

  // A redraw now would get in the way: the user is editing, choosing, typing, deciding or has a menu open.
  _canRefresh() {
    const s = this._s;
    if (!this._hass || !s.loaded || !s.entryId || s.busy || s.confirm || s.editing || s.aiEdit || document.visibilityState !== "visible") return false;
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
    if (this._s.sheet && (topics.has("rules") || topics.has("ai"))) jobs.push(this._loadTimeline());
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

  async _autoRefresh() {
    if (!this._canRefresh()) return;
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
    if (first) this._subscribe();
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
        .catch(() => (this._s.ai = null)), // older backend or AI sorting unavailable
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
    await this._call(async () => {
      await this._ws({ type: "friedafetch_mail/ai/correct", entry_id: this._s.entryId, rating_id: ratingId, category });
      this._s.ai = await this._ws({ type: "friedafetch_mail/ai", entry_id: this._s.entryId });
    });
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
      <div class="facts">${fact("format-text", num(w.chars), t.aiuTipChars)}${fact("text-long", num(w.body), t.aiuTipBody, w.body ? "hot" : "")}${fact("shield-check-outline", num(w.held_back), t.aiuTipHeld)}${w.errors ? fact("alert-circle-outline", num(w.errors), t.aiuTipErrors, "err") : ""}</div></div>${charts ? pie(w) : ""}</div>`;
    const legend = charts
      ? `<div class="legend" style="margin-top:8px"><span><i style="background:${COLORS.sent}"></i>${esc(t.aiuSent)}</span><span><i style="background:${COLORS.held}"></i>${esc(t.aiuHeldBack)}</span><span><i style="background:${COLORS.err}"></i>${esc(t.resError)}</span></div>`
      : "";
    const m = u.month || {};
    const chips = [
      ...Object.entries(m.entities || {}).map(([e, n]) => `<span class="chip ic">${ico("robot-outline")}${esc(e.replace(/^ai_task\./, ""))} · ${esc(n)}</span>`),
      m.sort ? `<span class="chip ic">${ico("sort-variant")}${esc(t.aiuKindSort)} · ${esc(m.sort)}</span>` : "",
      m.digest ? `<span class="chip ic">${ico("newspaper-variant-outline")}${esc(t.aiuKindDigest)} · ${esc(m.digest)}</span>` : "",
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
        const digest = e.kind === "digest";
        const title = e.subject || (digest ? t.aiuKindDigest : "–");
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
            <td class="c-kind dim">${fact(digest ? "newspaper-variant-outline" : "sort-variant", digest ? t.aiuKindDigest : t.aiuKindSort, t.aiuTipKind)}</td>
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

  // The AI's recent ratings, as a data table like the other lists.
  // Progress of a re-rating, or its result (until hidden; for half an hour).
  _renderBatch(ai) {
    const t = this.t;
    const b = ai.batch;
    if (!b) return "";
    if (b.state === "running") {
      const pct = b.total ? Math.round((b.done / b.total) * 100) : 0;
      return `<div class="batch"><span class="spinner" aria-hidden="true"></span><div class="bt"><strong>${esc(fmt(t.rerateRunning, b.done, b.total))}</strong><div class="bar" aria-hidden="true"><span style="width:${pct}%"></span></div></div><button class="secondary small" data-action="rerate-cancel">${esc(t.rerateCancel)}</button></div>`;
    }
    const age = Date.now() - (parseTime(b.finished)?.getTime() || 0);
    if (this._s.batchHidden === b.started || age > 30 * 60000) return "";
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
    if (!ok) return;
    const apply = act && this._confirmOption;
    await this._call(async () => {
      this._s.ai = await this._ws({ type: "friedafetch_mail/ai/rerate", entry_id: this._s.entryId, rating_ids: ratingIds, messages, apply });
      this._s.rateSel = new Set();
      this._s.batchHidden = null;
    });
  }

  _renderRatings(ai, cats, catLabel) {
    const t = this.t;
    const s = this._s;
    const list = (ai.ratings || []).map((r, i) => ({ r, i }));
    if (!list.length) return `${this._renderBatch(ai)}<p class="muted">${esc(t.aiNoRatings)}</p>`;
    const sel = (s.rateSel ||= new Set());
    const kinds = {
      "": () => true,
      important: ({ r }) => Number(r.importance) >= 4,
      corrected: ({ r }) => !!r.corrected,
      suspicious: ({ r }) => !!r.suspicious,
    };
    const f = kinds[s.ratesFilter] ? s.ratesFilter : "";
    const sort = s.ratesSort || { key: "time", dir: -1 };
    const value = ({ r }) => (sort.key === "imp" ? Number(r.importance) : parseTime(r.time)?.getTime() || 0);
    const rows = list
      .filter(kinds[f])
      .sort((x, y) => (value(x) - value(y)) * sort.dir || y.i - x.i)
      .map(({ r, i }) => {
        const cur = r.corrected || r.category;
        const appliedIcons = { seen: "email-open-outline", flagged: "flag-outline", notified: "bell-outline", quota: "timer-sand" };
        const applied = (r.applied || [])
          .map((a) => {
            const moved = a.startsWith("moved:");
            const label = moved ? `→ ${a.slice(6)}` : t[`aiApplied_${a}`] || a;
            return `<span class="fi ${a === "quota" ? "hot" : ""}" role="img" aria-label="${esc(label)}" title="${esc(label)}">${ico(moved ? "folder-move-outline" : appliedIcons[a] || "check")}</span>`;
          })
          .join("");
        const opt = (val, label) => `<option value="${esc(val)}" ${val === cur ? "selected" : ""}>${esc(label)}</option>`;
        const search = [r.subject, r.from, r.from_domain, cur, r.reason].join(" ").toLowerCase();
        const picked = sel.has(r.id);
        return `<tr class="arow rrate ${picked ? "picked" : ""}" data-rid="${esc(r.id)}" data-search="${esc(search)}">
            <td class="c-sel"><input type="checkbox" class="selbox" data-action="rate-sel" data-id="${esc(r.id)}" ${picked ? "checked" : ""} aria-label="${esc(fmt(t.selectMail, r.subject || "–"))}"></td>
            <td class="c-imp"><span class="imp i${esc(r.importance)}" role="img" aria-label="${esc(fmt(t.aiImportance, r.importance))}" title="${esc(fmt(t.aiImportance, r.importance))}">${esc(r.importance)}</span></td>
            <td class="c-time num dim" title="${esc(fmtDateTime(r.time))}">${esc(fmtShort(r.time))}</td>
            <td class="c-subj"><button class="rtext go" data-action="rate-open" data-id="${esc(r.id)}" aria-haspopup="dialog" title="${esc(r.subject || "")}"><span class="rt">${esc(r.subject || "–")}</span>${ico("chevron-right")}</button></td>
            <td class="c-from dim" title="${esc(r.from || "")}">${esc(r.from || "–")}</td>
            <td class="c-cat"><label class="chipsel ${r.corrected ? "on" : ""}" title="${esc(r.corrected ? `${t.aiCorrected}: ${catLabel(r.category)} → ${catLabel(cur)}` : t.aiCorrect)}">${r.corrected ? `<span class="lead">${ico("pencil-outline")}</span>` : ""}<select data-action="ai-correct" data-id="${esc(r.id)}" aria-label="${esc(t.aiCorrect)}: ${esc(r.subject || "")}">${[...new Set([...cats.map((c) => c.name), "other", cur])].map((n) => opt(n, catLabel(n))).join("")}</select>${ico("chevron-down")}</label>${r.suspicious ? `<span class="fi hot" role="img" aria-label="${esc(t.aiSuspicious)}" title="${esc(t.aiSuspicious)}">${ico("alert-outline")}</span>` : ""}</td>
            <td class="c-applied"><span class="fields">${applied || `<span class="muted">–</span>`}</span></td>
          </tr>`;
      })
      .join("");
    const cols = [
      { key: "time", label: t.colTime },
      { key: "from", label: t.colSender },
      { key: "cat", label: t.colCategory },
      { key: "applied", label: t.colApplied },
    ];
    const count = (k) => list.filter(kinds[k]).length;
    const seg = (val, icon, label) => {
      const n = count(val);
      if (val && !n && f !== val) return "";
      const text = label.charAt(0).toUpperCase() + label.slice(1);
      return `<button class="seg ${f === val ? "on" : ""}" data-action="rate-filter" data-v="${val}" aria-pressed="${f === val}">${ico(icon)}${esc(text)}<span class="n">${n}</span></button>`;
    };
    const th = (key, label, cls = "") => {
      const active = sort.key === key;
      return `<th class="${cls}" aria-sort="${active ? (sort.dir < 0 ? "descending" : "ascending") : "none"}"><button class="sort ${active ? "on" : ""}" data-action="rate-sort" data-k="${key}">${esc(label)}${ico(active ? (sort.dir < 0 ? "arrow-down" : "arrow-up") : "swap-vertical")}</button></th>`;
    };
    const shown = list.filter(kinds[f]);
    const all = shown.length > 0 && shown.every(({ r }) => sel.has(r.id));
    const running = ai.batch?.state === "running";
    const selbar = sel.size
      ? `<div class="selbar"><strong>${esc(fmt(t.selected, sel.size))}</strong><span class="grow"></span><button class="link small" data-action="rate-sel-clear">${esc(t.selectionClear)}</button><button class="pill" data-action="rerate" ${s.busy || running ? "disabled" : ""}>${ico("refresh")}${esc(t.rerate)}</button></div>`
      : "";
    return `${this._renderBatch(ai)}<div class="tbar">
        <label class="search">${ico("magnify")}<input type="search" data-search-table="rates" value="${esc(s.searchRates || "")}" placeholder="${esc(t.searchAi)}" aria-label="${esc(t.searchAi)}"></label>
        <div class="segs" role="group">${seg("", "format-list-bulleted", t.aiuAll)}${seg("important", "alert-circle-outline", t.aiImportant)}${seg("corrected", "pencil-outline", t.aiCorrected)}${seg("suspicious", "alert-outline", t.aiSuspicious)}</div>
        <span class="grow"></span>${W.columnMenu(this._layout, "rates", cols, t)}
      </div>${W.columnStyle(this._layout, "rates", cols)}${selbar}
      <div class="scroll aiu-scroll"><table class="dtable atable ratetable" data-table="rates"><thead><tr>
        <th class="c-sel"><input type="checkbox" class="selbox" data-action="rate-sel-all" ${all ? "checked" : ""} aria-label="${esc(t.selectAllMatching)}" title="${esc(t.selectAllMatching)}"></th>${th("imp", "!", "c-imp")}${th("time", t.colTime, "c-time num")}<th class="c-subj">${esc(t.colSubjectOnly)}</th><th class="c-from">${esc(t.colSender)}</th><th class="c-cat">${esc(t.colCategory)}</th><th class="c-applied">${esc(t.colApplied)}</th>
      </tr></thead><tbody>${rows || `<tr><td colspan="8" class="muted">${esc(t.noMatches)}</td></tr>`}</tbody></table></div>${W.pagerSlot ? W.pagerSlot("rates") : ""}
      <p class="muted nomatch" hidden>${esc(t.noMatches)}</p>`;
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
    ].filter(Boolean);
    const warn = !st.entity_ok ? fmt(t.aiEntityMissing, st.entity) : st.last_error ? fmt(t.aiError, st.last_error) : "";
    const catLabel = (name) => (name === "other" ? t.aiOther : name);
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
        return `<div class="ai-cat"><span class="tx"><strong>${esc(c.name)}</strong><span class="muted">${esc(c.description)}</span></span>
          <span>${acts.map((a) => `<span class="chip">${esc(a)}</span>`).join("")}</span>
          <button class="icon" data-action="ai-cat-edit" data-index="${i}" ${edit ? "disabled" : ""} title="${esc(t.edit)}" aria-label="${esc(t.edit)}: ${esc(c.name)}">${ico("pencil-outline")}</button></div>`;
      })
      .join("");
    const ratings = this._renderRatings(ai, cats, catLabel);
    return `<div class="card" id="ai">
      <div class="chead"><h2>${esc(t.ai)} <span class="badge ${act ? "warn" : ""}">${esc(act ? t.aiModeActShort : t.aiModeObserveShort)}</span></h2>
        <button class="pill" data-action="ai-run" ${s.busy ? "disabled" : ""} title="${esc(t.aiRunHint)}">${ico("play")}${esc(t.aiRun)}</button>
        ${W.cardMenu([(ai.ratings || []).length && { action: "ai-clear", icon: "delete-sweep-outline", label: t.aiClear, danger: true, disabled: s.busy }], t)}</div>
      <div class="mode ${warn ? "warn" : ""}"><span class="ic" aria-hidden="true">${act ? "✦" : "👁"}</span><span class="tx"><strong>${esc(act ? t.aiAct : t.aiObserve)}</strong><span class="muted">${esc(sub.join(" · "))}</span>${warn ? `<span class="muted">${esc(warn)}</span>` : ""}</span></div>
      ${acc && !acc.rules_auto ? `<p class="muted" style="margin:-4px 0 10px">${esc(t.aiManualOnly)}</p>` : ""}
      <div class="with-add"><h3 class="muted">${esc(t.aiCategories)}</h3><button class="round small" data-action="ai-cat-new" ${edit ? "disabled" : ""} title="${esc(t.aiNewCategory)}" aria-label="${esc(t.aiNewCategory)}">+</button></div>
      <p class="muted" style="margin:-4px 0 8px">${esc(t.aiCategoriesHint)}</p>
      <div class="ai-cats">${catRows}${edit && edit.index < 0 ? editor(edit) : ""}</div>
      <h3 class="muted with-add">${esc(t.aiRatings)}</h3>
      ${ratings}
    </div>`;
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
    if (!(await this._confirm({ title: t.confirmDeleteTitle, text: fmt(t.confirmDelete, name), ok: t.remove }))) return;
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
  async _openTimeline(key) {
    this._s.sheet = { key, data: null, loading: true, error: null };
    this._render();
    await this._loadTimeline();
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
    this._render();
  }

  // Swipe down on the sheet: on its head at any time, in the list once it is scrolled to the top.
  _bindSwipe(sheet) {
    const body = sheet.querySelector(".sheet-body");
    let y0 = null;
    let t0 = 0;
    let dy = 0;
    sheet.addEventListener(
      "touchstart",
      (ev) => {
        if (ev.touches.length !== 1) return;
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
        if (y0 === null) return;
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
    this._render();
  }

  _renderSheet() {
    const sheet = this._s.sheet;
    if (!sheet) return "";
    const t = this.t;
    const d = sheet.data || {};
    const cat = (c) => (c === "other" ? t.aiOther : c);
    const subject = d.subject || sheet.key.subject || "–";
    const sender = d.sender || sheet.key.sender || "";
    const chips = [];
    if (d.category) chips.push(`<span class="state ai">${ico(d.corrected ? "pencil-outline" : "creation")}${esc(d.corrected ? fmt(t.tlCategoryCorrected, cat(d.category)) : cat(d.category))}</span>`);
    if (d.held) chips.push(`<span class="state held">${ico("shield-check-outline")}${esc(t.tlNotAi)}</span>`);
    const where = d.location === "trash" ? t.tlTrash : d.location ? `${d.mailbox || "INBOX"} → ${d.location}` : d.mailbox;
    if (where) chips.push(`<span class="state box">${ico(d.location === "trash" ? "delete-outline" : "folder-outline")}${esc(where)}</span>`);
    const events = d.events || [];
    const body = sheet.loading
      ? `<p class="working"><span class="spinner" aria-hidden="true"></span>${esc(t.tlLoading)}</p>`
      : sheet.error
        ? `<div class="error">${esc(sheet.error)}</div>`
        : !d.found
          ? `<p class="muted">${esc(t.tlEmpty)}</p>`
          : `<ol class="tl">${events.map((e, i) => this._tlStep(e, i === events.length - 1)).join("")}</ol>`;
    return `<div class="sheet-backdrop" data-action="sheet-close"></div>
      <aside class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
        <span class="handle" aria-hidden="true"></span>
        <div class="sheet-top"><span class="ttl">${esc(t.tlTitle)}</span><button class="icon" data-action="sheet-close" aria-label="${esc(t.close)}" title="${esc(t.close)}">${ico("close")}</button></div>
        <div class="sheet-head">
          <h2 id="sheet-title">${esc(subject)}</h2>
          ${sender || d.date ? `<span class="from">${esc([sender.replace(/^@/, ""), d.date ? fmtDateTime(d.date) : ""].filter(Boolean).join(" · "))}</span>` : ""}
          ${chips.length ? `<div class="chips">${chips.join("")}</div>` : ""}
        </div>
        <div class="sheet-body">${body}</div>
        <div class="sheet-foot"><span class="muted">${esc(d.message_id || sheet.key.message_id ? t.tlFoot : t.tlFootOld)}</span>${
          (d.message_id || sheet.key.message_id) && this._s.ai?.status?.active
            ? `<button class="secondary small ib" data-action="tl-rerate" ${this._s.busy || this._s.ai?.batch?.state === "running" ? "disabled" : ""}>${ico("refresh")}${esc(t.rerate)}</button>`
            : ""
        }</div>
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
      icon = "tag-outline";
      tone = "ai";
      title = fmt(e.again ? t.tlRatedAgain : t.tlRated, cat(e.category));
      sub = e.importance ? fmt(t.tlImportance, e.importance) : "";
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
    } else if (e.kind === "corrected") {
      icon = "pencil-outline";
      tone = "you";
      title = t.tlCorrected;
      sub = fmt(t.tlCorrectedSub, cat(e.before), cat(e.after));
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
        return `<tr class="rrow ${open ? "open" : ""} ${r.enabled ? "" : "off"}" data-rule-id="${esc(r.id)}" data-search="${esc(search)}">
            <td class="c-pos num">${i + 1}</td>
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
      <div class="with-add"><h3 class="muted">${esc(t.conditions)}</h3><button class="round small" data-action="add-cond" title="${esc(t.addCondition)}" aria-label="${esc(t.addCondition)}">+</button></div>
      ${conds}
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

  _render() {
    const s = this._s;
    // a deliberate jump (to the report or the editor) wins over keeping the position
    const draw = () => W.keepFocus(this.shadowRoot, () => this._draw());
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
    const widgets = !s.loaded || !s.entryId
      ? {}
      : {
          rules: { title: t.rules, html: `
      <div class="card">
        <div class="chead"><h2>${esc(t.rules)}${s.accounts.length > 1 && acc ? ` <span class="chip">${esc(acc.label)}</span>` : ""}</h2>
          ${s.rules.length ? runMenu : ""}
          <button class="round" data-action="new" ${s.editing ? "disabled" : ""} title="${esc(t.newRule)}" aria-label="${esc(t.newRule)}">+</button></div>
        <div class="mode ${m.cls}"><span class="ic" aria-hidden="true">${esc(m.ic)}</span><span class="tx"><strong>${esc(m.title)}</strong>${m.sub ? `<span class="muted">${esc(m.sub)}</span>` : ""}</span></div>
        <div class="subbar"><span class="muted">${esc([last, ...extra].join(" · "))}</span><span class="grow"></span>
          ${s.rules.length > 1 ? `<button class="link" data-action="expand-all" data-open="${allOpen ? "0" : "1"}">${esc(allOpen ? t.collapseAll : t.expandAll)}</button>` : ""}</div>
        ${this._renderRules()}
      </div>` },
          ai: { title: t.ai, html: this._renderAi() },
          aiu: { title: t.aiu, html: this._renderAiUsage() },
          history: { title: t.history, html: this._renderHistory() },
        };
    const body = !s.loaded
      ? `<p class="muted">${esc(t.loading)}</p>`
      : !s.entryId
        ? `<div class="card"><p>${esc(t.noAccount)}</p></div>`
        : `
      ${this._renderUpdateHint()}
      ${s.error ? `<div class="error" data-announce>${esc(s.error)}</div>` : ""}
      ${s.notice ? `<div class="ok" data-announce>${esc(s.notice)}</div>` : ""}
      ${this._renderAccounts()}
      ${this._renderReport()}
      ${W.renderWidgets(this._layout, widgets, t)}`;
    W.mount(
      this.shadowRoot,
      `<style>${W.UI_STYLE}${STYLE}</style>
      <div class="toolbar"><ha-menu-button></ha-menu-button><img src="${esc(ICON_URL)}" alt=""><span>${esc(t.title)}</span><span class="grow"></span>${s.loaded && s.entryId ? W.layoutButton(this._layout, t) : ""}</div>
      <div class="content widgets">${body}</div>${this._renderSheet()}${this._renderConfirm()}`
    );
    const menu = this.shadowRoot.querySelector("ha-menu-button");
    if (menu && this._hass) {
      menu.hass = this._hass;
      menu.narrow = this._narrow;
    }
    this._bind();
    W.bindWidgets(this.shadowRoot, this._layout, () => this._render());
    for (const key of Object.keys(SEARCH_KEYS)) this._applySearch(key);
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
      if (ev.key === "Escape") this._confirmDone(false);
    });
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
          const t = this.t;
          const name = this._s.ai.categories[e.index]?.name || "";
          if (!(await this._confirm({ title: t.aiCatConfirmDeleteTitle, text: fmt(t.aiCatConfirmDelete, name), ok: t.remove }))) return;
          this._aiSaveCategories(this._s.ai.categories.filter((_, i) => i !== e.index));
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
        "rate-filter": () => {
          this._s.ratesFilter = el.dataset.v;
          this._render();
        },
        "rate-sort": () => {
          const key = el.dataset.k;
          const cur = this._s.ratesSort || { key: "time", dir: -1 };
          this._s.ratesSort = cur.key === key ? { key, dir: -cur.dir } : { key, dir: -1 };
          this._render();
        },
        "rate-open": () => {
          const r = (this._s.ai?.ratings || []).find((x) => x.id === el.dataset.id);
          if (r) this._openTimeline({ message_id: r.message_id || null, subject: r.subject || "", sender: r.from_domain ? `@${r.from_domain}` : r.from || "" });
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
        "rate-sel": () => {
          const sel = (this._s.rateSel ||= new Set());
          if (el.checked) sel.add(el.dataset.id);
          else sel.delete(el.dataset.id);
          this._render();
        },
        "rate-sel-all": () => {
          // every row that matches the filter and the search, on all pages
          const sel = (this._s.rateSel ||= new Set());
          for (const tr of root.querySelectorAll('table[data-table="rates"] tbody tr[data-rid]')) {
            if (tr.dataset.nomatch === "1") continue;
            if (el.checked) sel.add(tr.dataset.rid);
            else sel.delete(tr.dataset.rid);
          }
          this._render();
        },
        "rate-sel-clear": () => {
          this._s.rateSel = new Set();
          this._render();
        },
        rerate: () => this._rerate({ ratingIds: [...(this._s.rateSel || [])] }),
        "tl-rerate": () => {
          const sheet = this._s.sheet;
          const mid = sheet?.data?.message_id || sheet?.key?.message_id;
          if (mid) this._rerate({ messages: [{ message_id: mid, ...(sheet.data?.mailbox ? { mailbox: sheet.data.mailbox } : {}) }] });
        },
        "rerate-cancel": () =>
          this._call(async () => {
            this._s.ai = await this._ws({ type: "friedafetch_mail/ai/rerate/cancel", entry_id: this._s.entryId });
          }),
        "batch-hide": () => {
          this._s.batchHidden = this._s.ai?.batch?.started;
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
        tr.querySelector('[data-action="aiu-open"], [data-action="aiu-mail"], [data-action="rate-open"], [data-action="run-open"]')?.click();
      })
    );
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
    root.querySelector(".sheet")?.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") this._closeTimeline();
    });
    // phones: the timeline comes from the bottom and closes with a swipe down
    const sheet = root.querySelector(".sheet");
    if (sheet && window.matchMedia?.("(max-width: 600px)").matches) this._bindSwipe(sheet);
    // an item of a row menu closes the menu
    root.querySelectorAll("details.rowmenu .menu-list button").forEach((b) => b.addEventListener("click", () => b.closest("details")?.removeAttribute("open")));
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
