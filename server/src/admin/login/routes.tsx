import { Hono } from "hono";
import { clientIp } from "@/shared";
import { login, logout } from "../session";
import { isUnlocked } from "@/config";
import { page, back, form } from "../http";
import { LoginView } from "./view";
import { loginFailed, loginSucceeded, loginWait } from "./attempts";

/** Only our own pages, so a crafted link cannot send the admin elsewhere after login. */
export const safeNext = (s?: string) => (s && /^\/admin\/[A-Za-z0-9/_-]*$/.test(s) ? s : "/admin");

/** `/admin/login` (page + form) and `/admin/logout` (the button of the layout). */
export const loginRoutes = new Hono();
export const logoutRoutes = new Hono();

loginRoutes.get("/", (c) =>
  page(c, "Connexion", <LoginView locked={!isUnlocked()} error={c.req.query("err")} next={c.req.query("next")} />, false),
);
loginRoutes.post("/", async (c) => {
  const next = safeNext(c.req.query("next"));
  const ip = clientIp(c.req.raw);
  const wait = loginWait(ip);
  if (wait > 0) {
    const seconds = Math.ceil(wait / 1000);
    c.status(429);
    c.header("Retry-After", String(seconds));
    return page(
      c,
      "Connexion",
      <LoginView locked={!isUnlocked()} error={`Trop de tentatives : réessayez dans ${seconds} s`} next={next} />,
      false,
    );
  }
  const { email, password } = await form(c);
  if (!(await login(c, email ?? "", password ?? ""))) {
    loginFailed(ip);
    return back(c, `/admin/login${next !== "/admin" ? `?next=${encodeURIComponent(next)}` : ""}`, {
      err: "E-mail ou mot de passe incorrect",
    });
  }
  loginSucceeded(ip);
  return c.redirect(next, 303);
});
logoutRoutes.post("/", (c) => {
  logout(c);
  c.header("HX-Redirect", "/admin/login");
  return c.redirect("/admin/login", 303);
});
