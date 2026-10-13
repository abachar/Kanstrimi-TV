import { db, schema, client, type Profile } from "@/db";
import { invalidateSettings } from "@/config";
import { sql } from "drizzle-orm";
import type { XStream } from "@/providers/xtream";
import { applyFilters, runGrouping } from "@/catalog";

/** Empty every catalogue table between test files, then seed the default profile. */
export async function resetDb() {
  await db.execute(
    sql`truncate table xtream_streams, xtream_categories, catalog_variants, catalog_contents, catalog_episodes, catalog_episode_variants, catalog_categories, tmdb_cache, xtream_info_cache, app_profiles, app_profile_filters, catalog_variant_profiles, catalog_content_profiles, task_steps, task_runs, iptvorg_channels, settings, app_watch_progress, app_live_watch, app_favorites, app_devices, catalog_epg_programmes, curation_epg_offsets, curation_epg_sources, catalog_epg_source_channels, curation_epg_links, curation_studios, curation_waitlist, tmdb_trending, tmdb_recommendations, tmdb_extras, skipdb_segments, theintrodb_cache, introdb_cache restart identity cascade`,
  );
  await db.insert(schema.appProfiles).values({ name: "Hakim", isDefault: true, judgedAt: new Date() }); // the restarted identity gives it PROFILE
  invalidateSettings();
}

/** The default profile `resetDb` seeds (identities restart: it is always 1), the one every test records for. */
export const PROFILE = 1;
/**
 * Contents inserted by hand with `visible: true` (no variant, no step): the default profile sees them,
 * as the `filters` step would have written.
 */
export async function profileSeesVisible() {
  await db.execute(
    sql`insert into catalog_content_profiles (content_id, profile_id) select id, ${PROFILE} from catalog_contents where visible on conflict do nothing`,
  );
}

/** The same profile as a context carries it. */
export const testProfile: Profile = {
  id: PROFILE,
  name: "Hakim",
  isDefault: true,
  createdAt: new Date("2026-09-01T00:00:00Z"),
  judgedAt: new Date("2026-09-01T00:00:00Z"),
  avatarVersion: "d41d8cd9",
};
/** The language order of a profile without filters, as a context carries it. */
export const testLanguageOrder = { vod: ["VF", "VOSTFR", "VO"], series: ["VF", "VOSTFR", "VO"] };

export async function closeDb() {
  await client.end({ timeout: 5 });
}

export type ItemSeed = {
  kind: "live" | "vod" | "series";
  xtreamId: string;
  name: string;
  cat?: string;
  tmdbId?: number;
  matchStatus?: "pending" | "matched" | "unmatched" | "manual" | "skipped";
  hiddenManual?: boolean;
  raw?: Partial<XStream>;
  addedAt?: Date;
  keyOverride?: string;
  section?: string;
};

export async function seedCategories(rows: { kind: "live" | "vod" | "series"; xtreamId: string; name: string; hiddenManual?: boolean }[]) {
  if (!rows.length) return;
  await db.insert(schema.catalogCategories).values(
    rows.map((c, i) => ({
      kind: c.kind,
      xtreamId: c.xtreamId,
      name: c.name,
      position: i,
      hiddenManual: c.hiddenManual ?? false,
      raw: {},
    })),
  );
}

export async function seedItems(rows: ItemSeed[]) {
  if (!rows.length) return [];
  return db
    .insert(schema.catalogVariants)
    .values(
      rows.map((r, i) => ({
        kind: r.kind,
        xtreamId: r.xtreamId,
        name: r.name,
        categoryXtreamId: r.cat ?? null,
        position: i,
        tmdbId: r.tmdbId ?? null,
        matchStatus: r.matchStatus ?? (r.kind === "live" ? "skipped" : "pending"),
        hiddenManual: r.hiddenManual ?? false,
        keyOverride: r.keyOverride ?? null,
        section: r.section ?? null,
        raw: {
          name: r.name,
          stream_id: Number(r.xtreamId) || r.xtreamId,
          container_extension: r.kind === "live" ? "ts" : "mkv",
          ...r.raw,
        } as Record<string, unknown>,
        addedAt: r.addedAt ?? new Date("2026-09-20T04:10:00Z"),
      })),
    )
    .returning({ id: schema.catalogVariants.id, xtreamId: schema.catalogVariants.xtreamId });
}

export async function seedTmdb(mediaType: "movie" | "tv", tmdbId: number, data: Record<string, unknown>, lang = "fr-FR") {
  await db
    .insert(schema.tmdbCache)
    .values({ mediaType, tmdbId, lang, data: { id: tmdbId, ...data } })
    .onConflictDoNothing();
}

/** Programmes of the guide, `startAt` / `endAt` relative to now in minutes. */
export async function seedProgrammes(rows: { channelId: string; start: number; end: number; title: string; overview?: string }[]) {
  if (!rows.length) return;
  const now = Date.now();
  await db.insert(schema.catalogEpgProgrammes).values(
    rows.map((r) => ({
      channelId: r.channelId,
      startAt: new Date(now + r.start * 60_000),
      endAt: new Date(now + r.end * 60_000),
      title: r.title,
      overview: r.overview ?? null,
      importedAt: new Date(now),
    })),
  );
}

/**
 * The end of a pipeline run: the grouping, then the filters that judge what it made. A version the
 * filters have not seen is left out.
 */
export async function groupAndFilter() {
  const stats = await runGrouping();
  const judged = await applyFilters();
  return { ...stats, variants_hidden: judged.variants_hidden, waitlist_available: stats.waitlist_available + judged.waitlist_available };
}
