// deno run -A scripts/fill-images-api.ts [--dry-run]
// 아직 사진이 빈 호텔을 공식 API 키워드 검색으로 채운다: JP → 라쿠텐 KeywordHotelSearch(hotelImageUrl),
// KR → TourAPI KorService2 searchKeyword2(firstimage). 이름이 확실히 같은 결과 1건일 때만 넣는다.
import { load } from "@std/dotenv";
import { createClient } from "@supabase/supabase-js";
import { normalizeName } from "../supabase/functions/_shared/match.ts";

export type Cand = { name: string; img: string };

/** 정규화 이름이 정확히 같은 후보 1건, 없으면 서로 포함 관계인 후보가 정확히 1건일 때만 그 사진. */
export function pickByName(names: (string | null | undefined)[], cands: Cand[]): string | null {
  const keys = names.filter(Boolean).map((n) => normalizeName(n!)).filter((k) => k.length >= 2);
  const ok = cands.filter((c) => /^https?:\/\//.test(c.img));
  const exact = ok.filter((c) => keys.includes(normalizeName(c.name)));
  if (exact.length) return new Set(exact.map((c) => c.img)).size === 1 ? exact[0].img : null;
  const part = ok.filter((c) => {
    const n = normalizeName(c.name);
    return n.length >= 2 && keys.some((k) => n.includes(k) || k.includes(n));
  });
  return part.length === 1 ? part[0].img : null;
}

if (import.meta.main) {
  const env = await load({ envPath: ".env" });
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const dry = Deno.args.includes("--dry-run");
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  async function rakuten(keyword: string): Promise<Cand[]> {
    const u = new URL("https://openapi.rakuten.co.jp/engine/api/Travel/KeywordHotelSearch/20170426");
    u.search = new URLSearchParams({ applicationId: env.RAKUTEN_APP_ID, accessKey: env.RAKUTEN_ACCESS_KEY, format: "json", keyword, hits: "10" }).toString();
    const res = await fetch(u, { headers: { Origin: "https://nyaosu072.github.io" }, signal: AbortSignal.timeout(15_000) });
    if (res.status === 404) return []; // 결과 없음
    if (!res.ok) throw new Error(`rakuten ${res.status}`);
    const j = await res.json();
    // deno-lint-ignore no-explicit-any
    return (j.hotels ?? []).map((h: any) => h.hotel?.[0]?.hotelBasicInfo).filter(Boolean)
      // deno-lint-ignore no-explicit-any
      .map((b: any) => ({ name: String(b.hotelName ?? ""), img: String(b.hotelImageUrl ?? "") }));
  }

  async function tourapi(keyword: string): Promise<Cand[]> {
    const q = new URLSearchParams({ _type: "json", MobileOS: "ETC", MobileApp: "HotelResearch", keyword, contentTypeId: "32", numOfRows: "10", pageNo: "1" });
    const url = `https://apis.data.go.kr/B551011/KorService2/searchKeyword2?serviceKey=${encodeURIComponent(env.TOURAPI_KEY)}&${q}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`tourapi ${res.status}`);
    const j = await res.json();
    if (j?.response?.header?.resultCode !== "0000") throw new Error(`tourapi ${j?.response?.header?.resultCode}`);
    const items = j.response.body?.items?.item ?? [];
    // deno-lint-ignore no-explicit-any
    return (Array.isArray(items) ? items : [items]).map((i: any) => ({ name: String(i.title ?? ""), img: String(i.firstimage ?? "") }));
  }

  const { data, error } = await db.from("hotels").select("id,country,name_ja,name_en,name_ko,image_url,manual_fields").is("image_url", null).range(0, 1999);
  if (error) throw error;
  const targets = data!.filter((h) => !(h.manual_fields ?? []).includes("image_url"));
  console.log(`targets: ${targets.length}`);
  let filled = 0, none = 0, failed = 0;
  for (const h of targets) {
    const names = [h.name_ja, h.name_en, h.name_ko];
    try {
      const keyword = (h.country === "KR" ? h.name_ko : h.name_ja ?? h.name_en) ?? "";
      if (keyword.trim().length < 2) { none++; continue; }
      const cands = h.country === "KR" ? await tourapi(keyword) : await rakuten(keyword);
      const img = pickByName(names, cands);
      if (!img) { none++; } else {
        filled++;
        if (dry) console.log(`  ${keyword} -> ${img}`);
        else {
          const { error } = await db.from("hotels").update({ image_url: img }).eq("id", h.id).is("image_url", null);
          if (error) throw error;
        }
      }
    } catch (e) {
      failed++;
      console.log(`  fail ${h.name_ja ?? h.name_ko ?? h.name_en}: ${(e as Error).message}`);
    }
    await sleep(1100); // 라쿠텐 1 req/s, TourAPI도 같은 간격
  }
  console.log({ filled, noMatch: none, failed, dryRun: dry });
}
