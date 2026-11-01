// Detail drawer: header, editable contact fields, OTA links, status, assignee, contacts, notes.
import { callFn, sb } from "./supabase.js";
import { getLang, t } from "./i18n.js";
import { fill, copyText, errMsg, ext, fmtDate, fmtMD, h, hostOf, icon, safeUrl, toast } from "./dom.js";
import { badges, formatPrice, mapsQuery, names } from "./hotel.js";
import { canSetStatus, otaLinks, STATUSES } from "./status.js";
import { statusOf } from "./filters.js";
import { contactsSection } from "./contacts.js";
import { notesSection } from "./notes.js";

export const who = (id, ctx) => (!id ? "" : id === ctx.user?.id ? t("who.me") : t("who.member", { id: String(id).slice(0, 4) }));

// Save one or more hotel columns; the edited column names are appended (de-duplicated) to manual_fields in the same update.
export function saveHotel(hotel, patch, manualCols) {
  const manual = [...new Set([...(hotel.manual_fields ?? []), ...manualCols])];
  return sb.from("hotels").update({ ...patch, manual_fields: manual }).eq("id", hotel.id).select("*").single();
}

export const SPECS = {
  homepage: {
    input: "url", parse(raw) {
      const s = raw.trim();
      if (!s) return { value: null };
      try {
        const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`);
        return u.protocol === "http:" || u.protocol === "https:" ? { value: u.href } : { err: t("err.url") };
      } catch { return { err: t("err.url") }; }
    },
  },
  main_email: {
    input: "email", parse(raw) {
      const s = raw.trim();
      if (!s) return { value: null };
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? { value: s } : { err: t("err.email") };
    },
  },
  main_phone: { input: "tel", parse: (raw) => ({ value: raw.trim() || null }) },
  min_charge: {
    input: "number", parse(raw) {
      if (raw.trim() === "") return { value: null };
      const n = Number(raw);
      return Number.isFinite(n) && n >= 0 ? { value: Math.round(n) } : { err: t("err.number") };
    },
  },
  type: { input: "select", parse: (raw) => ({ value: raw || null }) },
};

function patchFor(hotel, col, value) {
  if (col !== "min_charge") return { [col]: value };
  return { min_charge: value, currency: hotel.currency ?? (hotel.country === "KR" ? "KRW" : "JPY"), price_source: value == null ? null : "manual" };
}

// A <dt>/<dd> pair whose value can be edited in place. Failed saves keep the typed value and offer retry.
function editable(hotel, ctx, { label, col, view, missing, extra }) {
  const spec = SPECS[col];
  const dd = h("dd");
  const show = () => {
    const v = hotel[col];
    dd.replaceChildren(...[
      h("div", { class: "inline" },
        v == null || v === "" ? missing() : view(v),
        h("button", { class: "btn small", onclick: edit }, v == null || v === "" ? t("action.add") : t("action.edit"))),
      extra ? extra(show) : null].filter(Boolean));
  };
  const edit = () => {
    const cur = hotel[col] ?? "";
    const input = spec.input === "select"
      ? h("select", { "aria-label": label }, h("option", { value: "" }, "—"), ...["hotel", "ryokan", "resort"].map((ty) => h("option", { value: ty, selected: cur === ty }, t(`type.${ty}`))))
      : h("input", { type: spec.input === "number" ? "number" : spec.input === "url" ? "text" : spec.input, min: spec.input === "number" ? "0" : null, "aria-label": label, value: cur });
    const msg = h("div", { class: "msg err", role: "alert" });
    const save = h("button", { class: "btn small primary" }, t("action.save"));
    const run = async () => {
      const r = spec.parse(input.value);
      if (r.err) { msg.textContent = r.err; return; }
      save.disabled = true; msg.textContent = "";
      const { data, error } = await saveHotel(hotel, patchFor(hotel, col, r.value), [col]);
      save.disabled = false;
      if (error) { msg.textContent = errMsg(error); save.textContent = t("action.retry"); return; }
      Object.assign(hotel, data);
      ctx.onChange(hotel);
      toast(t("saved"));
      show();
    };
    save.onclick = run;
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); run(); } });
    fill(dd, h("div", { class: "inline" }, input, save, h("button", { class: "btn small", onclick: show }, t("action.cancel"))), msg);
    input.focus();
  };
  show();
  return [h("dt", null, label), dd];
}

function findEmail(hotel, ctx, refresh) {
  const out = h("div");
  const btn = h("button", { class: "btn small", disabled: !safeUrl(hotel.homepage), title: safeUrl(hotel.homepage) ? null : t("find.need_homepage"), onclick: async () => {
    btn.disabled = true;
    fill(out, h("div", { class: "msg" }, t("find.searching")));
    const { status, data } = await callFn("find-email", { hotel_id: hotel.id });
    btn.disabled = false;
    if (status === 200 && Array.isArray(data?.emails)) {
      if (!data.emails.length) { fill(out, h("div", { class: "msg" }, t("find.none"))); return; }
      fill(out, h("ul", { class: "cands" }, ...data.emails.map((em) =>
        h("li", null, h("span", null, em),
          h("button", { class: "btn small", onclick: async (e) => {
            e.target.disabled = true;
            const { data: d, error } = await saveHotel(hotel, { main_email: em }, ["main_email"]);
            e.target.disabled = false;
            if (error) { toast(errMsg(error)); return; }
            Object.assign(hotel, d); ctx.onChange(hotel); toast(t("saved")); refresh();
          } }, t("find.use"))))));
    } else {
      fill(out, h("div", { class: "msg err" }, data?.error === "no_homepage" ? t("find.need_homepage") : t("find.error")));
    }
  } }, t("find.button"));
  return h("div", { style: "margin-top:4px" }, btn, out);
}

function statusSection(hotel, ctx) {
  const box = h("div");
  const msg = h("div", { class: "msg err", role: "alert" });
  const render = () => {
    const cur = statusOf(hotel);
    const r = hotel.research;
    const blocked = !canSetStatus(hotel, "contacted");
    const assignee = h("input", { type: "text", "aria-label": t("detail.assignee"), value: r?.assignee ?? "", placeholder: t("detail.assignee") });
    const aMsg = h("span", { class: "msg err", role: "alert" });
    const aSave = h("button", { class: "btn small" }, t("action.save"));
    aSave.onclick = async () => {
      aSave.disabled = true; aMsg.textContent = "";
      const { data, error } = await sb.from("research").upsert({ hotel_id: hotel.id, status: cur, assignee: assignee.value.trim() || null }, { onConflict: "hotel_id" }).select("*").single();
      aSave.disabled = false;
      if (error) { aMsg.textContent = errMsg(error); aSave.textContent = t("action.retry"); return; }
      hotel.research = data; ctx.onChange(hotel); toast(t("saved"));
    };
    fill(box, 
      h("h3", null, t("detail.status")),
      h("div", { class: "steps", role: "group", "aria-label": t("detail.status") },
        ...STATUSES.map((s) => h("button", {
          style: `--c:var(--st-${s})`, "aria-pressed": String(cur === s), disabled: !canSetStatus(hotel, s),
          onclick: async () => {
            if (s === cur) return;
            msg.textContent = "";
            const { data, error } = await sb.rpc("set_research_status", { p_hotel_id: hotel.id, p_status: s });
            if (error) { msg.textContent = errMsg(error); return; }
            hotel.research = Array.isArray(data) ? data[0] : data;
            ctx.onChange(hotel); render();
          },
        }, h("i"), t(`status.${s}`)))),
      blocked ? h("div", { class: "msg" }, t("status.need_homepage")) : null,
      msg,
      h("div", { class: "en", style: "margin-top:6px" }, t("detail.last_contact"), " ", h("span", { class: "num" }, r?.last_contacted_at ? fmtDate(r.last_contacted_at) : "—")),
      h("div", { class: "inline", style: "margin-top:6px" }, assignee, aSave, aMsg));
  };
  render();
  return box;
}

export function openDetail(drawer, hotel, ctx) {
  const lang = getLang();
  const nm = names(hotel, lang);
  const img = safeUrl(hotel.image_url);

  const markEls = badges(hotel).map((b) =>
    b.type === "key" ? h("span", { class: "mark" }, ...Array.from({ length: b.n }, () => icon("key")), " ", t("badge.michelin_label"))
    : b.type === "star" ? h("span", { class: "mark" }, ...Array.from({ length: b.n }, () => icon("star")), " Forbes")
    : b.type === "official" ? h("span", { class: "mark" }, t("badge.official", { n: b.n }))
    : b.type === "member" ? h("span", { class: "mark" }, icon("flower"), b.text)
    : b.type === "brand" ? h("span", { class: "mark" }, b.text)
    : h("span", { class: "mark find" }, t("badge.discovery")));
  if (hotel.media_mentions?.length) markEls.push(h("span", { class: "mark other" }, t("badge.media")));

  const links = otaLinks(hotel);
  const fields = h("dl", { class: "field" },
    editable(hotel, ctx, {
      label: t("detail.homepage"), col: "homepage",
      view: (v) => (safeUrl(v) ? ext(safeUrl(v), hostOf(v)) : h("span", null, v)),
      missing: () => h("span", { class: "missing" }, t("hp.missing"), "　", ext(mapsQuery(hotel), t("hp.find_map"))),
    }),
    editable(hotel, ctx, {
      label: t("detail.email"), col: "main_email",
      view: (v) => h("button", { class: "linklike", title: t("mail.copy"), onclick: async () => toast((await copyText(v)) ? t("mail.copied") : t("mail.copy_failed")) }, v),
      missing: () => h("span", { class: "missing" }, t("mail.missing")),
      extra: (refresh) => findEmail(hotel, ctx, refresh),
    }),
    editable(hotel, ctx, { label: t("detail.phone"), col: "main_phone", view: (v) => h("span", { class: "num" }, v), missing: () => h("span", { class: "missing" }, "—") }),
    h("dt", null, t("detail.address")), h("dd", null, hotel.address || "—"),
    editable(hotel, ctx, {
      label: t("detail.price"), col: "min_charge",
      view: () => h("span", { class: "num" }, formatPrice(hotel.min_charge, hotel.currency ?? (hotel.country === "KR" ? "KRW" : "JPY")), "〜 ", h("span", { class: "en", style: "display:inline" }, t("detail.per_night"))),
      missing: () => h("span", { class: "missing" }, t("price.unknown")),
    }),
    editable(hotel, ctx, { label: t("detail.type"), col: "type", view: (v) => h("span", null, t(`type.${v}`)), missing: () => h("span", { class: "missing" }, "—") }),
    hotel.room_count ? [h("dt", null, t("detail.rooms")), h("dd", { class: "num" }, hotel.room_count)] : null,
    hotel.review_avg != null ? [h("dt", null, t("detail.rating")), h("dd", { class: "num" }, Number(hotel.review_avg).toFixed(2), hotel.review_count ? ` (${hotel.review_count})` : "")] : null,
    safeUrl(hotel.rakuten_url) ? [h("dt", null, t("detail.rakuten")), h("dd", null, ext(safeUrl(hotel.rakuten_url), t("detail.rakuten_link")))] : null,
  );

  const closeBtn = h("button", { class: "close", "aria-label": t("action.close"), onclick: ctx.onClose }, "✕");
  fill(drawer, 
    closeBtn,
    h("div", { class: "d-hero" }, img ? h("img", { src: img, alt: "", referrerpolicy: "no-referrer" }) : null),
    h("div", { class: "d-body" },
      h("div", { class: "d-title" }, h("h2", null, nm.main), nm.sub ? h("div", { class: "en" }, nm.sub) : null, h("div", { class: "marks" }, markEls)),
      fields,
      h("div", { class: "links" },
        ext(links.booking, "Booking.com"), ext(links.agoda, "Agoda"), ext(links.trip, "Trip.com"), ext(links.gmaps, t("ota.gmaps"))),
      statusSection(hotel, ctx),
      contactsSection(hotel, ctx),
      notesSection(hotel, ctx),
      h("div", { class: "msg" }, t("detail.updated", { who: who(hotel.updated_by, ctx) || "—", at: fmtMD(hotel.updated_at) }))),
  );
  drawer.scrollTop = 0;
  closeBtn.focus({ preventScroll: true });
}
