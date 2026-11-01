import { assertEquals } from "@std/assert";
import { plan } from "../scripts/apply-verified.ts";

const h = { country: "JP", source: "award", external_id: "award:jp:x", region_code: "jp:shizuoka", manual_fields: [], address: "静岡県伊豆の国市", name_ja: "x", homepage: null } as never;

Deno.test("plan: address change recomputes region, name change moves external_id", () => {
  const p = plan({ ...(h as object), address: "岩手県滝沢市" } as never, { hotel_id: "1", address: "静岡県伊豆市", name_ja: "A B", homepage: "https://a.jp/", source_url: "u" });
  assertEquals(p.address, "静岡県伊豆市");
  assertEquals(p.region_code, undefined); // 이미 jp:shizuoka
  assertEquals(p.external_id, "award:jp:ab");
  assertEquals(p.homepage, "https://a.jp/");
});
Deno.test("plan: respects manual_fields, finer region, non-http homepage", () => {
  const m = { ...(h as object), manual_fields: ["address", "name_ja"], region_code: "jp:shizuoka:izu" } as never;
  assertEquals(plan(m, { hotel_id: "1", address: "x", name_ja: "y", homepage: "ftp://a", source_url: "u" }), {});
  const f = { ...(h as object), region_code: "jp:shizuoka:izu" } as never;
  assertEquals(plan(f, { hotel_id: "1", address: "静岡県熱海市", source_url: "u" }), { address: "静岡県熱海市" });
});
