import { getSettings, type Settings } from "@/lib/settings";
import { XtreamClient } from "@/lib/xtream/client";
import { verify } from "@/lib/auth/vault";

export type ApiContext = {
  settings: Settings;
  upstream: XtreamClient;
  /** Public base URL of this server, e.g. http://192.168.1.10:3000 */
  baseUrl: string;
  /** Credentials the client authenticated with (proxy or real). */
  username: string;
  password: string;
};

/** Base URL of this server as seen by the client. */
export function publicBaseUrl(req: Request, settings: Settings) {
  if (settings.public_base_url) return settings.public_base_url.replace(/\/+$/, "");
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

/** Validate Xtream-style credentials: client username + the admin password (which also unlocks the vault). */
export async function authenticate(req: Request, username?: string | null, password?: string | null): Promise<ApiContext | null> {
  const sp = new URL(req.url).searchParams;
  const u = username ?? sp.get("username") ?? "";
  const p = password ?? sp.get("password") ?? "";
  if (!(await verify(p))) return null;
  const settings = await getSettings();
  if (u !== settings.proxy_username || !settings.xtream_url) return null;
  return {
    settings,
    upstream: new XtreamClient(settings.xtream_url, settings.xtream_username, settings.xtream_password),
    baseUrl: publicBaseUrl(req, settings),
    username: u, password: p,
  };
}

/** Stream URLs always point to this server (302 to upstream); upstream credentials never reach clients. */
export function streamBase(ctx: ApiContext): { base: string; username: string; password: string } {
  return { base: ctx.baseUrl, username: ctx.username, password: ctx.password };
}

export function streamUrl(ctx: ApiContext, kind: "live" | "movie" | "series", id: number | string, ext: string) {
  const b = streamBase(ctx);
  return `${b.base}/${kind}/${encodeURIComponent(b.username)}/${encodeURIComponent(b.password)}/${id}.${ext}`;
}
