import type { Context } from "hono";
import { getSignedCookie, setSignedCookie, deleteCookie } from "hono/cookie";
import { env } from "@/shared";
import { verify, isUnlocked } from "@/config";

const COOKIE = "kanstrimi_admin";
const MAX_AGE = 60 * 60 * 24 * 30;

/** Logged in = valid cookie AND vault unlocked (a restart locks it again). With `DEV_PASSWORD`, every request is. */
export async function isLoggedIn(c: Context) {
  if (env.devPassword) return verify(env.devPassword);
  return isUnlocked() && (await getSignedCookie(c, env.sessionSecret, COOKIE)) === "1";
}
export async function login(c: Context, email: string, password: string): Promise<boolean> {
  // Password checked even on a wrong email, so the answer time does not reveal which one failed.
  const ok = await verify(password);
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
