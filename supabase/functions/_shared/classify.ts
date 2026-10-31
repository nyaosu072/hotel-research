import type { HotelType } from "./types.ts";

// `宿`는 직전 글자가 `新`이면(新宿) 제외
const RYOKAN = /旅館|ryokan|(?<!新)宿/;
const RESORT = /リゾート|resort/;

export function classifyType(name: string): HotelType {
  const s = name.normalize("NFKC").toLowerCase();
  if (RYOKAN.test(s)) return "ryokan";
  if (RESORT.test(s)) return "resort";
  return "hotel";
}
