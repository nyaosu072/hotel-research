const ASSET = /\.(png|jpe?g|gif|svg|webp|woff2?)$/i;
const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&commat;/gi, "@")
    .replace(/&amp;/gi, "&");
}

/** 홈페이지 HTML에서 메일 주소 후보를 뽑는다. 중복 제거, 소문자, 나온 순서 유지. */
export function extractEmails(html: string): string[] {
  const text = decodeEntities(html);
  const found: string[] = [];
  for (const m of text.matchAll(/mailto:([^"'?\s>]+)/gi)) found.push(m[1]);
  for (const m of text.matchAll(EMAIL)) found.push(m[0]);
  const out: string[] = [];
  for (const raw of found) {
    const e = raw.toLowerCase();
    if (ASSET.test(e) || !/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(e)) continue;
    if (!out.includes(e)) out.push(e);
  }
  return out;
}

/** http(s)만, localhost·사설·링크로컬 IP는 거부 (서버가 내부망을 대신 요청하지 않도록). */
export function isSafeUrl(raw: string): boolean {
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const h = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80")) return false;
  const v4 = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return false;
  }
  // ponytail: 호스트명 기준 검사만 함. DNS가 사설 IP로 풀리는 도메인은 못 막음 — Supabase Edge 런타임은 내부망 접근이 없어서 위험이 낮음.
  return true;
}
