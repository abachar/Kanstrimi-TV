import { isTmdbKey } from "@/catalog";
import type { Content } from "@/db";
import { signedImagePath } from "@/shared";
import type { Card, ContentItem, Person, ProgressWire } from "./types";
import type { RestContext } from "./context";
import { isResumable, type Progress } from "./progress";
import { drOf, languageLabel, qualityBadgeOf, qualityOfRank, sortLanguages } from "./versions";

/** The one `Card` of the contract, in its three sizes: base (every list), grid (+ year, rating…), sheet (+ overview, cast…). */

/** The URL of a TMDB image through this server's `/img` cache; empty when there is no image. */
export function imageUrl(baseUrl: string, size: string, tmdbPath: string | null | undefined): string {
  if (!tmdbPath) return "";
  return `${baseUrl}${signedImagePath(size, tmdbPath)}`;
}

/** A channel logo: iptv-org's through this server (`/img/logos/…`), else the provider's absolute URL. */
export function channelLogo(baseUrl: string, logo: string | null): string | null {
  return logo?.startsWith("/") ? `${baseUrl}${logo}` : logo;
}

export function progressWire(p: Progress | undefined, withFinished: boolean): ProgressWire | null {
  if (!p) return null;
  const resumable = isResumable(p);
  return withFinished
    ? { position: p.position, duration: p.duration, finished: p.finished, resumable }
    : { position: p.position, duration: p.duration, resumable };
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

/** "VOSTF seul" when that is the only language; the series-specific hint needs the episodes. */
export function hintOf(languages: string[]): string | null {
  return languages.length === 1 && languages[0] === "VOSTFR" ? `${languageLabel("VOSTFR")} seul` : null;
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

/** The wide picture and the title's logo: the sheet. */
export function artBlock(ctx: RestContext, c: Content): Pick<Card, "backdrop" | "logo"> {
  return {
    backdrop: imageUrl(ctx.baseUrl, "w1280", c.backdropPath) || null,
    logo: imageUrl(ctx.baseUrl, "w500", c.titleLogoPath) || null,
  };
}

/** The cast kept on a content, as the sheet and the player show it. */
export function castOf(ctx: RestContext, c: Content): Person[] {
  return (c.cast ?? []).map((p) => ({
    id: p.id != null ? `person:${p.id}` : null,
    name: p.name,
    role: p.role,
    photo: imageUrl(ctx.baseUrl, "w185", p.profile) || null,
  }));
}

/** Base + sheet block, without versions and seasons (added by the caller). */
export function sheetCard(
  ctx: RestContext,
  c: Content,
  extra: { providerCategory: string | null; rawTitle: string | null; seasonCount?: number },
): Card {
  const tmdb = isTmdbKey(c.key);
  return {
    ...gridCard(ctx, c),
    ...artBlock(ctx, c),
    tagline: c.kind === "series" ? `SÉRIE · ${extra.seasonCount ?? 0} ${(extra.seasonCount ?? 0) > 1 ? "SAISONS" : "SAISON"}` : "FILM",
    facts: sheetFacts(c),
    rating_label: c.rating ? `★ ${c.rating.toFixed(1)}` : null,
    original_title: c.originalTitle,
    end_year: c.endYear,
    overview: c.overview,
    runtime: c.runtime,
    certification: c.certification,
    cast: castOf(ctx, c),
    director: c.director,
    trailer: c.trailerKey ? `https://www.youtube.com/watch?v=${c.trailerKey}` : null,
    has_tmdb: tmdb,
    provider_category: tmdb ? null : extra.providerCategory,
    raw_title: tmdb ? null : extra.rawTitle,
  };
}

/** « 2019 », « 2019 – 2022 » (a series that ended the year it began: « 2021 »), then two genres at most, then the runtime: « 2019 · Drame, Crime · 52 min »; null when empty. */
function sheetFacts(c: Content): string | null {
  const parts = [
    c.year ? (c.endYear && c.endYear !== c.year ? `${c.year} – ${c.endYear}` : String(c.year)) : null,
    c.genres.length ? c.genres.slice(0, 2).join(", ") : null,
    c.runtime ? runtimeText(c.runtime) : null,
  ].filter((t) => t !== null);
  return parts.length ? parts.join(" · ") : null;
}

/**
 * The play button of a title, on its sheet and on its home slide. A movie: « Revoir », « Reprendre · 40 min restantes »,
 * « Lecture ». A series (`series` given, its current episode or null): « Reprendre S2 É4 », « Lire S2 É4 », « Lecture ».
 * `progress` is the movie's, or the current episode's.
 */
export function playLabel(progress: Progress | undefined, series?: { season: number; number: number } | null): string {
  if (series === undefined) {
    if (isWatched(progress)) return "Revoir";
    return isResumable(progress) ? `Reprendre · ${remaining(progress)}` : "Lecture";
  }
  if (!series) return "Lecture";
  return `${isResumable(progress) ? "Reprendre" : "Lire"} S${series.season} É${series.number}`;
}

/** « 40 min restantes », « 1 h 08 restantes ». */
export function remaining(p: Pick<Progress, "position" | "duration">): string {
  const minutes = Math.max(1, Math.round((p.duration - p.position) / 60));
  const h = Math.floor(minutes / 60),
    m = minutes % 60;
  return `${h ? `${h} h ${String(m).padStart(2, "0")}` : `${m} min`} restantes`;
}

/** « 2 h 18 », « 52 min ». */
export function runtimeText(minutes: number): string {
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}` : `${minutes} min`;
}

/** The badges of a card: its quality first, then its languages as they read on screen. */
export function badgesOf(quality: string | null, languages: string[]): string[] {
  return [quality, ...languages.map(languageLabel)].filter((b) => b !== null);
}

/** « 1 film », « 3 films ». */
export const filmCount = (n: number) => (n > 1 ? `${n} films` : `${n} film`);

/** « S2 · É4 ». */
export const episodeCode = (season: number, number: number) => `S${season} · É${number}`;

/** « Vu »: what the write derived (`setProgress` at 90 %, `setFinished`). */
export function isWatched(p: Progress | undefined): boolean {
  return Boolean(p?.finished);
}

/** « 4K DV », « HD »: the best quality of a content and its dynamic range. */
export function qualityBadge(c: Content): string | null {
  return qualityBadgeOf({
    max_quality: c.maxQualityRank ? qualityOfRank(c.maxQualityRank) : undefined,
    dynamic_range: drOf(c.dynamicRange),
  });
}

/** « 2019 · ★ 8.5 »: the year and the rating, null when neither is known. */
export function factsOf(year: number | null, rating: number | null): string | null {
  const parts = [year ? String(year) : null, rating ? `★ ${rating.toFixed(1)}` : null].filter((p) => p !== null);
  return parts.length ? parts.join(" · ") : null;
}

/** The list item of a movie or a series: what its card draws, every text written. */
export function contentItem(ctx: RestContext, c: Content, progress?: Progress): ContentItem {
  const base = baseCard(ctx, c);
  const languages = base.languages ?? [];
  const quality = qualityBadge(c);
  const resumable = isResumable(progress);
  return {
    id: base.id,
    kind: base.kind,
    title: base.title,
    poster: base.poster ?? null,
    logo: imageUrl(ctx.baseUrl, "w500", c.titleLogoPath) || null,
    picture: imageUrl(ctx.baseUrl, "w1280", c.backdropPath) || null,
    facts: factsOf(c.year, c.rating),
    quality,
    badges: badgesOf(quality, languages),
    hint: hintOf(languages),
    progress: resumable ? progress.position / progress.duration : null,
    watched: isWatched(progress),
    caption: resumable ? remaining(progress) : null,
    overview: null,
  };
}

/** A « Reprendre » item: a movie, or an episode under its series' title and picture with its code. */
export function resumeItem(
  ctx: RestContext,
  c: Content,
  p: Progress,
  episode?: { key: string; season: number; number: number },
): ContentItem {
  const item = contentItem(ctx, c, p);
  if (!episode) return item;
  return {
    ...item,
    id: episode.key,
    kind: "episode",
    caption: [episodeCode(episode.season, episode.number), item.caption].filter((t) => t !== null).join(" · "),
  };
}

/** The player's « Similaires »: no progress, « 2003 · Action · 2 h 18 », « Série · 2019 · Drame ». */
export function relatedItem(ctx: RestContext, c: Content): ContentItem {
  const caption = [
    c.kind === "series" ? "Série" : null,
    c.year ? String(c.year) : null,
    c.genres[0] ?? null,
    c.kind !== "series" && c.runtime ? runtimeText(c.runtime) : null,
  ].filter((t) => t !== null);
  return { ...contentItem(ctx, c), caption: caption.length ? caption.join(" · ") : null };
}

/** « À suivre » after a movie or a series: « 2003 · Action · 2 h 18 », its badges and overview. */
export function upNextItem(ctx: RestContext, c: Content): ContentItem {
  const item = relatedItem(ctx, c);
  return { ...item, facts: item.caption, caption: null, overview: c.overview };
}
