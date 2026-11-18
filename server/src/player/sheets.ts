import { Hono } from "hono";
import type { Content } from "@/db";
import { parseKey, refreshCardOnOpen } from "@/catalog";
import type { Env, RestContext } from "./context";
import { fail, json } from "./http";
import { contentByKey, variantsOf, type Variants } from "./contents";
import { getProgress } from "./progress";
import { favoriteSet } from "./favorites";
import { hintOf, playLabel, progressWire, sheetCard } from "./cards";
import { languageLabel, variantsSummary, wireVariants } from "./variants";
import { sagaRefOf } from "./sagas";
import { sheetRelated } from "./related";
import { rememberedFor, rememberedWire } from "./remembered";
import { currentEpisode, episodesOf, seasonsWire, seriesPlayables, seriesVariants, type EpisodeRow } from "./episodes";
import type { Card, EpisodeRef, Variant } from "./types";

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
  const own = await variantsOf(ctx, content);
  const variants = wireVariants(ctx, own.playables);
  const [progress, favs, saga, remembered] = await Promise.all([
    getProgress(ctx.profile.id, [content.key]),
    favoriteSet(ctx.profile.id),
    sagaRefOf(ctx, content.sagaId),
    rememberedFor(ctx.profile, content.key),
  ]);
  return {
    ...sheetCard(ctx, content, provenance(own)),
    ...variantsSummary(variants),
    progress: progressWire(progress.get(content.key), true),
    play_label: playLabel(progress.get(content.key)),
    variants,
    remembered: rememberedWire(remembered, own.playables),
    is_favorite: favs.has(content.key),
    ...(saga ? { saga } : {}),
  };
}

/** Seasons, episodes with variants and progress, current episode. */
export async function seriesSheet(ctx: RestContext, content: Content): Promise<Card> {
  const { variants: own, episodes } = await episodesOf(ctx, content);
  const [progress, favs, remembered] = await Promise.all([
    getProgress(
      ctx.profile.id,
      episodes.map((e) => e.key),
    ),
    favoriteSet(ctx.profile.id),
    rememberedFor(ctx.profile, content.key),
  ]);
  const seasons = await seasonsWire(ctx, content, episodes, progress);
  const variants = seriesVariants(ctx, own, episodes);
  const current = currentEpisode(episodes, progress);
  const summary = variantsSummary(variants);
  return {
    ...sheetCard(ctx, content, { ...provenance(own), seasonCount: seasons.length }),
    ...summary,
    hint: seriesHint(summary.languages ?? [], seasons),
    progress: current ? progressWire(progress.get(current.key), true) : null,
    play_label: playLabel(current && progress.get(current.key), current ?? null),
    variants,
    remembered: rememberedWire(remembered, seriesPlayables(own.items, own.categoryName)),
    is_favorite: favs.has(content.key),
    seasons,
    current_episode: current ? episodeRef(current) : null,
  };
}
/** What the provider calls the title, from its best variant: shown on the sheet of an unmatched title. */
function provenance({ items, categoryName }: Variants) {
  const best = items[0];
  return { providerCategory: best ? categoryName(best) : null, rawTitle: best?.name ?? null };
}
const episodeRef = (e: EpisodeRow): EpisodeRef => ({ season: e.season, number: e.number, title: e.title });
function seriesHint(languages: string[], seasons: { number: number; episodes: { variants: Variant[] }[] }[]): string | null {
  if (hintOf(languages)) return hintOf(languages);
  const last = seasons[seasons.length - 1];
  if (last && languages.includes("VF") && last.episodes.some((e) => !e.variants.some((v) => v.language === "VF")))
    return `${languageLabel("VF")} partielle S${last.number}`;
  return null;
}
