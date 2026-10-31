import { assertEquals } from "@std/assert";
import { isCandidate } from "../supabase/functions/_shared/judge.ts";

const o = { minChargeJpy: 50000 };
Deno.test("isCandidate", () => {
  assertEquals(isCandidate({ hotelNo: 1, hotelMinCharge: 50000 }, o), true);
  assertEquals(isCandidate({ hotelNo: 1, hotelMinCharge: 49999 }, o), false);
  assertEquals(isCandidate({ hotelNo: 1 }, o), false);
});
