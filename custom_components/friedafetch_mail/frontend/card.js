/* Frieda Postfach – dashboard card: parcels arriving, important mail of today and whether everything works.

Reads only the account's own entities (no websocket commands), so it also works for users who are not admins.
Configuration (all optional):
  type: custom:friedafetch-mail-card
  device_id: <the Frieda Postfach device of an account>   # default: the first account
  parcels: true      # the parcels on their way
  important: true    # important mail of today
  title: Mail        # instead of "Frieda Postfach"
A tap on a mail opens it in the Frieda Postfach panel; a parcel's link opens the carrier's or the shop's page (built by
Frieda from their own addresses, never taken from a mail).
*/

const TEXTS = {
  de: {
    title: "Frieda Postfach",
    ok: "Alles läuft",
    problem: "Problem",
    kinds: { push: "Push getrennt", look: "Abgleich gestört", ai: "KI antwortet nicht", pass_slow: "Durchlauf hängt", throttled: "iCloud bremst", for_you: "„Für dich“ gestört" },
    parcels: "Pakete",
    noParcels: "Keine Pakete unterwegs",
    important: "Wichtig heute",
    noImportant: "Nichts Wichtiges heute",
    unread: "{0} ungelesen",
    status: { in_transit: "unterwegs", out_for_delivery: "kommt heute", pickup: "abholbereit", delivered: "zugestellt", problem: "Problem" },
    today: "heute",
    tomorrow: "morgen",
    track: "Verfolgen",
    order: "Bestellung",
    open: "Im Postfach öffnen",
    more: "+{0} weitere",
    missing: "Keine Frieda-Postfach-Sensoren gefunden.",
  },
  en: {
    title: "Frieda Postfach",
    ok: "All good",
    problem: "Problem",
    kinds: { push: "Push disconnected", look: "Look failing", ai: "AI not answering", pass_slow: "Pass stuck", throttled: "iCloud throttling", for_you: "“For you” failing" },
    parcels: "Parcels",
    noParcels: "No parcels on their way",
    important: "Important today",
    noImportant: "Nothing important today",
    unread: "{0} unread",
    status: { in_transit: "on its way", out_for_delivery: "arrives today", pickup: "ready for pick-up", delivered: "delivered", problem: "problem" },
    today: "today",
    tomorrow: "tomorrow",
    track: "Track",
    order: "Order",
    open: "Open in Postfach",
    more: "+{0} more",
    missing: "No Frieda Postfach sensors found.",
  },
};
const ICONS = { in_transit: "mdi:package-variant-closed", out_for_delivery: "mdi:truck-delivery-outline", pickup: "mdi:store-marker-outline", delivered: "mdi:package-variant-closed-check", problem: "mdi:package-variant-remove" };
const KEYS = ["parcels", "important_today", "unread_inbox", "problem"];
const SHOWN = 3; // rows per section; the rest is counted

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmt = (s, ...a) => String(s).replace(/\{(\d+)\}/g, (_, i) => a[Number(i)]);

// The entities of one account by their translation key (from the entity registry the frontend has); without
// translation keys, by the attributes only these sensors have.
export function findEntities(hass, deviceId = null) {
  const mine = Object.values(hass.entities || {}).filter((e) => e.platform === "friedafetch_mail");
  const device = deviceId || mine.find((e) => KEYS.includes(e.translation_key))?.device_id || null;
  const out = {};
  for (const e of mine) {
    if (device && e.device_id !== device) continue;
    if (KEYS.includes(e.translation_key) && !out[e.translation_key]) out[e.translation_key] = e.entity_id;
  }
  if (!out.parcels || !out.problem) {
    for (const [id, st] of Object.entries(hass.states || {})) {
      const a = st.attributes || {};
      if (!out.parcels && id.startsWith("sensor.") && Array.isArray(a.parcels) && "out_for_delivery" in a) out.parcels = id;
      if (!out.problem && id.startsWith("binary_sensor.") && Array.isArray(a.problems) && "throttle" in a) out.problem = id;
    }
  }
  const entry = device ? hass.devices?.[device]?.config_entries?.[0] || null : null;
  return { device, entry, ...out };
}

class FriedaMailCard extends HTMLElement {
  static getStubConfig() {
    return {};
  }

  setConfig(config) {
    this._config = { parcels: true, important: true, ...(config || {}) };
    this._sig = null;
    if (this._hass) this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._ids = findEntities(hass, this._config?.device_id);
    // draw again only when one of the account's entities changed (hass is set on every state change in HA)
    const sig = KEYS.map((k) => hass.states[this._ids[k]]).concat(hass.locale?.language);
    if (this._sig && sig.every((x, i) => x === this._sig[i])) return;
    this._sig = sig;
    this._render();
  }

  getCardSize() {
    return 4;
  }

  getGridOptions() {
    return { columns: 6, min_columns: 4, min_rows: 3 };
  }

  get _t() {
    const lang = (this._hass?.locale?.language || this._hass?.language || "en").slice(0, 2);
    return TEXTS[lang] || TEXTS.en;
  }

  _day(iso) {
    if (!iso) return "";
    const d = new Date(`${iso}T12:00:00`);
    const diff = Math.round((new Date(d.toDateString()) - new Date(new Date().toDateString())) / 86400000);
    const t = this._t;
    if (diff === 0) return t.today;
    if (diff === 1) return t.tomorrow;
    return d.toLocaleDateString(this._hass?.locale?.language || undefined, { weekday: "short", day: "numeric", month: "short" });
  }

  _open(mid) {
    const q = new URLSearchParams();
    if (mid) q.set("mail", mid);
    if (mid && this._ids.entry) q.set("account", this._ids.entry);
    window.history.pushState(null, "", `/frieda-postfach${mid ? `?${q}` : ""}`);
    window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } }));
  }

  _render() {
    if (!this._hass || !this._config) return;
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    const t = this._t;
    const st = (key) => this._hass.states[this._ids[key]];
    const parcelsSt = st("parcels");
    const importantSt = st("important_today");
    const unreadSt = st("unread_inbox");
    const problemSt = st("problem");
    if (!parcelsSt && !importantSt && !problemSt) {
      this.shadowRoot.innerHTML = `${STYLE}<ha-card><div class="empty">${esc(t.missing)}</div></ha-card>`;
      return;
    }
    const problems = problemSt?.state === "on" ? problemSt.attributes.problems || [] : [];
    const status = problems.length
      ? `<span class="chip warn" role="status"><ha-icon icon="mdi:alert-circle-outline"></ha-icon>${esc(problems.map((p) => t.kinds[p.kind] || p.kind).join(" · "))}</span>`
      : problemSt
        ? `<span class="chip ok"><ha-icon icon="mdi:check-circle-outline"></ha-icon>${esc(t.ok)}</span>`
        : "";
    const sections = [];
    if (this._config.parcels && parcelsSt) {
      const order = { out_for_delivery: 0, pickup: 1, problem: 2, in_transit: 3, delivered: 4 };
      const list = [...(parcelsSt.attributes.parcels || [])].filter((p) => p.status !== "delivered").sort((a, b) => (order[a.status] ?? 5) - (order[b.status] ?? 5));
      const rows = list.slice(0, SHOWN).map((p) => {
        const when = [p.status === "out_for_delivery" ? "" : this._day(p.eta), p.window || ""].filter(Boolean).join(" ");
        const link = p.url
          ? `<button class="link" data-url="${esc(p.url)}" aria-label="${esc(`${p.shop ? t.order : t.track}: ${p.shop || p.carrier || ""}`)}"><ha-icon icon="mdi:open-in-new"></ha-icon></button>`
          : "";
        return `<li class="${p.status === "out_for_delivery" || p.status === "problem" ? "hot" : ""}"><ha-icon icon="${ICONS[p.status] || ICONS.in_transit}"></ha-icon>
          <span class="tx"><strong>${esc(p.shop || p.carrier || "–")}</strong><small>${esc([t.status[p.status] || p.status, when].filter(Boolean).join(" · "))}</small></span>${link}</li>`;
      });
      sections.push(`<section><h3>${esc(t.parcels)}${list.length ? `<span class="n">${list.length}</span>` : ""}</h3>
        ${rows.length ? `<ul>${rows.join("")}</ul>${list.length > SHOWN ? `<p class="more">${esc(fmt(t.more, list.length - SHOWN))}</p>` : ""}` : `<p class="none">${esc(t.noParcels)}</p>`}</section>`);
    }
    if (this._config.important && importantSt) {
      const mails = importantSt.attributes.mails || [];
      const rows = mails.slice(0, SHOWN).map(
        (m) => `<li><button class="mail" data-mid="${esc(m.message_id || "")}" aria-label="${esc(`${t.open}: ${m.subject || ""}`)}"><ha-icon icon="mdi:email-alert-outline"></ha-icon>
          <span class="tx"><strong>${esc(m.from || "–")}</strong><small>${esc(m.subject || "–")}</small></span></button></li>`
      );
      const total = Number(importantSt.state) || mails.length;
      sections.push(`<section><h3>${esc(t.important)}${total ? `<span class="n">${total}</span>` : ""}</h3>
        ${rows.length ? `<ul>${rows.join("")}</ul>${total > SHOWN ? `<p class="more">${esc(fmt(t.more, total - SHOWN))}</p>` : ""}` : `<p class="none">${esc(t.noImportant)}</p>`}</section>`);
    }
    const unread = unreadSt && !Number.isNaN(Number(unreadSt.state)) ? `<button class="foot" data-mid="">${esc(fmt(t.unread, unreadSt.state))}<ha-icon icon="mdi:chevron-right"></ha-icon></button>` : "";
    this.shadowRoot.innerHTML = `${STYLE}<ha-card>
      <div class="head"><ha-icon icon="mdi:email-fast-outline"></ha-icon><span class="ttl">${esc(this._config.title || t.title)}</span>${status}</div>
      ${sections.join("")}${unread}</ha-card>`;
    this.shadowRoot.querySelectorAll("[data-url]").forEach((b) => b.addEventListener("click", () => window.open(b.dataset.url, "_blank", "noopener,noreferrer")));
    this.shadowRoot.querySelectorAll("[data-mid]").forEach((b) => b.addEventListener("click", () => this._open(b.dataset.mid)));
  }
}

const STYLE = `<style>
  ha-card { display: grid; gap: 14px; padding: 14px 16px 10px; }
  .head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; --mdc-icon-size: 22px; }
  .head > ha-icon { color: var(--primary-color); }
  .ttl { font-size: 16px; font-weight: 600; margin-right: auto; }
  .chip { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px 3px 7px; border-radius: 12px; font-size: 12px; --mdc-icon-size: 15px; }
  .chip.ok { background: color-mix(in srgb, var(--success-color, #43a047) 14%, transparent); }
  .chip.warn { background: color-mix(in srgb, var(--warning-color, #ffa600) 20%, transparent); }
  section h3 { display: flex; align-items: center; gap: 6px; margin: 0 0 6px; font-size: 12px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--secondary-text-color); }
  .n { display: inline-grid; place-items: center; min-width: 18px; height: 18px; padding: 0 5px; box-sizing: border-box; border-radius: 9px; font-size: 11px; background: var(--secondary-background-color, #f0f0f0); color: var(--primary-text-color); letter-spacing: 0; }
  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
  li { display: flex; align-items: center; gap: 10px; min-height: 40px; --mdc-icon-size: 20px; }
  li > ha-icon, .mail > ha-icon { color: var(--secondary-text-color); flex: none; }
  li.hot > ha-icon { color: var(--primary-color); }
  .tx { display: grid; min-width: 0; flex: 1; text-align: left; }
  .tx strong { font-size: 14px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tx small { font-size: 12px; color: var(--secondary-text-color); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  button { font: inherit; color: inherit; background: none; border: 0; cursor: pointer; border-radius: 8px; }
  button:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 1px; }
  .mail { display: flex; align-items: center; gap: 10px; width: 100%; padding: 4px 0; }
  .link { display: inline-grid; place-items: center; width: 36px; height: 36px; color: var(--primary-color); --mdc-icon-size: 18px; }
  .none, .more { margin: 0; font-size: 13px; color: var(--secondary-text-color); }
  .foot { display: flex; align-items: center; justify-content: flex-end; gap: 2px; justify-self: end; padding: 4px 2px 4px 8px; font-size: 13px; color: var(--primary-color); --mdc-icon-size: 18px; }
  .empty { color: var(--secondary-text-color); font-size: 14px; }
</style>`;

if (!customElements.get("friedafetch-mail-card")) customElements.define("friedafetch-mail-card", FriedaMailCard);
window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "friedafetch-mail-card")) {
  window.customCards.push({
    type: "friedafetch-mail-card",
    name: "Frieda Postfach",
    description: "Parcels arriving, important mail of today and whether Frieda Postfach works.",
    preview: true,
    documentationURL: "https://github.com/nadeo360/friedafetch-mail#dashboard-card",
  });
}
