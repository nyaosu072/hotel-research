import { assertEquals } from "@std/assert";
import { extractOgImage } from "../supabase/functions/_shared/og-image.ts";

Deno.test("extractOgImage", () => {
  const base = "https://www.gorakadan.com/ja/";
  assertEquals(extractOgImage('<meta property="og:image" content="https://cdn.x.jp/a.jpg">', base), "https://cdn.x.jp/a.jpg");
  assertEquals(extractOgImage("<meta content='/img/top.jpg' property='og:image'/>", base), "https://www.gorakadan.com/img/top.jpg");
  assertEquals(extractOgImage('<meta name="twitter:image" content="b.png">', base), "https://www.gorakadan.com/ja/b.png");
  assertEquals(extractOgImage('<link rel="image_src" href="//cdn.y.jp/c.webp">', base), "https://cdn.y.jp/c.webp");
  assertEquals(extractOgImage('<meta property="og:image" content="https://x.jp/a&amp;b.jpg">', base), "https://x.jp/a&b.jpg");
  assertEquals(extractOgImage('<meta property="og:image" content="javascript:alert(1)">', base), null);
  assertEquals(extractOgImage('<meta property="og:image" content="">', base), null);
  assertEquals(extractOgImage("<html>no image</html>", base), null);
});
