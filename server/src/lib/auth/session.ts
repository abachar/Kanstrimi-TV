import type { Context } from "hono";
import { getSignedCookie, setSignedCookie, deleteCookie } from "hono/cookie";
import { env } from "@/lib/env";
import { verify, isUnlocked } from "./vault";

const COOKIE = "kanstrimi_admin";
const MAX_AGE = 60 * 60 * 24 * 30;

/** Logged in = valid cookie AND vault unlocked (a restart locks it again). */
export async function isLoggedIn(c: Context) {
  return isUnlocked() && (await getSignedCookie(c, env.sessionSecret, COOKIE)) === "1";
}
export async function login(c: Context, password: string): Promise<boolean> {
  if (!(await verify(password))) return false;
  // Derived from the request rather than hard-coded so `npm run dev` keeps working over http.
  const secure = c.req.header("x-forwarded-proto") === "https" || new URL(c.req.url).protocol === "https:";
  await setSignedCookie(c, COOKIE, "1", env.sessionSecret, {
    path: "/", httpOnly: true, sameSite: "Lax", maxAge: MAX_AGE, secure,
  });
  return true;
}
export function logout(c: Context) {
  deleteCookie(c, COOKIE, { path: "/" });
}
