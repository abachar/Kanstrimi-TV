import { and, eq, inArray } from "drizzle-orm";
import { db, schema, type Profile, type ProfileVersion } from "@/db";
import { parseKey } from "@/catalog";
import { drOf, languageLabel, qualityOf } from "./versions";
import type { RememberedVersion, Version } from "./types";

/**
 * The version a profile chose for a title (`app_profile_versions`), kept while the profile's
 * `remember_versions` is on: a movie or a channel under its own key, a series under the series' key
 * whichever episode the choice was made on. Read back on the sheet, the home slide, `/playback` and
 * `/channels`; the apps start the title on it.
 */

const pv = schema.appProfileVersions;

/** The key a choice is stored under: the series' for an episode, the title's own otherwise. */
export const rememberKey = (key: string): string => parseKey(key)?.seriesKey ?? key;

/** The profile's choices for these keys (already `rememberKey`ed), as a map; nothing when the setting is off. */
export async function rememberedOf(profile: Profile, keys: string[]): Promise<Map<string, ProfileVersion>> {
  if (!profile.rememberVersions || !keys.length) return new Map();
  const rows = await db
    .select()
    .from(pv)
    .where(and(eq(pv.profileId, profile.id), inArray(pv.contentKey, [...new Set(keys)])));
  return new Map(rows.map((r) => [r.contentKey, r]));
}

/** The profile's choice for one title; null when none, or when the setting is off. */
export async function rememberedFor(profile: Profile, key: string): Promise<RememberedVersion | null> {
  const row = (await rememberedOf(profile, [rememberKey(key)])).get(rememberKey(key));
  return row ? rememberedWire(row) : null;
}

/** Keeps `version` for the title (the series for an episode); nothing when the setting is off. */
export async function rememberVersion(profile: Profile, key: string, version: Version): Promise<void> {
  if (!profile.rememberVersions) return;
  const row = {
    profileId: profile.id,
    contentKey: rememberKey(key),
    versionId: version.id,
    language: version.language,
    quality: version.quality,
    dynamicRange: version.dynamic_range ?? null,
    edition: version.edition ?? null,
    updatedAt: new Date(),
  };
  await db
    .insert(pv)
    .values(row)
    .onConflictDoUpdate({ target: [pv.profileId, pv.contentKey], set: row });
}

/** The title starts on the best version again. */
export async function forgetVersion(profile: Profile, key: string): Promise<void> {
  await db.delete(pv).where(and(eq(pv.profileId, profile.id), eq(pv.contentKey, rememberKey(key))));
}

/** « FR · 4K DV · Version longue »: what the sheet shows as the series' language, or a picker's current choice. */
export function rememberedWire(r: ProfileVersion): RememberedVersion {
  const quality = qualityOf(r.quality);
  const dr = drOf(r.dynamicRange);
  return {
    id: r.versionId,
    language: r.language,
    quality,
    ...(dr ? { dynamic_range: dr } : {}),
    ...(r.edition ? { edition: r.edition } : {}),
    label: [`${languageLabel(r.language)} · ${quality}${dr ? ` ${dr}` : ""}`, r.edition].filter((t) => t).join(" · "),
  };
}
