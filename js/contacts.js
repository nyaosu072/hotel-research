// Contact persons per hotel (contacts table): list, add, edit, delete.
import { sb } from "./supabase.js";
import { t } from "./i18n.js";
import { fill, clear, copyText, errMsg, fmtDate, h, toast } from "./dom.js";

const FIELDS = ["name", "department", "email", "phone", "memo"];

export function contactsSection(hotel, ctx) {
  const box = h("div");
  const list = h("ul", { class: "people" });
  const formHost = h("div");
  const loadMsg = h("div", { class: "msg" });
  let rows = [];

  async function reload() {
    const { data, error } = await sb.from("contacts").select("*").eq("hotel_id", hotel.id).order("updated_at", { ascending: false });
    if (error) { loadMsg.textContent = t("err.load"); return; }
    loadMsg.textContent = "";
    rows = data;
    renderList();
  }

  function renderList() {
    fill(list, ...rows.map((c) =>
      h("li", null,
        h("div", null,
          h("div", { class: "who" }, [c.name, c.department].filter(Boolean).join(" · ") || "—"),
          c.email ? h("div", { class: "meta" }, h("button", { class: "linklike", title: t("mail.copy"), onclick: async () => toast((await copyText(c.email)) ? t("mail.copied") : t("mail.copy_failed")) }, c.email)) : null,
          c.phone ? h("div", { class: "meta num" }, c.phone) : null,
          c.memo ? h("div", { class: "meta" }, c.memo) : null,
          c.last_contacted_at ? h("div", { class: "meta" }, t("contact.last"), " ", h("span", { class: "num" }, fmtDate(c.last_contacted_at))) : null),
        h("div", { class: "acts" },
          h("button", { class: "btn small", onclick: () => form(c) }, t("action.edit")),
          h("button", { class: "btn small danger", onclick: () => del(c) }, t("action.delete"))))));
  }

  async function del(c) {
    if (!confirm(t("contact.confirm_delete"))) return;
    const { error } = await sb.from("contacts").delete().eq("id", c.id);
    if (error) { toast(errMsg(error)); return; }
    rows = rows.filter((r) => r.id !== c.id);
    renderList();
  }

  function form(c) {
    const inputs = Object.fromEntries(FIELDS.map((f) => [f, h(f === "memo" ? "textarea" : "input", { type: f === "email" ? "email" : f === "phone" ? "tel" : "text", "aria-label": t(`contact.${f}`), placeholder: t(`contact.${f}`), value: c?.[f] ?? "" })]));
    const date = h("input", { type: "date", "aria-label": t("contact.last"), value: c?.last_contacted_at ? c.last_contacted_at.slice(0, 10) : "" });
    const msg = h("div", { class: "msg err", role: "alert" });
    const save = h("button", { class: "btn small primary" }, t("action.save"));
    save.onclick = async () => {
      const row = Object.fromEntries(FIELDS.map((f) => [f, inputs[f].value.trim() || null]));
      if (!row.name && !row.email) { msg.textContent = t("contact.need_one"); return; }
      if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) { msg.textContent = t("err.email"); return; }
      row.last_contacted_at = date.value ? new Date(date.value).toISOString() : null;
      save.disabled = true; msg.textContent = "";
      const q = c ? sb.from("contacts").update(row).eq("id", c.id) : sb.from("contacts").insert({ ...row, hotel_id: hotel.id });
      const { error } = await q;
      save.disabled = false;
      if (error) { msg.textContent = errMsg(error); save.textContent = t("action.retry"); return; } // inputs stay as typed
      clear(formHost);
      reload();
    };
    fill(formHost, h("div", { class: "cform" },
      h("div", { class: "row2" }, inputs.name, inputs.department),
      h("div", { class: "row2" }, inputs.email, inputs.phone),
      inputs.memo, h("label", { class: "msg" }, t("contact.last"), " ", date),
      h("div", { class: "inline" }, save, h("button", { class: "btn small", onclick: () => clear(formHost) }, t("action.cancel"))), msg));
    inputs.name.focus();
  }

  box.append(h("h3", null, t("contact.title")), loadMsg, list, formHost,
    h("button", { class: "btn", style: "margin-top:8px", onclick: () => form(null) }, t("contact.add")));
  reload();
  return box;
}
