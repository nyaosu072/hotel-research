export type HotelType = "hotel" | "resort" | "ryokan";

// DB `hotels` 열과 동일 (snake_case)
export interface HotelRow {
  id: string;
  country: "JP" | "KR";
  region_code: string | null;
  name_ja: string | null;
  name_en: string | null;
  name_ko: string | null;
  type: HotelType | null;
  lat: number | null;
  lng: number | null;
  address: string | null;
  homepage: string | null;
  main_email: string | null;
  main_phone: string | null;
  image_url: string | null;
  min_charge: number | null;
  currency: "JPY" | "KRW" | null;
  price_source: "rakuten" | "manual" | null;
  review_avg: number | null;
  review_count: number | null;
  room_count: number | null;
  rakuten_url: string | null;
  source: "rakuten" | "tourapi" | "award" | "manual";
  external_id: string | null;
  excluded: boolean;
  needs_review: boolean;
  manual_fields: string[];
  updated_by: string | null;
  updated_at: string;
}
