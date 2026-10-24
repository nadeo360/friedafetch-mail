// The dashboard card in the preview (?card=1): the example data as Home Assistant states, entities and a device.
// ?problem=1 turns the problem sensor on.

export async function show({ data, rows, q }) {
  const { findEntities } = await import(`./postfach/card.js?v=__BUILD__`);
  if (!customElements.get("ha-card")) {
    customElements.define(
      "ha-card",
      class extends HTMLElement {
        connectedCallback() {
          // like Home Assistant's: a block of its own, the card's styles lay out the inside
          Object.assign(this.style, { background: "var(--card-background-color)", color: "var(--primary-text-color)", borderRadius: "12px", border: "1px solid var(--divider-color)" });
        }
      }
    );
  }
  const fy = data["friedafetch_mail/insights"];
  const important = rows.filter((r) => r.kind === "ai" && (r.ai?.importance || 0) >= 4);
  const problem = q.get("problem")
    ? [{ kind: "push", since: new Date(Date.now() - 3600e3).toISOString(), detail: "connection lost" }, { kind: "throttled", since: new Date().toISOString(), detail: "NO [THROTTLED]" }]
    : [];
  const states = {
    "sensor.frieda_postfach_privat_pakete_unterwegs": { state: String(fy.parcels.filter((p) => p.status !== "delivered").length), attributes: { out_for_delivery: 1, parcels: fy.parcels.map(({ carrier, number, shop, status, eta, window, url }) => ({ carrier, number, shop, status, eta, window, url })) } },
    "sensor.frieda_postfach_privat_wichtige_mails_heute": { state: String(important.length), attributes: { threshold: 4, mails: important.slice(0, 5).map((r) => ({ time: r.time, from: r.name, subject: r.subject, category: r.ai.category, importance: r.ai.importance, reason: r.reason || "", message_id: r.message_id })) } },
    "sensor.frieda_postfach_privat_ungelesen_im_posteingang": { state: String(rows.filter((r) => r.state?.seen === false).length), attributes: {} },
    "binary_sensor.frieda_postfach_privat_problem": { state: problem.length ? "on" : "off", attributes: { problems: problem, throttle: { active: false } } },
  };
  const keys = ["parcels", "important_today", "unread_inbox", "problem"];
  const entities = Object.fromEntries(Object.keys(states).map((id, i) => [id, { entity_id: id, platform: "friedafetch_mail", translation_key: keys[i], device_id: "d1" }]));
  const hass = { language: "de", locale: { language: "de" }, states, entities, devices: { d1: { id: "d1", config_entries: ["e1"] } } };
  window.__cardHass = hass;
  window.__findEntities = findEntities;
  const wrap = document.createElement("div");
  wrap.style.cssText = "max-width: 420px; margin: 24px auto; padding: 0 16px;";
  const card = document.createElement("friedafetch-mail-card");
  card.setConfig({});
  card.hass = hass;
  wrap.append(card);
  document.body.prepend(wrap);
  return card;
}
