// 주소 → 시도(都道府県) 단위 region_code. JP: 라쿠텐 middleClassCode, KR: lDongRegnCd.
const JP = "北海道:hokkaido 青森県:aomori 岩手県:iwate 宮城県:miyagi 秋田県:akita 山形県:yamagata 福島県:fukushima 茨城県:ibaraki 栃木県:tochigi 群馬県:gunma 埼玉県:saitama 千葉県:chiba 東京都:tokyo 神奈川県:kanagawa 新潟県:niigata 富山県:toyama 石川県:ishikawa 福井県:fukui 山梨県:yamanashi 長野県:nagano 岐阜県:gifu 静岡県:shizuoka 愛知県:aichi 三重県:mie 滋賀県:shiga 京都府:kyoto 大阪府:osaka 兵庫県:hyogo 奈良県:nara 和歌山県:wakayama 鳥取県:tottori 島根県:shimane 岡山県:okayama 広島県:hiroshima 山口県:yamaguchi 徳島県:tokushima 香川県:kagawa 愛媛県:ehime 高知県:kochi 福岡県:fukuoka 佐賀県:saga 長崎県:nagasaki 熊本県:kumamoto 大分県:oita 宮崎県:miyazaki 鹿児島県:kagoshima 沖縄県:okinawa"
  .split(" ").map((s) => s.split(":"));

// ponytail: 광주·전남은 TourAPI에서 통합특별시 코드 12 하나(tourapi_area.json), 세종은 36110 그대로.
const KR: Record<string, string> = {};
for (
  const [code, names] of Object.entries({
    "11": "서울특별시 서울",
    "26": "부산광역시 부산",
    "27": "대구광역시 대구",
    "28": "인천광역시 인천",
    "12": "광주광역시 광주 전라남도 전남",
    "30": "대전광역시 대전",
    "31": "울산광역시 울산",
    "36110": "세종특별자치시 세종",
    "41": "경기도 경기",
    "43": "충청북도 충북",
    "44": "충청남도 충남",
    "47": "경상북도 경북",
    "48": "경상남도 경남",
    "50": "제주특별자치도 제주도 제주",
    "51": "강원특별자치도 강원도 강원",
    "52": "전북특별자치도 전라북도 전북",
  })
) for (const n of names.split(" ")) KR[n] = code;

export function regionFromAddress(country: "JP" | "KR", address: string): string | null {
  const a = address.normalize("NFKC").trim();
  if (country === "JP") {
    const p = JP.find(([n]) => a.startsWith(n));
    return p ? `jp:${p[1]}` : null;
  }
  const name = Object.keys(KR).sort((x, y) => y.length - x.length).find((n) => a.startsWith(n));
  return name ? `kr:${KR[name]}` : null;
}
