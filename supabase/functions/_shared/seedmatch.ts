import { matchHotel } from "./match.ts";
import type { HotelRow } from "./types.ts";

const pref = (c: string | null | undefined) => c?.split(":").slice(0, 2).join(":") ?? null;

// matchHotel + 지역 가드: 둘 다 region_code가 있고 시도 단위가 다르면 매칭하지 않고 ambiguous.
export function matchWithRegion(
  row: Partial<HotelRow>,
  candidates: HotelRow[],
): { match: HotelRow | null; ambiguous: boolean } {
  const m = matchHotel(row, candidates);
  if (m.match) {
    const a = pref(row.region_code), b = pref(m.match.region_code);
    if (a && b && a !== b) return { match: null, ambiguous: true };
  }
  return m;
}
