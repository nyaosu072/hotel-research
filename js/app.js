import { sb } from "./supabase.js";
import { getLang, loadDicts, setLang, t } from "./i18n.js";
import { fill, h } from "./dom.js";
import { renderLogin, signOut } from "./auth.js";

const root = document.getElementById("app");
let session = null;
let current = null; // mounted view module (has optional unmount())
let routeId = 0;

export const getSession = () => session;

// ---- theme (system by default; toggle overrides, remembered) ----
function applyTheme() {
  try {
    const v = localStorage.getItem("theme");
    if (v) document.documentElement.dataset.theme = v;
  } catch { /* ignore */ }
}
function toggleTheme() {
  const r = document.documentElement;
  const dark = r.dataset.theme ? r.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  r.dataset.theme = dark ? "light" : "dark";
  try { localStorage.setItem("theme", r.dataset.theme); } catch { /* ignore */ }
  dispatchEvent(new Event("themechange"));
}

const langSeg = () =>
  h("div", { class: "seg", role: "group", "aria-label": t("bar.lang") },
    ...[["ja", "日本語"], ["en", "EN"]].map(([l, label]) =>
      h("button", { "aria-pressed": String(getLang() === l), onclick: () => { if (getLang() !== l) { setLang(l); route(); } } }, label)));

const themeBtn = () => h("button", { class: "btn", "aria-label": t("bar.theme"), title: t("bar.theme"), onclick: toggleTheme }, "◐");

function bar(left) {
  const nav = (hash, key) =>
    h("a", { class: "btn", href: hash, "aria-current": location.hash.startsWith(hash) ? "page" : null, style: "text-decoration:none;color:inherit" }, t(key));
  // 좁은 화면에서는 오른쪽 도구들을 "メニュー" 버튼 하나로 접는다 (CSS가 데스크톱에선 버튼을 숨김)
  const tools = h("div", { class: "tools", id: "bar-tools" },
    h("nav", { class: "nav" }, nav("#/research", "nav.research"), nav("#/add", "nav.add"), nav("#/settings", "nav.settings")),
    langSeg(), themeBtn(),
    h("button", { class: "btn", onclick: signOut }, t("bar.logout")));
  const menuBtn = h("button", { class: "btn menubtn", "aria-expanded": "false", "aria-controls": "bar-tools" }, t("bar.menu"));
  const header = h("header", { class: "bar" }, h("div", { class: "left" }, left), h("div", { class: "spacer" }), menuBtn, tools);
  menuBtn.onclick = () => {
    const open = header.classList.toggle("menu-open");
    menuBtn.setAttribute("aria-expanded", String(open));
  };
  tools.addEventListener("click", (e) => { if (e.target.closest("a")) header.classList.remove("menu-open"); });
  return header;
}

const VIEWS = {
  "/": () => import("./list.js"),
  "/research": () => import("./research.js"),
  "/add": () => import("./add.js"),
  "/settings": () => import("./settings.js"),
};

export async function route() {
  const id = ++routeId;
  current?.unmount?.();
  current = null;
  document.title = t("app.title");
  document.documentElement.lang = getLang();
  const path = (location.hash.replace(/^#/, "") || "/").split("?")[0];

  if (!session) {
    if (path !== "/login") { location.hash = "#/login"; return; }
    renderLogin(root, [langSeg(), themeBtn()]);
    return;
  }
  if (path === "/login" || !VIEWS[path]) { location.hash = "#/"; return; }

  const left = h("div", { class: "left" });
  const view = h("div", { class: "view" });
  fill(root, bar(left), view);
  const mod = await VIEWS[path]();
  if (id !== routeId) return;
  current = mod;
  if (path !== "/") left.append(h("a", { class: "btn", href: "#/", style: "text-decoration:none;color:inherit" }, "← " + t("nav.back")));
  await mod.mount(view, left, session);
}

async function boot() {
  const [ja, en] = await Promise.all(["ja", "en"].map((l) => fetch(`i18n/${l}.json`).then((r) => r.json())));
  loadDicts(ja, en);
  applyTheme();
  const { data } = await sb.auth.getSession();
  session = data.session;
  sb.auth.onAuthStateChange((_ev, s) => {
    const changed = !!s !== !!session;
    session = s;
    if (changed) route();
  });
  addEventListener("hashchange", route);
  route();
}
boot();
