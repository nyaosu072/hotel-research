// One-off: deno run -A scripts/build-regions.ts  -> data/regions_jp.json, data/regions_kr.json (public data, committed)
// Region code formats: see docs/api-notes.md. JP names: Rakuten GetAreaClass (ja only; en = prefecture table / slug).
import { load } from "@std/dotenv";

const env = await load({ envPath: ".env" });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Region = { code: string; name_ja: string; name_en: string; name_ko?: string; children?: Region[] };

// ---- Japan ----
const PREF_EN = "hokkaido:Hokkaido aomori:Aomori iwate:Iwate miyagi:Miyagi akita:Akita yamagata:Yamagata fukushima:Fukushima ibaraki:Ibaraki tochigi:Tochigi gunma:Gunma saitama:Saitama chiba:Chiba tokyo:Tokyo kanagawa:Kanagawa niigata:Niigata toyama:Toyama ishikawa:Ishikawa fukui:Fukui yamanashi:Yamanashi nagano:Nagano gifu:Gifu shizuoka:Shizuoka aichi:Aichi mie:Mie shiga:Shiga kyoto:Kyoto osaka:Osaka hyogo:Hyogo nara:Nara wakayama:Wakayama tottori:Tottori shimane:Shimane okayama:Okayama hiroshima:Hiroshima yamaguchi:Yamaguchi tokushima:Tokushima kagawa:Kagawa ehime:Ehime kochi:Kochi fukuoka:Fukuoka saga:Saga nagasaki:Nagasaki kumamoto:Kumamoto oita:Oita miyazaki:Miyazaki kagoshima:Kagoshima okinawa:Okinawa"
  .split(" ").map((s) => s.split(":"));
const prefEn = Object.fromEntries(PREF_EN);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const u = new URL("https://openapi.rakuten.co.jp/engine/api/Travel/GetAreaClass/20140210");
u.searchParams.set("applicationId", env.RAKUTEN_APP_ID);
u.searchParams.set("accessKey", env.RAKUTEN_ACCESS_KEY);
u.searchParams.set("format", "json");
const rr = await fetch(u, { headers: { Origin: "https://nyaosu072.github.io" } });
if (!rr.ok) throw new Error(`rakuten ${rr.status}`);
// deno-lint-ignore no-explicit-any
const ra: any = await rr.json();
const jp: Region[] = [];
for (const L of ra.areaClasses.largeClasses) {
  for (const M of L.largeClass.middleClasses) {
    const m = M.middleClass;
    const mc = m.middleClassCode;
    const smalls: Region[] = [];
    for (const S of m.smallClasses) {
      const s = S.smallClass;
      const details = (s.detailClasses ?? []).map((D: any) => {
        const d = D.detailClass;
        return { code: `jp:${mc}:${s.smallClassCode}:${d.detailClassCode}`, name_ja: d.detailClassName, name_en: `${cap(s.smallClassCode)} ${d.detailClassCode}` };
      });
      smalls.push({
        code: `jp:${mc}:${s.smallClassCode}`, name_ja: s.smallClassName, name_en: cap(s.smallClassCode),
        ...(details.length ? { children: details } : {}),
      });
    }
    jp.push({ code: `jp:${mc}`, name_ja: m.middleClassName, name_en: prefEn[mc] ?? cap(mc), children: smalls });
  }
}
await Deno.writeTextFile("data/regions_jp.json", JSON.stringify(jp, null, 1) + "\n");
console.log("jp prefectures", jp.length, "smalls", jp.reduce((n, p) => n + (p.children?.length ?? 0), 0));

// ---- Korea ----
async function tour(svc: string, q: Record<string, string> = {}): Promise<{ code: string; name: string }[]> {
  const t = new URL(`https://apis.data.go.kr/B551011/${svc}/ldongCode2`);
  t.searchParams.set("serviceKey", env.TOURAPI_KEY);
  for (const [k, v] of Object.entries({ _type: "json", MobileOS: "ETC", MobileApp: "HotelResearch", numOfRows: "100", ...q })) t.searchParams.set(k, v);
  const r = await fetch(t);
  if (!r.ok) throw new Error(`tourapi ${svc} ${r.status}`);
  const j = await r.json();
  const it = j.response.body.items;
  await sleep(150);
  return it ? it.item : [];
}
const sido = {
  ko: await tour("KorService2"), ja: await tour("JpnService2"), en: await tour("EngService2"),
};
const kr: Region[] = [];
for (const s of sido.ko) {
  const q = { lDongRegnCd: s.code };
  const [ko, ja, en] = [await tour("KorService2", q), await tour("JpnService2", q), await tour("EngService2", q)];
  const nm = (arr: { code: string; name: string }[], c: string) => arr.find((x) => x.code === c)?.name;
  const children: Region[] = ko.filter((g) => g.code !== s.code).map((g) => ({
    code: `kr:${s.code}:${g.code}`, name_ko: g.name, name_ja: nm(ja, g.code) ?? g.name, name_en: nm(en, g.code) ?? g.name,
  }));
  kr.push({
    code: `kr:${s.code}`, name_ko: s.name, name_ja: nm(sido.ja, s.code) ?? s.name, name_en: nm(sido.en, s.code) ?? s.name,
    ...(children.length ? { children } : {}),
  });
}
await Deno.writeTextFile("data/regions_kr.json", JSON.stringify(kr, null, 1) + "\n");
console.log("kr sido", kr.length, "sigungu", kr.reduce((n, p) => n + (p.children?.length ?? 0), 0));
