// Nominatim geocoding. Usage policy: >= 1 s between calls; the browser sends our page as Referer.
let last = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function lookup(q) {
  const wait = last + 1100 - Date.now();
  if (wait > 0) await sleep(wait);
  last = Date.now();
  try {
    const u = new URL("https://nominatim.openstreetmap.org/search");
    u.search = new URLSearchParams({ format: "jsonv2", limit: "1", q }).toString();
    const res = await fetch(u, { referrerPolicy: "origin" });
    if (!res.ok) return null;
    const [hit] = await res.json();
    if (!hit) return null;
    const lat = Number(hit.lat), lng = Number(hit.lon);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  } catch {
    return null;
  }
}

// Nominatim often misses full Japanese addresses ("...県...郡...町強羅1300"); retry with the prefecture/county
// prefix and the trailing house number removed. Each retry still waits >= 1 s.
export function addressVariants(address) {
  const a = (address ?? "").normalize("NFKC").trim();
  if (!a) return [];
  const noPref = a.replace(/^.{1,4}?[都道府県]/, "").replace(/^.+?郡/, "");
  const noNum = noPref.replace(/[\d\-丁目番地号の]+$/, "");
  return [...new Set([a, noPref, noNum].filter((s) => s.length >= 2))];
}

export async function geocode(address) {
  for (const q of addressVariants(address)) {
    const hit = await lookup(q);
    if (hit) return hit;
  }
  return null;
}
