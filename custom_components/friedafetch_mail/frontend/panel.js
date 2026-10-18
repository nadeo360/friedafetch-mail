/* Frieda Postfach – Posteingangsregeln, Läufe und Verlauf (ohne Build-Schritt, ohne Abhängigkeiten). */

const ICON_URL = new URL("icon.svg", import.meta.url).href;

const FIELDS = ["from", "to", "cc", "subject", "any"];
const OPS = ["contains", "equals", "starts_with", "ends_with", "domain", "regex"];

// Texts and styles live in their own modules; they are loaded with the same ?v= as this file so that
// a browser never combines a new panel with old texts after an update.
const VERSION_QUERY = new URL(import.meta.url).search;
const [{ I18N }, { STYLE }] = await Promise.all([import(`./i18n.js${VERSION_QUERY}`), import(`./styles.js${VERSION_QUERY}`)]);

const trigLabel = (t, trig) =>
  trig === "auto" ? t.triggerAuto : trig === "push" ? t.triggerPush : trig === "assistant" ? t.triggerAssistant : t.triggerManual;

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
      ai: null,
      aiEdit: null,
      aiuFilter: "",
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
    if (!this._hass || !s.loaded || !s.entryId || s.busy || s.editing || s.aiEdit || document.visibilityState !== "visible") return;
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
    try {
      this._s.ai = await this._ws({ type: "friedafetch_mail/ai", entry_id: this._s.entryId });
    } catch (err) {
      this._s.ai = null; /* older backend or AI sorting unavailable */
    }
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
    if (!confirm(this.t.aiConfirmClear)) return;
    await this._call(async () => {
      this._s.ai = await this._ws({ type: "friedafetch_mail/ai/clear", entry_id: this._s.entryId });
    });
  }

  async _aiUsageClear() {
    if (!confirm(this.t.aiuConfirmClear)) return;
    await this._call(async () => {
      this._s.ai = await this._ws({ type: "friedafetch_mail/ai/usage/clear", entry_id: this._s.entryId });
    });
  }

  // Kill-switch reasons: a list of {type, value, where} (older entries: "sender" or "term:<x>").
  _heldReasons(held) {
    const t = this.t;
    const list = Array.isArray(held)
      ? held
      : held === "sender"
        ? [{ type: "sender", value: "", where: [] }]
        : [{ type: "term", value: String(held || "").replace(/^term:/, ""), where: [] }];
    return list
      .map((r) => {
        const where = (r.where || []).map((w) => t.aiuWhere[w] || w).join(", ");
        const text = r.type === "sender" ? (r.value ? fmt(t.aiuHeldSenderV, r.value) : t.aiuHeldSender) : fmt(t.aiuHeldTerm, r.value);
        return where && r.type !== "sender" ? `${text} (${where})` : text;
      })
      .join(" · ");
  }

  _renderAiUsage() {
    const t = this.t;
    const s = this._s;
    const u = s.ai?.usage;
    if (!u) return "";
    const st = s.ai.status || {};
    const log = u.log || [];
    if (!st.active && !log.length) return "";
    const stat = (label, w) => `<div class="stat"><div class="k">${esc(label)}</div><div class="v">${esc(Number(w.calls || 0).toLocaleString())} <small class="muted">${esc(t.aiuCalls)}</small></div>
      <div class="s">${esc([fmt(t.aiuChars, Number(w.chars || 0).toLocaleString()), fmt(t.aiuBody, w.body || 0), fmt(t.aiuHeld, w.held_back || 0), w.errors ? fmt(t.aiuErrors, w.errors) : ""].filter(Boolean).join(" · "))}</div></div>`;
    const m = u.month || {};
    const chips = [
      ...Object.entries(m.entities || {}).map(([e, n]) => `${e} · ${n}`),
      m.sort ? `${t.aiuKindSort} · ${m.sort}` : "",
      m.digest ? `${t.aiuKindDigest} · ${m.digest}` : "",
    ].filter(Boolean);
    const f = s.aiuFilter;
    const rows = log
      .filter((e) => !f || (f === "sent" ? e.sent : !e.sent))
      .map((e) => {
        const kind = e.kind === "digest" ? t.aiuKindDigest : t.aiuKindSort;
        const what = e.sent
          ? `${(e.fields || []).map((x) => t.aiuFields[x] || x).join(", ")} · ${fmt(t.aiuChars, Number(e.chars || 0).toLocaleString())}${e.items != null ? " · " + fmt(t.aiuItems, e.items) : ""}`
          : this._heldReasons(e.held_back);
        return `<div class="aiu-row">
          <span class="badge ${e.sent ? (e.ok ? "" : "warn") : "ok-held"}">${esc(e.sent ? (e.ok ? t.aiuSent : t.resError) : t.aiuHeldBack)}</span>${!e.sent && Array.isArray(e.held_back) && e.held_back.length > 1 ? `<span class="badge">${esc(fmt(t.aiuReasons, e.held_back.length))}</span>` : ""}
          <span class="tx"><span><strong>${esc(kind)}</strong> → ${esc(e.entity || "–")} <span class="muted">· ${esc(fmtDateTime(e.time))}</span></span>
            <span class="muted">${esc(what)}</span>
            ${e.subject || e.sender ? `<span class="muted">${esc([e.sender, e.subject ? `„${e.subject}“` : ""].filter(Boolean).join(" · "))}</span>` : ""}
            ${e.error ? `<span class="muted">${esc(e.error)}</span>` : ""}</span>
        </div>`;
      })
      .join("");
    const opt = (val, label) => `<option value="${val}" ${f === val ? "selected" : ""}>${esc(label)}</option>`;
    return `<div class="card" id="ai-usage">
      <h2><span class="grow">${esc(t.aiu)}</span>${log.length ? `<button class="link" data-action="aiu-clear">${esc(t.aiuClear)}</button>` : ""}</h2>
      <p class="muted" style="margin:0 0 10px">${esc(t.aiuHint)}</p>
      <div class="stats">${stat(t.aiuToday, u.today || {})}${stat(t.aiuWeek, u.week || {})}${stat(t.aiuMonth, u.month || {})}</div>
      ${chips.length ? `<div style="margin-top:10px">${chips.map((c) => `<span class="chip">${esc(c)}</span>`).join("")}</div>` : ""}
      ${
        log.length
          ? `<div class="fbar" style="margin-top:12px"><select data-action="aiu-filter" aria-label="${esc(t.aiuAll)}">${opt("", t.aiuAll)}${opt("sent", t.aiuOnlySent)}${opt("held", t.aiuOnlyHeld)}</select></div><div class="aiu-list">${rows}</div>`
          : `<p class="muted" style="margin-top:12px">${esc(t.aiuEmpty)}</p>`
      }
    </div>`;
  }

  _renderAi() {
    const t = this.t;
    const s = this._s;
    const ai = s.ai;
    if (!ai) return "";
    const st = ai.status || {};
    if (!st.active) {
      return `<div class="card"><h2><span class="grow">${esc(t.ai)}</span><span class="badge">${esc(t.aiOff)}</span></h2>
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
        <div class="row"><label></label><label><input type="checkbox" id="ai-seen" ${e.data.mark_seen ? "checked" : ""}> ${esc(t.aiCatSeen)}</label></div>
        <div class="row"><label></label><label><input type="checkbox" id="ai-flag" ${e.data.flag ? "checked" : ""}> ${esc(t.aiCatFlag)}</label></div>
        ${act ? "" : `<p class="muted" style="margin:0 0 10px">${esc(t.aiCatActionsObserve)}</p>`}
        <div class="actionsbar"><button data-action="ai-cat-save" ${s.busy ? "disabled" : ""}>${esc(t.save)}</button><button class="secondary" data-action="ai-cat-cancel">${esc(t.cancel)}</button>
          ${e.index >= 0 ? `<button class="secondary" data-action="ai-cat-delete">🗑 ${esc(t.aiCatDelete)}</button>` : ""}</div>
      </div>`;
    const catRows = cats
      .map((c, i) => {
        if (edit && edit.index === i) return editor(edit);
        const acts = [c.move_to ? `→ ${c.move_to}` : "", c.mark_seen ? t.aSeen : "", c.flag ? t.aFlag : ""].filter(Boolean);
        return `<div class="ai-cat"><span class="tx"><strong>${esc(c.name)}</strong><span class="muted">${esc(c.description)}</span></span>
          <span>${acts.map((a) => `<span class="chip">${esc(a)}</span>`).join("")}</span>
          <button class="icon" data-action="ai-cat-edit" data-index="${i}" ${edit ? "disabled" : ""} title="${esc(t.edit)}" aria-label="${esc(t.edit)}: ${esc(c.name)}">✎</button></div>`;
      })
      .join("");
    const ratings = (ai.ratings || [])
      .map((r) => {
        const cur = r.corrected || r.category;
        const applied = (r.applied || []).map((a) => (a.startsWith("moved:") ? `→ ${a.slice(6)}` : t[`aiApplied_${a}`] || a));
        return `<div class="ai-rate">
          <span class="imp i${r.importance}" title="${esc(fmt(t.aiImportance, r.importance))}">${esc(r.importance)}</span>
          <span class="subj">${esc(r.subject || "–")}</span>
          <span class="side">
            <select data-action="ai-correct" data-id="${esc(r.id)}" title="${esc(t.aiCorrect)}" aria-label="${esc(t.aiCorrect)}">${[...cats.map((c) => c.name), "other"].map((n) => opt(n, catLabel(n), cur)).join("")}</select>
            ${r.corrected ? `<span class="badge">${esc(t.aiCorrected)}</span>` : ""}${r.suspicious ? `<span class="badge warn">${esc(t.aiSuspicious)}</span>` : ""}
          </span>
          <span class="meta">${esc(r.from || "")} · ${esc(fmtDateTime(r.time))}${applied.length ? " · " + applied.map(esc).join(", ") : ""}</span>
          <span class="why muted">${esc(r.reason || "")}</span>
        </div>`;
      })
      .join("");
    return `<div class="card" id="ai">
      <h2><span class="grow">${esc(t.ai)} <span class="badge ${act ? "warn" : ""}">${esc(act ? t.aiModeActShort : t.aiModeObserveShort)}</span></span>
        <button class="pill" data-action="ai-run" ${s.busy ? "disabled" : ""} title="${esc(t.aiRunHint)}"><span aria-hidden="true" style="font-size:11px">▶</span>${esc(t.aiRun)}</button></h2>
      <div class="mode ${warn ? "warn" : ""}"><span class="ic" aria-hidden="true">${act ? "✦" : "👁"}</span><span class="tx"><strong>${esc(act ? t.aiAct : t.aiObserve)}</strong><span class="muted">${esc(sub.join(" · "))}</span>${warn ? `<span class="muted">${esc(warn)}</span>` : ""}</span></div>
      ${acc && !acc.rules_auto ? `<p class="muted" style="margin:-4px 0 10px">${esc(t.aiManualOnly)}</p>` : ""}
      <h3 class="muted with-add">${esc(t.aiCategories)} <button class="round small" data-action="ai-cat-new" ${edit ? "disabled" : ""} title="${esc(t.aiNewCategory)}" aria-label="${esc(t.aiNewCategory)}">+</button></h3>
      <p class="muted" style="margin:-4px 0 8px">${esc(t.aiCategoriesHint)}</p>
      <div class="ai-cats">${catRows}${edit && edit.index < 0 ? editor(edit) : ""}</div>
      <h3 class="muted with-add">${esc(t.aiRatings)}${(ai.ratings || []).length ? ` <button class="link" data-action="ai-clear">${esc(t.aiClear)}</button>` : ""}</h3>
      ${ratings ? `<div class="ai-rates">${ratings}</div>` : `<p class="muted">${esc(t.aiNoRatings)}</p>`}
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
      .map((s) => `<li>${esc(t[s.code] ? fmt(t[s.code], s.count ?? "") : s.reason)}${s.uid ? ` (UID ${s.uid})` : ""}${s.rule ? ` – ${esc(s.rule)}` : ""}${s.mailbox ? ` – ${esc(s.mailbox)}` : ""}</li>`)
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
      ${this._renderAi()}
      ${this._renderAiUsage()}
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
        "ai-cat-delete": () => {
          const e = this._s.aiEdit;
          this._aiSaveCategories(this._s.ai.categories.filter((_, i) => i !== e.index));
        },
      }[action];
      if (action === "aiu-filter") {
        el.addEventListener("change", () => {
          this._s.aiuFilter = el.value;
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
