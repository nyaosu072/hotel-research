import { fillEmpty } from "./merge.ts";
import { matchHotel } from "./match.ts";
import type { HotelRow } from "./types.ts";

export interface WikiItem {
  qid: string;
  name_ja?: string;
  name_en?: string;
  name_ko?: string;
  lat?: number;
  lng?: number;
  homepage?: string;
}
type Country = "JP" | "KR";

const UA = "HotelResearch/0.1 (https://github.com/nyaosu072)";
const COUNTRY_QID = { JP: "wd:Q17", KR: "wd:Q884" };
// hotel, ryokan, resort hotel (QID는 Wikidata API로 확인).
// ponytail: 직접 P31만 봄. P31/P279* + ORDER BY는 공개 엔드포인트에서 504가 남. 하위 분류 호텔은 빠질 수 있음.
const CLASSES = "wd:Q27686 wd:Q562930 wd:Q2880255";
const BBOX = { JP: [24, 46, 122, 154], KR: [33, 39, 124, 132] } as const;

export const inCountry = (c: Country, lat: number, lng: number) => {
  const [a, b, x, y] = BBOX[c];
  return lat >= a && lat <= b && lng >= x && lng <= y;
};

// 국가 하나의 호텔 항목을 페이지 단위로(항목 기준 LIMIT/OFFSET) 가져오는 쿼리.
export function buildBulkQuery(country: Country, offset: number, limit: number): string {
  return `SELECT ?item ?homepage ?coord ?ja ?en ?ko WHERE {
  { SELECT DISTINCT ?item WHERE {
      VALUES ?c { ${CLASSES} } ?item wdt:P31 ?c . ?item wdt:P17 ${COUNTRY_QID[country]} .
    } LIMIT ${limit} OFFSET ${offset} }
  OPTIONAL { ?item wdt:P625 ?coord }
  OPTIONAL { ?item wdt:P856 ?homepage }
  OPTIONAL { ?item rdfs:label ?ja FILTER(lang(?ja) = "ja") }
  OPTIONAL { ?item rdfs:label ?en FILTER(lang(?en) = "en") }
  OPTIONAL { ?item rdfs:label ?ko FILTER(lang(?ko) = "ko") }
}`;
}

// SPARQL JSON -> 항목 목록 (같은 항목의 여러 행은 병합, 첫 값 우선)
// deno-lint-ignore no-explicit-any
export function parseBulk(json: any): WikiItem[] {
  const items = new Map<string, WikiItem>();
  for (const r of json?.results?.bindings ?? []) {
    const qid = String(r.item.value).split("/").pop()!;
    const it = items.get(qid) ?? { qid };
    it.name_ja ??= r.ja?.value;
    it.name_en ??= r.en?.value;
    it.name_ko ??= r.ko?.value;
    it.homepage ??= r.homepage?.value;
    const m = r.coord?.value.match(/Point\(([-\d.eE]+) ([-\d.eE]+)\)/);
    if (m && it.lat === undefined) {
      it.lng = Number(m[1]);
      it.lat = Number(m[2]);
    }
    items.set(qid, it);
  }
  return [...items.values()].map((i) =>
    Object.fromEntries(Object.entries(i).filter(([, v]) => v !== undefined)) as unknown as WikiItem
  );
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// 타임아웃 + 429/5xx 백오프
export async function fetchSparql(query: string, fetchFn: typeof fetch = fetch, sleep = realSleep) {
  const url = "https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(query);
  for (let attempt = 0;; attempt++) {
    try {
      const res = await fetchFn(url, {
        headers: { "User-Agent": UA, Accept: "application/sparql-results+json" },
        signal: AbortSignal.timeout(90_000),
      });
      if (res.ok) return await res.json();
      if (res.status !== 429 && res.status < 500) throw new Error(`wikidata ${res.status}`);
      if (attempt >= 5) throw new Error(`wikidata ${res.status}`);
      await sleep(Number(res.headers.get("retry-after")) * 1000 || 2000 * 2 ** attempt);
    } catch (e) {
      if (attempt >= 5 || (e as Error).message.startsWith("wikidata ")) throw e;
      await sleep(2000 * 2 ** attempt); // 타임아웃/네트워크 오류
    }
  }
}

export async function downloadCountry(
  country: Country,
  fetchFn: typeof fetch = fetch,
  pageSize = 10000,
  sleep = realSleep,
): Promise<WikiItem[]> {
  const all = new Map<string, WikiItem>();
  for (let offset = 0;; offset += pageSize) {
    const page = await fetchSparql(buildBulkQuery(country, offset, pageSize), fetchFn, sleep);
    const bindings = new Set((page.results.bindings as { item: { value: string } }[]).map((r) => r.item.value));
    for (const i of parseBulk(page)) all.set(i.qid, i);
    if (bindings.size < pageSize) return [...all.values()];
    await sleep(1000);
  }
}

export type WikiDecision = { kind: "fill"; patch: Partial<HotelRow> } | { kind: "ambiguous" } | { kind: "none" };

// 로컬 매칭: 이름 정확 일치, 또는 포함 관계 + 좌표 300m 이내(matchHotel 규칙). fillEmpty로만 채운다.
export function decideWikidata(h: HotelRow, items: WikiItem[]): WikiDecision {
  const cands = items.map((i) => ({ ...i, id: i.qid }) as unknown as HotelRow);
  const m = matchHotel(h, cands);
  if (m.ambiguous) return { kind: "ambiguous" };
  if (!m.match) return { kind: "none" };
  const w = items.find((i) => i.qid === m.match!.id)!;
  const coordsOk = w.lat !== undefined && w.lng !== undefined && inCountry(h.country, w.lat, w.lng);
  const patch = fillEmpty(h, {
    homepage: w.homepage,
    name_en: w.name_en,
    name_ja: w.name_ja,
    name_ko: w.name_ko,
    ...(coordsOk ? { lat: w.lat, lng: w.lng } : {}),
  } as Partial<HotelRow>);
  for (const k of Object.keys(patch) as (keyof HotelRow)[]) if (patch[k] === undefined) delete patch[k];
  return { kind: "fill", patch };
}
