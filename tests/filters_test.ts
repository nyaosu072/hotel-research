import { assertEquals } from "@std/assert";
import { badgeRank, defaultFilters, filterHotels, isFiveStar, sortHotels } from "../js/filters.js";
import { badges, formatPrice, names } from "../js/hotel.js";
import { isFetchable, regionFilter } from "../js/regions.js";

const krNoPrice = { id: "k", country: "KR", min_charge: null, currency: "KRW", awards: [{ kind: "kr_official", grade: "5" }] };
const jpCheap = { id: "j1", country: "JP", min_charge: 40000, currency: "JPY", awards: [] };
const jpLux = { id: "j2", country: "JP", min_charge: 90000, currency: "JPY", awards: [{ kind: "michelin", grade: "3" }] };
const all = [krNoPrice, jpCheap, jpLux];

Deno.test("price filter keeps unknown-price hotels when included", () => {
  assertEquals(filterHotels(all, { ...defaultFilters(), priceMin: 50000 }).map((h) => h.id), ["k", "j2"]);
  assertEquals(filterHotels(all, { ...defaultFilters(), priceMin: 50000, includeUnknownPrice: false }).map((h) => h.id), ["j2"]);
});

Deno.test("five-star class", () => {
  assertEquals(filterHotels(all, { ...defaultFilters(), grade: "five" }).map((h) => h.id), ["k", "j2"]);
  assertEquals(isFiveStar({ awards: [{ kind: "michelin", grade: "1" }] }), false);
  assertEquals(isFiveStar({ awards: [{ kind: "forbes", grade: "5" }] }), true);
  assertEquals(isFiveStar({ awards: [{ kind: "forbes", grade: "4" }] }), false);
  assertEquals(isFiveStar({ awards: [{ kind: "michelin", grade: "2" }] }), true);
});

Deno.test("sort by badge", () => {
  assertEquals(sortHotels([jpCheap, krNoPrice, jpLux], "badge").map((h) => h.id), ["j2", "k", "j1"]);
  assertEquals(
    badgeRank({ awards: [{ kind: "membership", grade: "R&C" }] }) < badgeRank({ awards: [{ kind: "brand", grade: "界" }] }),
    true,
  );
});

Deno.test("sort by price/rating puts unknowns last; other filters", () => {
  assertEquals(sortHotels(all, "price").map((h) => h.id), ["j2", "j1", "k"]);
  const rated = [{ id: "a", review_avg: 4.1, awards: [] }, { id: "b", review_avg: null, awards: [] }, { id: "c", review_avg: 4.6, awards: [] }];
  assertEquals(sortHotels(rated, "rating").map((h) => h.id), ["c", "a", "b"]);
  assertEquals(filterHotels(rated, { ...defaultFilters(), ratingMin: 4.5 }).map((h) => h.id), ["c"]);
  assertEquals(filterHotels(all, { ...defaultFilters(), badges: ["discovery"] }).map((h) => h.id), ["j1"]);
  assertEquals(filterHotels(all, { ...defaultFilters(), statuses: ["done"] }), []);
  assertEquals(filterHotels(all, { ...defaultFilters(), statuses: ["candidate"] }).length, 3);
});

Deno.test("display helpers", () => {
  assertEquals(formatPrice(120000, "JPY"), "¥120,000");
  assertEquals(formatPrice(500000, "KRW"), "₩500,000");
  assertEquals(formatPrice(null, "JPY"), null);
  assertEquals(badges({ awards: [] }), [{ type: "find" }]);
  assertEquals(
    badges({ awards: [{ kind: "michelin", grade: "3" }, { kind: "membership", grade: "Relais & Châteaux" }] }),
    [{ type: "key", n: 3 }, { type: "member", text: "R&C" }],
  );
  assertEquals(names({ country: "JP", name_ja: "強羅花壇", name_en: "Gora Kadan" }, "en"), { main: "Gora Kadan", sub: "強羅花壇" });
});

Deno.test("R15 region filter + fetchable", () => {
  assertEquals(
    regionFilter("jp:kanagawa:hakone"),
    "region_code.eq.jp:kanagawa:hakone,region_code.like.jp:kanagawa:hakone:*,region_code.in.(jp:kanagawa)",
  );
  assertEquals(regionFilter("jp:tokyo"), "region_code.eq.jp:tokyo,region_code.like.jp:tokyo:*");
  assertEquals(regionFilter("jp:tokyo:tokyo:A").endsWith("region_code.in.(jp:tokyo,jp:tokyo:tokyo)"), true);
  assertEquals(isFetchable("jp:kanagawa", []), false);
  assertEquals(isFetchable("jp:kanagawa:hakone", []), true);
  assertEquals(isFetchable("kr:50:130", []), true);
  assertEquals(isFetchable("kr:36110", [{ code: "kr:36110" }]), true);
  assertEquals(isFetchable("kr:11", [{ code: "kr:11", children: [{ code: "kr:11:110" }] }]), false);
  let threw = false;
  try {
    regionFilter("jp:x,region_code.neq.1");
  } catch {
    threw = true;
  }
  assertEquals(threw, true);
});

Deno.test("isFetchable: only leaf areas", () => {
  const jp = JSON.parse(Deno.readTextFileSync("data/regions_jp.json")), kr = JSON.parse(Deno.readTextFileSync("data/regions_kr.json"));
  assertEquals(isFetchable("jp:tokyo:tokyo", jp), false); // has detail children
  assertEquals(isFetchable("jp:tokyo:tokyo:A", jp), true);
  assertEquals(isFetchable("jp:kanagawa:hakone", jp), true);
  assertEquals(isFetchable("jp:kanagawa", jp), false);
  assertEquals(isFetchable("kr:11", kr), false);
  assertEquals(isFetchable("kr:11:110", kr), true);
});
