import type { HotelRow } from "./types.ts";

// API 갱신용: 수동 수정 열은 버린다.
export function mergeHotel(existing: HotelRow | null, incoming: Partial<HotelRow>): Partial<HotelRow> {
  if (!existing) return incoming;
  const locked = new Set(existing.manual_fields ?? []);
  return Object.fromEntries(Object.entries(incoming).filter(([k]) => !locked.has(k)));
}

// Wikidata용: 비어 있고 수동 수정 아닌 열만 채운다.
export function fillEmpty(existing: HotelRow, incoming: Partial<HotelRow>): Partial<HotelRow> {
  const locked = new Set(existing.manual_fields ?? []);
  const e = existing as unknown as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(incoming).filter(([k]) => !locked.has(k) && (e[k] == null || e[k] === "")),
  );
}
