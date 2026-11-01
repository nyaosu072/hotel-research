// One-off: merge JP rakuten rows into their award/manual twins (dry-run by default).
//   deno run -A scripts/merge-duplicates.ts [--apply]
// Keeps the award/manual row (awards, homepage stay), moves research/contacts/notes onto it, copies Rakuten data into blank columns,
// turns it into the rakuten row (source + external_id), then deletes the rakuten twin.
import { load } from "@std/dotenv";
import { createClient } from "@supabase/supabase-js";
import { matchHotel } from "../supabase/functions/_shared/match.ts";
import { fillEmpty } from "../supabase/functions/_shared/merge.ts";
import type { HotelRow } from "../supabase/functions/_shared/types.ts";

const apply = Deno.args.includes("--apply");
const env = { ...(await load({ export: false })), ...Deno.env.toObject() };
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const ok = <T>(r: { data: T; error: { message: string } | null }): T => {
  if (r.error) throw new Error(r.error.message);
  return r.data;
};

const jp: HotelRow[] = [];
for (let from = 0;; from += 1000) {
  const d = ok(await db.from("hotels").select("*").eq("country", "JP").range(from, from + 999)) as HotelRow[];
  jp.push(...d);
  if (d.length < 1000) break;
}
const awards = jp.filter((h) => h.source === "award" || h.source === "manual");
const rakutens = jp.filter((h) => h.source === "rakuten");

// region_code same, or one is a parent of the other
const related = (a: string | null, b: string | null) =>
  !!a && !!b && (a === b || a.startsWith(b + ":") || b.startsWith(a + ":"));

const pairs: { a: HotelRow; r: HotelRow }[] = [];
const claimed = new Map<string, HotelRow[]>(); // award id -> rakuten rows matching it
for (const r of rakutens) {
  const { match, ambiguous } = matchHotel(r, awards.filter((a) => related(a.region_code, r.region_code)));
  if (match && !ambiguous) claimed.set(match.id, [...(claimed.get(match.id) ?? []), r]);
}
const conflicts: string[] = [];
for (const [id, rs] of claimed) {
  const a = awards.find((x) => x.id === id)!;
  if (rs.length === 1) pairs.push({ a, r: rs[0] });
  else conflicts.push(`${a.name_ja ?? a.name_en} <- ${rs.length} rakuten rows`);
}

const nm = (h: HotelRow) => h.name_ja ?? h.name_en ?? h.name_ko;
console.log(`JP hotels ${jp.length}: award/manual ${awards.length}, rakuten ${rakutens.length}`);
console.log(`pairs ${pairs.length}, conflicts skipped ${conflicts.length}`);
for (const { a, r } of pairs) console.log(`  [${a.source}] ${nm(a)} @${a.region_code}  <->  [rakuten ${r.external_id}] ${nm(r)} @${r.region_code}`);
for (const c of conflicts) console.log(`  CONFLICT ${c}`);
if (!apply) { console.log("dry-run: nothing written (use --apply)"); Deno.exit(0); }

const RANK: Record<string, number> = { candidate: 0, excluded: 1, contacted: 2, confirmed: 3, done: 4 };
const COPY = ["lat", "lng", "image_url", "address", "type", "main_phone", "min_charge", "currency", "price_source", "review_avg", "review_count", "rakuten_url"] as const;
let merged = 0, failed = 0, movedResearch = 0, movedContacts = 0, movedNotes = 0;
for (const { a, r } of pairs) {
  try {
    const [ra, rr] = await Promise.all(
      [a.id, r.id].map(async (id) => ok(await db.from("research").select("*").eq("hotel_id", id).maybeSingle())),
    );
    if (rr) {
      if (ra && RANK[rr.status] <= RANK[ra.status]) ok(await db.from("research").delete().eq("hotel_id", r.id)); // 전진한 쪽(동률이면 award 행) 유지
      else {
        if (ra) ok(await db.from("research").delete().eq("hotel_id", a.id));
        ok(await db.from("research").update({ hotel_id: a.id }).eq("hotel_id", r.id)); // 홈페이지 규칙 위반 시 여기서 throw
        movedResearch++;
      }
    }
    for (const t of ["contacts", "notes", "awards", "media_mentions"] as const) {
      const rows = ok(await db.from(t).update({ hotel_id: a.id }).eq("hotel_id", r.id).select("id")) as unknown[];
      if (t === "contacts") movedContacts += rows.length;
      if (t === "notes") movedNotes += rows.length;
    }
    const src = r as unknown as Record<string, unknown>;
    const patch: Record<string, unknown> = fillEmpty(a, Object.fromEntries(COPY.map((k) => [k, src[k]]).filter(([, v]) => v != null)));
    if (r.region_code && r.region_code.startsWith((a.region_code ?? "") + ":") && !a.manual_fields?.includes("region_code")) {
      patch.region_code = r.region_code;
    }
    const ext = r.external_id;
    ok(await db.from("hotels").delete().eq("id", r.id)); // unique(source, external_id) 확보
    ok(await db.from("hotels").update({ ...patch, source: "rakuten", external_id: ext }).eq("id", a.id));
    merged++;
  } catch (e) {
    failed++;
    console.error(`FAILED ${nm(a)}: ${(e as Error).message}`);
  }
}
console.log(`merged ${merged}, failed ${failed}, research moved ${movedResearch}, contacts moved ${movedContacts}, notes moved ${movedNotes}`);
