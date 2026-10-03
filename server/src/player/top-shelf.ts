import { Hono } from "hono";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { db, schema, type Content } from "@/db";
import { describeError, within } from "@/shared";
import { availableWaitlistKeys, ensureEpisodes, isEpisodeKey, parseKey, trendingContents, UpstreamUnavailable } from "@/catalog";
import type { Env, RestContext } from "./context";
import { json } from "./http";
import { contentByKey, contentsInOrder, variantsOf, visibleContent } from "./contents";
import { getProgress, resumeKeys } from "./progress";
import { type EpisodeRow, loadEpisodes } from "./episodes";
import { drOf, qualityOfRank } from "./versions";
import { remaining } from "./cards";
import type { TopShelfItem } from "./types";

/** `/top-shelf`: the Apple TV home screen's carousel. */
export const topShelfRoutes = new Hono<Env>();
topShelfRoutes.get("/", async (c) => json(await topShelf(c.get("ctx"))));

/** Apple's advice for a carousel is five to ten items; six keeps it quick to browse. */
export const TOP_SHELF_SIZE = 6;
/** How long the carousel waits for the provider's episodes of a series. */
const EPISODES_WAIT_MS = 1500;
/** Series looked at for a new episode, the most recently watched first. */
const NEW_EPISODE_CANDIDATES = 10;

/**
 * One title of the carousel, and of the home hero that repeats it: the content its sheet opens, what
 * Lecture plays (`playId`, an episode for a series) and why it is there (`context`).
 */
export type ShelfPick = {
  content: Content;
  playId: string;
  reason: TopShelfItem["reason"];
  context: string;
  /** Seconds. */
  duration: number | null;
  summary?: string | null;
  /** The episode Lecture plays, for a series. */
  episode?: EpisodeRow;
};

/** The Apple TV carousel: every pick, the title in progress included. */
export async function topShelf(ctx: RestContext): Promise<TopShelfItem[]> {
  return (await shelfPicks(ctx, { resume: true })).map((p) => item(ctx, p));
}

/**
 * The awaited movies that arrived, then the last title in progress (`resume`: the home has its own
 * row for it), then a series started that received an episode since it was last watched, then the
 * week's top movies for the remaining places. Only titles with a backdrop and a TMDB title logo
 * (the carousel shows no title: it is drawn in the image), each once.
 */
export async function shelfPicks(ctx: RestContext, o: { resume: boolean }): Promise<ShelfPick[]> {
  // One place at least is left to the others.
  const picks = (await availablePicks(ctx)).slice(0, TOP_SHELF_SIZE - 1);
  const resume = o.resume ? await resumePick(ctx) : null;
  if (resume) picks.push(resume);
  const fresh = await newEpisodePick(ctx, new Set(picks.map((p) => p.content.key)));
  if (fresh) picks.push(fresh);
  const taken = new Set(picks.map((p) => p.content.key));
  for (const pick of await topMoviePicks(ctx)) {
    if (picks.length >= TOP_SHELF_SIZE) break;
    if (!taken.has(pick.content.key)) picks.push(pick);
  }
  return picks.slice(0, TOP_SHELF_SIZE);
}

const moviePick = (c: Content, reason: ShelfPick["reason"], context: string): ShelfPick => ({
  content: c,
  playId: c.key,
  reason,
  context,
  duration: c.runtime ? c.runtime * 60 : null,
});

/** The « Liste d'attente » movies the provider now has and nobody started, the latest arrival first. */
async function availablePicks(ctx: RestContext): Promise<ShelfPick[]> {
  const contents = await contentsInOrder(ctx, await availableWaitlistKeys(), "vod");
  return contents.filter(hasShelfArt).map((c) => moviePick(c, "available", "Enfin disponible"));
}

async function resumePick(ctx: RestContext): Promise<ShelfPick | null> {
  for (const p of await resumeKeys(20)) {
    const parsed = parseKey(p.contentKey);
    if (!parsed) continue;
    const content = await contentByKey(ctx, parsed.seriesKey);
    if (!hasShelfArt(content)) continue;
    const left = remaining(p);
    if (!isEpisodeKey(p.contentKey))
      return { content, playId: p.contentKey, reason: "resume", context: `Reprendre · ${left}`, duration: p.duration };
    const [e] = await db.select().from(schema.catalogEpisodes).where(eq(schema.catalogEpisodes.key, p.contentKey));
    if (!e) continue;
    return {
      content,
      playId: p.contentKey,
      reason: "resume",
      context: `Reprendre · S${e.season} É${e.number} · ${left}`,
      duration: p.duration,
      summary: e.overview,
    };
  }
  return null;
}

/** A series whose latest arrival is newer than its last watched episode, and the first unwatched episode after it. */
async function newEpisodePick(ctx: RestContext, skip: Set<string>): Promise<ShelfPick | null> {
  const watched = await db
    .select({ key: schema.appWatchProgress.contentKey, at: schema.appWatchProgress.updatedAt })
    .from(schema.appWatchProgress)
    .where(sql`${schema.appWatchProgress.contentKey} ~ ':s[0-9]+e[0-9]+$'`)
    .orderBy(desc(schema.appWatchProgress.updatedAt));
  const lastWatched = new Map<string, Date>();
  for (const w of watched) {
    const series = parseKey(w.key)?.seriesKey;
    if (series && !lastWatched.has(series)) lastWatched.set(series, w.at);
  }
  for (const [key, at] of [...lastWatched].slice(0, NEW_EPISODE_CANDIDATES)) {
    if (skip.has(key)) continue;
    const content = await contentByKey(ctx, key);
    if (!hasShelfArt(content) || content.addedAt <= at) continue;
    const { items, categoryName } = await variantsOf(ctx, content);
    // The provider gets a moment, not the home screen: past it, the rebuild lands for the next call
    // and the episodes known so far answer now. Only its outage is forgiven, not a bug.
    const rebuild = ensureEpisodes(content, items, ctx.tmdbLang);
    rebuild.catch((e) => console.error(`[top-shelf] épisodes de ${key} : ${describeError(e)}`));
    try {
      await within(rebuild, EPISODES_WAIT_MS, null);
    } catch (e) {
      if (e instanceof UpstreamUnavailable) continue;
      throw e;
    }
    const episodes = await loadEpisodes(content, items, categoryName);
    const progress = await getProgress(episodes.map((e) => e.key));
    const last = episodes.reduce((at, e, i) => (progress.has(e.key) ? i : at), -1);
    const next = episodes.slice(last + 1).find((e) => !progress.has(e.key) && e.playables.length);
    if (!next) continue;
    return {
      content,
      playId: next.key,
      reason: "new_episode",
      context: `Nouvel épisode · S${next.season} É${next.number}`,
      duration: next.runtime ? next.runtime * 60 : null,
      summary: next.overview,
      episode: next,
    };
  }
  return null;
}

/** The week's TMDB trending movies that the app sees, with a backdrop, in TMDB's order. */
async function topMoviePicks(ctx: RestContext): Promise<ShelfPick[]> {
  const contents = await trendingContents(
    "vod",
    and(visibleContent(ctx, "vod"), isNotNull(schema.catalogContents.backdropPath), isNotNull(schema.catalogContents.titleLogoPath)),
    TOP_SHELF_SIZE,
  );
  return contents.map((content, i) => moviePick(content, "top", `N° ${i + 1} cette semaine`));
}

function item(ctx: RestContext, p: ShelfPick): TopShelfItem {
  const c = p.content;
  const dr = drOf(c.dynamicRange);
  return {
    id: p.playId,
    reason: p.reason,
    context: p.context,
    title: c.title,
    summary: p.summary || c.overview,
    genre: c.genres[0] ?? null,
    duration: p.duration || null,
    release_date: c.releaseDate,
    image: shelfImage(ctx, c, "1x"),
    image_2x: shelfImage(ctx, c, "2x"),
    cast: (c.cast ?? []).slice(0, 4).map((x) => x.name),
    ...(c.maxQualityRank ? { max_quality: qualityOfRank(c.maxQualityRank) } : {}),
    ...(dr ? { dynamic_range: dr } : {}),
    play_id: p.playId,
    open_id: c.key,
  };
}

const hasShelfArt = (c: Content | null): c is Content => Boolean(c?.backdropPath && c.titleLogoPath);
/**
 * `/img/shelf/…`: the backdrop with the title logo drawn on it (`providers/tmdb`, `ensureShelfImage`).
 * `layout` follows `SHELF_LAYOUT` there: tvOS caches by URL, a new layout needs a new one.
 */
/**
 * `/img/shelf/{scale}/{backdrop}/{logo}` composes only the pair of a visible content: anything else would let anyone
 * have this server draw every backdrop with every logo, in 4K, and keep them all on its disk.
 */
export async function isShelfPair(backdrop: string, logo: string): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.catalogContents.id })
    .from(schema.catalogContents)
    .where(
      and(
        eq(schema.catalogContents.visible, true),
        eq(schema.catalogContents.backdropPath, `/${backdrop}`),
        eq(schema.catalogContents.titleLogoPath, `/${logo}`),
      ),
    )
    .limit(1);
  return Boolean(row);
}

const shelfImage = (ctx: RestContext, c: Content, scale: "1x" | "2x") =>
  `${ctx.baseUrl}/img/shelf/${scale}/${c.backdropPath!.replace(/^\//, "")}/${c.titleLogoPath!.replace(/^\//, "")}?layout=2`;
