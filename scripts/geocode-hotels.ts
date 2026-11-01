// deno run -A scripts/geocode-hotels.ts [--dry-run]
// 좌표가 빈 호텔을 OSM Nominatim에서 "호텔 이름 + 시/정" 으로 찾아, 이름이 확실히 맞는 시설일 때만 lat/lng를 넣는다.
// 주소만으로 찾은 마을 중심점은 넣지 않는다(핀이 엉뚱한 곳에 찍히므로). 1초 1건, Nominatim 이용 규칙 준수.
import { load } from "@std/dotenv";
import { createClient } from "@supabase/supabase-js";
import { normalizeName } from "../supabase/functions/_shared/match.ts";
import { inCountry } from "../supabase/functions/_shared/wikidata.ts";

export type Place = { name: string; lat: number; lng: number; cls: string };
const OK_CLASS = new Set(["tourism", "building", "amenity", "leisure"]);

/** 이름이 정확히 같은 시설 1곳(같은 좌표 여러 건은 1곳), 없으면 포함 관계 시설이 정확히 1곳일 때만. 국가 범위 밖은 버림. */
export function chooseGeocode(names: (string | null | undefined)[], country: "JP" | "KR", places: Place[]): { lat: number; lng: number } | null {
  const keys = names.filter(Boolean).map((n) => normalizeName(n!)).filter((k) => k.length >= 2);
  const ok = places.filter((p) => OK_CLASS.has(p.cls) && inCountry(country, p.lat, p.lng) && normalizeName(p.name).length >= 2);
  const one = (xs: Place[]) => {
    const uniq = new Map(xs.map((p) => [`${p.lat.toFixed(4)},${p.lng.toFixed(4)}`, p]));
    return uniq.size === 1 ? { lat: xs[0].lat, lng: xs[0].lng } : null;
  };
  const exact = ok.filter((p) => keys.includes(normalizeName(p.name)));
  if (exact.length) return one(exact);
  const part = ok.filter((p) => { const n = normalizeName(p.name); return keys.some((k) => n.includes(k) || k.includes(n)); });
  return part.length ? one(part) : null;
}

if (import.meta.main) {
  const env = await load({ envPath: ".env" });
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const dry = Deno.args.includes("--dry-run");
  const UA = "HotelResearch/0.1 (internal research tool; https://github.com/nyaosu072/hotel-research)";
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  // 주소에서 도도부현+시정촌 / 시도+시군구 정도만 남김 (검색 범위를 좁히는 용도)
  const area = (addr: string | null) => (addr ?? "").split(/\s+/).slice(0, 2).join(" ").slice(0, 30);

  async function search(q: string, country: string): Promise<Place[]> {
    const u = new URL("https://nominatim.openstreetmap.org/search");
    u.search = new URLSearchParams({ q, format: "jsonv2", limit: "5", countrycodes: country.toLowerCase(), "accept-language": country === "JP" ? "ja" : "ko" }).toString();
    const res = await fetch(u, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`nominatim ${res.status}`);
    // deno-lint-ignore no-explicit-any
    return (await res.json()).map((r: any) => ({ name: String(r.name ?? ""), lat: Number(r.lat), lng: Number(r.lon), cls: String(r.category ?? r.class ?? "") }));
  }

  const { data, error } = await db.from("hotels").select("id,country,name_ja,name_en,name_ko,address,lat,manual_fields").is("lat", null).range(0, 1999);
  if (error) throw error;
  const targets = data!.filter((h) => !(h.manual_fields ?? []).some((f: string) => f === "lat" || f === "lng"));
  console.log(`targets: ${targets.length}`);
  let filled = 0, none = 0, failed = 0;
  for (const h of targets) {
    const names = [h.name_ja, h.name_en, h.name_ko];
    const primary = (h.country === "KR" ? h.name_ko : h.name_ja) ?? h.name_en;
    try {
      let hit = null;
      // 1) 이름 + 지역  2) 이름만  3) 영문명
      for (const q of [`${primary} ${area(h.address)}`, primary, h.name_en].filter((x, i, a) => x && a.indexOf(x) === i) as string[]) {
        const places = await search(q, h.country);
        await sleep(1100);
        hit = chooseGeocode(names, h.country, places);
        if (hit) break;
      }
      if (!hit) { none++; continue; }
      filled++;
      if (dry) { console.log(`  ${primary} -> ${hit.lat},${hit.lng}`); continue; }
      const { error } = await db.from("hotels").update({ lat: hit.lat, lng: hit.lng }).eq("id", h.id).is("lat", null);
      if (error) throw error;
    } catch (e) {
      failed++;
      console.log(`  fail ${primary}: ${(e as Error).message}`);
      await sleep(5000);
    }
  }
  console.log({ filled, notFound: none, failed, dryRun: dry });
}
