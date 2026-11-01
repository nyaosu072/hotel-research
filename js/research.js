// Research overview: every hotel with a research row, across regions, + CSV export.
import { sb } from "./supabase.js";
import { getLang, t } from "./i18n.js";
import { fill, fmtDate, h, toast } from "./dom.js";
import { names } from "./hotel.js";
import { STATUSES } from "./status.js";
import { toCsv } from "./csv.js";
import { loadRegions, regionLabel } from "./regions.js";
import { requestOpen } from "./list.js";

const filter = { statuses: [] }; // empty = all

export async function mount(view) {
  const page = h("div", { class: "page" });
  view.append(page);
  fill(page, h("h1", null, t("research.title")), h("div", { class: "skel" }));

  const [trees, { data, error }] = await Promise.all([
    Promise.all([loadRegions("JP"), loadRegions("KR")]).then(([JP, KR]) => ({ JP, KR })),
    sb.from("research").select("*, hotels(id, country, region_code, name_ja, name_en, name_ko, main_email, contacts(email))").order("updated_at", { ascending: false }),
  ]);
  if (error) { fill(page, h("h1", null, t("research.title")), h("div", { class: "msg err" }, t("err.load"))); return; }

  const lang = getLang();
  const all = data.filter((r) => r.hotels).map((r) => {
    const hx = r.hotels;
    return {
      hotelId: hx.id, country: hx.country, code: hx.region_code, status: r.status, updated: r.updated_at,
      name: names(hx, lang).main, region: regionLabel(hx.region_code, trees, lang), assignee: r.assignee ?? "",
      mainEmail: hx.main_email ?? "", contactEmails: (hx.contacts ?? []).map((c) => c.email).filter(Boolean).join("; "),
      last: r.last_contacted_at ?? "",
    };
  }).sort((a, b) => STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status) || (a.updated < b.updated ? 1 : -1));

  const cols = ["hotel", "region", "status", "assignee", "main_email", "contact_email", "last"].map((k) => t(`research.col.${k}`));
  const shown = () => all.filter((r) => !filter.statuses.length || filter.statuses.includes(r.status));
  const toRow = (r) => Object.fromEntries([r.name, r.region, t(`status.${r.status}`), r.assignee, r.mainEmail, r.contactEmails, fmtDate(r.last)].map((v, i) => [cols[i], v]));

  function render() {
    const rows = shown();
    fill(page, 
      h("h1", null, t("research.title")),
      h("div", { class: "inline" },
        ...STATUSES.map((s) => h("button", {
          class: "chip", "aria-pressed": String(filter.statuses.includes(s)),
          onclick: () => { filter.statuses = filter.statuses.includes(s) ? filter.statuses.filter((x) => x !== s) : [...filter.statuses, s]; render(); },
        }, `${t(`status.${s}`)} ${all.filter((r) => r.status === s).length}`)),
        h("span", { style: "flex:1" }),
        h("button", { class: "btn", disabled: !rows.length, onclick: () => download(toCsv(rows.map(toRow), cols)) }, t("research.export"))),
      rows.length
        ? h("div", { class: "card tblwrap" }, h("table", { class: "tbl" },
          h("thead", null, h("tr", null, ...cols.map((c) => h("th", null, c)))),
          h("tbody", null, ...rows.map((r) => h("tr", null,
            h("td", null, r.code ? h("button", { class: "linklike", onclick: () => requestOpen(r.country, r.code, r.hotelId) }, r.name) : r.name),
            h("td", null, r.region),
            h("td", null, h("span", { class: "status", style: `--c:var(--st-${r.status})` }, h("i"), t(`status.${r.status}`))),
            h("td", null, r.assignee),
            h("td", null, r.mainEmail),
            h("td", null, r.contactEmails),
            h("td", { class: "num" }, fmtDate(r.last)))))))
        : h("div", { class: "empty" }, t("research.empty")),
    );
  }
  render();
}

function download(csv) {
  const d = new Date(), p = (n) => String(n).padStart(2, "0");
  const a = h("a", { href: URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })), download: `research-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}.csv` });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  toast(t("research.exported"));
}
