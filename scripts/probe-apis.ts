// Task 2 spike: call the free APIs once per region and save trimmed responses as fixtures.
// Usage: deno run -A scripts/probe-apis.ts   (reads .env; never prints/saves keys)
import { load } from "@std/dotenv";

const env = await load({ envPath: ".env" });
const KEYS = [env.RAKUTEN_APP_ID, env.RAKUTEN_ACCESS_KEY, env.TOURAPI_KEY];
if (KEYS.some((k) => !k)) throw new Error("missing RAKUTEN_APP_ID / RAKUTEN_ACCESS_KEY / TOURAPI_KEY in .env");
const FX = "tests/fixtures/";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ponytail: trims every array to 5 items; fine for fixtures, don't reuse for real data.
const trim = (v: unknown): unknown =>
  Array.isArray(v) ? v.slice(0, 5).map(trim)
  : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, trim(x)]))
  : v;

async function save(name: string, data: unknown, doTrim = true) {
  let s = JSON.stringify(doTrim ? trim(data) : data, null, 2);
  for (const k of KEYS) s = s.replaceAll(k, "<redacted>").replaceAll(encodeURIComponent(k), "<redacted>");
  await Deno.writeTextFile(FX + name, s + "\n");
  console.log("saved", name, s.length);
}

// ---- Rakuten (Origin header is REQUIRED; Referer alone gives 403) ----
const RB = "https://openapi.rakuten.co.jp/engine/api/Travel/";
async function rak(path: string, q: Record<string, string> = {}) {
  const u = new URL(RB + path);
  u.searchParams.set("applicationId", env.RAKUTEN_APP_ID);
  u.searchParams.set("accessKey", env.RAKUTEN_ACCESS_KEY);
  u.searchParams.set("format", "json");
  for (const [k, v] of Object.entries(q)) u.searchParams.set(k, v);
  const r = await fetch(u, { headers: { Origin: "https://nyaosu072.github.io", Referer: "https://nyaosu072.github.io/hotel-research/" } });
  await sleep(1100); // 1 req/sec limit
  if (!r.ok) throw new Error(`rakuten ${path} ${r.status}`);
  return await r.json();
}
const area = await rak("GetAreaClass/20140210");
const jp = area.areaClasses.largeClasses[0].largeClass;
const keep = jp.middleClasses.filter((m: any) => ["tokyo", "kanagawa"].includes(m.middleClass.middleClassCode));
await save("rakuten_area.json", { areaClasses: { largeClasses: [{ largeClass: { ...jp, middleClasses: keep } }] } }, false);

const common = { largeClassCode: "japan", datumType: "1", hits: "5" }; // datumType=1: WGS84 degrees
const tokyo = await rak("SimpleHotelSearch/20170426", { ...common, middleClassCode: "tokyo", smallClassCode: "tokyo", detailClassCode: "A" });
const hakone = await rak("SimpleHotelSearch/20170426", { ...common, middleClassCode: "kanagawa", smallClassCode: "hakone" });
await save("rakuten_simple.json", { "jp:tokyo:tokyo:A": tokyo, "jp:kanagawa:hakone": hakone });
const no = hakone.hotels[0].hotel[0].hotelBasicInfo.hotelNo;
await save("rakuten_detail.json", await rak("HotelDetailSearch/20170426", { hotelNo: String(no), datumType: "1" }));
await save("rakuten_ranking_premium.json", await rak("HotelRanking/20170426", { genre: "premium" }));

// ---- TourAPI (lDongRegnCd is the reliable region filter; legacy areaCode misses new items) ----
const TB = "https://apis.data.go.kr/B551011/";
async function tour(path: string, q: Record<string, string> = {}) {
  const u = new URL(TB + path);
  u.searchParams.set("serviceKey", env.TOURAPI_KEY);
  for (const [k, v] of Object.entries({ _type: "json", MobileOS: "ETC", MobileApp: "HotelResearch", ...q })) u.searchParams.set(k, v);
  const r = await fetch(u);
  console.log(path, r.status, "ratelimit-remaining", r.headers.get("x-ratelimit-remaining"));
  if (!r.ok) throw new Error(`tourapi ${path} ${r.status}`);
  return (await r.json()).response;
}
const seoul = { lDongRegnCd: "11", numOfRows: "5" }, jeju = { lDongRegnCd: "50", numOfRows: "5" };
for (const [svc, file] of [["JpnService2", "tourapi_jpn_stay.json"], ["EngService2", "tourapi_eng_stay.json"], ["KorService2", "tourapi_kor_stay.json"]]) {
  const s = await tour(`${svc}/searchStay2`, seoul), j = await tour(`${svc}/searchStay2`, jeju);
  const id = j.body.items?.item?.[0]?.contentid;
  if (!id) throw new Error(`${svc}: no Jeju stay items`); // detailCommon2 is the only place with `homepage`
  const out: Record<string, unknown> = { "kr:11": s, "kr:50": j,
    [`detailCommon2:${id}`]: await tour(`${svc}/detailCommon2`, { contentId: id }) };
  await save(file, out);
}
await save("tourapi_area.json", {
  ldongCode2_jpn: await tour("JpnService2/ldongCode2", { numOfRows: "30" }),
  ldongCode2_jpn_jeju_sigungu: await tour("JpnService2/ldongCode2", { numOfRows: "30", lDongRegnCd: "50" }),
  areaCode2_jpn: await tour("JpnService2/areaCode2", { numOfRows: "30" }),
}, false);

// ---- Wikidata: P856 coverage of 20 luxury hotels (QIDs resolved by label/search; null = not found) ----
const UA = { "User-Agent": "HotelResearchSpike/0.1 (https://github.com/nyaosu072/hotel-research;)" };
const Q: Record<string, string | null> = {
  "Bulgari Hotel Tokyo": null, "Four Seasons Hotel Tokyo at Otemachi": null, "Palace Hotel Tokyo": "Q7126175",
  "Gora Kadan": null, "Asaba": "Q4803192", "Amanemu": "Q38125247", "Hotel The Mitsui Kyoto": "Q100256040",
  "Aman Tokyo": "Q30525632", "The Peninsula Tokyo": "Q3522204", "Park Hyatt Tokyo": "Q11329793",
  "Hoshinoya Kyoto": null, "The Ritz-Carlton Kyoto": "Q17209588", "Signiel Seoul": "Q111406430",
  "The Shilla Seoul": "Q111406453", "Josun Palace": null, "Four Seasons Seoul": "Q111406504",
  "Park Hyatt Busan": "Q16182922", "Lotte Hotel Jeju": "Q111416195", "Grand Hyatt Seoul": "Q5594665",
  "Andaz Seoul Gangnam": "Q111865253",
};
async function sparql(q: string) {
  const r = await fetch("https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(q), { headers: UA });
  const t = await r.text(); try { return JSON.parse(t); } catch { throw new Error("sparql: " + t.slice(0, 400)); }
}
const ids = Object.values(Q).filter(Boolean).map((x) => `wd:${x}`).join(" ");
const res = await sparql(`SELECT ?item ?w WHERE { VALUES ?item { ${ids} } ?item wdt:P856 ?w }`);
const withSite = new Set(res.results.bindings.map((b: any) => b.item.value.split("/").pop()));
console.log(`wikidata: found ${Object.values(Q).filter(Boolean).length}/20, with P856: ${withSite.size}`);
for (const [n, id] of Object.entries(Q)) console.log(" ", n, id ?? "NOT FOUND", id && withSite.has(id) ? "P856" : "-");
await save("wikidata_asaba.json", await sparql(
  `SELECT ?p ?pLabel ?v ?vLabel WHERE { wd:Q4803192 ?pp ?v . ?p wikibase:directClaim ?pp . SERVICE wikibase:label { bd:serviceParam wikibase:language "en,ja". } }`), false);
