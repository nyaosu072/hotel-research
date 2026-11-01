import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { extractEmails, isSafeUrl } from "../_shared/extract-emails.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const MAX_BYTES = 1_000_000;

async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  await reader.cancel().catch(() => {});
  const buf = new Uint8Array(Math.min(size, MAX_BYTES));
  let off = 0;
  for (const c of chunks) {
    const part = c.subarray(0, buf.length - off);
    buf.set(part, off);
    off += part.length;
    if (off >= buf.length) break;
  }
  return new TextDecoder().decode(buf);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return reply(405, { error: "method_not_allowed" });
  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const url = Deno.env.get("SUPABASE_URL")!;
    const { data: auth, error: authErr } = await createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!).auth.getUser(token);
    if (authErr || !auth.user) return reply(401, { error: "unauthorized" });

    const body = await req.json().catch(() => null);
    if (!body?.hotel_id) return reply(400, { error: "bad_request" });

    // URL은 요청에서 받지 않고 DB의 공식 홈페이지만 사용
    const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: hotel } = await db.from("hotels").select("homepage").eq("id", body.hotel_id).maybeSingle();
    const homepage = hotel?.homepage?.trim();
    if (!homepage || !isSafeUrl(homepage)) return reply(400, { error: "no_homepage" });

    try {
      const res = await fetch(homepage, { signal: AbortSignal.timeout(10_000), redirect: "follow" });
      if (!res.ok || !isSafeUrl(res.url || homepage)) return reply(200, { emails: [] });
      return reply(200, { emails: extractEmails(await readCapped(res)) });
    } catch {
      return reply(200, { emails: [] });
    }
  } catch (e) {
    console.error("find-email failed", (e as Error).message);
    return reply(500, { error: "internal_error" });
  }
});
