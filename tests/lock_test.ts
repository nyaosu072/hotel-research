import { assertEquals } from "@std/assert";
import { release, tryAcquire } from "../supabase/functions/_shared/lock.ts";
import { cleanup, db, hasEnv, rand } from "./_db.ts";

Deno.test({ name: "lock: acquire / block / release", ignore: !hasEnv }, async () => {
  const code = `jp:test-${rand()}:x`;
  try {
    assertEquals(await tryAcquire(db, code, 120), true);
    assertEquals(await tryAcquire(db, code, 120), false);
    await release(db, code, { success: false });
    const { data } = await db.from("region_cache").select("*").eq("region_code", code).single();
    assertEquals(data.refreshing_until, null);
    assertEquals(data.refreshed_at, null); // 실패 해제는 refreshed_at을 올리지 않는다
    assertEquals(await tryAcquire(db, code, 120), true);
    await release(db, code);
    const { data: d2 } = await db.from("region_cache").select("*").eq("region_code", code).single();
    assertEquals(d2.refreshing_until, null);
    assertEquals(typeof d2.refreshed_at, "string");
  } finally {
    await cleanup(code);
  }
});

Deno.test({ name: "lock: expired lock can be re-acquired", ignore: !hasEnv }, async () => {
  const code = `jp:test-${rand()}:x`;
  try {
    await db.from("region_cache").insert({
      country: "JP",
      region_code: code,
      refreshing_until: new Date(Date.now() - 1000).toISOString(),
    });
    assertEquals(await tryAcquire(db, code, 120), true);
  } finally {
    await cleanup(code);
  }
});

Deno.test({ name: "lock: concurrent tryAcquire -> exactly one wins", ignore: !hasEnv }, async () => {
  const code = `jp:test-${rand()}:x`;
  try {
    const rs = await Promise.all([1, 2, 3, 4].map(() => tryAcquire(db, code, 120)));
    assertEquals(rs.filter(Boolean).length, 1);
  } finally {
    await cleanup(code);
  }
});
