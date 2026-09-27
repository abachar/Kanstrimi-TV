import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/shared";
import { imageUrl } from "@/sync";
import { QUALITY_RANK, DYNAMIC_RANGE_RANK, qualityOfRank as knownQualityOfRank } from "@/sync";
import type { Content, Device, Item } from "@/db";
import type { Card, DynamicRange, ProgressWire, Quality, Version } from "./types";
import type { Progress } from "./progress";

export type RestContext = {
  /** Public base URL of this server, e.g. https://kanstrimi.crafters.dev */
  baseUrl: string;
  device: Device;
  tmdbLang: string;
  /** Display name of the single Xtream account (its host). */
  providerName: string;
  /** Paramètres › « Servir les contenus adultes » ; off by default. */
  serveAdult: boolean;
};

export const DEFAULT_LANGUAGE_ORDER = ["VF", "VOSTFR", "VO"];
const LANG_RANK = (l: string) => { const i = DEFAULT_LANGUAGE_ORDER.indexOf(l); return i === -1 ? 3 : i; };
export function sortLanguages(langs: Iterable<string>): string[] {
  return [...new Set(langs)].sort((a, b) => LANG_RANK(a) - LANG_RANK(b) || a.localeCompare(b));
}
/** Unknown quality is served as HD: the app needs a value, and providers rarely ship worse. */
export const qualityOf = (q: string | null | undefined): Quality => (q && q in QUALITY_RANK ? q as Quality : "HD");
export const qualityOfRank = (r: number): Quality => knownQualityOfRank(r) ?? "HD";
const drOf = (d: string | null | undefined): DynamicRange | undefined => (d === "HDR" || d === "DV" ? d : undefined);

// ---------------------------------------------------------------- stream URLs

/**
 * `stream_url` is opaque to the app and re-read at every playback: a signed link to our
 * `/api/v1/stream/{source}` redirect, tied to the device and valid a day. The device token
 * never appears in a URL (VLC cannot send headers, logs must stay clean).
 */
export const STREAM_TTL_MS = 24 * 3600 * 1000;
const sign = (src: string, code: string, exp: number) => createHmac("sha256", env.sessionSecret).update(`${src}|${code}|${exp}`).digest("base64url");
export function streamUrl(ctx: RestContext, sourceId: string): string {
  const exp = Math.floor((Date.now() + STREAM_TTL_MS) / 1000);
  return `${ctx.baseUrl}/api/v1/stream/${sourceId}?d=${ctx.device.code}&e=${exp}&s=${sign(sourceId, ctx.device.code, exp)}`;
}
export function verifyStreamSignature(sourceId: string, code: string, exp: number, sig: string): boolean {
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false;
  const expected = Buffer.from(sign(sourceId, code, exp));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
/** `src-i…` = an item (movie or channel), `src-e…` = an episode source; base36 of our own ids. */
export const sourceId = (kind: "item" | "episode", id: number) => `src-${kind === "item" ? "i" : "e"}${id.toString(36)}`;
export function parseSourceId(s: string): { kind: "item" | "episode"; id: number } | null {
  const m = /^src-([ie])([0-9a-z]{1,10})$/.exec(s);
  if (!m) return null;
  const id = parseInt(m[2], 36);
  return Number.isInteger(id) && id > 0 ? { kind: m[1] === "i" ? "item" : "episode", id } : null;
}

// ---------------------------------------------------------------- versions

/** What a version needs from a playable row, whether it is an item or an episode source. */
export type Playable = {
  sourceId: string; container: string; lang: string | null; quality: string | null; dynamicRange: string | null;
  categoryName: string | null; qualityRank: number; position: number; id: number;
};

export function playableOfItem(it: Item, categoryName: string | null): Playable {
  return {
    sourceId: sourceId("item", it.id), container: String(it.raw.container_extension ?? (it.kind === "live" ? "ts" : "mp4")).toUpperCase(),
    lang: it.lang, quality: it.quality, dynamicRange: it.dynamicRange, categoryName, qualityRank: it.qualityRank, position: it.position, id: it.id,
  };
}

/** Group playable rows by language × quality × dynamic range; sources in server order. */
export function versionsOf(ctx: RestContext, rows: Playable[], withSources = true): Version[] {
  const map = new Map<string, Version & { _q: number; _d: number }>();
  const sorted = [...rows].sort((a, b) => b.qualityRank - a.qualityRank || a.position - b.position || a.id - b.id);
  for (const r of sorted) {
    const language = r.lang ?? "VO", quality = qualityOf(r.quality), dr = drOf(r.dynamicRange);
    const id = `${language.toLowerCase()}-${quality.toLowerCase()}${dr ? `-${dr.toLowerCase()}` : ""}`;
    let v = map.get(id);
    if (!v) { v = { id, language, quality, ...(dr ? { dynamic_range: dr } : {}), sources: [], _q: QUALITY_RANK[quality], _d: dr ? DYNAMIC_RANGE_RANK[dr] : 0 }; map.set(id, v); }
    if (withSources) v.sources.push({
      id: r.sourceId, container: r.container, stream_url: streamUrl(ctx, r.sourceId),
      provider: { id: "xtream", name: ctx.providerName, kind: "xtream" }, origin: r.categoryName,
    });
  }
  return [...map.values()]
    .sort((a, b) => LANG_RANK(a.language) - LANG_RANK(b.language) || a.language.localeCompare(b.language) || b._q - a._q || b._d - a._d)
    .map(({ _q, _d, ...v }) => v);
}

export function versionsSummary(versions: Version[]): { max_quality?: Quality; dynamic_range?: DynamicRange; languages: string[] } {
  let q = 0, d = 0;
  for (const v of versions) { q = Math.max(q, QUALITY_RANK[v.quality]); if (v.dynamic_range) d = Math.max(d, DYNAMIC_RANGE_RANK[v.dynamic_range]); }
  return { ...(q ? { max_quality: qualityOfRank(q) } : {}), ...(d ? { dynamic_range: d === 2 ? "DV" : "HDR" } : {}), languages: sortLanguages(versions.map((v) => v.language)) };
}

// ---------------------------------------------------------------- cards

export function progressWire(p: Progress | undefined, withFinished: boolean): ProgressWire | null {
  if (!p) return null;
  return withFinished ? { position: p.position, duration: p.duration, finished: p.finished } : { position: p.position, duration: p.duration };
}

export const kindOf = (c: Content): Card["kind"] => (c.kind === "vod" ? "movie" : c.kind === "series" ? "series" : "live");

/** The base block every list carries. */
export function baseCard(ctx: RestContext, c: Content): Card {
  return {
    id: c.key, kind: kindOf(c), title: c.title,
    poster: c.kind === "live" ? c.logoUrl : imageUrl(ctx.baseUrl, "w500", c.posterPath) || null,
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
    year: c.year, rating: c.rating, genres: c.genres, hint: hintOf(base.languages ?? []), added_at: c.addedAt.toISOString(),
  };
}

/** Base + sheet block, without versions and seasons (added by the caller). */
export function sheetCard(ctx: RestContext, c: Content, extra: { providerCategory: string | null; rawTitle: string | null }): Card {
  const tmdb = c.key.startsWith("tmdb:");
  return {
    ...gridCard(ctx, c),
    backdrop: imageUrl(ctx.baseUrl, "w1280", c.backdropPath) || null,
    original_title: c.originalTitle, end_year: c.endYear, overview: c.overview, runtime: c.runtime, certification: c.certification,
    cast: c.cast ?? [], director: c.director,
    trailer: c.trailerKey ? `https://www.youtube.com/watch?v=${c.trailerKey}` : null,
    has_tmdb: tmdb, provider_category: tmdb ? null : extra.providerCategory, raw_title: tmdb ? null : extra.rawTitle,
  };
}
