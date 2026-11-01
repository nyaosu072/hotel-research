// Pure filter/sort logic (no DOM). HotelView = hotels row + awards[] + media_mentions[] + research.
export const defaultFilters = () => ({
  types: [], grade: "all4", badges: [], priceMin: null, priceMax: null,
  includeUnknownPrice: true, ratingMin: null, statuses: [],
});

export const isFiveStar = (h) =>
  (h.awards ?? []).some((a) =>
    (a.kind === "michelin" && ["2", "3"].includes(String(a.grade))) ||
    (a.kind === "forbes" && String(a.grade) === "5") ||
    (a.kind === "kr_official" && String(a.grade) === "5")
  );

export const statusOf = (h) => (Array.isArray(h.research) ? h.research[0] : h.research)?.status ?? "candidate";

export const badgeKinds = (h) => {
  const k = new Set((h.awards ?? []).map((a) => a.kind));
  if (!k.size) k.add("discovery");
  return k;
};

/** @param {any[]} hotels @param {any} f @returns {any[]} */
export function filterHotels(hotels, f) {
  const priceOn = f.priceMin != null || f.priceMax != null;
  return hotels.filter((h) => {
    if (f.types.length && !f.types.includes(h.type)) return false;
    if (f.grade === "five" && !isFiveStar(h)) return false;
    if (f.badges.length && ![...badgeKinds(h)].some((k) => f.badges.includes(k))) return false;
    if (priceOn) {
      if (h.min_charge == null) return f.includeUnknownPrice && passRest(h, f);
      if (f.priceMin != null && h.min_charge < f.priceMin) return false;
      if (f.priceMax != null && h.min_charge > f.priceMax) return false;
    }
    return passRest(h, f);
  });
}
function passRest(h, f) {
  if (f.ratingMin != null && !(h.review_avg != null && h.review_avg >= f.ratingMin)) return false;
  if (f.statuses.length && !f.statuses.includes(statusOf(h))) return false;
  return true;
}

// lower = better. michelin 3>2>1, forbes 5>4, kr_official 5>4, membership, brand, discovery
const ORDER = ["michelin:3", "michelin:2", "michelin:1", "forbes:5", "forbes:4", "kr_official:5", "kr_official:4", "membership", "brand"];
export function badgeRank(h) {
  let best = ORDER.length;
  for (const a of h.awards ?? []) {
    let i = ORDER.indexOf(`${a.kind}:${a.grade}`);
    if (i < 0) i = ORDER.indexOf(a.kind);
    if (i >= 0) best = Math.min(best, i);
  }
  return best;
}

const desc = (get) => (a, b) => {
  const x = get(a), y = get(b);
  if (x == null && y == null) return 0;
  if (x == null) return 1;
  if (y == null) return -1;
  return y - x;
};
/** @param {any[]} hotels @param {string} key @returns {any[]} */
export function sortHotels(hotels, key) {
  const cmp = key === "rating" ? desc((h) => h.review_avg)
    : key === "price" ? desc((h) => h.min_charge)
    : (a, b) => badgeRank(a) - badgeRank(b);
  return [...hotels].sort(cmp); // stable
}

// persisted per browser (try/catch: storage can be blocked)
export function loadFilters() {
  try {
    const s = JSON.parse(localStorage.getItem("filters") ?? "null");
    if (s && typeof s === "object") return { ...defaultFilters(), ...s };
  } catch { /* ignore */ }
  return defaultFilters();
}
export function saveFilters(f) {
  try { localStorage.setItem("filters", JSON.stringify(f)); } catch { /* ignore */ }
}
