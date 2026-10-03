import type { Context } from "hono";
import { getSignedCookie, setSignedCookie, deleteCookie } from "hono/cookie";
import { env } from "@/shared";
import { verifyPassword } from "@/config";

const COOKIE = "kanstrimi_admin";
const MAX_AGE = 60 * 60 * 24 * 30;

/** With `DEV_PASSWORD` (local only), checked once: every request is logged in when it matches. */
const devLogin = env.devPassword ? verifyPassword(env.devPassword) : null;

/** Logged in = valid cookie. With a matching `DEV_PASSWORD`, every request is. */
export async function isLoggedIn(c: Context) {
  if (devLogin) return devLogin;
  return (await getSignedCookie(c, env.sessionSecret, COOKIE)) === "1";
}
export async function login(c: Context, email: string, password: string): Promise<boolean> {
  // Password checked even on a wrong email, so the answer time does not reveal which one failed.
  const ok = await verifyPassword(password);
  if (email.trim().toLowerCase() !== env.adminEmail || !ok) return false;
  // Derived from the request rather than hard-coded so `npm run dev` keeps working over http.
  const secure = c.req.header("x-forwarded-proto") === "https" || new URL(c.req.url).protocol === "https:";
  await setSignedCookie(c, COOKIE, "1", env.sessionSecret, {
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    maxAge: MAX_AGE,
    secure,
  });
  return true;
}
export function logout(c: Context) {
  deleteCookie(c, COOKIE, { path: "/" });
}
