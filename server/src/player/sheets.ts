import { Hono } from "hono";
import type { Content } from "@/db";
import { ensureEpisodes, parseKey, refreshCardOnOpen } from "@/catalog";
import type { Env, RestContext } from "./context";
import { fail, json } from "./http";
import { contentByKey, variantsOf } from "./contents";
import { getProgress } from "./progress";
import { favoriteSet } from "./favorites";
import { progressWire, hintOf, sheetCard } from "./cards";
import { versionsOf, versionsSummary } from "./versions";
import { sagaRefOf } from "./sagas";
import { sheetRelated } from "./related";
import { currentEpisode, loadEpisodes, seasonsWire, seriesVersions, type EpisodeRow } from "./episodes";
import type { Card, EpisodeRef, Version } from "./types";

/** `/movies/{id}`, `/series/{id}`: the whole sheet in one call. */
export function sheetRoutes(kind: "vod" | "series") {
  const routes = new Hono<Env>();
  routes.get("/:id", async (c) => {
    const key = c.req.param("id");
    const parsed = parseKey(key);
    if (!parsed || parsed.kind !== kind || parsed.episode !== undefined) return fail("not_found", "Contenu introuvable");
    let content = await contentByKey(c.get("ctx"), key);
    if (!content) return fail("not_found", "Contenu introuvable");
    // TMDB is asked for the card and the recommendations at once, each within its own wait.
    const [refreshed, related] = await Promise.all([refreshCardOnOpen(content), sheetRelated(c.get("ctx"), content)]);
    if (refreshed) content = (await contentByKey(c.get("ctx"), key)) ?? content;
    const sheet = kind === "vod" ? await movieSheet(c.get("ctx"), content) : await seriesSheet(c.get("ctx"), content);
    return json({ ...sheet, related });
  });
  return routes;
}

export async function movieSheet(ctx: RestContext, content: Content): Promise<Card> {
  const { items, playables, categoryName } = await variantsOf(content);
  const best = items[0];
  const versions = versionsOf(ctx, playables);
  const [progress, favs, saga] = await Promise.all([getProgress([content.key]), favoriteSet(), sagaRefOf(ctx, content.sagaId)]);
  return {
    ...sheetCard(ctx, content, { providerCategory: best ? categoryName(best) : null, rawTitle: best?.name ?? null }),
    ...versionsSummary(versions),
    progress: progressWire(progress.get(content.key), true),
    versions,
    is_favorite: favs.has(content.key),
    ...(saga ? { saga } : {}),
  };
}

/** Seasons, episodes with versions and progress, current episode. */
export async function seriesSheet(ctx: RestContext, content: Content): Promise<Card> {
  const { items, categoryName } = await variantsOf(content);
  await ensureEpisodes(content, items, ctx.tmdbLang);
  const episodes = await loadEpisodes(content, items, categoryName);
  const [progress, favs] = await Promise.all([getProgress(episodes.map((e) => e.key)), favoriteSet()]);
  const seasons = await seasonsWire(ctx, content, episodes, progress);
  const versions = seriesVersions(ctx, episodes);
  const current = currentEpisode(episodes, progress);
  const best = items[0];
  const summary = versionsSummary(versions);
  return {
    ...sheetCard(ctx, content, { providerCategory: best ? categoryName(best) : null, rawTitle: best?.name ?? null }),
    ...summary,
    hint: seriesHint(summary.languages ?? [], seasons),
    progress: current ? progressWire(progress.get(current.key), true) : null,
    versions,
    is_favorite: favs.has(content.key),
    seasons,
    current_episode: current ? episodeRef(current) : null,
  };
}
const episodeRef = (e: EpisodeRow): EpisodeRef => ({ season: e.season, number: e.number, title: e.title });
function seriesHint(languages: string[], seasons: { number: number; episodes: { versions: Version[] }[] }[]): string | null {
  if (hintOf(languages)) return hintOf(languages);
  const last = seasons[seasons.length - 1];
  if (last && languages.includes("VF") && last.episodes.some((e) => !e.versions.some((v) => v.language === "VF")))
    return `VF partielle S${last.number}`;
  return null;
}
