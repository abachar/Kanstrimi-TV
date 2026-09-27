import { createHash } from "node:crypto";
import { schema, tmdbMediaType, type Kind } from "@/db";
import { sql, type SQL } from "drizzle-orm";
import { slug } from "@/shared";

/**
 * The identity of a content as the app sees it (`contents.key`), and the only place that
 * knows how it is spelled: `tmdb:movie:603`, `tmdb:tv:1396`, `fallback:movie:<slug>:<year>`,
 * `live:<market>-<slug>`, `manual:<item id>` for a variant split out by hand, and
 * `<series key>:s01e05` for an episode.
 */

export type KeyInput = {
  kind: Kind;
  title: string;
  year?: number | null;
  market?: string | null;
  tmdbId?: number | null;
  matchStatus?: string | null;
  keyOverride?: string | null;
};

/**
 * The stable identity of a content, in priority order: manual override, verified TMDB id,
 * then a fallback on the cleaned title. Never a provider id.
 */
export function contentKey(i: KeyInput): string {
  if (i.keyOverride) return i.keyOverride;
  // A name without a single letter or digit (separator lines, emoji-only entries) gets a
  // key of its own instead of joining every other junk entry in one 400-variant group.
  const s = slug(i.title);
  const id = s === "-" ? `x${createHash("sha1").update(i.title).digest("hex").slice(0, 10)}` : s;
  if (i.kind === "live") return `live:${i.market ? i.market + "-" : ""}${id}`;
  if (i.tmdbId && (i.matchStatus === "matched" || i.matchStatus === "manual")) return `tmdb:${tmdbMediaType(i.kind)}:${i.tmdbId}`;
  return `fallback:${i.kind === "vod" ? "movie" : "series"}:${id}:${i.year ?? "-"}`;
}

export function episodeKey(seriesKey: string, season: number, episode: number) {
  return `${seriesKey}:s${String(season).padStart(2, "0")}e${String(episode).padStart(2, "0")}`;
}

const EPISODE_SUFFIX = /^(.*):s(\d{2})e(\d{2})$/;
export const isEpisodeKey = (key: string) => EPISODE_SUFFIX.test(key);

/** Parse a REST content id back into its parts. Null when it is not one of ours. */
export function parseKey(key: string): { kind: Kind; tmdbId?: number; season?: number; episode?: number; seriesKey: string } | null {
  const ep = EPISODE_SUFFIX.exec(key);
  const base = ep ? ep[1] : key;
  let kind: Kind;
  let tmdbId: number | undefined;
  let m: RegExpExecArray | null;
  if ((m = /^tmdb:(movie|tv):(\d+)$/.exec(base))) {
    kind = m[1] === "movie" ? "vod" : "series";
    tmdbId = Number(m[2]);
  } else if ((m = /^fallback:(movie|series):.+$/.exec(base))) kind = m[1] === "movie" ? "vod" : "series";
  else if (/^live:.+$/.test(base)) kind = "live";
  else return null;
  if (ep && kind !== "series") return null;
  return { kind, tmdbId, season: ep ? Number(ep[2]) : undefined, episode: ep ? Number(ep[3]) : undefined, seriesKey: base };
}

/** How a key was made: `merged` = a variant attached by hand to another content's key. */
export type KeyKind = "tmdb" | "fallback" | "manual" | "live" | "merged";
export function keyKind(key: string): KeyKind {
  const prefix = key.slice(0, key.indexOf(":"));
  return prefix === "tmdb" || prefix === "fallback" || prefix === "manual" || prefix === "live" ? prefix : "merged";
}
export const isTmdbKey = (key: string) => keyKind(key) === "tmdb";
export const isFallbackKey = (key: string) => keyKind(key) === "fallback";

/** The same tests, on `contents.key` in a query. */
export const hasTmdbKey: SQL = sql`${schema.contents.key} like 'tmdb:%'`;
export const hasFallbackKey: SQL = sql`${schema.contents.key} like 'fallback:%'`;
