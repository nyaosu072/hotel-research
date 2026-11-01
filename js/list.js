// Main screen: country/region select, filtered hotel list, map, detail drawer.
import { callFn, sb } from "./supabase.js";
import { getLang, t } from "./i18n.js";
import { fill, clear, copyText, ext, fmtMD, h, hostOf, icon, safeUrl, toast } from "./dom.js";
import { badges, formatPrice, mapsQuery, names } from "./hotel.js";
import { defaultFilters, filterHotels, loadFilters, saveFilters, sortHotels, statusOf } from "./filters.js";
import { STATUSES } from "./status.js";
import { findPath, isFetchable, leafCodes, loadRegions, regionFilter, rname } from "./regions.js";
import { createMap } from "./map.js";
import { openDetail } from "./detail.js";
import { route } from "./app.js";

const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };

// Survives re-mounts (language switch, route changes).
const saved = (() => { try { return JSON.parse(lsGet("region") ?? "null") ?? {}; } catch { return {}; } })();
const S = {
  country: saved.country === "KR" ? "KR" : "JP",
  region: saved.region ?? null,
  hotels: [], loadedFor: null, req: 0, loading: false, busy: false,
  banner: null, refreshedAt: null, openId: null, view: "list",
  filters: loadFilters(), sort: lsGet("sort") ?? "badge", fopen: false, tree: null,
};
const persist = () => lsSet("region", JSON.stringify({ country: S.country, region: S.region }));

// other screens (research table, manual add) jump to a hotel on the main screen
export function requestOpen(country, region, id) {
  Object.assign(S, { country, region, hotels: [], loadedFor: null, openId: id });
  persist();
  location.hash = "#/";
}

const QUICK = { JP: [30000, 50000, 100000], KR: [300000, 500000, 1000000] };
const SLIDER = { JP: [300000, 10000], KR: [3000000, 100000] };
const sym = () => (S.country === "KR" ? "₩" : "¥");
const money = (n) => sym() + n.toLocaleString("en-US");

let ui = null; // handles of the mounted view

export function unmount() {
  if (!ui) return;
  ui.alive = false;
  S.req++; // drop in-flight responses
  ui.map?.destroy();
  removeEventListener("themechange", ui.onTheme);
  document.removeEventListener("keydown", ui.onKey);
  ui = null;
}

export async function mount(view, slot, session) {
  S.user = session.user;
  S.tree = await loadRegions(S.country);
  view.classList.add("mainview");
  const me = (ui = { alive: true });

  const barLeft = h("div", { class: "left" });
  const headEl = h("div", { class: "head" });
  const bannerEl = h("div");
  const filtersEl = h("div", { class: "filters" });
  const fdetailEl = h("details", { class: "fdetail" });
  const rowsEl = h("ul", { class: "rows", id: "rows" });
  const drawer = h("aside", { class: "drawer", id: "drawer", "aria-label": t("detail.aria"), hidden: true });
  const mapDiv = h("div", { id: "map" });
  const main = h("main", { class: "main", "data-view": S.view });
  const tabs = h("div", { class: "seg mobtabs", role: "group" },
    ...["list", "map"].map((v) => h("button", {
      "aria-pressed": String(S.view === v),
      onclick: () => { S.view = v; main.dataset.view = v; tabs.querySelectorAll("button").forEach((b, i) => b.setAttribute("aria-pressed", String(["list", "map"][i] === v))); if (v === "map") map.invalidate(); },
    }, t(`tab.${v}`))));

  main.append(
    h("section", { class: "listpane", "aria-label": t("list.aria") }, headEl, bannerEl, filtersEl, fdetailEl, rowsEl,
      h("footer", { class: "credit" }, t("credit.prefix"), " ", ext("https://webservice.rakuten.co.jp/", "Supported by Rakuten Developers"))),
    h("section", { class: "mapwrap", "aria-label": t("map.aria") }, mapDiv, drawer),
  );
  view.append(tabs, main);
  slot.append(barLeft);

  const map = (me.map = createMap(mapDiv, S.country, (id) => { openHotel(id); rowsEl.querySelector(`[data-id="${id}"]`)?.scrollIntoView({ block: "nearest" }); }));
  me.onTheme = () => map.recolor();
  me.onKey = (e) => { if (e.key === "Escape" && S.openId) closeDrawer(); };
  addEventListener("themechange", me.onTheme);
  document.addEventListener("keydown", me.onKey);

  // ---------- data ----------
  const nameOf = (x) => names(x, getLang()).main;
  const visible = () => sortHotels(filterHotels(S.hotels, S.filters), S.sort);

  async function queryDb(code) {
    const { data, error } = await sb.from("hotels").select("*, awards(*), media_mentions(*), research(*)")
      .or(regionFilter(code)).range(0, 999); // ponytail: 1000-row page; add paging if a region ever exceeds it
    if (error) { S.banner = { k: "error" }; return []; }
    for (const x of data) x.research = Array.isArray(x.research) ? (x.research[0] ?? null) : x.research;
    return data;
  }

  // 현 단위 선택: 아래 세부 지역을 2개씩 차례로 갱신(최신인 곳은 서버가 바로 "fresh"로 답함), 끝나면 목록 다시 읽기
  async function refreshMany(codes, code, my, force) {
    let done = 0, added = 0;
    S.busy = true; S.banner = { k: "refreshing_n", done, total: codes.length };
    renderBanner(); renderBarLeft();
    const queue = [...codes];
    await Promise.all([0, 1].map(async () => {
      for (let c = queue.shift(); c; c = queue.shift()) {
        if (!me.alive || my !== S.req) return;
        const { data } = await callFn("fetch-region", { region_code: c, force: !!force });
        if (data?.status === "refreshed") added += data.count ?? 0;
        done++;
        if (my === S.req) { S.banner = { k: "refreshing_n", done, total: codes.length }; renderBanner(); }
      }
    }));
    if (!me.alive || my !== S.req) return;
    S.busy = false; S.banner = null;
    S.hotels = await queryDb(code);
    if (!me.alive || my !== S.req) return;
    renderAll(); rebindDrawer();
    if (added) toast(t("banner.refreshed", { n: added }));
  }

  async function load(code, force) {
    const my = ++S.req;
    Object.assign(S, { hotels: [], banner: null, loading: true, busy: false });
    renderAll();
    const rows = await queryDb(code);
    if (!me.alive || my !== S.req) return;
    Object.assign(S, { hotels: rows, loading: false, loadedFor: code });
    renderAll();
    if (S.openId) { const id = S.openId; S.openId = null; openHotel(id); }
    if (!isFetchable(code, S.tree)) {
      S.refreshedAt = null; renderBarLeft();
      const leaves = leafCodes(code, S.tree);
      if (leaves.length) await refreshMany(leaves, code, my, force);
      return;
    }

    S.busy = true; S.banner = { k: "refreshing" };
    renderBanner(); renderBarLeft();
    const { data } = await callFn("fetch-region", { region_code: code, force: !!force });
    if (!me.alive || my !== S.req) return;
    S.busy = false;
    const st = data?.status;
    if (st === "refreshed") { S.banner = null; const rows2 = await queryDb(code); if (!me.alive || my !== S.req) return; S.hotels = rows2; toast(t("banner.refreshed", { n: data.count })); }
    else if (st === "fresh") S.banner = null;
    else if (st === "in_progress") {
      S.banner = { k: "in_progress" };
      (async () => { // another client is refreshing: ask again (cheap once fresh) up to 3 times, then reload
        for (let i = 0; i < 3; i++) {
          await new Promise((r) => setTimeout(r, 8000));
          if (!me.alive || my !== S.req) return;
          const { data: d2 } = await callFn("fetch-region", { region_code: code, force: false });
          if (!me.alive || my !== S.req) return;
          if (d2?.status !== "in_progress") break;
        }
        const rows3 = await queryDb(code);
        if (!me.alive || my !== S.req) return;
        S.hotels = rows3; S.banner = null; renderAll(); rebindDrawer();
      })();
    }
    else if (st === "upstream_failed") S.banner = { k: "stale", at: data.refreshed_at };
    else S.banner = { k: "error" };
    const { data: rc } = await sb.from("region_cache").select("refreshed_at").eq("country", S.country).eq("region_code", code).maybeSingle();
    if (!me.alive || my !== S.req) return;
    S.refreshedAt = rc?.refreshed_at ?? null;
    renderAll();
    if (st === "refreshed") rebindDrawer();
  }

  function selectRegion(code) {
    S.region = code; S.openId = null; persist();
    closeDrawer();
    if (!code) { S.req++; Object.assign(S, { hotels: [], banner: null, loading: false, refreshedAt: null, loadedFor: null }); renderAll(); return; }
    load(code, false);
  }

  // ---------- bar ----------
  function renderBarLeft() {
    const path = S.region ? findPath(S.tree, S.region) ?? [] : [];
    const selects = [];
    let level = S.tree;
    for (let i = 0; level?.length; i++) {
      const cur = path[i];
      selects.push(h("select", {
        "aria-label": t(i === 0 ? `bar.l1.${S.country}` : `bar.l${i + 1}`),
        onchange: (e) => selectRegion(e.target.value || (i > 0 ? path[i - 1].code : null)),
      }, h("option", { value: "" }, i === 0 ? t("bar.choose") : t("bar.all")),
      // 첫 단계에만 "전국" (국가 코드 jp/kr = 그 나라 전체, DB에 있는 호텔만 보여줌)
      i === 0 ? h("option", { value: S.country.toLowerCase(), selected: S.region === S.country.toLowerCase() }, t(`bar.whole.${S.country}`)) : null,
      ...level.map((r) => h("option", { value: r.code, selected: cur?.code === r.code }, rname(r)))));
      if (!cur) break;
      level = cur.children;
    }
    const canRefresh = S.region && (isFetchable(S.region, S.tree) || leafCodes(S.region, S.tree).length > 0);
    fill(barLeft, 
      h("div", { class: "seg", role: "group", "aria-label": t("bar.country") },
        ...[["JP", "bar.jp"], ["KR", "bar.kr"]].map(([c, k]) => h("button", {
          "aria-pressed": String(S.country === c),
          onclick: () => {
            if (S.country === c) return;
            Object.assign(S, { country: c, region: null, hotels: [], loadedFor: null, openId: null, filters: { ...S.filters, priceMin: null, priceMax: null } });
            saveFilters(S.filters); persist(); route();
          },
        }, t(k)))),
      h("div", { class: "path" }, selects),
      S.refreshedAt ? h("span", { class: "updated num" }, t("bar.updated", { at: fmtMD(S.refreshedAt) })) : null,
      canRefresh ? h("button", { class: "btn", disabled: S.busy || S.loading, onclick: () => load(S.region, true) }, t("bar.refresh")) : null,
    );
  }

  // ---------- list ----------
  function renderBanner() {
    clear(bannerEl);
    const b = S.banner;
    if (!b) return;
    const text = b.k === "refreshing" ? t("banner.refreshing")
      : b.k === "refreshing_n" ? t("banner.refreshing_n", { done: b.done, total: b.total })
      : b.k === "in_progress" ? t("banner.in_progress")
      : b.k === "stale" ? t("banner.stale", { at: b.at ? fmtMD(b.at) : t("banner.never") })
      : t("banner.error");
    bannerEl.append(h("div", { class: "banner" + (b.k === "stale" || b.k === "error" ? " warn" : ""), role: "status" }, text));
  }

  function renderHead() {
    const path = S.region ? findPath(S.tree, S.region) ?? [] : [];
    const list = visible();
    const award = list.filter((x) => x.awards?.length).length;
    fill(headEl, 
      h("h1", null, path.length ? rname(path.at(-1)) : S.region === S.country.toLowerCase() ? t(`bar.whole.${S.country}`) : t("main.pick")),
      S.region ? h("div", { class: "sub" },
        h("span", null, h("strong", { class: "num" }, list.length), " ", t("head.count")),
        h("span", null, t("head.award"), " ", h("span", { class: "num" }, award)),
        h("span", null, t("head.discovery"), " ", h("span", { class: "num" }, list.length - award))) : null,
    );
  }

  const chip = (label, on, fn) => h("button", { class: "chip", "aria-pressed": String(!!on), onclick: fn }, label);
  const toggle = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  function setF(patch) {
    S.filters = { ...S.filters, ...patch };
    saveFilters(S.filters);
    renderFilters(); renderHead(); renderRows(); renderPins();
  }

  function renderFilters() {
    const f = S.filters;
    const q = QUICK[S.country];
    fill(filtersEl, 
      ...["hotel", "ryokan", "resort"].map((ty) => chip(t(`type.${ty}`), f.types.includes(ty), () => setF({ types: toggle(f.types, ty) }))),
      chip(t("filter.five"), f.grade === "five", () => setF({ grade: f.grade === "five" ? "all4" : "five" })),
      ...q.map((n) => chip(`${money(n)}〜`, f.priceMin === n && f.priceMax == null, () => setF(f.priceMin === n && f.priceMax == null ? { priceMin: null } : { priceMin: n, priceMax: null }))),
      h("select", { class: "sort", "aria-label": t("sort.label"), onchange: (e) => { S.sort = e.target.value; lsSet("sort", S.sort); renderRows(); } },
        ...["badge", "rating", "price"].map((k) => h("option", { value: k, selected: S.sort === k }, t(`sort.${k}`)))),
    );

    const [max, step] = SLIDER[S.country];
    const priceIn = (key, label) => {
      const num = h("input", { type: "number", min: "0", step: String(step), "aria-label": label, value: f[key] ?? "", placeholder: label,
        onchange: (e) => { const v = e.target.value === "" ? null : Math.max(0, Number(e.target.value)); setF({ [key]: Number.isFinite(v) ? v : null }); } });
      const rng = h("input", { type: "range", min: "0", max: String(max), step: String(step), "aria-label": label, value: f[key] ?? (key === "priceMax" ? max : 0),
        oninput: (e) => { num.value = e.target.value; }, onchange: (e) => { const v = Number(e.target.value); setF({ [key]: key === "priceMax" && v >= max ? null : v > 0 || key === "priceMax" ? v : null }); } });
      return h("div", { class: "grp" }, h("span", null, label), rng, num);
    };
    fdetailEl.open = S.fopen;
    fdetailEl.ontoggle = () => { S.fopen = fdetailEl.open; };
    fill(fdetailEl, 
      h("summary", null, t("filter.more")),
      h("div", { class: "grp" }, h("b", null, t("filter.badge")),
        ...["michelin", "forbes", "kr_official", "brand", "membership", "discovery"].map((k) => chip(t(`filter.badge.${k}`), f.badges.includes(k), () => setF({ badges: toggle(f.badges, k) })))),
      h("div", { class: "grp" }, h("b", null, t("filter.price")), priceIn("priceMin", t("filter.min")), priceIn("priceMax", t("filter.max")),
        h("label", { class: "grp" }, h("input", { type: "checkbox", checked: f.includeUnknownPrice, onchange: (e) => setF({ includeUnknownPrice: e.target.checked }) }), t("filter.unknown_price"))),
      h("div", { class: "grp" }, h("b", null, t("filter.rating")),
        h("select", { "aria-label": t("filter.rating"), onchange: (e) => setF({ ratingMin: e.target.value === "" ? null : Number(e.target.value) }) },
          h("option", { value: "" }, t("filter.any")),
          ...[3, 3.5, 4, 4.5].map((r) => h("option", { value: r, selected: f.ratingMin === r }, `${r.toFixed(1)}+`)))),
      h("div", { class: "grp" }, h("b", null, t("filter.status")),
        ...STATUSES.map((s) => chip(t(`status.${s}`), f.statuses.includes(s), () => setF({ statuses: toggle(f.statuses, s) })))),
      h("div", { class: "grp" }, h("button", { class: "btn small", onclick: () => setF(defaultFilters()) }, t("filter.reset"))),
    );
  }

  function markEl(b) {
    if (b.type === "key") return h("span", { class: "mark", title: t("badge.michelin", { n: b.n }) }, ...Array.from({ length: b.n }, () => icon("key")));
    if (b.type === "star") return h("span", { class: "mark", title: t("badge.forbes", { n: b.n }) }, ...Array.from({ length: b.n }, () => icon("star")));
    if (b.type === "official") return h("span", { class: "mark", title: t("badge.official", { n: b.n }) }, t("badge.official", { n: b.n }));
    if (b.type === "member") return h("span", { class: "mark" }, icon("flower"), b.text);
    if (b.type === "brand") return h("span", { class: "mark" }, b.text);
    return h("span", { class: "mark find" }, t("badge.discovery"));
  }

  function rowEl(x) {
    const nm = names(x, getLang());
    const st = statusOf(x);
    const hp = safeUrl(x.homepage);
    const price = formatPrice(x.min_charge, x.currency);
    const img = safeUrl(x.image_url);
    return h("li", { class: "row", tabindex: "0", "data-id": x.id, "data-st": st, "aria-selected": String(S.openId === x.id) },
      h("div", { class: "thumb" }, img ? h("img", { src: img, alt: "", loading: "lazy", referrerpolicy: "no-referrer" }) : null),
      h("div", null,
        h("div", { class: "name" }, nm.main),
        nm.sub ? h("div", { class: "en" }, nm.sub) : null,
        h("div", { class: "contact" },
          hp ? ext(hp, hostOf(hp)) : h("span", { class: "missing" }, t("hp.missing"), "　", ext(mapsQuery(x), t("hp.find_map"))),
          x.main_email
            ? h("button", { class: "linklike", title: t("mail.copy"), onclick: async () => toast((await copyText(x.main_email)) ? t("mail.copied") : t("mail.copy_failed")) }, x.main_email)
            : h("span", { class: "missing" }, t("mail.missing")),
          x.lat == null ? h("span", { class: "noloc" }, t("list.noloc")) : null)),
      h("div", { class: "right" },
        h("div", { class: "marks" }, badges(x).map(markEl), x.media_mentions?.length ? h("span", { class: "mark other" }, t("badge.media")) : null),
        price ? h("div", { class: "price num" }, price, h("small", null, "〜")) : h("div", { class: "price" }, h("small", null, t("price.unknown"))),
        h("span", { class: "status", style: `--c:var(--st-${st})` }, h("i"), t(`status.${st}`))));
  }

  function renderRows() {
    clear(rowsEl);
    if (!S.region) { rowsEl.append(h("li", { class: "empty" }, t("empty.pick"))); return; }
    if (S.loading) { rowsEl.append(...Array.from({ length: 5 }, () => h("li", { class: "skel" }))); return; }
    const list = visible();
    if (!list.length) {
      rowsEl.append(S.hotels.length
        ? h("li", { class: "empty" }, t("empty.filtered"), " ", h("button", { class: "linklike", onclick: () => setF(defaultFilters()) }, t("filter.reset")))
        : h("li", { class: "empty" }, t("empty.region")));
      return;
    }
    rowsEl.append(...list.map(rowEl));
  }

  function renderPins() { map.setHotels(S.loading ? [] : visible(), nameOf); }
  function renderAll() { renderBarLeft(); renderHead(); renderBanner(); renderFilters(); renderRows(); renderPins(); }

  // ---------- drawer ----------
  function openHotel(id) {
    const x = S.hotels.find((r) => r.id === id);
    if (!x) return;
    S.openId = id;
    drawer.hidden = false;
    openDetail(drawer, x, {
      user: S.user,
      onClose: closeDrawer,
      onChange: () => { renderHead(); renderRows(); map.recolor(); },
    });
    rowsEl.querySelectorAll(".row").forEach((r) => r.setAttribute("aria-selected", String(r.dataset.id === id)));
    // 패널이 지도를 전부 덮는 좁은 화면(모바일)에서는 보정하지 않음
    const cover = drawer.offsetWidth < mapDiv.offsetWidth ? drawer.offsetWidth : 0;
    map.focus(id, cover);
  }
  // list reloaded while the drawer is open: point it at the new hotel object, or close it if the row is gone
  function rebindDrawer() {
    if (!S.openId || drawer.hidden) return;
    if (S.hotels.some((r) => r.id === S.openId)) openHotel(S.openId); else closeDrawer();
  }
  function closeDrawer() {
    S.openId = null;
    drawer.hidden = true;
    rowsEl.querySelectorAll(".row").forEach((r) => r.setAttribute("aria-selected", "false"));
  }

  rowsEl.addEventListener("click", (e) => {
    const r = e.target.closest(".row");
    if (r && !e.target.closest("a,button")) openHotel(r.dataset.id);
  });
  rowsEl.addEventListener("keydown", (e) => {
    const r = e.target.closest(".row");
    if (r && e.target === r && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openHotel(r.dataset.id); }
  });
  rowsEl.addEventListener("mouseover", (e) => map.highlight(e.target.closest(".row")?.dataset.id ?? null));
  rowsEl.addEventListener("mouseleave", () => map.highlight(null));

  // ---------- start ----------
  renderAll();
  if (S.region) {
    if (S.loadedFor === S.region && S.hotels.length) {
      if (S.openId) { const id = S.openId; S.openId = null; openHotel(id); }
    } else load(S.region, false);
  }
}
