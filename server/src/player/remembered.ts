import { and, eq, inArray } from "drizzle-orm";
import { db, schema, type Profile, type ProfileVariant } from "@/db";
import { parseKey } from "@/catalog";
import type { RestContext } from "./context";
import { contentByKey, variantsOf } from "./contents";
import { drOf, parseVariantId, qualityOf, variantId, variantLabel, type Playable } from "./variants";
import type { RememberedVariant } from "./types";

/**
 * The variant a profile chose for a title (`app_profile_variants`), kept while the profile's
 * `remember_variants` is on: a movie or a channel under its own key, a series under the series' key
 * whichever episode the choice was made on. What is kept is the provider's stream (a series': the one
 * the episode sits under) and what the variant was. Read back on the sheet, the home slide, `/playback`
 * and `/channels`; the apps start the title on it.
 */

const pv = schema.appProfileVariants;

/** The key a choice is stored under: the series' for an episode, the title's own otherwise. */
export const rememberKey = (key: string): string => parseKey(key)?.seriesKey ?? key;

/** The profile's choices for these keys (already `rememberKey`ed), as a map; nothing when the setting is off. */
export async function rememberedOf(profile: Profile, keys: string[]): Promise<Map<string, ProfileVariant>> {
  if (!profile.rememberVariants || !keys.length) return new Map();
  const rows = await db
    .select()
    .from(pv)
    .where(and(eq(pv.profileId, profile.id), inArray(pv.contentKey, [...new Set(keys)])));
  return new Map(rows.map((r) => [r.contentKey, r]));
}

/** The profile's choice for one title; null when none, or when the setting is off. */
export async function rememberedFor(profile: Profile, key: string): Promise<ProfileVariant | null> {
  return (await rememberedOf(profile, [rememberKey(key)])).get(rememberKey(key)) ?? null;
}

/** The provider's stream a variant id names: its own, or the series' stream an episode's variant sits under. */
async function streamOf(id: string): Promise<number | null> {
  const parsed = parseVariantId(id);
  if (!parsed) return null;
  if (parsed.kind === "item") return parsed.id;
  const [row] = await db
    .select({ streamId: schema.catalogEpisodeSources.xtreamId })
    .from(schema.catalogEpisodeSources)
    .where(eq(schema.catalogEpisodeSources.id, parsed.id));
  return row?.streamId ?? null;
}

/**
 * The stream of the title of `key` (the series for an episode) that variant `id` names: one of the title's own
 * (a series': picked on its sheet) or, for a series, an episode's under one of its streams (the one playing).
 * `unknown_title`, `unknown_variant` when it is not one of them.
 */
export async function streamOfTitle(ctx: RestContext, key: string, id: string): Promise<Playable | "unknown_title" | "unknown_variant"> {
  const content = await contentByKey(ctx, rememberKey(key));
  if (!content) return "unknown_title";
  const streamId = await streamOf(id);
  const stream = streamId === null ? undefined : (await variantsOf(ctx, content)).playables.find((p) => p.streamId === streamId);
  return stream ?? "unknown_variant";
}

/** Keeps the variant `id` names for the title of `key` (`streamOfTitle`); kept only while the setting is on. */
export async function rememberVariant(ctx: RestContext, key: string, id: string): Promise<"ok" | "unknown_title" | "unknown_variant"> {
  const chosen = await streamOfTitle(ctx, key, id);
  if (typeof chosen === "string") return chosen;
  if (!ctx.profile.rememberVariants) return "ok";
  const row = {
    profileId: ctx.profile.id,
    contentKey: rememberKey(key),
    streamId: chosen.streamId,
    language: chosen.lang ?? "VO",
    quality: qualityOf(chosen.quality),
    dynamicRange: drOf(chosen.dynamicRange) ?? null,
    edition: chosen.edition,
    updatedAt: new Date(),
  };
  await db
    .insert(pv)
    .values(row)
    .onConflictDoUpdate({ target: [pv.profileId, pv.contentKey], set: row });
  return "ok";
}

/** The title starts on the best variant again. */
export async function forgetVariant(profile: Profile, key: string): Promise<void> {
  await db.delete(pv).where(and(eq(pv.profileId, profile.id), eq(pv.contentKey, rememberKey(key))));
}

/**
 * The choice as the app reads it, beside the variants `playables` are served as: `id` is the one of them on
 * the chosen stream (an episode's, under the series' stream), else the stream's own id, which the app
 * finds or not. « FR · 4K DV · Version longue »: what the sheet shows as the series' variant.
 */
export function rememberedWire(r: ProfileVariant | null | undefined, playables: Playable[] = []): RememberedVariant | null {
  if (!r) return null;
  const quality = qualityOf(r.quality);
  const dr = drOf(r.dynamicRange);
  const what = { language: r.language, quality, ...(dr ? { dynamic_range: dr } : {}), ...(r.edition ? { edition: r.edition } : {}) };
  const id = playables.find((p) => p.streamId === r.streamId)?.variantId ?? (r.streamId === null ? "" : variantId("item", r.streamId));
  return { id, ...what, label: variantLabel(what) };
}
