import { Hono } from "hono";
import { clientIp } from "@/shared";
import { login, logout } from "../session";
import { page, back, form } from "../http";
import { LoginView } from "./view";
import { beginAttempt, endAttempt, loginFailed, loginSucceeded, loginWait } from "./attempts";

/** Only our own pages, so a crafted link cannot send the admin elsewhere after login. */
export const safeNext = (s?: string) => (s && /^\/admin\/[A-Za-z0-9/_-]*$/.test(s) ? s : "/admin");

/** `/admin/login` (page + form) and `/admin/logout` (the button of the layout). */
export const loginRoutes = new Hono();
export const logoutRoutes = new Hono();

/** The failures the login page can show, by the code in `?e=`: a closed list, so a link cannot write the message. */
const LOGIN_ERRORS: Record<string, string> = { bad: "E-mail ou mot de passe incorrect" };

loginRoutes.get("/", (c) =>
  page(c, "Connexion", <LoginView error={LOGIN_ERRORS[c.req.query("e") ?? ""]} next={c.req.query("next")} />, false),
);
loginRoutes.post("/", async (c) => {
  const next = safeNext(c.req.query("next"));
  const ip = clientIp(c.req.raw);
  const wait = loginWait(ip);
  if (wait > 0) {
    const seconds = Math.ceil(wait / 1000);
    c.status(429);
    c.header("Retry-After", String(seconds));
    return page(c, "Connexion", <LoginView error={`Trop de tentatives : réessayez dans ${seconds} s`} next={next} />, false);
  }
  if (!beginAttempt()) {
    c.status(429);
    c.header("Retry-After", "1");
    return page(c, "Connexion", <LoginView error="Une tentative est déjà en cours : réessayez dans un instant" next={next} />, false);
  }
  try {
    const { email, password } = await form(c);
    if (!(await login(c, email ?? "", password ?? ""))) {
      loginFailed(ip);
      const params = new URLSearchParams({ e: "bad" });
      if (next !== "/admin") params.set("next", next);
      return back(c, `/admin/login?${params}`, {});
    }
    loginSucceeded(ip);
    return c.redirect(next, 303);
  } finally {
    endAttempt();
  }
});
logoutRoutes.post("/", (c) => {
  logout(c);
  c.header("HX-Redirect", "/admin/login");
  return c.redirect("/admin/login", 303);
});
