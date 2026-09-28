import type { Device } from "@/db";
import type { Settings } from "@/config";

/** What every authenticated request carries: who asks, and how to spell URLs and titles for them. */
export type RestContext = {
  /** Public base URL of this server, e.g. https://kanstrimi.crafters.dev */
  baseUrl: string;
  /** The paired device asking, or `null` when the admin looks through the app's eyes (no stream links then). */
  device: Device | null;
  tmdbLang: string;
  /** Display name of the single Xtream account (its host). */
  providerName: string;
  /** Paramètres › « Servir les contenus adultes » ; off by default. */
  serveAdult: boolean;
};

/** Hono environment of the API routers. */
export type Env = { Variables: { device: Device; ctx: RestContext } };

/** Base URL of this server as the client sees it: the configured one, else the proxy headers. */
export function publicBaseUrl(req: Request, settings: Settings) {
  if (settings.public_base_url) return settings.public_base_url.replace(/\/+$/, "");
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

export function contextFor(req: Request, device: Device | null, s: Settings): RestContext {
  let providerName = "Fournisseur";
  try {
    providerName = new URL(s.xtream_url.startsWith("http") ? s.xtream_url : `http://${s.xtream_url}`).hostname;
  } catch {
    /* keep default */
  }
  return { baseUrl: publicBaseUrl(req, s), device, tmdbLang: s.tmdb_language, providerName, serveAdult: s.serve_adult === "1" };
}
