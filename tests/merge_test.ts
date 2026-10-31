import { assertEquals } from "@std/assert";
import { fillEmpty, mergeHotel } from "../supabase/functions/_shared/merge.ts";
import {
  parseTourHomepage,
  rakutenToRow,
  tourapiToRow,
} from "../supabase/functions/_shared/mappers.ts";
import type { HotelRow } from "../supabase/functions/_shared/types.ts";

const ex = { homepage: "https://a.jp", main_email: null, manual_fields: ["homepage"] } as HotelRow;

Deno.test("merge", () => {
  assertEquals(mergeHotel(ex, { homepage: "https://rakuten.jp/x", min_charge: 60000 }), { min_charge: 60000 });
  assertEquals(fillEmpty({ ...ex, name_en: null } as HotelRow, { name_en: "Asaba", homepage: "https://w.org" }), { name_en: "Asaba" });
  assertEquals(mergeHotel(null, { name_ja: "X" }), { name_ja: "X" });
});

const fx = async (f: string) => JSON.parse(await Deno.readTextFile(`tests/fixtures/${f}`));

Deno.test("rakutenToRow", async () => {
  const j = await fx("rakuten_simple.json");
  const b = Object.values(j)[0] as any;
  const info = b.hotels[0].hotel[0].hotelBasicInfo;
  const r = rakutenToRow(info, "jp:tokyo:tokyo:A");
  assertEquals(r.name_ja, info.hotelName);
  assertEquals(r.lat, info.latitude);
  assertEquals(r.lng, info.longitude);
  assertEquals(r.currency, "JPY");
  assertEquals(r.source, "rakuten");
  assertEquals(r.external_id, String(info.hotelNo));
  assertEquals(r.min_charge, info.hotelMinCharge);
  assertEquals(r.rakuten_url, info.hotelInformationUrl);
  assertEquals(r.main_phone, info.telephoneNo);
  assertEquals(r.region_code, "jp:tokyo:tokyo:A");
  assertEquals("homepage" in r, false);
});

Deno.test("tourapiToRow", async () => {
  const item = (f: string) => (Object.values(JSON.parse(Deno.readTextFileSync(`tests/fixtures/${f}`)))[0] as any).body.items.item[0];
  const kor = item("tourapi_kor_stay.json");
  const jpn = item("tourapi_jpn_stay.json");
  const eng = item("tourapi_eng_stay.json");
  const r = tourapiToRow(kor, jpn, eng, "kr:11");
  assertEquals(r.name_ko, kor.title);
  assertEquals(r.name_ja, jpn.title);
  assertEquals(r.name_en, eng.title);
  assertEquals(r.lat, Number(kor.mapy));
  assertEquals(r.lng, Number(kor.mapx));
  assertEquals(r.currency, "KRW");
  assertEquals(r.source, "tourapi");
  assertEquals(r.external_id, kor.contentid);
  assertEquals(r.country, "KR");
  const r2 = tourapiToRow(kor, null, null, "kr:11");
  assertEquals(r2.name_ja, undefined);
});

Deno.test("parseTourHomepage", async () => {
  const d = await fx("tourapi_detail_homepage.json");
  const hp = d.detailCommon2.body.items.item[0].homepage;
  assertEquals(parseTourHomepage(hp), hp.trim());
  assertEquals(parseTourHomepage('<a href="https://x.co.kr" target="_blank" title="t">x</a>'), "https://x.co.kr");
  assertEquals(parseTourHomepage(""), null);
  assertEquals(parseTourHomepage("   "), null);
  assertEquals(parseTourHomepage(null), null);
});
