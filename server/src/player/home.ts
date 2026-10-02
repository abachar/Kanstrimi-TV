import { Hono } from "hono";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { hasTmdbKey, isEpisodeKey } from "@/catalog";
import type { Env, RestContext } from "./context";
import { json } from "./http";
import { contentsInOrder, isNewRelease, variantsOf, visibleContent } from "./contents";
import { getProgress, resumeKeys, type Progress } from "./progress";
import { favoriteKeys } from "./favorites";
import { MOST_WATCHED_LIMIT, mostWatchedKeys } from "./watch-time";
import { artBlock, baseCard, gridCard, imageUrl, progressWire } from "./cards";
import { versionsOf, versionsSummary } from "./versions";
import { type ShelfPick, shelfPicks, TOP_SHELF_SIZE } from "./top-shelf";
import type { Card, Home, HomeHero, HomeRow } from "./types";

/**
 * `/home`: the carousel (the Top Shelf without « Reprendre »), "Reprendre", "Chaînes les plus
 * regardées", recent movies and series, "Ma liste".
 */
export const homeRoutes = new Hono<Env>();
homeRoutes.get("/", async (c) => json(await home(c.get("ctx"))));

const HOME_ROW = 24;

export async function home(ctx: RestContext): Promise<Home> {
  const [resume, recentMovies, recentSeries, favKeys, watchedKeys, picks] = await Promise.all([
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
      cards: watched.slice(0, MOST_WATCHED_LIMIT).map((c) => gridCard(ctx, c)),
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
      cards: recentMovies.map((c) => gridCard(ctx, c, progress.get(c.key))),
    });
  }
  if (recentSeries.length) {
    rows.push({
      id: "recent-series",
      kind: "recent_series",
      title: "Derniers épisodes",
      cards: recentSeries.map((c) => gridCard(ctx, c, progress.get(c.key))),
    });
  }
  const favs = await contentsInOrder(ctx, favKeys);
  if (favs.length) rows.push({ id: "favorites", kind: "favorites", title: "Ma liste", cards: favs.map((c) => gridCard(ctx, c)) });
  const heroes = await Promise.all(slides.map((p) => heroOf(ctx, p, progress.get(p.content.key))));
  return { heroes, rows, generated_at: new Date().toISOString() };
}

/** A slide: the content's card, and what Lecture plays with its own versions (an episode for a series). */
async function heroOf(
  ctx: RestContext,
  p: Pick<ShelfPick, "content" | "playId" | "context" | "episode">,
  progress: Progress | undefined,
): Promise<HomeHero> {
  const { content: c, episode: e } = p;
  const versions = versionsOf(ctx, e ? e.playables : (await variantsOf(c)).playables);
  return {
    // The title's logo too: the slide draws it in place of the title, as the sheet does. The iPhone
    // shows the poster full width: a larger one than the rows'.
    card: {
      ...gridCard(ctx, c, progress),
      poster: imageUrl(ctx.baseUrl, "w780", c.posterPath) || null,
      ...artBlock(ctx, c),
      ...versionsSummary(versions),
    },
    tagline: `${c.kind === "series" ? "Série" : "Film"} · ${p.context}`.toLocaleUpperCase("fr-FR"),
    overview: e?.overview || c.overview,
    runtime: e ? e.runtime : c.runtime,
    certification: c.certification,
    versions,
    play_id: p.playId,
    ...(e ? { episode: { season: e.season, number: e.number, title: e.title } } : {}),
  };
}

/** Resume cards: a movie card, or the series card wearing the episode's progress and reference. */
async function resumeCardsOf(ctx: RestContext, resume: Progress[]): Promise<Card[]> {
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
  const byKey = new Map<string, Card>();
  // The card draws the title's logo on its picture: no title under it.
  for (const c of movies) byKey.set(c.key, { ...baseCard(ctx, c), ...artBlock(ctx, c), progress: null });
  for (const { e, c } of episodes) {
    // Badges of the series: the episode's own sources are not loaded here.
    byKey.set(e.key, {
      ...baseCard(ctx, c),
      id: e.key,
      kind: "episode",
      ...artBlock(ctx, c),
      progress: null,
      episode: { season: e.season, number: e.number, title: e.title },
    });
  }
  return resume.flatMap((p) => {
    const card = byKey.get(p.contentKey);
    return card ? [{ ...card, progress: progressWire(p, false) }] : [];
  });
}
