// DOM-free i18n core. app.js fetches the JSON and calls loadDicts(); tests import this directly.
let dicts = { ja: {}, en: {} };
let lang = null;

export function loadDicts(ja, en) { dicts = { ja, en }; }

export function getLang() {
  if (lang) return lang;
  try { lang = localStorage.getItem("lang") === "en" ? "en" : "ja"; } catch { lang = "ja"; }
  return lang;
}

export function setLang(l) {
  lang = l === "en" ? "en" : "ja";
  try { localStorage.setItem("lang", lang); } catch { /* private mode etc: keep in memory only */ }
}

export function t(key, vars) {
  const s = dicts[getLang()][key] ?? key;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
}
