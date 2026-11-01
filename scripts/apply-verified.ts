// deno run -A scripts/apply-verified.ts [--dry-run] : data/verified-fixes.json -> hotels (manual_fields 존중)
import { load } from "@std/dotenv";
import { createClient } from "@supabase/supabase-js";
import { normalizeName } from "../supabase/functions/_shared/match.ts";
import { regionFromAddress } from "../supabase/functions/_shared/region.ts";

export type Fix = {
  hotel_id: string; name_ja?: string; name_en?: string; name_ko?: string; address?: string;
  homepage?: string; lat?: number; lng?: number; clear_needs_review?: boolean; source_url: string;
};
type Row = Record<string, unknown> & {
  country: "JP" | "KR"; source: string; external_id: string | null; region_code: string | null;
  manual_fields: string[];
};
const COLS = ["name_ja", "name_en", "name_ko", "address", "homepage", "lat", "lng"] as const;

// 순수 로직: 한 호텔에 적용할 patch (바뀌는 컬럼만)
export function plan(h: Row, f: Fix): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const free = (c: string) => !(h.manual_fields ?? []).includes(c);
  for (const c of COLS) {
    const v = f[c];
    if (v === undefined || !free(c) || v === h[c]) continue;
    if (c === "homepage" && !/^https?:\/\//i.test(String(v))) continue;
    patch[c] = v;
  }
  if (patch.address && free("region_code")) {
    const r = regionFromAddress(h.country, String(patch.address));
    // 같은 시도 안의 더 세분된 기존 코드는 유지
    if (r && r !== h.region_code && !h.region_code?.startsWith(r + ":")) patch.region_code = r;
  }
  if (patch.name_ja && h.source === "award" && h.country === "JP" && free("external_id")) {
    patch.external_id = `award:jp:${normalizeName(String(patch.name_ja))}`;
  }
  if (f.clear_needs_review && free("needs_review")) patch.needs_review = false;
  return patch;
}

if (import.meta.main) {
  const dry = Deno.args.includes("--dry-run");
  const env = { ...(await load({ export: false })), ...Deno.env.toObject() };
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const fixes: Fix[] = JSON.parse(Deno.readTextFileSync("data/verified-fixes.json"));
  let n = 0;
  for (const f of fixes) {
    const { data: h, error } = await db.from("hotels").select("*").eq("id", f.hotel_id).maybeSingle();
    if (error) throw error;
    if (!h) { console.log(`MISSING ${f.hotel_id}`); continue; }
    const patch = plan(h as Row, f);
    const keys = Object.keys(patch);
    if (!keys.length) continue;
    console.log(`${h.name_ja ?? h.name_ko ?? h.name_en}`);
    for (const k of keys) console.log(`  ${k}: ${JSON.stringify(h[k])} -> ${JSON.stringify(patch[k])}`);
    n++;
    if (!dry) {
      const { error: e } = await db.from("hotels").update(patch).eq("id", f.hotel_id);
      if (e) throw e;
    }
  }
  console.log(`${dry ? "dry-run: " : ""}${n} hotels changed`);
}
