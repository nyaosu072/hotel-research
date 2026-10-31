import type { SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";

export type Db = SupabaseClient;

export const countryOf = (code: string) => (code.startsWith("kr:") ? "KR" : "JP");

export async function tryAcquire(db: Db, regionCode: string, ttlSec: number): Promise<boolean> {
  const { data, error } = await db.rpc("try_acquire_region", {
    p_country: countryOf(regionCode),
    p_code: regionCode,
    p_ttl: ttlSec,
  });
  if (error) throw new Error(`lock: ${error.message}`);
  return data === true;
}

// success=false(업스트림 실패): refreshed_at은 건드리지 않아 다음 호출이 재시도한다.
export async function release(db: Db, regionCode: string, opts: { success: boolean } = { success: true }) {
  const patch: Record<string, unknown> = { refreshing_until: null };
  if (opts.success) patch.refreshed_at = new Date().toISOString();
  const { error } = await db.from("region_cache").update(patch)
    .eq("country", countryOf(regionCode)).eq("region_code", regionCode);
  if (error) throw new Error(`release: ${error.message}`);
}
