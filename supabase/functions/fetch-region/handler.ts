// deno-lint-ignore-file no-explicit-any
import { isCandidate } from "../_shared/judge.ts";
import { type Db, release, tryAcquire } from "../_shared/lock.ts";
import { matchHotel } from "../_shared/match.ts";
import { fillEmpty, mergeHotel } from "../_shared/merge.ts";
import { parseTourHomepage, rakutenToRow, tourapiToRow } from "../_shared/mappers.ts";
import { fetchRakutenRegion, type UpstreamEnv } from "../_shared/rakuten.ts";
import { fetchTourapiRegion, fetchTourHomepage } from "../_shared/tourapi.ts";
import type { HotelRow } from "../_shared/types.ts";

export interface Deps {
  db: Db;
  fetchFn: typeof fetch;
  env: UpstreamEnv;
  sleep: (ms: number) => Promise<void>;
  now: () => Date;
  minChargeJpy?: number; // 테스트용 override. 없으면 settings에서 읽는다
}
export interface Result {
  status: number;
  body: Record<string, unknown>;
}

const DAY_MS = 24 * 3600_000;
const LOCK_TTL_SEC = 300;
const MAX_DETAIL_CALLS = 20;

const JP = /^jp:[a-z0-9-]+:[a-z0-9-]+(:[a-z0-9-]+)?$/i;
const KR = /^kr:[a-z0-9-]+(:[a-z0-9-]+)?$/i;

const must = <T>(r: { data: T; error: { message: string } | null }): T => {
  if (r.error) throw new Error(r.error.message);
  return r.data;
};

async function refreshJapan(code: string, d: Deps): Promise<number> {
  let min = d.minChargeJpy;
  if (min === undefined) {
    const s = must(await d.db.from("settings").select("value").eq("key", "discovery_min_charge_jpy").maybeSingle());
    const n = s?.value == null ? NaN : Number(s.value);
    min = Number.isFinite(n) ? n : 50000;
  }
  const { hotels } = await fetchRakutenRegion(code, d.env, d.fetchFn, d.sleep, min);
  const byId = new Map<string, Record<string, unknown>>();
  for (const h of hotels as any[]) {
    if (!isCandidate(h, { minChargeJpy: min })) continue;
    const row = rakutenToRow(h, code);
    byId.set(row.external_id!, Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v ?? null])));
  }
  const ids = [...byId.keys()];
  const existing = new Map<string, HotelRow>();
  for (let i = 0; i < ids.length; i += 100) {
    const rows = must(await d.db.from("hotels").select("*").eq("source", "rakuten").in("external_id", ids.slice(i, i + 100)));
    for (const r of rows as HotelRow[]) existing.set(r.external_id!, r);
  }
  // 같은 호텔이 award/manual 행으로 이미 있으면(지역 코드가 같거나 상·하위) 새로 만들지 않고 그 행을 라쿠텐 행으로 승격한다.
  const fresh = [...byId.keys()].filter((id) => !existing.has(id));
  let twins: HotelRow[] = [];
  if (fresh.length) {
    const parts = code.split(":");
    const conds = [`region_code.eq.${code}`, `region_code.like.${code}:*`];
    for (let i = 2; i < parts.length; i++) conds.push(`region_code.eq.${parts.slice(0, i).join(":")}`);
    twins = must(await d.db.from("hotels").select("*").eq("country", "JP").in("source", ["award", "manual"]).or(conds.join(","))) as HotelRow[];
  }
  const claimed = new Set<string>();
  const bulk: unknown[] = [], locked: { id: string; patch: unknown }[] = [];
  for (const [id, row] of byId) {
    const ex = existing.get(id) ?? null;
    if (!ex && twins.length) {
      const { match, ambiguous } = matchHotel(row as Partial<HotelRow>, twins.filter((t) => !claimed.has(t.id)));
      if (match && !ambiguous) {
        claimed.add(match.id);
        const patch = Object.fromEntries(
          Object.entries(mergeHotel(match, row as Partial<HotelRow>)).filter(([k, v]) => v != null && !(k === "type" && match.type)),
        );
        locked.push({ id: match.id, patch: { ...patch, source: "rakuten", external_id: id } });
        continue;
      }
    }
    const patch = mergeHotel(ex, row as Partial<HotelRow>);
    if (ex && ex.manual_fields?.length) locked.push({ id: ex.id, patch }); // 열 구성이 달라 개별 update
    else bulk.push(patch);
  }
  if (bulk.length) must(await d.db.from("hotels").upsert(bulk, { onConflict: "source,external_id" }));
  for (const l of locked) must(await d.db.from("hotels").update(l.patch).eq("id", l.id));
  return byId.size;
}

// TourAPI는 새 호텔을 만들지 않는다: 기존 KR 호텔과 매칭된 것만 빈 열(좌표·사진·이름·홈페이지)을 채운다.
async function refreshKorea(code: string, d: Deps): Promise<number> {
  const [, regn, signgu] = code.split(":");
  const { kor, jpn, eng } = await fetchTourapiRegion(code, d.env, d.fetchFn);
  const by = (a: unknown[]) => new Map((a as any[]).map((i) => [String(i.contentid), i]));
  const jpnBy = by(jpn), engBy = by(eng);

  const parent = `kr:${regn}`;
  const existing = must(
    await d.db.from("hotels").select("*").eq("country", "KR")
      .or(`region_code.eq.${code},region_code.like.${code}:*,region_code.eq.${parent}`),
  ) as HotelRow[];

  const patches = new Map<string, Partial<HotelRow>>();
  let detailCalls = 0;
  for (const k of kor as any[]) {
    const itemCode = signgu ? code : k.lDongSignguCd ? `${code}:${k.lDongSignguCd}` : code;
    const id = String(k.contentid);
    const row = tourapiToRow(k, jpnBy.get(id) ?? null, engBy.get(id) ?? null, itemCode);
    const { match } = matchHotel(row, existing);
    if (!match) continue;
    const fill = fillEmpty(match, {
      name_ko: row.name_ko, name_ja: row.name_ja, name_en: row.name_en,
      lat: row.lat, lng: row.lng, image_url: row.image_url,
    });
    const coarser = !match.region_code || itemCode.startsWith(match.region_code + ":");
    if (coarser && itemCode !== match.region_code && !match.manual_fields?.includes("region_code")) {
      fill.region_code = itemCode;
    }
    if (!match.homepage && detailCalls < MAX_DETAIL_CALLS) {
      detailCalls++;
      try {
        const hp = parseTourHomepage(await fetchTourHomepage(id, d.env, d.fetchFn));
        if (hp) Object.assign(fill, fillEmpty(match, { homepage: hp }));
      } catch (e) {
        console.error("detailCommon2 failed", (e as Error).message); // 홈페이지는 다음 갱신에서 재시도
      }
    }
    patches.set(match.id, { ...patches.get(match.id), ...fill });
  }
  let n = 0;
  for (const [id, patch] of patches) {
    if (!Object.keys(patch).length) continue;
    must(await d.db.from("hotels").update(patch).eq("id", id));
    n++;
  }
  return n;
}

export async function handle(req: { region_code: string; force?: boolean }, d: Deps): Promise<Result> {
  const code = req?.region_code;
  if (typeof code !== "string" || !(JP.test(code) || KR.test(code))) {
    return { status: 400, body: { error: "bad_region_code" } };
  }
  const country = code.startsWith("kr:") ? "KR" : "JP";
  const cache = must(
    await d.db.from("region_cache").select("refreshed_at").eq("country", country).eq("region_code", code).maybeSingle(),
  );
  const prev: string | null = cache?.refreshed_at ?? null;

  if (!req.force && prev && d.now().getTime() - new Date(prev).getTime() < DAY_MS) {
    const { count } = await d.db.from("hotels").select("id", { count: "exact", head: true })
      .or(`region_code.eq.${code},region_code.like.${code}:*`);
    return { status: 200, body: { status: "fresh", count: count ?? 0 } };
  }
  if (!(await tryAcquire(d.db, code, LOCK_TTL_SEC))) return { status: 202, body: { status: "in_progress" } };

  let ok = false;
  try {
    const count = country === "JP" ? await refreshJapan(code, d) : await refreshKorea(code, d);
    ok = true;
    return { status: 200, body: { status: "refreshed", count } };
  } catch (e) {
    console.error("refresh failed", (e as Error).message);
    return { status: 502, body: { status: "upstream_failed", refreshed_at: prev } };
  } finally {
    await release(d.db, code, { success: ok });
  }
}
