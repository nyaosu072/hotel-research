import { assertEquals } from "@std/assert";
import { pickByName } from "../scripts/fill-images-api.ts";

Deno.test("pickByName", () => {
  const c = (name: string, img = `https://img/${name}.jpg`) => ({ name, img });
  assertEquals(pickByName(["강라화단"], [c("강라화단")]), "https://img/강라화단.jpg");
  assertEquals(pickByName(["ザ・リッツ・カールトン京都"], [c("ザ・リッツ・カールトン京都"), c("ザ・リッツ・カールトン大阪")]), "https://img/ザ・リッツ・カールトン京都.jpg");
  assertEquals(pickByName(["신라호텔"], [c("서울신라호텔")]), "https://img/서울신라호텔.jpg");
  assertEquals(pickByName(["호텔"], [c("A호텔"), c("B호텔")]), null); // 포함 후보 2개 → 넣지 않음
  assertEquals(pickByName(["파크하얏트 서울"], [c("롯데호텔")]), null);
  assertEquals(pickByName(["X"], [c("X", "")]), null); // 사진 없는 결과
});
