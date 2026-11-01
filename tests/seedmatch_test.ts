import { assertEquals } from "@std/assert";
import { matchWithRegion } from "../supabase/functions/_shared/seedmatch.ts";
import type { HotelRow } from "../supabase/functions/_shared/types.ts";

const rows = [
  { id: "a", name_en: "Hilton Tokyo", region_code: "jp:tokyo" },
  { id: "b", name_en: "Hakone Inn", region_code: "jp:kanagawa:hakone" },
] as HotelRow[];

Deno.test("matchWithRegion", () => {
  assertEquals(matchWithRegion({ name_en: "Hilton Tokyo", region_code: "jp:tokyo" }, rows).match?.id, "a");
  assertEquals(matchWithRegion({ name_en: "Hilton Tokyo", region_code: "jp:kanagawa" }, rows), { match: null, ambiguous: true });
  assertEquals(matchWithRegion({ name_en: "Hakone Inn", region_code: "jp:kanagawa" }, rows).match?.id, "b");
  assertEquals(matchWithRegion({ name_en: "Hilton Tokyo", region_code: null }, rows).match?.id, "a");
});
