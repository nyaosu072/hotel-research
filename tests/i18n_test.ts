import { assert, assertEquals } from "@std/assert";
import { getLang, loadDicts, setLang, t } from "../js/i18n.js";

const ja = JSON.parse(await Deno.readTextFile("i18n/ja.json"));
const en = JSON.parse(await Deno.readTextFile("i18n/en.json"));

Deno.test("ja/en have identical keys", () => {
  assertEquals(Object.keys(ja).sort(), Object.keys(en).sort());
});

Deno.test("status labels", () => {
  for (const s of ["candidate", "contacted", "confirmed", "done", "excluded"]) assert(ja[`status.${s}`] && en[`status.${s}`]);
  assertEquals(ja["status.contacted"], "連絡済");
  assertEquals(en["status.contacted"], "Contacted");
});

Deno.test("t(): default ja, switch, vars, missing key", () => {
  loadDicts(ja, en);
  setLang("ja");
  assertEquals(getLang(), "ja");
  assertEquals(t("status.confirmed"), "取材確定");
  assertEquals(t("no.such.key"), "no.such.key");
  assertEquals(t("banner.refreshed", { n: 3 }), "3件を更新しました");
  setLang("en");
  assertEquals(t("status.confirmed"), "Confirmed");
  assertEquals(t("who.member", { id: "ab12" }), "Member ab12");
  setLang("ja");
});

Deno.test("every literal t('key') used in js/ exists in ja.json", async () => {
  const missing: string[] = [];
  for await (const f of Deno.readDir("js")) {
    if (!f.name.endsWith(".js")) continue;
    const src = await Deno.readTextFile(`js/${f.name}`);
    for (const m of src.matchAll(/\bt\(\s*["']([\w.]+)["']/g)) if (!(m[1] in ja)) missing.push(`${f.name}: ${m[1]}`);
  }
  assertEquals(missing, []);
});

Deno.test("dynamic key families exist", () => {
  const need = [
    ...["list", "map"].map((k) => `tab.${k}`),
    ...["hotel", "ryokan", "resort"].map((k) => `type.${k}`),
    ...["michelin", "forbes", "kr_official", "brand", "membership", "discovery"].map((k) => `filter.badge.${k}`),
    ...["badge", "rating", "price"].map((k) => `sort.${k}`),
    ...["name", "department", "email", "phone", "memo"].map((k) => `contact.${k}`),
    ...["hotel", "region", "status", "assignee", "main_email", "contact_email", "last"].map((k) => `research.col.${k}`),
    "bar.l1.JP", "bar.l1.KR", "bar.l2", "bar.l3",
  ];
  assertEquals(need.filter((k) => !(k in ja)), []);
});
