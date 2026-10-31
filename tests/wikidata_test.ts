import { assertEquals } from "@std/assert";
import { wikidataLookup } from "../supabase/functions/_shared/wikidata.ts";

// 실제 SPARQL JSON 응답 모양. tests/fixtures/wikidata_asaba.json 은 항목 속성 덤프(호텔 아님)라 쓰지 않는다.
const b = (item: string, o: Record<string, string> = {}) => ({
  item: { type: "uri", value: `http://www.wikidata.org/entity/${item}` },
  ...Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { type: "literal", value: v }])),
});
const fake = (bindings: unknown[], seen?: { url?: string; ua?: string }) =>
  (u: string | URL | Request, init?: RequestInit) => {
    if (seen) {
      seen.url = String(u);
      seen.ua = new Headers(init?.headers).get("user-agent") ?? "";
    }
    return Promise.resolve(new Response(JSON.stringify({ results: { bindings } })));
  };

Deno.test("1 item -> fields", async () => {
  const seen: { url?: string; ua?: string } = {};
  const r = await wikidataLookup(
    "浅羽旅館",
    undefined,
    undefined,
    fake([b("Q1", { homepage: "https://asaba.example", en: "Asaba", ja: "浅羽旅館", coord: "Point(137.9 34.7)" })], seen),
  );
  assertEquals(r, { homepage: "https://asaba.example", name_en: "Asaba", name_ja: "浅羽旅館", lng: 137.9, lat: 34.7 });
  assertEquals(seen.ua, "HotelResearch/0.1 (https://github.com/nyaosu072)");
  assertEquals(new URL(seen.url!).origin, "https://query.wikidata.org");
});

Deno.test("same item in several rows is not ambiguous", async () => {
  const r = await wikidataLookup("x", undefined, undefined, fake([b("Q1", { en: "X" }), b("Q1", { homepage: "https://x.example" })]));
  assertEquals(r, { homepage: "https://x.example", name_en: "X" });
});

Deno.test("2 distinct items -> ambiguous", async () => {
  assertEquals(await wikidataLookup("x", undefined, undefined, fake([b("Q1"), b("Q2")])), "ambiguous");
});

Deno.test("0 items -> null", async () => {
  assertEquals(await wikidataLookup("x", undefined, undefined, fake([])), null);
});

Deno.test("coords restrict query to 1km", async () => {
  const seen: { url?: string } = {};
  await wikidataLookup("x", 35.6, 139.7, fake([], seen));
  const q = new URL(seen.url!).searchParams.get("query")!;
  assertEquals(q.includes("wikibase:around") && q.includes("1"), true);
});
