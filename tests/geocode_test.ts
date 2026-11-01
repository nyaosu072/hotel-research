import { assertEquals } from "@std/assert";
import { chooseGeocode } from "../scripts/geocode-hotels.ts";

Deno.test("chooseGeocode", () => {
  const p = (name: string, lat = 35.25, lng = 139.05, cls = "tourism") => ({ name, lat, lng, cls });
  assertEquals(chooseGeocode(["強羅花壇"], "JP", [p("強羅花壇")]), { lat: 35.25, lng: 139.05 });
  assertEquals(chooseGeocode(["強羅花壇"], "JP", [p("箱根町", 35.23, 139.1, "boundary")]), null); // 마을 중심점은 안 넣음
  assertEquals(chooseGeocode(["界 箱根"], "JP", [p("界 箱根"), p("界 箱根", 35.3, 139.2)]), null); // 같은 이름 다른 위치 2곳
  assertEquals(chooseGeocode(["파크 하얏트 서울"], "KR", [p("파크하얏트서울", 37.508, 127.06)]), { lat: 37.508, lng: 127.06 });
  assertEquals(chooseGeocode(["Signiel Seoul"], "KR", [p("Signiel Seoul", 35.2, 139.0)]), null); // 국가 범위 밖
  assertEquals(chooseGeocode(["あさば"], "JP", [p("あさば旅館")]), { lat: 35.25, lng: 139.05 }); // 포함 관계 1곳
});
