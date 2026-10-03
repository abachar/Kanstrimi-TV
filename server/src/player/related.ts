import { and, asc, desc, eq, gt, inArray, like, or } from "drizzle-orm";
import { db, schema, type Content } from "@/db";
import { cachedRecommendedKeys, isEpisodeKey, isTmdbKey, parseKey, recommendedKeys } from "@/catalog";
import type { RestContext } from "./context";
import { contentByKey, contentsInOrder, variantsOf, visibleContent } from "./contents";
import { getProgress, isResumable, listProgress, type Progress } from "./progress";
import { favoriteKeys } from "./favorites";
import { contentItem, relatedItem, upNextItem } from "./cards";
import { loadEpisodes } from "./episodes";
import type { ContentItem, Suggestion, Suggestions } from "./types";

/**
 * « Si vous avez aimé… »: TMDB's recommendations crossed with what the app may see, on the sheet, in
 * the player and on the home screen. Never seen titles; at the end of a title, nothing in progress
 * either; on the home screen, nothing of « Ma liste ».
 */

/** The sheet waits this long for TMDB; past it the row shows at the next opening. */
const SHEET_WAIT_MS = 2000;
/** The player asks once playback has started: it can wait longer. */
const PLAYER_WAIT_MS = 4000;
const SHEET_RELATED = 10;
const PLAYER_RELATED = 5;
const HOME_RELATED = 24;
/** The home row's seeds: the titles last watched, plus « Ma liste ». */
const HOME_SEEDS = 30;

type WatchState = "seen" | "started";

/**
 * Seen or in progress, per content. A movie: finished, or resumable. A series: its last episode
 * finished = seen; any episode finished or resumable = in progress.
 */
async function watchStates(contents: Content[]): Promise<Map<string, WatchState>> {
  const states = new Map<string, WatchState>();
  const movies = contents.filter((c) => c.kind === "vod");
  for (const [key, p] of await getProgress(movies.map((c) => c.key))) {
    if (p.finished) states.set(key, "seen");
    else if (isResumable(p)) states.set(key, "started");
  }
  const series = contents.filter((c) => c.kind === "series");
  if (!series.length) return states;
  const rows = await db
    .select()
    .from(schema.appWatchProgress)
    .where(or(...series.map((c) => like(schema.appWatchProgress.contentKey, `${c.key.replace(/[\\%_]/g, "\\$&")}:%`))));
  const watched = new Map<string, Progress[]>();
  for (const p of rows) {
    if (!p.finished && !isResumable(p)) continue;
    const key = parseKey(p.contentKey)?.seriesKey;
    if (key) watched.set(key, [...(watched.get(key) ?? []), p]);
  }
  const started = series.filter((c) => watched.has(c.key));
  if (!started.length) return states;
  const last = await db
    .selectDistinctOn([schema.catalogEpisodes.contentId], { contentId: schema.catalogEpisodes.contentId, key: schema.catalogEpisodes.key })
    .from(schema.catalogEpisodes)
    .where(
      inArray(
        schema.catalogEpisodes.contentId,
        started.map((c) => c.id),
      ),
    )
    .orderBy(schema.catalogEpisodes.contentId, desc(schema.catalogEpisodes.season), desc(schema.catalogEpisodes.number));
  const lastKey = new Map(last.map((r) => [r.contentId, r.key]));
  for (const c of started) {
    const end = lastKey.get(c.id);
    states.set(c.key, watched.get(c.key)!.some((p) => p.finished && p.contentKey === end) ? "seen" : "started");
  }
  return states;
}

/** TMDB's recommendations of a title that the app may see, in TMDB's order, without the title itself. */
async function recommendedContents(ctx: RestContext, content: Content, waitMs: number): Promise<Content[]> {
  const keys = (await recommendedKeys(content.key, waitMs)).filter((k) => k !== content.key);
  return contentsInOrder(ctx, keys);
}

/** The sheet's row: nothing seen, ten at most. */
export async function sheetRelated(ctx: RestContext, content: Content): Promise<ContentItem[]> {
  const candidates = await recommendedContents(ctx, content, SHEET_WAIT_MS);
  const states = await watchStates(candidates);
  const kept = candidates.filter((c) => states.get(c.key) !== "seen").slice(0, SHEET_RELATED);
  const progress = await getProgress(kept.map((c) => c.key));
  return kept.map((c) => contentItem(ctx, c, progress.get(c.key)));
}

/** `/playback/{id}/suggestions`: null when the id is not a visible movie or episode. */
export async function suggestions(ctx: RestContext, key: string): Promise<Suggestions | null> {
  const parsed = parseKey(key);
  if (!parsed || parsed.kind === "live") return null;
  const episode = parsed.episode !== undefined;
  if (parsed.kind === "series" && !episode) return null;
  const content = await contentByKey(ctx, episode ? parsed.seriesKey : key);
  if (!content) return null;
  const candidates = await recommendedContents(ctx, content, PLAYER_WAIT_MS);
  const states = await watchStates(candidates);
  const related = candidates.filter((c) => states.get(c.key) !== "seen").slice(0, PLAYER_RELATED);
  const fresh = candidates.filter((c) => !states.has(c.key));

  let next: Suggestion | null = null;
  // An episode before the last one: the next episode follows, as `/playback` says.
  if (!episode || !(await hasEpisodeAfter(ctx, content, key))) {
    const saga = episode ? null : await nextInSaga(ctx, content);
    if (saga) next = { item: upNextItem(ctx, saga), reason: "saga", heading: "À SUIVRE · SUITE DE LA SAGA" };
    else if (fresh[0])
      next = {
        item: upNextItem(ctx, fresh[0]),
        reason: "recommended",
        heading: fresh[0].kind === "series" ? "À SUIVRE · NOUVELLE SÉRIE" : "À SUIVRE",
      };
  }
  return { related: related.map((c) => relatedItem(ctx, c)), next };
}

/** The saga's first movie released after this one, neither seen nor in progress. */
async function nextInSaga(ctx: RestContext, movie: Content): Promise<Content | null> {
  if (movie.sagaId === null || !movie.releaseDate) return null;
  const later = await db
    .select()
    .from(schema.catalogContents)
    .where(
      and(
        visibleContent(ctx, "vod"),
        eq(schema.catalogContents.sagaId, movie.sagaId),
        gt(schema.catalogContents.releaseDate, movie.releaseDate),
      ),
    )
    .orderBy(asc(schema.catalogContents.releaseDate), asc(schema.catalogContents.id));
  const states = await watchStates(later);
  return later.find((c) => !states.has(c.key)) ?? null;
}

async function hasEpisodeAfter(ctx: RestContext, series: Content, key: string): Promise<boolean> {
  const { items, categoryName } = await variantsOf(ctx, series);
  const episodes = await loadEpisodes(series, items, categoryName);
  const idx = episodes.findIndex((e) => e.key === key);
  return idx !== -1 && idx < episodes.length - 1;
}

/**
 * « Recommandé pour vous »: the recommendations of the last titles watched and of « Ma liste », each
 * weighed by the rank TMDB gives it and by how recent its seed is. From the cache only: the seeds
 * without recommendations yet are fetched in the background, the row fills at a later visit.
 */
export async function recommendedRow(ctx: RestContext): Promise<ContentItem[]> {
  const [history, favs] = await Promise.all([listProgress(), favoriteKeys()]);
  const seeds = new Map<string, number>();
  for (const p of history) {
    if (seeds.size >= HOME_SEEDS) break;
    if (!p.finished && !isResumable(p)) continue;
    const key = isEpisodeKey(p.contentKey) ? parseKey(p.contentKey)?.seriesKey : p.contentKey;
    if (key && isTmdbKey(key) && !seeds.has(key)) seeds.set(key, 1 - seeds.size / (2 * HOME_SEEDS));
  }
  for (const key of favs) if (isTmdbKey(key) && parseKey(key)?.kind !== "live" && !seeds.has(key)) seeds.set(key, 0.5);
  if (!seeds.size) return [];

  const recommended = await cachedRecommendedKeys([...seeds.keys()]);
  const scores = new Map<string, number>();
  for (const [seed, keys] of recommended)
    for (const [rank, k] of keys.entries()) scores.set(k, (scores.get(k) ?? 0) + seeds.get(seed)! * Math.max(0.05, 1 - rank / 20));
  const exclude = new Set([...seeds.keys(), ...favs]);
  const ranked = [...scores].filter(([k]) => !exclude.has(k)).sort((a, b) => b[1] - a[1]);
  const candidates = await contentsInOrder(
    ctx,
    ranked.map(([k]) => k),
  );
  const states = await watchStates(candidates);
  return candidates
    .filter((c) => !states.has(c.key))
    .slice(0, HOME_RELATED)
    .map((c) => contentItem(ctx, c));
}
