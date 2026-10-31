import { load } from "@std/dotenv";
import { createClient } from "@supabase/supabase-js";

// .env가 없으면(예: CI) 통합 테스트는 ignore 처리된다.
export const env = { ...(await load({ export: false })), ...Deno.env.toObject() };
export const hasEnv = Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
// deno-lint-ignore no-explicit-any
export const db: any = hasEnv ? createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY) : null;
export const rand = () => crypto.randomUUID().slice(0, 8);

// 테스트가 만든 hotels / region_cache 행 삭제 (지역 코드가 prefix로 시작하는 것 전부)
export async function cleanup(prefix: string) {
  await db.from("hotels").delete().like("region_code", `${prefix}%`);
  await db.from("region_cache").delete().like("region_code", `${prefix}%`);
}
