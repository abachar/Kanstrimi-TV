import { asc, eq, inArray } from "drizzle-orm";
import { db, schema, type Content, type Episode, type Variant } from "@/db";
import { seasonsOf } from "@/catalog";
import { qualityBadgeOf, versionsOf, versionsSummary, type Playable } from "./versions";
import { imageUrl, isWatched, progressWire, remaining, runtimeText } from "./cards";
import type { RestContext } from "./context";
import { sourceId } from "./stream-links";
import { isResumable, type Progress } from "./progress";
import type { EpisodeWire, SeasonWire, Version } from "./types";

export type EpisodeRow = Episode & { playables: Playable[] };

/** Episodes of a content in (season, number) order, each with its playable sources (visible variants only). */
export async function loadEpisodes(
  content: Content,
  variants: Variant[],
  categoryName: (it: Variant) => string | null,
): Promise<EpisodeRow[]> {
  const eps = await db
    .select()
    .from(schema.catalogEpisodes)
    .where(eq(schema.catalogEpisodes.contentId, content.id))
    .orderBy(asc(schema.catalogEpisodes.season), asc(schema.catalogEpisodes.number));
  if (!eps.length) return [];
  const byItem = new Map(variants.map((v) => [v.id, v]));
  const srcs = await db
    .select()
    .from(schema.catalogEpisodeVariants)
    .where(
      inArray(
        schema.catalogEpisodeVariants.episodeId,
        eps.map((e) => e.id),
      ),
    );
  const byEp = new Map<number, Playable[]>();
  for (const s of srcs) {
    const it = byItem.get(s.itemId);
    if (!it) continue; // hidden or gone
    const list = byEp.get(s.episodeId) ?? [];
    list.push({
      sourceId: sourceId("episode", s.id),
      container: (s.container ?? "mp4").toUpperCase(),
      upstream: { kind: "series", id: s.xtreamId, ext: s.container ?? "mp4" },
      lang: it.lang,
      quality: it.quality,
      dynamicRange: it.dynamicRange,
      edition: it.edition,
      epgIds: [],
      categoryName: categoryName(it),
      qualityRank: it.qualityRank,
      position: it.position,
      id: s.id,
    });
    byEp.set(s.episodeId, list);
  }
  return eps.map((e) => ({ ...e, playables: byEp.get(e.id) ?? [] })).filter((e) => e.playables.length > 0);
}

/** The episode a series resumes on: the one in progress, else the first never started. */
export function currentEpisode(episodes: EpisodeRow[], progress: Map<string, Progress>): EpisodeRow | undefined {
  return episodes.find((e) => isResumable(progress.get(e.key))) ?? episodes.find((e) => !progress.get(e.key));
}

export function episodeWire(ctx: RestContext, e: EpisodeRow, progress?: Progress): EpisodeWire {
  const title = e.title ?? `Épisode ${e.number}`;
  const still = imageUrl(ctx.baseUrl, "w300", e.stillPath) || null;
  const versions = versionsOf(ctx, e.playables);
  const runtime = e.runtime ? runtimeText(e.runtime) : null;
  const resumable = isResumable(progress);
  const watched = isWatched(progress);
  const facts = [runtime, resumable ? remaining(progress) : watched ? "Vu" : null].filter((t) => t !== null);
  const summary = versionsSummary(versions);
  const quality = qualityBadgeOf(summary);
  return {
    id: e.key,
    season: e.season,
    number: e.number,
    title,
    overview: e.overview,
    runtime: e.runtime,
    still,
    air_date: e.airDate ? `${e.airDate}T00:00:00Z` : null,
    versions,
    progress: progressWire(progress, true),
    item: {
      id: e.key,
      kind: "episode",
      title,
      logo: null,
      poster: null,
      picture: still,
      facts: facts.length ? facts.join(" · ") : null,
      badges: [quality, ...summary.languages].filter((b) => b !== null),
      hint: summary.languages.length === 1 ? `${summary.languages[0]} SEUL` : null,
      progress: resumable ? progress.position / progress.duration : null,
      watched,
      caption: [`É${e.number}`, runtime].filter((t) => t !== null).join(" · "),
      overview: e.overview,
    },
  };
}

/** Seasons for the sheet: TMDB names and years when known, every season that has an episode. */
export async function seasonsWire(
  ctx: RestContext,
  content: Content,
  episodes: EpisodeRow[],
  progress: Map<string, Progress>,
): Promise<SeasonWire[]> {
  const tmdbSeasons = await seasonsOf(content, ctx.tmdbLang);
  const out = new Map<number, SeasonWire>();
  for (const e of episodes) {
    let s = out.get(e.season);
    if (!s) {
      const t = tmdbSeasons.get(e.season);
      s = {
        number: e.season,
        title: t?.title || (e.season === 0 ? "Épisodes spéciaux" : `Saison ${e.season}`),
        year: t?.year ?? null,
        episodes: [],
      };
      out.set(e.season, s);
    }
    s.episodes.push(episodeWire(ctx, e, progress.get(e.key)));
  }
  return [...out.values()].sort((a, b) => a.number - b.number);
}

/** Language × quality of the whole series, without sources ("Langue de la série"). */
export function seriesVersions(ctx: RestContext, episodes: EpisodeRow[]): Version[] {
  return versionsOf(
    ctx,
    episodes.flatMap((e) => e.playables),
    false,
  );
}
