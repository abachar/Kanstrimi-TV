import { Hono } from "hono";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { hasTmdbKey, isEpisodeKey } from "@/catalog";
import type { Env, RestContext } from "./context";
import { json } from "./http";
import { contentsInOrder, isNewRelease, variantsOf, visibleContent } from "./contents";
import { getProgress, isResumable, resumeKeys, type Progress } from "./progress";
import { favoriteKeys } from "./favorites";
import { MOST_WATCHED_LIMIT, mostWatchedKeys } from "./watch-time";
import { badgesOf, contentItem, imageUrl, playLabel, resumeItem, runtimeText } from "./cards";
import { qualityBadgeOf, versionsOf, versionsSummary } from "./versions";
import { recommendedRow } from "./related";
import { type ShelfPick, shelfPicks, TOP_SHELF_SIZE } from "./top-shelf";
import type { ContentItem, Home, HomeHero, HomeRow } from "./types";

/**
 * `/home`: the carousel (the Top Shelf without « Reprendre »), "Reprendre", "Chaînes les plus
 * regardées", recent movies and series, "Ma liste", "Recommandé pour vous".
 */
export const homeRoutes = new Hono<Env>();
homeRoutes.get("/", async (c) => json(await home(c.get("ctx"))));

const HOME_ROW = 24;

export async function home(ctx: RestContext): Promise<Home> {
  const [resume, recentMovies, recentSeries, favKeys, watchedKeys, picks, recommended] = await Promise.all([
    resumeKeys(20),
    db
      .select()
      .from(schema.catalogContents)
      .where(and(visibleContent(ctx, "vod"), hasTmdbKey, isNewRelease()))
      .orderBy(desc(schema.catalogContents.addedAt), desc(schema.catalogContents.id))
      .limit(HOME_ROW),
    db
      .select()
      .from(schema.catalogContents)
      .where(visibleContent(ctx, "series"))
      .orderBy(desc(schema.catalogContents.addedAt), desc(schema.catalogContents.id))
      .limit(HOME_ROW),
    favoriteKeys(),
    mostWatchedKeys(),
    shelfPicks(ctx, { resume: false }),
    recommendedRow(ctx),
  ]);
  const rows: HomeRow[] = [];
  const resumeCards = await resumeCardsOf(ctx, resume);
  if (resumeCards.length) rows.push({ id: "resume", kind: "resume", title: "Reprendre", cards: resumeCards });
  const watched = await contentsInOrder(ctx, watchedKeys, "live");
  if (watched.length) {
    rows.push({
      id: "most-watched-channels",
      kind: "most_watched_channels",
      title: "Chaînes les plus regardées",
      cards: watched.slice(0, MOST_WATCHED_LIMIT).map((c) => contentItem(ctx, c)),
    });
  }
  // A lifeboat: no pick at all (no TMDB trend in the catalogue, nothing awaited) still leaves a carousel.
  const slides: Pick<ShelfPick, "content" | "playId" | "context" | "episode">[] = picks.length
    ? picks
    : recentMovies
        .filter((c) => c.posterPath && c.backdropPath)
        .slice(0, TOP_SHELF_SIZE)
        .map((c) => ({ content: c, playId: c.key, context: "Nouveauté" }));
  const progress = await getProgress([...recentMovies, ...recentSeries, ...slides.map((p) => p.content)].map((c) => c.key));
  if (recentMovies.length) {
    rows.push({
      id: "recent-movies",
      kind: "recent_movies",
      title: "Nouveautés",
      cards: recentMovies.map((c) => contentItem(ctx, c, progress.get(c.key))),
    });
  }
  if (recentSeries.length) {
    rows.push({
      id: "recent-series",
      kind: "recent_series",
      title: "Derniers épisodes",
      cards: recentSeries.map((c) => contentItem(ctx, c, progress.get(c.key))),
    });
  }
  const favs = await contentsInOrder(ctx, favKeys);
  if (favs.length) rows.push({ id: "favorites", kind: "favorites", title: "Ma liste", cards: favs.map((c) => contentItem(ctx, c)) });
  if (recommended.length) rows.push({ id: "recommended", kind: "recommended", title: "Recommandé pour vous", cards: recommended });
  const favSet = new Set(favKeys);
  const heroes = await Promise.all(slides.map((p) => heroOf(ctx, p, progress.get(p.content.key), favSet.has(p.content.key))));
  return { heroes, rows, generated_at: new Date().toISOString() };
}

/** A slide: what it draws, and what Lecture plays with its own versions (an episode for a series). */
async function heroOf(
  ctx: RestContext,
  p: Pick<ShelfPick, "content" | "playId" | "context" | "episode">,
  progress: Progress | undefined,
  favorite: boolean,
): Promise<HomeHero> {
  const { content: c, episode: e } = p;
  const versions = versionsOf(ctx, e ? e.playables : (await variantsOf(ctx, c)).playables);
  const summary = versionsSummary(versions);
  const runtime = e ? e.runtime : c.runtime;
  const facts = [
    e ? `S${e.season} É${e.number}` : null,
    c.year ? String(c.year) : null,
    c.genres[0] ?? null,
    runtime ? runtimeText(runtime) : null,
  ]
    .filter((t) => t !== null)
    .join(" · ");
  const quality = qualityBadgeOf(summary);
  const resumes = !e && isResumable(progress);
  return {
    // The iPhone shows the poster full width: a larger one than the rows'.
    item: {
      ...contentItem(ctx, c, progress),
      poster: imageUrl(ctx.baseUrl, "w780", c.posterPath) || null,
      facts: facts || null,
      quality,
      badges: badgesOf(quality, summary.languages),
      progress: resumes ? progress.position / progress.duration : null,
      caption: null,
      overview: e?.overview || c.overview,
    },
    tagline: `${c.kind === "series" ? "Série" : "Film"} · ${p.context}`.toLocaleUpperCase("fr-FR"),
    overview: e?.overview || c.overview,
    runtime,
    certification: c.certification,
    versions,
    play_id: p.playId,
    ...(e ? { episode: { season: e.season, number: e.number, title: e.title } } : {}),
    is_favorite: favorite,
    play_label: playLabel(e ? undefined : progress, c.kind === "series" ? (e ?? null) : undefined),
    resume_at: resumes ? progress.position : null,
    duration: resumes ? progress.duration : runtime ? runtime * 60 : null,
  };
}

/** « Reprendre »: a movie, or an episode under its series' title and picture with its code. */
async function resumeCardsOf(ctx: RestContext, resume: Progress[]): Promise<ContentItem[]> {
  if (!resume.length) return [];
  const movieKeys = resume.filter((p) => !isEpisodeKey(p.contentKey)).map((p) => p.contentKey);
  const episodeKeys = resume.filter((p) => isEpisodeKey(p.contentKey)).map((p) => p.contentKey);
  const movies = movieKeys.length
    ? await db
        .select()
        .from(schema.catalogContents)
        .where(and(visibleContent(ctx, "vod"), inArray(schema.catalogContents.key, movieKeys)))
    : [];
  const episodes = episodeKeys.length
    ? await db
        .select({ e: schema.catalogEpisodes, c: schema.catalogContents })
        .from(schema.catalogEpisodes)
        .innerJoin(schema.catalogContents, eq(schema.catalogContents.id, schema.catalogEpisodes.contentId))
        .where(and(inArray(schema.catalogEpisodes.key, episodeKeys), visibleContent(ctx)))
    : [];
  const movieOf = new Map(movies.map((c) => [c.key, c]));
  const episodeOf = new Map(episodes.map((r) => [r.e.key, r]));
  // Badges of the series: the episode's own sources are not loaded here.
  return resume.flatMap((p) => {
    const movie = movieOf.get(p.contentKey);
    if (movie) return [resumeItem(ctx, movie, p)];
    const ep = episodeOf.get(p.contentKey);
    return ep ? [resumeItem(ctx, ep.c, p, ep.e)] : [];
  });
}
