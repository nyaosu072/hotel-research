// deno run -A scripts/fill-images.ts [--dry-run]
// 사진이 빈 호텔의 공식 홈페이지 첫 페이지에서 대표 이미지(og:image 등) 주소를 읽어 image_url에 넣는다.
// 홈페이지 한 장만 읽고, 이미지 파일은 복사하지 않고 주소만 저장. manual_fields·기존 값은 건드리지 않음.
import { load } from "@std/dotenv";
import { createClient } from "@supabase/supabase-js";
import { isSafeUrl } from "../supabase/functions/_shared/extract-emails.ts";
import { extractOgImage } from "../supabase/functions/_shared/og-image.ts";

const env = await load({ envPath: ".env" });
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const dry = Deno.args.includes("--dry-run");
const UA = "Mozilla/5.0 (compatible; HotelResearch/0.1; +https://github.com/nyaosu072/hotel-research)";

async function fetchPage(start: string): Promise<{ html: string; url: string } | null> {
  const signal = AbortSignal.timeout(12_000);
  let url = start;
  for (let hop = 0; hop <= 3; hop++) {
    const res = await fetch(url, { signal, redirect: "manual", headers: { "User-Agent": UA, Accept: "text/html" } });
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      await res.body?.cancel().catch(() => {});
      url = new URL(loc, url).href;
      if (!isSafeUrl(url)) return null;
      continue;
    }
    if (!res.ok) { await res.body?.cancel().catch(() => {}); return null; }
    const text = (await res.text()).slice(0, 1_000_000);
    return { html: text, url };
  }
  return null;
}

const { data, error } = await db.from("hotels").select("id,name_ja,name_en,name_ko,homepage,image_url,manual_fields").range(0, 1999);
if (error) throw error;
const targets = data!.filter((h) => !h.image_url && h.homepage && isSafeUrl(h.homepage) && !(h.manual_fields ?? []).includes("image_url"));
console.log(`targets: ${targets.length}`);

let filled = 0, none = 0, failed = 0;
const queue = [...targets];
// ponytail: 동시 4개 고정. 같은 도메인(체인 브랜드 사이트)에 몰려도 4개라 부담이 작음.
await Promise.all(Array.from({ length: 4 }, async () => {
  for (let h = queue.shift(); h; h = queue.shift()) {
    const name = h.name_ja ?? h.name_en ?? h.name_ko;
    try {
      const page = await fetchPage(h.homepage!);
      const img = page ? extractOgImage(page.html, page.url) : null;
      if (!img) { none++; continue; }
      filled++;
      if (dry) { console.log(`  ${name} -> ${img}`); continue; }
      const { error } = await db.from("hotels").update({ image_url: img }).eq("id", h.id).is("image_url", null);
      if (error) throw error;
    } catch (e) {
      failed++;
      console.log(`  fail ${name}: ${(e as Error).message.slice(0, 80)}`);
    }
  }
}));
console.log({ filled, noImage: none, failed, dryRun: dry });
