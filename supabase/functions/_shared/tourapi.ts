// deno-lint-ignore-file no-explicit-any
import type { UpstreamEnv } from "./rakuten.ts";

const BASE = "https://apis.data.go.kr/B551011/";
const ROWS = 100;
const MAX_PAGES = 5;

export async function tourCall(
  path: string,
  q: Record<string, string>,
  env: UpstreamEnv,
  fetchFn: typeof fetch,
): Promise<any> {
  const u = new URL(BASE + path);
  u.searchParams.set("serviceKey", env.TOURAPI_KEY);
  for (const [k, v] of Object.entries({ _type: "json", MobileOS: "ETC", MobileApp: "HotelResearch", ...q })) {
    u.searchParams.set(k, v);
  }
  const res = await fetchFn(u);
  if (!res.ok) throw new Error(`tourapi ${path} ${res.status}`);
  return (await res.json()).response;
}

const items = (r: any): any[] => {
  const i = r?.body?.items?.item;
  return Array.isArray(i) ? i : i ? [i] : [];
};

// kr:<lDongRegnCd>[:<lDongSignguCd>] → 한/일/영 숙박 목록 (짝짓기는 contentid로 호출 측에서)
export async function fetchTourapiRegion(
  code: string,
  env: UpstreamEnv,
  fetchFn: typeof fetch = fetch,
): Promise<{ kor: unknown[]; jpn: unknown[]; eng: unknown[] }> {
  const [, regn, signgu] = code.split(":");
  const list = async (svc: string) => {
    const out: unknown[] = [];
    for (let p = 1; p <= MAX_PAGES; p++) {
      const q: Record<string, string> = { lDongRegnCd: regn, numOfRows: String(ROWS), pageNo: String(p) };
      if (signgu) q.lDongSignguCd = signgu;
      const got = items(await tourCall(`${svc}/searchStay2`, q, env, fetchFn));
      out.push(...got);
      if (got.length < ROWS) break;
    }
    return out;
  };
  return { kor: await list("KorService2"), jpn: await list("JpnService2"), eng: await list("EngService2") };
}

export async function fetchTourHomepage(contentId: string, env: UpstreamEnv, fetchFn: typeof fetch): Promise<string> {
  const r = await tourCall("KorService2/detailCommon2", { contentId }, env, fetchFn);
  return items(r)[0]?.homepage ?? "";
}
