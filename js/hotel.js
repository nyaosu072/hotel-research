// Pure display logic for hotel rows (no DOM): names, price text, badge descriptors.
export const MEMBER_SHORT = {
  "Relais & Châteaux": "R&C",
  "The Leading Hotels of the World": "LHW",
  "Small Luxury Hotels of the World": "SLH",
};

export function names(h, lang) {
  const native = h.country === "KR" ? h.name_ko : h.name_ja;
  if (lang === "en") {
    const main = h.name_en || native || h.name_ja || h.name_ko || "";
    return { main, sub: native && native !== main ? native : "" };
  }
  const main = h.name_ja || h.name_ko || h.name_en || "";
  return { main, sub: h.name_en && h.name_en !== main ? h.name_en : "" };
}

export function formatPrice(min, currency) {
  if (min == null || min === "") return null;
  const sym = currency === "KRW" ? "₩" : "¥";
  return sym + Math.round(Number(min)).toLocaleString("en-US");
}

export function mapsQuery(h) {
  const { main } = names(h, "ja");
  return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(`${main} ${h.address ?? ""}`.trim());
}

const maxBy = (arr, kind) => Math.max(0, ...arr.filter((a) => a.kind === kind).map((a) => Number(a.grade) || 0));

// -> [{ type: 'key'|'star'|'official'|'member'|'brand'|'find', n?, text? }]  (display order)
export function badges(h) {
  const aw = h.awards ?? [];
  const out = [];
  const m = maxBy(aw, "michelin"); if (m) out.push({ type: "key", n: m });
  const f = maxBy(aw, "forbes"); if (f) out.push({ type: "star", n: f });
  const k = maxBy(aw, "kr_official"); if (k) out.push({ type: "official", n: k });
  for (const a of aw) if (a.kind === "membership") out.push({ type: "member", text: MEMBER_SHORT[a.grade] ?? a.grade });
  const brands = new Set(aw.filter((a) => a.kind === "brand").map((a) => a.grade));
  for (const b of brands) out.push({ type: "brand", text: b });
  if (!aw.length) out.push({ type: "find" });
  return out;
}
