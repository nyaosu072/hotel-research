const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&#x2F;/gi, "/").replace(/&#47;/g, "/").trim();

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"));
  return m ? (m[2] ?? m[3] ?? null) : null;
}

/** 공식 홈페이지 HTML에서 대표 이미지(og:image → twitter:image → image_src) 주소를 찾는다. http(s)만. */
export function extractOgImage(html: string, baseUrl: string): string | null {
  const metas = html.match(/<meta\b[^>]*>/gi) ?? [];
  const pick = (key: string) => {
    for (const t of metas) {
      const p = (attr(t, "property") ?? attr(t, "name") ?? "").toLowerCase();
      if (p === key) return attr(t, "content");
    }
    return null;
  };
  const link = (html.match(/<link\b[^>]*>/gi) ?? []).find((t) => (attr(t, "rel") ?? "").toLowerCase() === "image_src");
  for (const raw of [pick("og:image"), pick("og:image:url"), pick("twitter:image"), link ? attr(link, "href") : null]) {
    if (!raw || !decode(raw)) continue;
    try {
      const u = new URL(decode(raw), baseUrl);
      if (u.protocol === "http:" || u.protocol === "https:") return u.href;
    } catch { /* 잘못된 주소는 건너뜀 */ }
  }
  return null;
}
