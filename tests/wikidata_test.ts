import { assertEquals } from "@std/assert";
import {
  buildBulkQuery,
  decideWikidata,
  downloadCountry,
  fetchSparql,
  inCountry,
  parseBulk,
} from "../supabase/functions/_shared/wikidata.ts";
import type { HotelRow } from "../supabase/functions/_shared/types.ts";

const b = (item: string, o: Record<string, string> = {}) => ({
  item: { type: "uri", value: `http://www.wikidata.org/entity/${item}` },
  ...Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { type: "literal", value: v }])),
});
const resp = (bindings: unknown[]) => new Response(JSON.stringify({ results: { bindings } }));
const hotel = (o: Partial<HotelRow>) => ({ id: "h", country: "JP", manual_fields: [], ...o }) as unknown as HotelRow;
const noSleep = () => Promise.resolve();

Deno.test("buildBulkQuery: country, classes, paging", () => {
  const jp = buildBulkQuery("JP", 4000, 2000);
  assertEquals(jp.includes("wdt:P17 wd:Q17"), true);
  assertEquals(buildBulkQuery("KR", 0, 10).includes("wdt:P17 wd:Q884"), true);
  for (const q of ["Q27686", "Q562930", "Q2880255", "LIMIT 2000 OFFSET 4000"]) assertEquals(jp.includes(q), true);
});

Deno.test("parseBulk merges rows of one item", () => {
  const r = parseBulk({
    results: {
      bindings: [
        b("Q1", { en: "Asaba", coord: "Point(137.9 34.7)" }),
        b("Q1", { ja: "浅羽", homepage: "https://a.example" }),
        b("Q2", { en: 'Other "Q" \\ Hotel' }),
      ],
    },
  });
  assertEquals(r, [
    { qid: "Q1", name_en: "Asaba", name_ja: "浅羽", homepage: "https://a.example", lng: 137.9, lat: 34.7 },
    { qid: "Q2", name_en: 'Other "Q" \\ Hotel' },
  ]);
});

Deno.test("decideWikidata: exact name fills only blanks, not manual_fields", () => {
  const items = [{ qid: "Q1", name_en: "Palace Hotel Tokyo", name_ja: "パレスホテル東京", homepage: "https://p.example", lat: 35.68, lng: 139.76 }];
  const h = hotel({ name_en: "PALACE HOTEL TOKYO", name_ja: "パレスホテル東京", homepage: null, lat: null, lng: null, manual_fields: ["homepage"] });
  assertEquals(decideWikidata(h, items), { kind: "fill", patch: { lat: 35.68, lng: 139.76 } });
  const h2 = hotel({ name_en: "Palace Hotel Tokyo", homepage: "https://mine.example", lat: 1, lng: 2 });
  assertEquals(decideWikidata(h2, items), { kind: "fill", patch: { name_ja: "パレスホテル東京" } });
});

Deno.test("decideWikidata: none, ambiguous, containment needs 300m", () => {
  const items = [{ qid: "Q1", name_en: "Hotel Tokyo", lat: 35.7, lng: 139.7 }, { qid: "Q2", name_en: "Hotel Tokyo" }];
  assertEquals(decideWikidata(hotel({ name_en: "Aman" }), items), { kind: "none" });
  assertEquals(decideWikidata(hotel({ name_en: "Hotel Tokyo" }), items), { kind: "ambiguous" });
  const one = [{ qid: "Q1", name_en: "Grand Hotel Tokyo", lat: 35.7, lng: 139.7 }];
  assertEquals(decideWikidata(hotel({ name_en: "Hotel Tokyo" }), one), { kind: "ambiguous" }); // 호텔 좌표 없음
  assertEquals(decideWikidata(hotel({ name_en: "Hotel Tokyo", lat: 35.7001, lng: 139.7001 }), one).kind, "fill");
  assertEquals(decideWikidata(hotel({ name_en: "Hotel Tokyo", lat: 35.8, lng: 139.7 }), one), { kind: "ambiguous" });
});

Deno.test("decideWikidata: out-of-country coords are not filled", () => {
  const items = [{ qid: "Q1", name_en: "Hilton", lat: 51.5, lng: -0.1, homepage: "https://h.example" }];
  assertEquals(decideWikidata(hotel({ name_en: "Hilton" }), items), { kind: "fill", patch: { homepage: "https://h.example" } });
  assertEquals(inCountry("JP", 35, 139), true);
  assertEquals(inCountry("KR", 35, 139), false);
});

Deno.test("fetchSparql retries 429; downloadCountry pages by item count", async () => {
  let n = 0;
  const f = (() => Promise.resolve(++n === 1 ? new Response("", { status: 429 }) : resp([b("Q1", { en: "A" })]))) as typeof fetch;
  assertEquals(parseBulk(await fetchSparql("q", f, noSleep)).length, 1);
  assertEquals(n, 2);
  const pages = [[b("Q1"), b("Q2")], [b("Q3")]];
  const f2 = (() => Promise.resolve(resp(pages.shift()!))) as typeof fetch;
  assertEquals((await downloadCountry("JP", f2, 2, noSleep)).map((i) => i.qid), ["Q1", "Q2", "Q3"]);
});
