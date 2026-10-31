import type { HotelRow } from "./types.ts";

export function normalizeName(s: string): string {
  return s.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

type Named = Partial<Pick<HotelRow, "name_ja" | "name_en" | "name_ko" | "lat" | "lng">>;

const names = (h: Named) =>
  [h.name_ja, h.name_en, h.name_ko].map((s) => normalizeName(s ?? "")).filter((s) => s !== "");

function meters(a: Named, b: Named): number | null {
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return null;
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 +
    Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

export function matchHotel(row: Named, candidates: HotelRow[]): { match: HotelRow | null; ambiguous: boolean } {
  const mine = names(row);
  const exact: HotelRow[] = [], near: HotelRow[] = [];
  for (const c of candidates) {
    const theirs = names(c);
    if (mine.some((a) => theirs.includes(a))) exact.push(c);
    else if (mine.some((a) => theirs.some((b) => a.includes(b) || b.includes(a)))) near.push(c);
  }
  if (exact.length === 1) return { match: exact[0], ambiguous: false };
  if (exact.length > 1 || near.length > 1) return { match: null, ambiguous: true };
  if (near.length === 1) {
    const d = meters(row, near[0]);
    return d !== null && d <= 300 ? { match: near[0], ambiguous: false } : { match: null, ambiguous: true };
  }
  return { match: null, ambiguous: false };
}
