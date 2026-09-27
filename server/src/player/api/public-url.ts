import type { Settings } from "@/db";

/** Base URL of this server as the client sees it: the configured one, else the proxy headers. */
export function publicBaseUrl(req: Request, settings: Settings) {
  if (settings.public_base_url) return settings.public_base_url.replace(/\/+$/, "");
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}
