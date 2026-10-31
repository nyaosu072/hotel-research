// deno run -A scripts/enrich-wikidata.ts : homepage/name_en/lat가 빈 호텔을 Wikidata로 채운다 (fillEmpty만, 재실행 안전).
import { load } from "@std/dotenv";
import { createClient } from "@supabase/supabase-js";
import { fillEmpty } from "../supabase/functions/_shared/merge.ts";
import { wikidataLookup } from "../supabase/functions/_shared/wikidata.ts";
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
const stats = (hs: HotelRow[]) => ({
  total: hs.length,
  blankHomepage: hs.filter((h) => blank(h.homepage)).length,
  blankNameEn: hs.filter((h) => blank(h.name_en)).length,
  blankLat: hs.filter((h) => h.lat == null).length,
});

const hotels = await all();
console.log("before", stats(hotels));
const targets = hotels.filter((h) => !h.excluded && (blank(h.homepage) || blank(h.name_en) || h.lat == null));
let filled = 0, ambiguous = 0, none = 0, failed = 0;
const ambList: string[] = [];
const started = Date.now();
for (const [i, h] of targets.entries()) {
  const name = h.name_en || h.name_ja || h.name_ko;
  if (!name) continue;
  try {
    const r = await wikidataLookup(name, h.lat ?? undefined, h.lng ?? undefined);
    if (r === null) none++;
    else if (r === "ambiguous") {
      ambiguous++;
      ambList.push(`${h.country} ${name}`);
      if (!h.needs_review) await db.from("hotels").update({ needs_review: true }).eq("id", h.id);
    } else {
      const patch = fillEmpty(h, r as Partial<HotelRow>);
      if (Object.keys(patch).length) {
        const { error } = await db.from("hotels").update(patch).eq("id", h.id);
        if (error) throw error;
        filled++;
      }
    }
  } catch (e) {
    failed++;
    console.warn(`fail ${name}: ${(e as Error).message}`);
  }
  if ((i + 1) % 25 === 0) console.log(`${i + 1}/${targets.length} filled=${filled} none=${none} ambiguous=${ambiguous} failed=${failed} ${Math.round((Date.now() - started) / 1000)}s`);
  await new Promise((r) => setTimeout(r, 1000)); // Wikidata 예의: 요청 간 >=1초
}
console.log({ targets: targets.length, filled, none, ambiguous, failed });
if (ambList.length) console.log("AMBIGUOUS:\n  " + ambList.join("\n  "));
console.log("after", stats(await all()));
