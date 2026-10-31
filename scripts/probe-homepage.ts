// Finds a KorService2 stay whose detailCommon2 has a non-empty `homepage`; saves it as a fixture. <=15 calls.
import { load } from "@std/dotenv";
const env = await load({ envPath: ".env" });
if (!env.TOURAPI_KEY) throw new Error("missing TOURAPI_KEY in .env");
async function tour(path: string, q: Record<string, string>) {
  const u = new URL("https://apis.data.go.kr/B551011/KorService2/" + path);
  u.searchParams.set("serviceKey", env.TOURAPI_KEY);
  for (const [k, v] of Object.entries({ _type: "json", MobileOS: "ETC", MobileApp: "HotelResearch", ...q })) u.searchParams.set(k, v);
  const r = await fetch(u);
  if (!r.ok) throw new Error(`tourapi ${path} ${r.status}`);
  return (await r.json()).response;
}
let calls = 0;
for (const region of ["50", "11"]) {
  const list = await tour("searchStay2", { lDongRegnCd: region, numOfRows: "7" }); calls++;
  for (const it of list.body.items?.item ?? []) {
    if (calls >= 15) break;
    const d = await tour("detailCommon2", { contentId: it.contentid }); calls++;
    const item = d.body.items?.item?.[0];
    if (item?.homepage) {
      const s = JSON.stringify({ "kr:region": region, detailCommon2: d }, null, 2).replaceAll(env.TOURAPI_KEY, "<redacted>");
      await Deno.writeTextFile("tests/fixtures/tourapi_detail_homepage.json", s + "\n");
      console.log("saved after", calls, "calls; homepage =", item.homepage); Deno.exit(0);
    }
  }
}
console.log("none found in", calls, "calls"); Deno.exit(1);
