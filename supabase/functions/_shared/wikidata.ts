export interface WikidataInfo {
  homepage?: string;
  name_en?: string;
  name_ja?: string;
  name_ko?: string;
  lat?: number;
  lng?: number;
}

const UA = "HotelResearch/0.1 (https://github.com/nyaosu072)";
// hotel, ryokan, resort hotel (QID는 wbsearchentities로 확인; P31/P279*라 하위 분류도 포함)
const CLASSES = "wd:Q27686 wd:Q562930 wd:Q2880255";

function buildQuery(name: string, lat?: number, lng?: number): string {
  const title = name.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
  const forms = [...new Set([name, name.toLowerCase(), name.toUpperCase(), title])];
  const labels = forms.flatMap((f) => ["ja", "en", "ko"].map((l) => `${JSON.stringify(f)}@${l}`)).join(" ");
  const geo = lat != null && lng != null
    ? `SERVICE wikibase:around { ?item wdt:P625 ?coord . bd:serviceParam wikibase:center "Point(${lng} ${lat})"^^geo:wktLiteral . bd:serviceParam wikibase:radius "1" . }`
    : "OPTIONAL { ?item wdt:P625 ?coord }";
  return `SELECT ?item ?homepage ?coord ?ja ?en ?ko WHERE {
  VALUES ?l { ${labels} } ?item rdfs:label ?l .
  VALUES ?c { ${CLASSES} } ?item wdt:P31/wdt:P279* ?c .
  ${geo}
  OPTIONAL { ?item wdt:P856 ?homepage }
  OPTIONAL { ?item rdfs:label ?ja FILTER(lang(?ja) = "ja") }
  OPTIONAL { ?item rdfs:label ?en FILTER(lang(?en) = "en") }
  OPTIONAL { ?item rdfs:label ?ko FILTER(lang(?ko) = "ko") }
}`;
}

export async function wikidataLookup(
  name: string,
  lat?: number,
  lng?: number,
  fetchFn: typeof fetch = fetch,
): Promise<WikidataInfo | "ambiguous" | null> {
  const url = "https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(buildQuery(name, lat, lng));
  const res = await fetchFn(url, { headers: { "User-Agent": UA, Accept: "application/sparql-results+json" } });
  if (!res.ok) throw new Error(`wikidata ${res.status}`);
  // deno-lint-ignore no-explicit-any
  const rows: any[] = (await res.json()).results.bindings;
  if (new Set(rows.map((r) => r.item.value)).size === 0) return null;
  if (new Set(rows.map((r) => r.item.value)).size > 1) return "ambiguous";
  const v = (k: string): string | undefined => rows.find((r) => r[k])?.[k].value;
  const m = v("coord")?.match(/Point\(([-\d.eE]+) ([-\d.eE]+)\)/);
  const out: WikidataInfo = {
    homepage: v("homepage"),
    name_en: v("en"),
    name_ja: v("ja"),
    name_ko: v("ko"),
    lng: m ? Number(m[1]) : undefined,
    lat: m ? Number(m[2]) : undefined,
  };
  return Object.fromEntries(Object.entries(out).filter(([, x]) => x !== undefined));
}
