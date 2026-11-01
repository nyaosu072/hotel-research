import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config.js";

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Edge function call -> { status, data } for 2xx and non-2xx alike (invoke() throws away non-2xx bodies).
export async function callFn(name, body) {
  const { data, error } = await sb.functions.invoke(name, { body });
  if (!error) return { status: 200, data };
  const res = error.context;
  if (res && typeof res.json === "function") {
    let data = null;
    try { data = await res.json(); } catch { /* not json */ }
    return { status: res.status, data };
  }
  return { status: 0, data: null };
}
