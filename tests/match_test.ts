import { assertEquals } from "@std/assert";
import { matchHotel, normalizeName } from "../supabase/functions/_shared/match.ts";
import type { HotelRow } from "../supabase/functions/_shared/types.ts";

const rows = [
  { id: "a", name_ja: "パレスホテル東京", name_en: "Palace Hotel Tokyo", lat: 35.6847, lng: 139.7613 },
  { id: "b", name_ja: "ホテル東京", name_en: "Hotel Tokyo", lat: 35.70, lng: 139.70 },
] as HotelRow[];

Deno.test("normalizeName", () => {
  assertEquals(normalizeName("Ｐａｌａｃｅ Hotel-Tokyo!"), "palacehoteltokyo");
});
Deno.test("matchHotel: exact en/ja", () => {
  assertEquals(matchHotel({ name_en: "PALACE HOTEL TOKYO" }, rows).match?.id, "a");
  assertEquals(matchHotel({ name_ja: "パレスホテル東京" }, rows).match?.id, "a");
});
Deno.test("matchHotel: ambiguous and none", () => {
  assertEquals(matchHotel({ name_en: "Tokyo" }, rows), { match: null, ambiguous: true });
  assertEquals(matchHotel({ name_en: "Aman Tokyo" }, rows), { match: null, ambiguous: false });
});
Deno.test("matchHotel: single containment needs coords within 300m", () => {
  const one = [rows[0]];
  assertEquals(matchHotel({ name_en: "Palace Hotel Tokyo Annex", lat: 35.6848, lng: 139.7614 }, one).match?.id, "a");
  assertEquals(matchHotel({ name_en: "Palace Hotel Tokyo Annex" }, one), { match: null, ambiguous: true });
  assertEquals(matchHotel({ name_en: "Palace Hotel Tokyo Annex", lat: 35.7, lng: 139.8 }, one), { match: null, ambiguous: true });
});
