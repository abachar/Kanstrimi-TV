import { Hono } from "hono";
import { and, asc, desc, eq, isNotNull, sql } from "drizzle-orm";
import { db, schema, type Content } from "@/db";
import { ensureEpisodes, isEpisodeKey, parseKey } from "@/catalog";
import type { Env, RestContext } from "./context";
import { json } from "./http";
import { contentByKey, variantsOf, visibleContent } from "./contents";
import { getProgress, resumeKeys, type Progress } from "./progress";
import { loadEpisodes } from "./episodes";
import { drOf, qualityOfRank } from "./versions";
import type { TopShelfItem } from "./types";

/** `/top-shelf`: the Apple TV home screen's carousel. */
export const topShelfRoutes = new Hono<Env>();
topShelfRoutes.get("/", async (c) => json(await topShelf(c.get("ctx"))));

/** Apple's advice for a carousel is five to ten items; six keeps it quick to browse. */
export const TOP_SHELF_SIZE = 6;
/** Series looked at for a new episode, the most recently watched first. */
const NEW_EPISODE_CANDIDATES = 10;

/**
 * The last title in progress, then a series started that received an episode since it was last
 * watched, then the week's top movies for the remaining places. Only titles with a backdrop and a
 * TMDB title logo (the carousel shows no title: it is drawn in the image), each once.
 */
export async function topShelf(ctx: RestContext): Promise<TopShelfItem[]> {
  const items: TopShelfItem[] = [];
  const resume = await resumeItem(ctx);
  if (resume) items.push(resume);
  const fresh = await newEpisodeItem(ctx, new Set(items.map((i) => i.open_id)));
  if (fresh) items.push(fresh);
  const taken = new Set(items.map((i) => i.open_id));
  for (const item of await topMovieItems(ctx)) {
    if (items.length >= TOP_SHELF_SIZE) break;
    if (!taken.has(item.open_id)) items.push(item);
  }
  return items;
}

async function resumeItem(ctx: RestContext): Promise<TopShelfItem | null> {
  for (const p of await resumeKeys(20)) {
    const parsed = parseKey(p.contentKey);
    if (!parsed) continue;
    const content = await contentByKey(ctx, parsed.seriesKey);
    if (!hasShelfArt(content)) continue;
    const left = remaining(p);
    if (!isEpisodeKey(p.contentKey))
      return item(ctx, content, { id: p.contentKey, reason: "resume", context: `Reprendre · ${left}`, duration: p.duration });
    const [e] = await db.select().from(schema.catalogEpisodes).where(eq(schema.catalogEpisodes.key, p.contentKey));
    if (!e) continue;
    return item(ctx, content, {
      id: p.contentKey,
      reason: "resume",
      context: `Reprendre · S${e.season} É${e.number} · ${left}`,
      duration: p.duration,
      summary: e.overview,
    });
  }
  return null;
}

/** A series whose latest arrival is newer than its last watched episode, and the first unwatched episode after it. */
async function newEpisodeItem(ctx: RestContext, skip: Set<string>): Promise<TopShelfItem | null> {
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
    const { items, categoryName } = await variantsOf(content);
    try {
      await ensureEpisodes(content, items, ctx.tmdbLang);
    } catch {
      continue; // The provider is unreachable: the episodes known so far will do next time.
    }
    const episodes = await loadEpisodes(content, items, categoryName);
    const progress = await getProgress(episodes.map((e) => e.key));
    const last = episodes.reduce((at, e, i) => (progress.has(e.key) ? i : at), -1);
    const next = episodes.slice(last + 1).find((e) => !progress.has(e.key) && e.playables.length);
    if (!next) continue;
    return item(ctx, content, {
      id: next.key,
      reason: "new_episode",
      context: `Nouvel épisode · S${next.season} É${next.number}`,
      duration: next.runtime ? next.runtime * 60 : null,
      summary: next.overview,
    });
  }
  return null;
}

/** The week's TMDB trending movies that the app sees, with a backdrop, in TMDB's order. */
async function topMovieItems(ctx: RestContext): Promise<TopShelfItem[]> {
  const rows = await db
    .select({ content: schema.catalogContents })
    .from(schema.catalogContents)
    .innerJoin(
      schema.tmdbTrending,
      and(eq(schema.tmdbTrending.tmdbId, schema.catalogContents.tmdbId), eq(schema.tmdbTrending.mediaType, "movie")),
    )
    .where(and(visibleContent(ctx, "vod"), isNotNull(schema.catalogContents.backdropPath), isNotNull(schema.catalogContents.titleLogoPath)))
    .orderBy(asc(schema.tmdbTrending.rank))
    .limit(TOP_SHELF_SIZE);
  return rows.map(({ content }, i) =>
    item(ctx, content, {
      id: content.key,
      reason: "top",
      context: `N° ${i + 1} cette semaine`,
      duration: content.runtime ? content.runtime * 60 : null,
    }),
  );
}

function item(
  ctx: RestContext,
  c: Content,
  o: { id: string; reason: TopShelfItem["reason"]; context: string; duration: number | null; summary?: string | null },
): TopShelfItem {
  const dr = drOf(c.dynamicRange);
  return {
    id: o.id,
    reason: o.reason,
    context: o.context,
    title: c.title,
    summary: o.summary || c.overview,
    genre: c.genres[0] ?? null,
    duration: o.duration || null,
    release_date: c.releaseDate,
    image: shelfImage(ctx, c, "1x"),
    image_2x: shelfImage(ctx, c, "2x"),
    cast: (c.cast ?? []).slice(0, 4).map((p) => p.name),
    ...(c.maxQualityRank ? { max_quality: qualityOfRank(c.maxQualityRank) } : {}),
    ...(dr ? { dynamic_range: dr } : {}),
    play_id: o.id,
    open_id: c.key,
  };
}

const hasShelfArt = (c: Content | null): c is Content => Boolean(c?.backdropPath && c.titleLogoPath);
/** `/img/shelf/…`: the backdrop with the title logo drawn on it (`providers/tmdb`, `ensureShelfImage`). */
const shelfImage = (ctx: RestContext, c: Content, scale: "1x" | "2x") =>
  `${ctx.baseUrl}/img/shelf/${scale}/${c.backdropPath!.replace(/^\//, "")}/${c.titleLogoPath!.replace(/^\//, "")}`;

/** « 40 min restantes », « 1 h 08 restantes ». */
export function remaining(p: Pick<Progress, "position" | "duration">): string {
  const minutes = Math.max(1, Math.round((p.duration - p.position) / 60));
  const h = Math.floor(minutes / 60),
    m = minutes % 60;
  return `${h ? `${h} h ${String(m).padStart(2, "0")}` : `${m} min`} restantes`;
}
