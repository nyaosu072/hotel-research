import { assertEquals } from "@std/assert";
import { regionFromAddress as r } from "../supabase/functions/_shared/region.ts";

Deno.test("regionFromAddress", () => {
  assertEquals(r("JP", "東京都千代田区"), "jp:tokyo");
  assertEquals(r("JP", "神奈川県足柄下郡箱根町"), "jp:kanagawa");
  assertEquals(r("JP", "北海道虻田郡"), "jp:hokkaido");
  assertEquals(r("KR", "서울특별시 중구"), "kr:11");
  assertEquals(r("KR", "서울 중구"), "kr:11");
  assertEquals(r("KR", "제주 서귀포시"), "kr:50");
  assertEquals(r("KR", "강원도 평창군"), "kr:51");
  assertEquals(r("KR", "경남 거제시"), "kr:48");
  assertEquals(r("JP", "京都府京都市"), "jp:kyoto");
  assertEquals(r("JP", "大阪府大阪市"), "jp:osaka");
  assertEquals(r("JP", "沖縄県名護市"), "jp:okinawa");
  assertEquals(r("KR", "전북특별자치도 전주시"), "kr:52");
  assertEquals(r("KR", "강원특별자치도 평창군"), "kr:51");
  assertEquals(r("KR", "세종특별자치시 한누리대로"), "kr:36110");
  assertEquals(r("KR", "Seoul"), null);
  assertEquals(r("JP", "unknown"), null);
});
