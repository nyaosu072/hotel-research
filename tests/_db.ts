import { load } from "@std/dotenv";
import { createClient } from "@supabase/supabase-js";

// .env가 없으면(예: CI) 통합 테스트는 ignore 처리된다.
export const env = { ...(await load({ export: false })), ...Deno.env.toObject() };
export const hasEnv = Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
// deno-lint-ignore no-explicit-any
export const db: any = hasEnv ? createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY) : null;
export const rand = () => crypto.randomUUID().slice(0, 8);

// 테스트가 만든 행만 삭제: 테스트 지역 코드 + 테스트 external_id(`t-` 또는 9000000000대 hotelNo)
export async function cleanup(prefix: string) {
  if (!/^(jp|kr):test-/.test(prefix)) throw new Error("cleanup: not a test region code");
  await db.from("hotels").delete().like("region_code", `${prefix}%`).or("external_id.like.t-%,external_id.like.90000000%");
  await db.from("region_cache").delete().like("region_code", `${prefix}%`);
}
