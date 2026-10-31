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
  minChargeJpy?: number,
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
      sort: "-roomCharge", // 대략 가격 내림차순(엄밀하지 않음, docs/api-notes.md)
    };
    if (detail) q.detailClassCode = detail;
    for (const [k, v] of Object.entries(q)) u.searchParams.set(k, v);
    const res = await fetchFn(u, { headers: { Origin: "https://nyaosu072.github.io" } });
    if (res.status === 404) break; // 결과 없음 (라쿠텐 not_found)
    if (!res.ok) throw new Error(`rakuten ${res.status}`);
    const j: any = await res.json();
    let top = -Infinity; // 이 페이지의 최고가
    for (const h of j.hotels ?? []) {
      const b = h?.hotel?.[0]?.hotelBasicInfo;
      if (!b) continue;
      hotels.push(b);
      top = Math.max(top, b.hotelMinCharge ?? -Infinity);
    }
    const pageCount = j.pagingInfo?.pageCount ?? 1;
    if (page >= pageCount) break;
    // 대략 내림차순 정렬이므로 후보가 한 곳도 없는 페이지 이후는 건너뛴다
    if (minChargeJpy !== undefined && top < minChargeJpy) break;
    if (page === MAX_PAGES) console.warn(`rakuten ${code}: truncated at ${MAX_PAGES} of ${pageCount} pages`);
  }
  return { hotels };
}
