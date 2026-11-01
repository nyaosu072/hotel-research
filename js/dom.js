// Tiny DOM helpers. All text goes through text nodes / textContent, never innerHTML.
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "value") el.value = v;
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, v);
  }
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return el;
}
export const clear = (el) => { el.replaceChildren(); return el; };
// replace children, skipping null/false (native append() would print "null")
export function fill(el, ...kids) {
  el.replaceChildren();
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return el;
}

export function icon(id) {
  const ns = "http://www.w3.org/2000/svg";
  const s = document.createElementNS(ns, "svg");
  const u = document.createElementNS(ns, "use");
  u.setAttribute("href", `#${id}`);
  s.append(u);
  s.setAttribute("aria-hidden", "true");
  return s;
}

let toastTimer;
export function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2200);
}

export async function copyText(s) {
  try { await navigator.clipboard.writeText(s); return true; } catch { /* fall through */ }
  const ta = h("textarea", { value: s, style: "position:fixed;opacity:0" });
  document.body.append(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand("copy"); } catch { /* ignore */ }
  ta.remove();
  return ok;
}

// Only http(s) URLs may become hrefs (DB text is untrusted: no javascript: URLs).
export function safeUrl(u) {
  if (!u) return null;
  try {
    const x = new URL(String(u).trim());
    return x.protocol === "http:" || x.protocol === "https:" ? x.href : null;
  } catch { return null; }
}
export function hostOf(u) {
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return String(u); }
}
export const ext = (href, ...kids) => h("a", { href, target: "_blank", rel: "noopener noreferrer" }, ...kids);

const pad = (n) => String(n).padStart(2, "0");
export function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
}
export function fmtMD(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

import { t } from "./i18n.js";
// Supabase/Postgres error -> user-facing text (the DB is the final enforcer of the homepage rule).
export const errMsg = (e) => (/homepage_required/.test(e?.message ?? "") ? t("err.homepage_required") : t("err.save"));
