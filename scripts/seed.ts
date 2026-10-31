// deno run -A scripts/seed.ts [--dry-run]  : data/*.csv -> hotels(source 'award') + awards + media_mentions
import { load } from "@std/dotenv";
import { createClient } from "@supabase/supabase-js";
import { fillEmpty } from "../supabase/functions/_shared/merge.ts";
import { matchHotel, normalizeName } from "../supabase/functions/_shared/match.ts";
import { regionFromAddress } from "../supabase/functions/_shared/region.ts";
import type { HotelRow } from "../supabase/functions/_shared/types.ts";

const dry = Deno.args.includes("--dry-run");
const env = { ...(await load({ export: false })), ...Deno.env.toObject() };
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

function parse(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n") { row.push(f.replace(/\r$/, "")); rows.push(row); row = []; f = ""; }
    else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  const [head, ...body] = rows;
  return body.filter((r) => r.length === head.length).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i].trim()])));
}
const csv = (f: string) => parse(Deno.readTextFileSync(`data/${f}`));
const nn = (s: string) => (s === "" ? null : s);

type Group = {
  key: string; country: "JP" | "KR"; ext: string; fields: Partial<HotelRow>;
  awards: Map<string, { kind: string; grade: string | null; year: number | null }>;
  hotel: HotelRow | null; // 기존 행(매칭 또는 이전 시드)
  mode: "new" | "matched" | "ambiguous" | "existing-award";
};

// 1) CSV -> 호텔 그룹
const groups = new Map<string, Group>();
for (const r of csv("awards_jp.csv").concat(csv("awards_kr.csv"))) {
  const country = r.country as "JP" | "KR";
  const primary = country === "KR" ? r.name_ko : r.name_ja || r.name_en;
  const key = `${country}:${normalizeName(primary)}`;
  let g = groups.get(key);
  if (!g) {
    g = {
      key, country, ext: `award:${country.toLowerCase()}:${normalizeName(primary)}`,
      fields: {
        country, source: "award", name_ja: nn(r.name_ja), name_en: nn(r.name_en), name_ko: nn(r.name_ko),
        type: (nn(r.type) as HotelRow["type"]), homepage: nn(r.homepage), address: nn(r.address),
        region_code: r.address ? regionFromAddress(country, r.address) : null,
        currency: country === "JP" ? "JPY" : "KRW", lat: null, lng: null,
      },
      awards: new Map(), hotel: null, mode: "new",
    };
    groups.set(key, g);
  }
  const a = { kind: r.award, grade: nn(r.grade), year: r.year ? Number(r.year) : null };
  g.awards.set(`${a.kind}|${a.grade}|${a.year}`, a);
}

// 2) 기존 호텔 로드 + 매칭
async function allHotels(): Promise<HotelRow[]> {
  const out: HotelRow[] = [];
  for (let from = 0;; from += 1000) {
    const { data, error } = await db.from("hotels").select("*").range(from, from + 999);
    if (error) throw error;
    out.push(...(data as HotelRow[]));
    if (data.length < 1000) return out;
  }
}
const existing = await allHotels();
const byExt = new Map(existing.filter((h) => h.source === "award").map((h) => [h.external_id, h]));
// 이전 시드(award) 행은 후보에서 제외해 재실행해도 결과가 같다.
const cands = { JP: existing.filter((h) => h.country === "JP" && h.source !== "award"), KR: existing.filter((h) => h.country === "KR" && h.source !== "award") };
const ambiguousList: string[] = [];
for (const g of groups.values()) {
  const prior = byExt.get(g.ext);
  if (prior) { g.hotel = prior; g.mode = "existing-award"; continue; }
  const m = matchHotel(g.fields, cands[g.country]);
  if (m.match) { g.hotel = m.match; g.mode = "matched"; }
  else if (m.ambiguous) { g.mode = "ambiguous"; ambiguousList.push(`${g.key} (${g.fields.name_en ?? g.fields.name_ja ?? g.fields.name_ko})`); }
}

// 3) media 매칭 (시드 대상 호텔 이름 기준)
const pseudo = [...groups.values()].map((g) => ({ ...(g.hotel ?? {}), ...g.fields, id: g.key, name_ja: g.fields.name_ja ?? g.hotel?.name_ja, name_en: g.fields.name_en ?? g.hotel?.name_en } as HotelRow));
const media: { key: string; outlet: string; list_name: string; year: number | null }[] = [];
const unmatched: string[] = [];
for (const r of csv("media_mentions.csv")) {
  const m = matchHotel({ name_en: r.name_en, name_ja: r.name_ja }, pseudo.filter((h) => h.country === r.country));
  if (m.match) media.push({ key: m.match.id, outlet: r.outlet, list_name: r.list_name, year: r.year ? Number(r.year) : null });
  else unmatched.push(`${r.country} ${r.name_en} / ${r.name_ja}${m.ambiguous ? " (ambiguous)" : ""}`);
}

const count = (m: Group["mode"]) => [...groups.values()].filter((g) => g.mode === m).length;
console.log({
  groups: groups.size, new: count("new"), matchedExisting: count("matched"), ambiguous: count("ambiguous"), existingAward: count("existing-award"),
  awardsRows: [...groups.values()].reduce((n, g) => n + g.awards.size, 0), mediaMatched: media.length, mediaUnmatched: unmatched.length,
  noRegion: [...groups.values()].filter((g) => !g.fields.region_code).length,
});
const noRegion = [...groups.values()].filter((g) => !g.fields.region_code).map((g) => `${g.key} | ${g.fields.address}`);
if (noRegion.length) console.log("NO REGION:\n  " + noRegion.join("\n  "));
if (ambiguousList.length) console.log("AMBIGUOUS (needs_review):\n  " + ambiguousList.join("\n  "));
if (unmatched.length) console.log("UNMATCHED MEDIA (skipped):\n  " + unmatched.join("\n  "));
if (dry) { console.log("dry-run: nothing written"); Deno.exit(0); }

// 4) 쓰기
const ids = new Map<string, string>(); // group key -> hotel id
const toInsert: Group[] = [];
for (const g of groups.values()) {
  if (g.hotel) {
    ids.set(g.key, g.hotel.id);
    const patch = fillEmpty(g.hotel, g.fields);
    delete patch.country; delete patch.source; // 항상 같거나 의미 없음
    if (Object.keys(patch).length) {
      const { error } = await db.from("hotels").update(patch).eq("id", g.hotel.id);
      if (error) throw error;
    }
  } else toInsert.push(g);
}
for (let i = 0; i < toInsert.length; i += 100) {
  const chunk = toInsert.slice(i, i + 100);
  const { data, error } = await db.from("hotels").insert(
    chunk.map((g) => ({ ...g.fields, external_id: g.ext, needs_review: g.mode === "ambiguous" })),
  ).select("id,external_id");
  if (error) throw error;
  for (const h of data!) ids.set(chunk.find((g) => g.ext === h.external_id)!.key, h.id);
}
const hotelIds = [...new Set(ids.values())];
for (let i = 0; i < hotelIds.length; i += 100) {
  const part = hotelIds.slice(i, i + 100);
  for (const t of ["awards", "media_mentions"]) {
    const { error } = await db.from(t).delete().in("hotel_id", part);
    if (error) throw error;
  }
}
const awardRows = [...groups.values()].flatMap((g) => [...g.awards.values()].map((a) => ({ hotel_id: ids.get(g.key), ...a })));
const mediaRows = media.map(({ key, ...m }) => ({ hotel_id: ids.get(key), ...m }));
for (const [t, rows] of [["awards", awardRows], ["media_mentions", mediaRows]] as const) {
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await db.from(t).insert(rows.slice(i, i + 200));
    if (error) throw error;
  }
}
console.log(`written: hotels inserted ${toInsert.length}, awards ${awardRows.length}, media ${mediaRows.length}`);
