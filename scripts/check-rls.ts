import { load } from "@std/dotenv";
import { createClient } from "@supabase/supabase-js";

const env = await load({ export: false });
const url = env.SUPABASE_URL, anonKey = env.SUPABASE_ANON_KEY;
const tables = ["hotels", "awards", "media_mentions", "research", "contacts", "notes", "region_cache", "settings"];

// 1) anon: 0행이거나 권한 거부(42501)여야 통과. 그 외 오류(테이블 없음 등)는 실패.
const anon = createClient(url, anonKey);
const leaked: string[] = [];
for (const t of tables) {
  const { data, error } = await anon.from(t).select("*");
  if (error ? error.code !== "42501" : data!.length > 0) {
    leaked.push(`${t}: ${error?.message ?? data!.length + " rows"}`);
  }
}
if (leaked.length) {
  console.error("RLS FAIL\n" + leaked.join("\n"));
  Deno.exit(1);
}

// 2) 로그인 후 hotels insert/select + 상태 규칙
const db = createClient(url, anonKey);
const { error: authErr } = await db.auth.signInWithPassword({
  email: env.TEST_USER_EMAIL,
  password: env.TEST_USER_PASSWORD,
});
if (authErr) { console.error("login failed:", authErr.message); Deno.exit(1); }

const extId = `rls-check-${Date.now()}`;
let hotelId: string | undefined;
let ok = false;
try {
  const ins = await db.from("hotels").insert({
    country: "JP", name_ja: "RLS検査", type: "hotel", source: "manual", external_id: extId,
  }).select().single();
  if (ins.error) throw new Error("insert: " + ins.error.message);
  hotelId = ins.data.id;
  const sel = await db.from("hotels").select("id").eq("id", hotelId!);
  if (sel.error || sel.data.length !== 1) throw new Error("authenticated select failed");
  console.log("RLS OK");

  // 홈페이지 없이 contacted → homepage_required
  const bad = await db.rpc("set_research_status", { p_hotel_id: hotelId, p_status: "contacted" });
  if (bad.error?.message !== "homepage_required") {
    throw new Error("expected homepage_required, got " + (bad.error?.message ?? "success"));
  }
  // 직접 쓰기 우회 차단
  const expectBlocked = (label: string, e: { message: string } | null) => {
    if (e?.message !== "homepage_required") throw new Error(label + ": expected homepage_required, got " + (e?.message ?? "success"));
  };
  expectBlocked("direct insert contacted", (await db.from("research").insert({ hotel_id: hotelId, status: "contacted" })).error);
  const cand = await db.rpc("set_research_status", { p_hotel_id: hotelId, p_status: "candidate" });
  if (cand.error) throw new Error("candidate failed: " + cand.error.message);
  expectBlocked("direct update done", (await db.from("research").update({ status: "done" }).eq("hotel_id", hotelId!)).error);
  const ws = await db.from("hotels").update({ homepage: "   " }).eq("id", hotelId!);
  if (ws.error) throw new Error("whitespace homepage on candidate should be allowed: " + ws.error.message);
  expectBlocked("whitespace homepage contacted", (await db.rpc("set_research_status", { p_hotel_id: hotelId, p_status: "contacted" })).error);
  const up = await db.from("hotels").update({ homepage: "https://example.com" }).eq("id", hotelId!);
  if (up.error) throw new Error("update: " + up.error.message);
  const good = await db.rpc("set_research_status", { p_hotel_id: hotelId, p_status: "contacted" });
  if (good.error) throw new Error("contacted failed: " + good.error.message);
  const today = new Date().toISOString().slice(0, 10);
  const got = String(good.data.last_contacted_at ?? "").slice(0, 10);
  // 자정 경계 허용: 서버(UTC)/로컬 날짜 중 하나와 같으면 통과
  const localToday = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  if (good.data.status !== "contacted" || (got !== today && got !== localToday)) {
    throw new Error("last_contacted_at mismatch: " + got);
  }
  expectBlocked("blank homepage on contacted hotel", (await db.from("hotels").update({ homepage: "" }).eq("id", hotelId!)).error);
  console.log("status rule OK");
  ok = true;
} catch (e) {
  console.error("FAIL:", (e as Error).message);
} finally {
  if (hotelId) await db.from("hotels").delete().eq("id", hotelId); // research 등은 cascade
  else await db.from("hotels").delete().eq("external_id", extId);
}
Deno.exit(ok ? 0 : 1);
