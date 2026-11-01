// Manual add: hotels insert (source 'manual', homepage required), address -> coordinates via Nominatim.
import { sb } from "./supabase.js";
import { t } from "./i18n.js";
import { fill, errMsg, h, toast } from "./dom.js";
import { geocode } from "./geocode.js";
import { guessRegion, loadRegions, rname } from "./regions.js";
import { SPECS } from "./detail.js";
import { requestOpen } from "./list.js";

export async function mount(view) {
  const trees = { JP: await loadRegions("JP"), KR: await loadRegions("KR") };
  let country = "JP";
  const page = h("div", { class: "page" });
  view.append(page);

  const country$ = h("select", { "aria-label": t("add.country") },
    h("option", { value: "JP" }, t("bar.jp")), h("option", { value: "KR" }, t("bar.kr")));
  const name = h("input", { type: "text", required: true });
  const nameEn = h("input", { type: "text" });
  const address = h("input", { type: "text", required: true });
  const region = h("select", { required: true });
  const type = h("select", null, ...["hotel", "ryokan", "resort"].map((ty) => h("option", { value: ty }, t(`type.${ty}`))));
  const homepage = h("input", { type: "text", required: true, placeholder: "https://" });
  const email = h("input", { type: "email" });
  const phone = h("input", { type: "tel" });
  const price = h("input", { type: "number", min: "0", step: "1000" });
  const msg = h("div", { class: "msg", role: "status" });
  const submit = h("button", { class: "btn primary", type: "submit" }, t("add.submit"));

  const fillRegions = (guess) => {
    const keep = guess ?? region.value;
    fill(region, h("option", { value: "" }, t("bar.choose")),
      ...trees[country].map((r) => h("option", { value: r.code, selected: r.code === keep }, rname(r))));
  };
  country$.onchange = () => { country = country$.value; fillRegions(null); price.placeholder = country === "KR" ? "₩" : "¥"; };
  address.onblur = () => { if (!region.value) fillRegions(guessRegion(trees[country], address.value)); };
  fillRegions(null);
  price.placeholder = "¥";

  const field = (label, el) => h("label", null, label, el);
  const form = h("form", {
    class: "form card",
    onsubmit: async (e) => {
      e.preventDefault();
      msg.className = "msg"; msg.textContent = "";
      const hp = SPECS.homepage.parse(homepage.value);
      if (hp.err || !hp.value) { msg.className = "msg err"; msg.textContent = hp.err ?? t("add.need_homepage"); return; }
      const em = SPECS.main_email.parse(email.value);
      if (em.err) { msg.className = "msg err"; msg.textContent = em.err; return; }
      const pr = SPECS.min_charge.parse(price.value);
      if (pr.err) { msg.className = "msg err"; msg.textContent = pr.err; return; }
      if (!name.value.trim() || !region.value) { msg.className = "msg err"; msg.textContent = t("add.need_fields"); return; }

      submit.disabled = true;
      msg.textContent = t("add.geocoding");
      const pos = await geocode(address.value);
      const nameCol = country === "KR" ? "name_ko" : "name_ja";
      const row = {
        country, region_code: region.value, [nameCol]: name.value.trim(), name_en: nameEn.value.trim() || null,
        address: address.value.trim() || null, type: type.value, homepage: hp.value,
        main_email: em.value, main_phone: phone.value.trim() || null,
        min_charge: pr.value, currency: pr.value == null ? null : country === "KR" ? "KRW" : "JPY", price_source: pr.value == null ? null : "manual",
        lat: pos?.lat ?? null, lng: pos?.lng ?? null,
        source: "manual", external_id: crypto.randomUUID(),
      };
      row.manual_fields = [nameCol, "name_en", "address", "type", "homepage", "main_email", "main_phone", "min_charge"].filter((c) => row[c] != null);
      const { data, error } = await sb.from("hotels").insert(row).select("id").single();
      submit.disabled = false;
      if (error) { msg.className = "msg err"; msg.textContent = errMsg(error); submit.textContent = t("action.retry"); return; }
      toast(pos ? t("add.done") : t("add.done_noloc"));
      requestOpen(country, region.value, data.id);
    },
  },
  field(t("add.country"), country$),
  field(t("add.name"), name), field(t("add.name_en"), nameEn),
  field(t("add.address"), address),
  h("div", { class: "row2" }, field(t("add.region"), region), field(t("detail.type"), type)),
  field(t("detail.homepage") + " *", homepage),
  h("div", { class: "row2" }, field(t("detail.email"), email), field(t("detail.phone"), phone)),
  field(t("add.price"), price),
  h("div", { class: "inline" }, submit), msg);

  fill(page, h("h1", null, t("add.title")), form);
}
