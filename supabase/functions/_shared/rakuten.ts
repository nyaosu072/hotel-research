// deno-lint-ignore-file no-explicit-any
export interface UpstreamEnv {
  RAKUTEN_APP_ID: string;
  RAKUTEN_ACCESS_KEY: string;
  TOURAPI_KEY: string;
}

export const MAX_PAGES = 10;

// jp:<middle>:<small>[:<detail>] → hotelBasicInfo[] (최대 10페이지, 호출 사이 1초 이상 대기)
export async function fetchRakutenRegion(
  code: string,
  env: UpstreamEnv,
  fetchFn: typeof fetch = fetch,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<{ hotels: unknown[] }> {
  const [, middle, small, detail] = code.split(":");
  const hotels: unknown[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    if (page > 1) await sleep(1100);
    const u = new URL("https://openapi.rakuten.co.jp/engine/api/Travel/SimpleHotelSearch/20170426");
    const q: Record<string, string> = {
      applicationId: env.RAKUTEN_APP_ID,
      accessKey: env.RAKUTEN_ACCESS_KEY,
      format: "json",
      largeClassCode: "japan",
      middleClassCode: middle,
      smallClassCode: small,
      datumType: "1",
      hits: "30",
      page: String(page),
    };
    if (detail) q.detailClassCode = detail;
    for (const [k, v] of Object.entries(q)) u.searchParams.set(k, v);
    const res = await fetchFn(u, { headers: { Origin: "https://nyaosu072.github.io" } });
    if (res.status === 404) break; // 결과 없음 (라쿠텐 not_found)
    if (!res.ok) throw new Error(`rakuten ${res.status}`);
    const j: any = await res.json();
    for (const h of j.hotels ?? []) {
      const b = h?.hotel?.[0]?.hotelBasicInfo;
      if (b) hotels.push(b);
    }
    if (page >= (j.pagingInfo?.pageCount ?? 1)) break;
  }
  return { hotels };
}
