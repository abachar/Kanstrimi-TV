import type { Device, Profile, ProviderAccount } from "@/db";
import { accountsById, type Settings } from "@/config";
import { upstreamStreamUrl } from "@/providers/xtream";
import { languageOrderOf } from "@/catalog";
import type { Provider } from "./types";

/** What every authenticated request carries: who asks, and how to spell URLs and titles for them. */
export type RestContext = {
  /** Public base URL of this server, e.g. https://kanstrimi.crafters.dev */
  baseUrl: string;
  /** The paired device asking, or `null` when the admin looks through the app's eyes (no stream links then). */
  device: Device | null;
  /** Whose eyes: the profile the device is on (`X-Profile`, else the default one), or the admin's choice. */
  profile: Profile;
  /** The languages the profile's filters name, in their order: the versions it plays, the first one first. */
  languageOrder: Record<"vod" | "series", string[]>;
  tmdbLang: string;
  /** The provider accounts by id (Fournisseurs), disabled ones included: a variant names its own. */
  accounts: Map<number, ProviderAccount>;
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

export async function contextFor(req: Request, device: Device | null, s: Settings, profile: Profile): Promise<RestContext> {
  return {
    baseUrl: publicBaseUrl(req, s),
    device,
    profile,
    languageOrder: await languageOrderOf(profile.id),
    tmdbLang: s.tmdb_language,
    accounts: await accountsById(),
    serveAdult: s.serve_adult === "1",
  };
}

/** The provider of a source, as the app labels it: the account's name and its place in the order of preference. */
export function providerOf(ctx: RestContext, accountId: number): Provider {
  const a = ctx.accounts.get(accountId);
  return { id: `xtream-${accountId}`, name: a?.name ?? "Fournisseur", kind: "xtream", rank: a?.position ?? Number.MAX_SAFE_INTEGER };
}

/** The rank of an account among the providers: the preferred one first; an unknown account last. */
export function accountRank(ctx: RestContext, accountId: number): number {
  return ctx.accounts.get(accountId)?.position ?? Number.MAX_SAFE_INTEGER;
}

/**
 * The provider's own URL of a stream, its account in the path, for a paired device only (the admin
 * reads the catalogue without one and never plays). Empty when the account is gone.
 */
export function streamUrlOf(ctx: RestContext, accountId: number, kind: "live" | "movie" | "series", id: string, ext: string): string {
  const account = ctx.device && ctx.accounts.get(accountId);
  return account ? upstreamStreamUrl(account, kind, id, ext) : "";
}
