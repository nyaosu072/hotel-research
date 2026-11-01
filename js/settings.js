// Settings: discovery baseline (settings.discovery_min_charge_jpy, shared by the team).
import { sb } from "./supabase.js";
import { t } from "./i18n.js";
import { fill, h, toast } from "./dom.js";

const KEY = "discovery_min_charge_jpy";

export async function mount(view, _slot, session) {
  const page = h("div", { class: "page" });
  view.append(page);
  const { data, error } = await sb.from("settings").select("value").eq("key", KEY).maybeSingle();
  if (error) { page.append(h("h1", null, t("settings.title")), h("div", { class: "msg err" }, t("err.load"))); return; }

  const input = h("input", { type: "number", min: "0", step: "1000", inputmode: "numeric", value: data?.value ?? 50000, "aria-label": t("settings.discovery") });
  const msg = h("div", { class: "msg", role: "status" });
  const save = h("button", { class: "btn primary", type: "submit" }, t("action.save"));
  const form = h("form", {
    class: "form card",
    onsubmit: async (e) => {
      e.preventDefault();
      msg.className = "msg";
      const raw = input.value.trim();
      if (!/^\d+$/.test(raw)) { msg.className = "msg err"; msg.textContent = t("settings.invalid"); return; } // integer >= 0 only
      save.disabled = true;
      const { error: err } = await sb.from("settings").upsert({ key: KEY, value: Number(raw) }, { onConflict: "key" });
      save.disabled = false;
      if (err) { msg.className = "msg err"; msg.textContent = t("err.save"); save.textContent = t("action.retry"); return; }
      // 기준가가 바뀌었으니 일본 지역 캐시를 비워, 다음에 지역을 열 때 새 기준으로 다시 검색되게 한다
      await sb.from("region_cache").update({ refreshed_at: null }).eq("country", "JP");
      msg.textContent = ""; save.textContent = t("action.save");
      toast(t("saved"));
    },
  },
  h("label", null, t("settings.discovery"), input),
  h("div", { class: "msg" }, t("settings.discovery_help")),
  h("div", { class: "inline" }, save), msg);

  fill(page, h("h1", null, t("settings.title")), form,
    h("div", { class: "msg" }, t("settings.account", { email: session.user.email ?? "" })));
}
