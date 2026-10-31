// deno-lint-ignore-file no-explicit-any
import { assertEquals } from "@std/assert";
import { handle } from "../supabase/functions/fetch-region/handler.ts";
import { cleanup, db, hasEnv, rand } from "./_db.ts";

const fx = (n: string) => JSON.parse(Deno.readTextFileSync(new URL(`./fixtures/${n}.json`, import.meta.url)));
const rakuten = fx("rakuten_simple")["jp:kanagawa:hakone"];
const kor = fx("tourapi_kor_stay")["kr:11"], detail = fx("tourapi_detail_homepage").detailCommon2;
// hakone fixture: 16400, 13200, 12947, 27775, 14000 → 기준 15000이면 2곳 통과
const MIN = 15000;
const PASS = rakuten.hotels.filter((h: any) => h.hotel[0].hotelBasicInfo.hotelMinCharge >= MIN).length;

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
function fake(opts: { status?: number } = {}) {
  const calls: { url: URL; headers: Headers }[] = [];
  const fetchFn = ((input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ url, headers: new Headers(init?.headers) });
    if (opts.status) return Promise.resolve(json({ error: "x" }, opts.status));
    if (url.host.includes("rakuten")) {
      // 2페이지 중 1페이지만 내용, 2페이지는 같은 내용(중복 제거 확인)
      return Promise.resolve(json({ ...rakuten, pagingInfo: { ...rakuten.pagingInfo, pageCount: 2 } }));
    }
    const p = url.pathname;
    if (p.endsWith("detailCommon2")) return Promise.resolve(json({ response: detail }));
    const page = url.searchParams.get("pageNo") ?? "1";
    let items = kor.body.items.item;
    if (p.includes("EngService2")) items = [{ ...items[0], title: "Gangnam Stay Hill Test" }];
    if (p.includes("JpnService2")) items = [];
    return Promise.resolve(json({
      response: { header: kor.header, body: { items: page === "1" && items.length ? { item: items } : "" } },
    }));
  }) as typeof fetch;
  return { calls, fetchFn };
}
const mkDeps = (f: ReturnType<typeof fake>, sleeps: number[] = []) => ({
  db,
  fetchFn: f.fetchFn,
  sleep: (ms: number) => {
    sleeps.push(ms);
    return Promise.resolve();
  },
  now: () => new Date(),
  minChargeJpy: MIN,
  env: { RAKUTEN_APP_ID: "app", RAKUTEN_ACCESS_KEY: "key", TOURAPI_KEY: "tk" },
});
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
const countHotels = async (code: string) =>
  (await db.from("hotels").select("id", { count: "exact", head: true }).like("region_code", `${code}%`)).count;

Deno.test({ name: "fetch-region: bad code -> 400", ignore: !hasEnv }, async () => {
  const r = await handle({ region_code: "us:nyc" }, mkDeps(fake()));
  assertEquals(r, { status: 400, body: { error: "bad_region_code" } });
});

Deno.test({ name: "fetch-region: fresh within 24h -> no upstream call", ignore: !hasEnv }, async () => {
  const code = `jp:test-${rand()}:x`, f = fake();
  try {
    await db.from("region_cache").insert({ country: "JP", region_code: code, refreshed_at: hoursAgo(1) });
    const r = await handle({ region_code: code }, mkDeps(f));
    assertEquals([r.status, (r.body as any).status], [200, "fresh"]);
    assertEquals(f.calls.length, 0);
  } finally {
    await cleanup(code);
  }
});

Deno.test({ name: "fetch-region: locked -> 202", ignore: !hasEnv }, async () => {
  const code = `jp:test-${rand()}:x`, f = fake();
  try {
    await db.from("region_cache").insert({
      country: "JP",
      region_code: code,
      refreshing_until: new Date(Date.now() + 60_000).toISOString(),
    });
    const r = await handle({ region_code: code }, mkDeps(f));
    assertEquals([r.status, (r.body as any).status], [202, "in_progress"]);
    assertEquals(f.calls.length, 0);
  } finally {
    await cleanup(code);
  }
});

Deno.test({ name: "fetch-region: japan refresh, idempotent, keeps manual_fields", ignore: !hasEnv }, async () => {
  const code = `jp:test-${rand()}:x`, f = fake(), sleeps: number[] = [];
  try {
    await db.from("region_cache").insert({ country: "JP", region_code: code, refreshed_at: hoursAgo(25) });
    let r = await handle({ region_code: code }, mkDeps(f, sleeps));
    assertEquals([r.status, (r.body as any).status, (r.body as any).count], [200, "refreshed", PASS]);
    assertEquals(await countHotels(code), PASS);
    // 라쿠텐 요청 규칙: Origin, datumType=1, 호출 사이 1초 이상 대기, pageCount 2까지
    assertEquals(f.calls.length, 2);
    assertEquals(f.calls[0].headers.get("Origin"), "https://nyaosu072.github.io");
    assertEquals(f.calls[0].url.searchParams.get("datumType"), "1");
    assertEquals(f.calls[0].url.searchParams.get("middleClassCode"), code.split(":")[1]);
    assertEquals(sleeps.filter((s) => s >= 1000).length, 1);

    // 수동 수정 열은 보존, 같은 입력 재실행해도 행 수 그대로
    const { data: one } = await db.from("hotels").select("id").like("region_code", `${code}%`).limit(1).single();
    await db.from("hotels").update({ name_ja: "수동", manual_fields: ["name_ja"] }).eq("id", one.id);
    r = await handle({ region_code: code, force: true }, mkDeps(f));
    assertEquals((r.body as any).count, PASS);
    assertEquals(await countHotels(code), PASS);
    const { data: kept } = await db.from("hotels").select("name_ja, homepage").eq("id", one.id).single();
    assertEquals(kept.name_ja, "수동");
    assertEquals(kept.homepage, null);
  } finally {
    await cleanup(code);
  }
});

Deno.test({ name: "fetch-region: upstream 500 -> 502, lock released, data intact", ignore: !hasEnv }, async () => {
  const code = `jp:test-${rand()}:x`;
  try {
    const old = hoursAgo(30);
    await db.from("region_cache").insert({ country: "JP", region_code: code, refreshed_at: old });
    await db.from("hotels").insert({
      country: "JP",
      region_code: code,
      source: "rakuten",
      external_id: `t-${rand()}`,
      name_ja: "既存",
    });
    const log = console.error;
    console.error = () => {}; // 의도된 실패 로그 숨김
    const r = await handle({ region_code: code }, mkDeps(fake({ status: 500 }))).finally(() => console.error = log);
    assertEquals(r.status, 502);
    assertEquals((r.body as any).status, "upstream_failed");
    assertEquals(await countHotels(code), 1);
    const { data } = await db.from("region_cache").select("*").eq("region_code", code).single();
    assertEquals(data.refreshing_until, null);
    assertEquals(new Date(data.refreshed_at).getTime(), new Date(old).getTime());
  } finally {
    await cleanup(code);
  }
});

Deno.test({ name: "fetch-region: korea only enriches matched hotels", ignore: !hasEnv }, async () => {
  const code = `kr:test-${rand()}`, f = fake();
  try {
    await db.from("hotels").insert([
      { country: "KR", region_code: code, source: "award", external_id: `t-${rand()}`, name_en: "Gangnam Stay Hill Test" },
      { country: "KR", region_code: code, source: "award", external_id: `t-${rand()}`, name_en: "Unrelated Palace" },
    ]);
    const r = await handle({ region_code: code }, mkDeps(f));
    assertEquals([r.status, (r.body as any).status, (r.body as any).count], [200, "refreshed", 1]);
    assertEquals(await countHotels(code), 2); // 새 호텔은 만들지 않는다
    const { data } = await db.from("hotels").select("*").like("region_code", `${code}%`)
      .eq("name_en", "Gangnam Stay Hill Test").single();
    assertEquals(data.name_ko, "강남스테이힐(Gangnam Stay Hill)");
    assertEquals(data.region_code, `${code}:680`);
    assertEquals(typeof data.lat, "number");
    assertEquals(data.homepage, "http://www.gnstayhill.com/");
    assertEquals(f.calls.filter((c) => c.url.pathname.endsWith("detailCommon2")).length, 1);
    assertEquals(f.calls[0].url.searchParams.get("lDongRegnCd"), code.split(":")[1]);
  } finally {
    await cleanup(code);
  }
});
