import { assertEquals } from "@std/assert";
import { classifyType } from "../supabase/functions/_shared/classify.ts";

Deno.test("classifyType", () => {
  assertEquals(classifyType("強羅花壇"), "hotel");
  assertEquals(classifyType("あさば旅館"), "ryokan");
  assertEquals(classifyType("湯宿 さか本"), "ryokan");
  assertEquals(classifyType("ハレクラニ沖縄 リゾート"), "resort");
  assertEquals(classifyType("Amanemu Resort"), "resort");
  assertEquals(classifyType("ＲＹＯＫＡＮ ｘ"), "ryokan");
  assertEquals(classifyType("京王プラザホテル新宿"), "hotel");
  assertEquals(classifyType("旅館リゾート"), "ryokan");
});
