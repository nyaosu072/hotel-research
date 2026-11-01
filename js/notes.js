// Team-shared notes per hotel (notes table). Author = auth.uid() by column default; only the id is known client-side.
import { sb } from "./supabase.js";
import { t } from "./i18n.js";
import { fill, errMsg, fmtMD, h, toast } from "./dom.js";
import { who } from "./detail.js";

export function notesSection(hotel, ctx) {
  const list = h("div", { style: "display:grid;gap:8px" });
  const loadMsg = h("div", { class: "msg" });
  const body = h("textarea", { "aria-label": t("note.title"), placeholder: t("note.placeholder") });
  const msg = h("div", { class: "msg err", role: "alert" });
  const post = h("button", { class: "btn", style: "margin-top:8px" }, t("note.post"));
  let rows = [];

  const render = () => fill(list, ...rows.map((n) =>
    h("div", { class: "note" },
      h("p", { style: "white-space:pre-wrap" }, n.body),
      h("div", { class: "by" }, who(n.author, ctx) || "—", " ", h("span", { class: "num" }, fmtMD(n.created_at)),
        n.author === ctx.user?.id ? [" ", h("button", { class: "linklike", onclick: () => del(n) }, t("action.delete"))] : null))));

  async function reload() {
    const { data, error } = await sb.from("notes").select("*").eq("hotel_id", hotel.id).order("created_at", { ascending: false });
    if (error) { loadMsg.textContent = t("err.load"); return; }
    loadMsg.textContent = ""; rows = data; render();
  }
  async function del(n) {
    if (!confirm(t("note.confirm_delete"))) return;
    const { error } = await sb.from("notes").delete().eq("id", n.id);
    if (error) { toast(errMsg(error)); return; }
    rows = rows.filter((r) => r.id !== n.id); render();
  }
  post.onclick = async () => {
    const text = body.value.trim();
    if (!text) return;
    post.disabled = true; msg.textContent = "";
    const { data, error } = await sb.from("notes").insert({ hotel_id: hotel.id, body: text }).select("*").single();
    post.disabled = false;
    if (error) { msg.textContent = errMsg(error); post.textContent = t("action.retry"); return; } // text stays
    body.value = ""; post.textContent = t("note.post");
    rows = [data, ...rows]; render();
  };

  reload();
  return h("div", null, h("h3", null, t("note.title")), loadMsg, list, body, post, msg);
}
