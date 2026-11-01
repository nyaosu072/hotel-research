import { assertEquals } from "@std/assert";
import { addressVariants } from "../js/geocode.js";

Deno.test("addressVariants: JP address loses prefecture/county prefix and house number", () => {
  assertEquals(addressVariants("神奈川県足柄下郡箱根町強羅1300"), ["神奈川県足柄下郡箱根町強羅1300", "箱根町強羅1300", "箱根町強羅"]);
  assertEquals(addressVariants("서울특별시 중구 소공로 106")[0], "서울특별시 중구 소공로 106");
  assertEquals(addressVariants("  "), []);
});
