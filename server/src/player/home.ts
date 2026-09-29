import { Hono } from "hono";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema, type Content } from "@/db";
import { hasTmdbKey, isEpisodeKey } from "@/catalog";
import type { Env, RestContext } from "./context";
import { json } from "./http";
import { isNewRelease, variantsOf, visibleContent } from "./contents";
import { getProgress, resumeKeys, type Progress } from "./progress";
import { favoriteKeys } from "./favorites";
import { baseCard, gridCard, progressWire, sheetCard } from "./cards";
import { versionsOf, versionsSummary } from "./versions";
import type { Card, Home, HomeRow } from "./types";

/** `/home`: hero, "Reprendre", recent movies and series, "Ma liste". */
export const homeRoutes = new Hono<Env>();
homeRoutes.get("/", async (c) => json(await home(c.get("ctx"))));

const HOME_ROW = 24;

export async function home(ctx: RestContext): Promise<Home> {
  const [resume, recentMovies, recentSeries, favKeys] = await Promise.all([
    resumeKeys(20),
    db
      .select()
      .from(schema.contents)
      .where(and(visibleContent(ctx, "vod"), hasTmdbKey, isNewRelease()))
      .orderBy(desc(schema.contents.addedAt), desc(schema.contents.id))
      .limit(HOME_ROW),
    db
      .select()
      .from(schema.contents)
      .where(visibleContent(ctx, "series"))
      .orderBy(desc(schema.contents.addedAt), desc(schema.contents.id))
      .limit(HOME_ROW),
    favoriteKeys(),
  ]);
  const rows: HomeRow[] = [];
  const resumeCards = await resumeCardsOf(ctx, resume);
  if (resumeCards.length) rows.push({ id: "resume", kind: "resume", title: "Reprendre", cards: resumeCards });
  const progress = await getProgress([...recentMovies, ...recentSeries].map((c) => c.key));
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
  if (favKeys.length) {
    const favs = await db
      .select()
      .from(schema.contents)
      .where(and(visibleContent(ctx), inArray(schema.contents.key, favKeys)));
    const order = new Map(favKeys.map((k, i) => [k, i]));
    favs.sort((a, b) => order.get(a.key)! - order.get(b.key)!);
    if (favs.length) rows.push({ id: "favorites", kind: "favorites", title: "Ma liste", cards: favs.map((c) => gridCard(ctx, c)) });
  }
  const heroContent = recentMovies.find((c) => c.posterPath && c.backdropPath) ?? recentMovies[0];
  let hero: Home["hero"] = null;
  if (heroContent) {
    const versions = versionsOf(ctx, (await variantsOf(heroContent)).playables);
    hero = {
      card: {
        ...gridCard(ctx, heroContent, progress.get(heroContent.key)),
        backdrop: backdropOf(ctx, heroContent),
        ...versionsSummary(versions),
      },
      tagline: "FILM · NOUVEAUTÉ",
      overview: heroContent.overview,
      runtime: heroContent.runtime,
      certification: heroContent.certification,
      versions,
    };
  }
  return { hero, rows, generated_at: new Date().toISOString() };
}

/** Resume cards: a movie card, or the series card wearing the episode's progress and reference. */
async function resumeCardsOf(ctx: RestContext, resume: Progress[]): Promise<Card[]> {
  if (!resume.length) return [];
  const movieKeys = resume.filter((p) => !isEpisodeKey(p.contentKey)).map((p) => p.contentKey);
  const episodeKeys = resume.filter((p) => isEpisodeKey(p.contentKey)).map((p) => p.contentKey);
  const movies = movieKeys.length
    ? await db
        .select()
        .from(schema.contents)
        .where(and(visibleContent(ctx, "vod"), inArray(schema.contents.key, movieKeys)))
    : [];
  const episodes = episodeKeys.length
    ? await db
        .select({ e: schema.episodes, c: schema.contents })
        .from(schema.episodes)
        .innerJoin(schema.contents, eq(schema.contents.id, schema.episodes.contentId))
        .where(and(inArray(schema.episodes.key, episodeKeys), visibleContent(ctx)))
    : [];
  const byKey = new Map<string, Card>();
  for (const c of movies) byKey.set(c.key, { ...baseCard(ctx, c), backdrop: backdropOf(ctx, c), progress: null });
  for (const { e, c } of episodes) {
    // Badges of the series: the episode's own sources are not loaded here.
    byKey.set(e.key, {
      ...baseCard(ctx, c),
      id: e.key,
      kind: "episode",
      backdrop: backdropOf(ctx, c),
      progress: null,
      episode: { season: e.season, number: e.number, title: e.title },
    });
  }
  return resume.flatMap((p) => {
    const card = byKey.get(p.contentKey);
    return card ? [{ ...card, progress: progressWire(p, false) }] : [];
  });
}
const backdropOf = (ctx: RestContext, c: Content) => sheetCard(ctx, c, { providerCategory: null, rawTitle: null }).backdrop ?? null;
