// deno run -A scripts/enrich-wikidata.ts [--refresh]
// Wikidata 호텔 항목을 국가별로 한 번에 내려받아(data/wikidata_{JP,KR}.json 캐시) 로컬에서 매칭하고,
// homepage/name_en/lat가 빈 호텔을 fillEmpty로만 채운다 (재실행 안전).
import { load } from "@std/dotenv";
import { createClient } from "@supabase/supabase-js";
import { decideWikidata, downloadCountry, inCountry, type WikiItem } from "../supabase/functions/_shared/wikidata.ts";
import type { HotelRow } from "../supabase/functions/_shared/types.ts";

const env = { ...(await load({ export: false })), ...Deno.env.toObject() };
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const blank = (v: unknown) => v == null || v === "";

async function all(): Promise<HotelRow[]> {
  const out: HotelRow[] = [];
  for (let from = 0;; from += 1000) {
    const { data, error } = await db.from("hotels").select("*").range(from, from + 999);
    if (error) throw error;
    out.push(...(data as HotelRow[]));
    if (data.length < 1000) return out;
  }
}
const stats = (hs: HotelRow[]) => {
  const f = (xs: HotelRow[]) => ({
    total: xs.length,
    blankHomepage: xs.filter((h) => blank(h.homepage)).length,
    blankNameEn: xs.filter((h) => blank(h.name_en)).length,
    blankLat: xs.filter((h) => h.lat == null).length,
  });
  return { all: f(hs), award: f(hs.filter((h) => h.source === "award")), needsReview: hs.filter((h) => h.needs_review).length };
};

// 캐시 로드 (--refresh 또는 파일 없음 -> 다운로드)
const refresh = Deno.args.includes("--refresh");
const wiki: Record<string, WikiItem[]> = {};
for (const c of ["JP", "KR"] as const) {
  const path = `data/wikidata_${c}.json`;
  let items: WikiItem[] | null = null;
  if (!refresh) try { items = JSON.parse(Deno.readTextFileSync(path)); } catch { /* 없음 */ }
  if (!items) {
    items = await downloadCountry(c);
    Deno.writeTextFileSync(path, JSON.stringify(items, null, 0) + "\n");
  }
  wiki[c] = items;
  console.log(`wikidata ${c}: ${items.length} items`);
}

let hotels = await all();
console.log("before", stats(hotels));

// 이전 실행에서 잘못 들어간 국가 밖 좌표 정리 (award 호텔, 수동 수정 열 제외)
let cleared = 0;
for (const h of hotels) {
  if (h.source !== "award" || h.lat == null || h.lng == null || inCountry(h.country, h.lat, h.lng)) continue;
  if (h.manual_fields?.includes("lat") || h.manual_fields?.includes("lng")) continue;
  const { error } = await db.from("hotels").update({ lat: null, lng: null }).eq("id", h.id);
  if (error) throw error;
  cleared++;
}
console.log(`out-of-country coords cleared: ${cleared}`);
if (cleared) hotels = await all();

const targets = hotels.filter((h) => !h.excluded && (blank(h.homepage) || blank(h.name_en) || h.lat == null));
let filled = 0, none = 0, ambiguous = 0, flagged = 0;
const ambList: string[] = [];
for (const h of targets) {
  const d = decideWikidata(h, wiki[h.country]);
  if (d.kind === "none") none++;
  else if (d.kind === "ambiguous") {
    ambiguous++;
    ambList.push(`${h.country} ${h.name_en ?? h.name_ja ?? h.name_ko}`);
    if (!h.needs_review) {
      const { error } = await db.from("hotels").update({ needs_review: true }).eq("id", h.id);
      if (error) throw error;
      flagged++;
    }
  } else if (Object.keys(d.patch).length) {
    const { error } = await db.from("hotels").update(d.patch).eq("id", h.id);
    if (error) throw error;
    filled++;
  }
}
console.log({ targets: targets.length, filled, none, ambiguous, newlyFlaggedNeedsReview: flagged });
if (ambList.length) console.log("AMBIGUOUS:\n  " + ambList.join("\n  "));
console.log("after", stats(await all()));
