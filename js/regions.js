// Region trees (data/regions_*.json) + pure helpers. Code formats: docs/api-notes.md.
import { getLang } from "./i18n.js";

const cache = {};
export async function loadRegions(country) {
  const f = country === "KR" ? "kr" : "jp";
  cache[f] ??= await fetch(`data/regions_${f}.json`).then((r) => r.json());
  return cache[f];
}

export function rname(r, lang = getLang()) {
  return (lang === "en" ? r.name_en : lang === "ko" ? r.name_ko : r.name_ja) || r.name_ja || r.name_en || r.code;
}

export function findPath(tree, code) {
  for (const r of tree) {
    if (r.code === code) return [r];
    if (r.children && code.startsWith(r.code + ":")) {
      const p = findPath(r.children, code);
      if (p) return [r, ...p];
    }
  }
  return null;
}

// sync label once both trees have been loaded (research table)
export function regionLabel(code, trees, lang = getLang()) {
  if (!code) return "";
  const tree = trees[code.startsWith("kr:") ? "KR" : "JP"];
  const p = tree && findPath(tree, code);
  return p ? p.map((r) => rname(r, lang)).join(" / ") : code;
}

const CODE = /^(jp|kr):[a-z0-9-]+(:[a-z0-9-]+){0,2}$/i;

// R15: rows at `sel`, below it, or at a parent level (award hotels stored at prefecture level)
export function regionFilter(sel) {
  if (!CODE.test(sel)) throw new Error("bad region code");
  const parts = sel.split(":");
  const parents = [];
  for (let i = 2; i < parts.length; i++) parents.push(parts.slice(0, i).join(":"));
  const conds = [`region_code.eq.${sel}`, `region_code.like.${sel}:*`];
  if (parents.length) conds.push(`region_code.in.(${parents.join(",")})`);
  return conds.join(",");
}

// fetch-region needs a small area (JP) / 시군구 (KR); a KR 시도 without children is itself fetchable (Sejong).
export function isFetchable(code, tree) {
  const parts = code.split(":");
  if (parts.length >= 3) return true;
  if (code.startsWith("kr:") && parts.length === 2) {
    const p = tree && findPath(tree, code);
    return !!p && !(p[0].children?.length);
  }
  return false;
}

// best-effort prefecture/시도 from an address (manual add)
export function guessRegion(tree, address) {
  const a = (address ?? "").normalize("NFKC").trim();
  if (!a) return null;
  const hit = tree.find((r) =>
    [r.name_ja, r.name_ko].some((n) => n && (a.startsWith(n) || (n.length > 3 && a.startsWith(n.slice(0, 2)))))
  );
  return hit?.code ?? null;
}
