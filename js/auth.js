import { sb } from "./supabase.js";
import { t } from "./i18n.js";
import { fill, h } from "./dom.js";

// Login screen: email + password only (no sign-up; accounts are invited).
export function renderLogin(root, controls) {
  const msg = h("div", { class: "msg err", role: "alert" });
  const email = h("input", { type: "email", autocomplete: "username", required: true });
  const pass = h("input", { type: "password", autocomplete: "current-password", required: true });
  const btn = h("button", { class: "btn primary", type: "submit" }, t("login.submit"));
  const form = h("form", {
    class: "form",
    onsubmit: async (e) => {
      e.preventDefault();
      btn.disabled = true;
      msg.textContent = "";
      const { error } = await sb.auth.signInWithPassword({ email: email.value.trim(), password: pass.value });
      btn.disabled = false;
      if (error) msg.textContent = t("login.error");
      // success: onAuthStateChange in app.js re-routes
    },
  }, h("label", null, t("login.email"), email), h("label", null, t("login.password"), pass), btn, msg);
  fill(root, 
    h("div", { class: "login" },
      h("div", { class: "top" }, controls),
      h("div", { class: "card" }, h("h1", null, t("app.title")), form)),
  );
  email.focus();
}

export const signOut = () => sb.auth.signOut();
