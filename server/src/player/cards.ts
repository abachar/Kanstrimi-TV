import { isTmdbKey } from "@/catalog";
import type { Content } from "@/db";
import type { Card, ProgressWire } from "./types";
import type { RestContext } from "./context";
import type { Progress } from "./progress";
import { drOf, qualityOfRank, sortLanguages } from "./versions";

/** The one `Card` of the contract, in its three sizes: base (every list), grid (+ year, rating…), sheet (+ overview, cast…). */

/** The URL of a TMDB image through this server's `/img` cache; empty when there is no image. */
export function imageUrl(baseUrl: string, size: string, tmdbPath: string | null | undefined): string {
  if (!tmdbPath) return "";
  return `${baseUrl}/img/${size}${tmdbPath.startsWith("/") ? "" : "/"}${tmdbPath}`;
}

/** A channel logo: iptv-org's through this server (`/img/logos/…`), else the provider's absolute URL. */
export function channelLogo(baseUrl: string, logo: string | null): string | null {
  return logo?.startsWith("/") ? `${baseUrl}${logo}` : logo;
}

export function progressWire(p: Progress | undefined, withFinished: boolean): ProgressWire | null {
  if (!p) return null;
  return withFinished
    ? { position: p.position, duration: p.duration, finished: p.finished }
    : { position: p.position, duration: p.duration };
}

export const kindOf = (c: Content): Card["kind"] => (c.kind === "vod" ? "movie" : c.kind === "series" ? "series" : "live");

/** The base block every list carries. */
export function baseCard(ctx: RestContext, c: Content): Card {
  return {
    id: c.key,
    kind: kindOf(c),
    title: c.title,
    poster: c.kind === "live" ? channelLogo(ctx.baseUrl, c.logoUrl) : imageUrl(ctx.baseUrl, "w500", c.posterPath) || null,
    ...(c.maxQualityRank ? { max_quality: qualityOfRank(c.maxQualityRank) } : {}),
    ...(drOf(c.dynamicRange) ? { dynamic_range: drOf(c.dynamicRange) } : {}),
    languages: sortLanguages(c.languages),
  };
}

/** "VOSTFR seul" when that is the only language; the series-specific hint needs the episodes. */
export function hintOf(languages: string[]): string | null {
  return languages.length === 1 && languages[0] === "VOSTFR" ? "VOSTFR seul" : null;
}

/** Base + grid block: `/movies`, `/series`, `/search`, home rows. */
export function gridCard(ctx: RestContext, c: Content, progress?: Progress): Card {
  const base = baseCard(ctx, c);
  return {
    ...base,
    ...(progress ? { progress: progressWire(progress, false) } : {}),
    year: c.year,
    rating: c.rating,
    genres: c.genres,
    hint: hintOf(base.languages ?? []),
    added_at: c.addedAt.toISOString(),
  };
}

/** Base + sheet block, without versions and seasons (added by the caller). */
export function sheetCard(ctx: RestContext, c: Content, extra: { providerCategory: string | null; rawTitle: string | null }): Card {
  const tmdb = isTmdbKey(c.key);
  return {
    ...gridCard(ctx, c),
    backdrop: imageUrl(ctx.baseUrl, "w1280", c.backdropPath) || null,
    original_title: c.originalTitle,
    end_year: c.endYear,
    overview: c.overview,
    runtime: c.runtime,
    certification: c.certification,
    cast: c.cast ?? [],
    director: c.director,
    trailer: c.trailerKey ? `https://www.youtube.com/watch?v=${c.trailerKey}` : null,
    has_tmdb: tmdb,
    provider_category: tmdb ? null : extra.providerCategory,
    raw_title: tmdb ? null : extra.rawTitle,
  };
}
