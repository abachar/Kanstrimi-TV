import type { Context } from "hono";
import { getSignedCookie, setSignedCookie, deleteCookie } from "hono/cookie";
import { env, sha256 } from "@/shared";
import { getSettings, setSettings, verifyPassword } from "@/config";

const COOKIE = "kanstrimi_admin";
const MAX_AGE = 60 * 60 * 24 * 30;

/** With `DEV_PASSWORD` (local only), checked once: every request is logged in when it matches. */
const devLogin = env.devPassword ? verifyPassword(env.devPassword) : null;

/** Changes with `ADMIN_PASSWORD_HASH`: a new password ends every session opened with the old one. */
const passwordTag = () => sha256(env.adminPasswordHash).toString("hex").slice(0, 12);
const generation = async () => (await getSettings()).session_generation || "0";

/**
 * Logged in = a signed cookie « generation.issued-at.password-tag » that is still current: the generation of the
 * last « Déconnecter toutes les sessions », the password in force, 30 days at most. With a matching `DEV_PASSWORD`,
 * every request is.
 */
export async function isLoggedIn(c: Context) {
  if (devLogin) return devLogin;
  const value = await getSignedCookie(c, env.sessionSecret, COOKIE);
  const [gen, issued, tag] = typeof value === "string" ? value.split(".") : [];
  const age = Date.now() / 1000 - Number(issued);
  return gen === (await generation()) && tag === passwordTag() && age >= 0 && age < MAX_AGE;
}
export async function login(c: Context, email: string, password: string): Promise<boolean> {
  // Password checked even on a wrong email, so the answer time does not reveal which one failed.
  const ok = await verifyPassword(password);
  if (email.trim().toLowerCase() !== env.adminEmail || !ok) return false;
  // Derived from the request rather than hard-coded so `npm run dev` keeps working over http.
  const secure = c.req.header("x-forwarded-proto") === "https" || new URL(c.req.url).protocol === "https:";
  const value = `${await generation()}.${Math.floor(Date.now() / 1000)}.${passwordTag()}`;
  await setSignedCookie(c, COOKIE, value, env.sessionSecret, {
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
/** « Déconnecter toutes les sessions »: every cookie issued so far is refused, this browser's included. */
export async function revokeSessions() {
  await setSettings({ session_generation: String(Number(await generation()) + 1) });
}
