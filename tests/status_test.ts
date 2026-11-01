import { assert, assertEquals } from "@std/assert";
import { canSetStatus, otaLinks } from "../js/status.js";

Deno.test("canSetStatus mirrors the homepage rule", () => {
  assertEquals(canSetStatus({ homepage: null }, "contacted"), false);
  assertEquals(canSetStatus({ homepage: "" }, "done"), false);
  assertEquals(canSetStatus({ homepage: "  " }, "confirmed"), false);
  assertEquals(canSetStatus({ homepage: null }, "excluded"), true);
  assertEquals(canSetStatus({ homepage: null }, "candidate"), true);
  assertEquals(canSetStatus({ homepage: "https://a.jp" }, "confirmed"), true);
});

Deno.test("otaLinks", () => {
  const l = otaLinks({ name_en: "Palace Hotel Tokyo", name_ja: "パレスホテル東京" });
  assert(l.booking.includes(encodeURIComponent("Palace Hotel Tokyo")));
  assert(l.gmaps.startsWith("https://www.google.com/maps/search/?api=1&query="));
  assert(otaLinks({ name_ja: "あさば" }).agoda.includes(encodeURIComponent("あさば")));
  assert(otaLinks({ name_ko: "신라호텔" }).trip.includes(encodeURIComponent("신라호텔")));
});
