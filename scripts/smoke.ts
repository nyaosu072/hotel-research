// deno run -A scripts/smoke.ts : headless check of what the frontend does against the real DB (TEST_USER login).
// Prints counts / OK lines only. Creates one disposable hotel and deletes it at the end.
import { load } from "@std/dotenv";
import { createClient } from "@supabase/supabase-js";
import { regionFilter } from "../js/regions.js";

const env = { ...(await load({ export: false })), ...Deno.env.toObject() };
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
const { error: le } = await sb.auth.signInWithPassword({ email: env.TEST_USER_EMAIL, password: env.TEST_USER_PASSWORD });
if (le) throw new Error("login failed");

let failed = 0;
const check = (name: string, ok: boolean, info = "") => {
  console.log(`${ok ? "OK  " : "FAIL"} ${name}${info ? ` (${info})` : ""}`);
  if (!ok) failed++;
};

// 1. R15 list query for Hakone
const SEL = "jp:kanagawa:hakone";
const { data: rows, error: qe } = await sb.from("hotels").select("id, region_code, source, awards(kind), research(status)").or(regionFilter(SEL)).range(0, 999);
if (qe) throw new Error("query failed: " + qe.message);
const own = rows!.filter((r) => r.region_code === SEL).length;
const parent = rows!.filter((r) => r.region_code === "jp:kanagawa").length;
check("R15 hakone rows >= 17 own", own >= 17, `own=${own} prefecture-level=${parent} total=${rows!.length}`);
check("R15 includes prefecture-level award rows", parent > 0 && rows!.some((r) => (r.awards as unknown[]).length > 0));
const { data: pref } = await sb.from("hotels").select("id").or(regionFilter("jp:kanagawa")).range(0, 999);
check("prefecture-only selection returns rows", (pref?.length ?? 0) >= rows!.length - 0);

// 2. blank-homepage award hotel: contacted must be refused with homepage_required
const { data: blank } = await sb.from("hotels").select("id").eq("source", "award").or("homepage.is.null,homepage.eq.").limit(1);
if (blank?.length) {
  const { error } = await sb.rpc("set_research_status", { p_hotel_id: blank[0].id, p_status: "contacted" });
  check("award hotel without homepage: contacted -> homepage_required", /homepage_required/.test(error?.message ?? ""));
  const { data: r } = await sb.from("research").select("status").eq("hotel_id", blank[0].id);
  check("no research row created by the refused change", !r?.length || r[0].status !== "contacted");
} else console.log("SKIP no blank-homepage award hotel found");

// 3. disposable hotel: manual add, status rule, manual_fields, contacts, notes
const ext = `smoke-${crypto.randomUUID()}`;
const { data: h, error: ie } = await sb.from("hotels").insert({
  country: "JP", region_code: "jp:test-smoke", name_ja: "スモークテスト", source: "manual", external_id: ext,
  manual_fields: ["name_ja"],
}).select("*").single();
if (ie || !h) throw new Error("insert failed: " + ie?.message);
try {
  const before = await sb.rpc("set_research_status", { p_hotel_id: h.id, p_status: "contacted" });
  check("manual hotel without homepage: contacted refused", /homepage_required/.test(before.error?.message ?? ""));
  const ex = await sb.rpc("set_research_status", { p_hotel_id: h.id, p_status: "excluded" });
  check("excluded allowed without homepage", !ex.error && ex.data?.status === "excluded");

  // same update as the detail panel: column + de-duplicated manual_fields
  const manual = [...new Set([...(h.manual_fields ?? []), "homepage", "homepage"])];
  const up = await sb.from("hotels").update({ homepage: "https://example.com/", manual_fields: manual }).eq("id", h.id).select("*").single();
  check("homepage saved + manual_fields appended once", !up.error && up.data.manual_fields.filter((c: string) => c === "homepage").length === 1);

  const ok = await sb.rpc("set_research_status", { p_hotel_id: h.id, p_status: "contacted" });
  const today = new Date().toISOString().slice(0, 10);
  check("contacted allowed with homepage, last_contacted_at = today", !ok.error && ok.data?.last_contacted_at?.slice(0, 10) === today);

  const clr = await sb.from("hotels").update({ homepage: null }).eq("id", h.id);
  check("clearing homepage while contacted -> homepage_required", /homepage_required/.test(clr.error?.message ?? ""));

  const as = await sb.from("research").upsert({ hotel_id: h.id, status: "contacted", assignee: "smoke" }, { onConflict: "hotel_id" }).select("*").single();
  check("assignee upsert keeps status", !as.error && as.data.status === "contacted" && as.data.assignee === "smoke");

  // I1: assignee save must not touch status (a teammate's newer status survives)
  await sb.rpc("set_research_status", { p_hotel_id: h.id, p_status: "confirmed" });
  const only = await sb.from("research").upsert({ hotel_id: h.id, assignee: "smoke2" }, { onConflict: "hotel_id" }).select("*").single();
  check("assignee-only upsert keeps confirmed status", !only.error && only.data.status === "confirmed" && only.data.assignee === "smoke2");

  const ci = await sb.from("contacts").insert({ hotel_id: h.id, name: "T", email: "t@example.com" }).select("id").single();
  const cu = await sb.from("contacts").update({ phone: "1" }).eq("id", ci.data!.id);
  const cd = await sb.from("contacts").delete().eq("id", ci.data!.id);
  check("contacts insert/update/delete", !ci.error && !cu.error && !cd.error);

  const ni = await sb.from("notes").insert({ hotel_id: h.id, body: "smoke" }).select("*").single();
  check("note insert with author = auth.uid()", !ni.error && !!ni.data.author);
  const nd = await sb.from("notes").delete().eq("id", ni.data!.id);
  check("note delete", !nd.error);

  const st = await sb.from("settings").select("value").eq("key", "discovery_min_charge_jpy").maybeSingle();
  check("settings readable (number)", typeof st.data?.value === "number", `value type ${typeof st.data?.value}`);
} finally {
  const del = await sb.from("hotels").delete().eq("id", h.id); // cascades research/contacts/notes
  const left = await sb.from("hotels").select("id").eq("external_id", ext);
  check("cleanup: disposable hotel deleted", !del.error && !left.data?.length);
}
console.log(failed ? `FAILED ${failed}` : "ALL OK");
Deno.exit(failed ? 1 : 0);
