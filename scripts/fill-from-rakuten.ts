// deno run -A scripts/fill-from-rakuten.ts [--dry-run]
// 일본 호텔 중 주소가 시/정 단위로 짧은 곳을 라쿠텐 키워드 검색으로 찾아, 이름이 확실히 맞으면
// 전체 주소로 바꾸고 비어 있는 가격·좌표·라쿠텐 링크·전화·평점도 채운다. manual_fields 칸은 건드리지 않음.
import { load } from "@std/dotenv";
import { createClient } from "@supabase/supabase-js";
import { pickCandidate } from "./fill-images-api.ts";

const env = await load({ envPath: ".env" });
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const dry = Deno.args.includes("--dry-run");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isShort = (a: string | null) => !a || !/[0-9０-９]/.test(a); // 번지 숫자가 없으면 시 단위로 봄

type R = { name: string; hotelNo: number; address: string; lat: number | null; lng: number | null; min: number | null; url: string; tel: string; avg: number | null; cnt: number | null };

async function search(keyword: string): Promise<R[]> {
  const u = new URL("https://openapi.rakuten.co.jp/engine/api/Travel/KeywordHotelSearch/20170426");
  u.search = new URLSearchParams({ applicationId: env.RAKUTEN_APP_ID, accessKey: env.RAKUTEN_ACCESS_KEY, format: "json", keyword, hits: "10", datumType: "1" }).toString();
  const res = await fetch(u, { headers: { Origin: "https://nyaosu072.github.io" }, signal: AbortSignal.timeout(15_000) });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`rakuten ${res.status}`);
  const j = await res.json();
  // deno-lint-ignore no-explicit-any
  return (j.hotels ?? []).map((h: any) => h.hotel?.[0]?.hotelBasicInfo).filter(Boolean).map((b: any) => ({
    name: String(b.hotelName ?? ""), hotelNo: Number(b.hotelNo),
    address: `${b.address1 ?? ""}${b.address2 ?? ""}`.trim(),
    lat: Number.isFinite(Number(b.latitude)) && Number(b.latitude) ? Number(b.latitude) : null,
    lng: Number.isFinite(Number(b.longitude)) && Number(b.longitude) ? Number(b.longitude) : null,
    min: Number(b.hotelMinCharge) || null, url: String(b.hotelInformationUrl ?? ""), tel: String(b.telephoneNo ?? ""),
    avg: b.reviewAverage != null ? Number(b.reviewAverage) : null, cnt: b.reviewCount != null ? Number(b.reviewCount) : null,
  }));
}

const { data, error } = await db.from("hotels")
  .select("id,name_ja,name_en,address,lat,min_charge,rakuten_url,main_phone,review_avg,manual_fields").eq("country", "JP").range(0, 1999);
if (error) throw error;
const targets = data!.filter((h) => isShort(h.address));
console.log(`targets: ${targets.length}`);
let filled = 0, none = 0, failed = 0;
for (const h of targets) {
  const locked = new Set<string>(h.manual_fields ?? []);
  const pref = (h.address ?? "").match(/^(.+?[都道府県])/)?.[1];
  try {
    let hit: R | null = null;
    for (const kw of [h.name_ja, h.name_en].filter(Boolean) as string[]) {
      const rs = (await search(kw)).filter((r) => r.address && (!pref || r.address.startsWith(pref))); // 같은 현만
      await sleep(1100);
      hit = pickCandidate([h.name_ja, h.name_en], rs, (r) => String(r.hotelNo));
      if (hit) break;
    }
    if (!hit) { none++; continue; }
    const patch: Record<string, unknown> = {};
    if (!locked.has("address")) patch.address = hit.address;
    if (h.min_charge == null && hit.min && !locked.has("min_charge")) Object.assign(patch, { min_charge: hit.min, currency: "JPY", price_source: "rakuten" });
    if (!h.rakuten_url && hit.url) patch.rakuten_url = hit.url;
    if (!h.main_phone && hit.tel && !locked.has("main_phone")) patch.main_phone = hit.tel;
    if (h.review_avg == null && hit.avg != null) Object.assign(patch, { review_avg: hit.avg, review_count: hit.cnt });
    filled++;
    if (dry) { console.log(`  ${h.name_ja} -> ${hit.address}${patch.min_charge ? ` ¥${hit.min}` : ""}`); continue; }
    if (Object.keys(patch).length) {
      const { error } = await db.from("hotels").update(patch).eq("id", h.id);
      if (error) throw error;
    }
    if (h.lat == null && hit.lat != null && hit.lng != null && !locked.has("lat")) {
      const { error } = await db.from("hotels").update({ lat: hit.lat, lng: hit.lng }).eq("id", h.id).is("lat", null);
      if (error) throw error;
    }
  } catch (e) {
    failed++;
    console.log(`  fail ${h.name_ja}: ${(e as Error).message}`);
    await sleep(3000);
  }
}
console.log({ filled, notFound: none, failed, dryRun: dry });
