import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { handle } from "./handler.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return reply(405, { error: "method_not_allowed" });

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const url = Deno.env.get("SUPABASE_URL")!;
  const { data, error } = await createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!).auth.getUser(token);
  if (error || !data.user) return reply(401, { error: "unauthorized" });

  const body = await req.json().catch(() => null);
  if (!body) return reply(400, { error: "bad_request" });

  const r = await handle(body, {
    db: createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!),
    fetchFn: fetch,
    env: {
      RAKUTEN_APP_ID: Deno.env.get("RAKUTEN_APP_ID")!,
      RAKUTEN_ACCESS_KEY: Deno.env.get("RAKUTEN_ACCESS_KEY")!,
      TOURAPI_KEY: Deno.env.get("TOURAPI_KEY")!,
    },
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    now: () => new Date(),
  });
  return reply(r.status, r.body);
});
