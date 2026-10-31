import { classifyType } from "./classify.ts";
import type { HotelRow } from "./types.ts";

// deno-lint-ignore no-explicit-any
type Any = any;

// h = hotels[].hotel[0].hotelBasicInfo (datumType=1 → WGS84 도)
export function rakutenToRow(h: unknown, regionCode: string): Partial<HotelRow> {
  const b = h as Any;
  return {
    country: "JP",
    region_code: regionCode,
    source: "rakuten",
    external_id: String(b.hotelNo),
    name_ja: b.hotelName,
    type: classifyType(b.hotelName ?? ""),
    lat: b.latitude,
    lng: b.longitude,
    address: `${b.address1 ?? ""}${b.address2 ?? ""}`.trim() || null,
    main_phone: b.telephoneNo || null,
    image_url: b.hotelImageUrl || null,
    min_charge: b.hotelMinCharge,
    currency: "JPY",
    price_source: "rakuten",
    review_avg: b.reviewAverage,
    review_count: b.reviewCount,
    rakuten_url: b.hotelInformationUrl,
  };
}

// kor/jpn/eng = response.body.items.item[] 의 항목. Kor가 주 항목.
export function tourapiToRow(
  kor: unknown,
  jpn: unknown | null,
  eng: unknown | null,
  regionCode: string,
): Partial<HotelRow> {
  const k = kor as Any;
  const row: Partial<HotelRow> = {
    country: "KR",
    region_code: regionCode,
    source: "tourapi",
    external_id: String(k.contentid),
    name_ko: k.title,
    lat: Number(k.mapy),
    lng: Number(k.mapx),
    address: `${k.addr1 ?? ""} ${k.addr2 ?? ""}`.trim() || null,
    image_url: k.firstimage || null,
    currency: "KRW",
  };
  if (jpn) row.name_ja = (jpn as Any).title;
  if (eng) row.name_en = (eng as Any).title;
  return row;
}

// detailCommon2.homepage: HTML 앵커 또는 평문 URL 또는 빈 값
export function parseTourHomepage(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  const href = s.match(/href\s*=\s*["']([^"']+)["']/i);
  if (href) return href[1].trim();
  return /^https?:\/\/\S+$/i.test(s) ? s : null;
}
