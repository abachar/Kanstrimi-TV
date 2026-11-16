import { db, schema, client, type Profile, type ProviderAccount } from "@/db";
import { invalidateAccounts, invalidateSettings } from "@/config";
import { eq, inArray, sql, type SQL } from "drizzle-orm";
import type { XStream } from "@/providers/xtream";
import { applyFilters, runGrouping } from "@/catalog";

/** Empty every catalogue table between test files, then seed the default profile and the provider account. */
export async function resetDb() {
  await db.execute(
    sql`truncate table xtream_accounts, xtream_streams, xtream_categories, catalog_variants, catalog_contents, catalog_episodes, catalog_episode_variants, cache_tmdb, cache_xtream_info, app_profiles, app_profile_filters, catalog_variant_profiles, catalog_content_profiles, task_steps, task_runs, cache_iptvorg_channels, settings, app_watch_progress, app_live_watch, app_favorites, app_profile_versions, app_plays, app_devices, cache_epg_programmes, settings_epg_offsets, settings_epg_sources, cache_epg_source_channels, curation_epg_links, catalog_studios, app_waitlist, curation_channels, cache_tmdb_trending, cache_tmdb_recommendations, cache_tmdb_extras, cache_skipdb_segments, cache_theintrodb, cache_introdb restart identity cascade`,
  );
  await db.insert(schema.appProfiles).values({ name: "Hakim", isDefault: true, judgedAt: new Date() }); // the restarted identity gives it PROFILE
  await db
    .insert(schema.xtreamAccounts)
    .values({ name: "provider.test", url: "http://provider.test", username: "u", password: "p", position: 1 }); // ACCOUNT
  invalidateSettings();
  invalidateAccounts();
}

/** The provider account `resetDb` seeds (identities restart: it is always 1), the one every seeded row belongs to. */
export const ACCOUNT = 1;
/** Changes the seeded account (its URL, its state) for a test file. */
export async function setAccountForTests(values: Partial<Pick<ProviderAccount, "name" | "url" | "username" | "password" | "enabled">>) {
  await db.update(schema.xtreamAccounts).set(values).where(eq(schema.xtreamAccounts.id, ACCOUNT));
  invalidateAccounts();
}
/** A second provider for the tests that need one: its rows carry its id. */
export async function seedAccount(values: Partial<Pick<ProviderAccount, "name" | "url" | "username" | "password" | "enabled">> = {}) {
  const [row] = await db
    .insert(schema.xtreamAccounts)
    .values({ name: "backup.test", url: "http://backup.test", username: "u2", password: "p2", position: 2, ...values })
    .returning();
  invalidateAccounts();
  return row;
}
/** The accounts as a context carries them, after `resetDb`. */
export const testAccounts = new Map<number, ProviderAccount>([
  [
    ACCOUNT,
    {
      id: ACCOUNT,
      name: "provider.test",
      url: "http://provider.test",
      username: "u",
      password: "p",
      enabled: true,
      position: 1,
      createdAt: new Date("2026-09-01T00:00:00Z"),
      updatedAt: new Date("2026-09-01T00:00:00Z"),
    },
  ],
]);

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
  maxQuality: "4K",
  autoPlayNext: true,
  rememberVersions: true,
  switchSourceOnFailure: true,
  avatarVersion: "d41d8cd9",
};
/** The language order of a profile without filters, as a context carries it. */
export const testLanguageOrder = { vod: ["VF", "VOSTFR", "VO"], series: ["VF", "VOSTFR", "VO"] };

export async function closeDb() {
  await client.end({ timeout: 5 });
}

export type ItemSeed = {
  /** The provider account; the seeded one by default. */
  accountId?: number;
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

export async function seedCategories(
  rows: { accountId?: number; kind: "live" | "vod" | "series"; xtreamId: string; name: string; hiddenManual?: boolean }[],
) {
  if (!rows.length) return;
  await db.insert(schema.xtreamCategories).values(
    rows.map((c, i) => ({
      accountId: c.accountId ?? ACCOUNT,
      kind: c.kind,
      xtreamId: c.xtreamId,
      name: c.name,
      position: i,
      hidden: c.hiddenManual ?? false,
      raw: {},
    })),
  );
}

/** Streams as the import would have written them, each with its variant (`merge`), not read yet (`runNaming`). */
export async function seedItems(rows: ItemSeed[]) {
  if (!rows.length) return [];
  const streams = await db
    .insert(schema.xtreamStreams)
    .values(
      rows.map((r, i) => ({
        accountId: r.accountId ?? ACCOUNT,
        kind: r.kind,
        upstreamId: r.xtreamId,
        name: r.name,
        categoryXtreamId: r.cat ?? null,
        position: i,
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
    .returning({ id: schema.xtreamStreams.id, xtreamId: schema.xtreamStreams.upstreamId });
  await db.insert(schema.catalogVariants).values(
    rows.map((r, i) => ({
      id: streams[i].id,
      tmdbId: r.tmdbId ?? null,
      matchStatus: r.matchStatus ?? (r.kind === "live" ? ("skipped" as const) : ("pending" as const)),
      hiddenManual: r.hiddenManual ?? false,
      keyOverride: r.keyOverride ?? null,
    })),
  );
  return streams;
}

export async function seedTmdb(mediaType: "movie" | "tv", tmdbId: number, data: Record<string, unknown>, lang = "fr-FR") {
  await db
    .insert(schema.cacheTmdb)
    .values({ mediaType, tmdbId, lang, data: { id: tmdbId, ...data } })
    .onConflictDoNothing();
}

/** Programmes of the guide, `startAt` / `endAt` relative to now in minutes. */
export async function seedProgrammes(rows: { channelId: string; start: number; end: number; title: string; overview?: string }[]) {
  if (!rows.length) return;
  const now = Date.now();
  await db.insert(schema.cacheEpgProgrammes).values(
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
 * A test that never runs `channels` gets a reference that knows every channel by its own name: the
 * grouping keys it as a recognised channel. A variant `channels` has judged (a reference theme, even
 * « Non reconnus ») is left alone.
 */
export async function knowChannels() {
  await db.execute(sql`
    update catalog_variants v set channel_name = s.title
    from xtream_streams s
    where s.id = v.id and s.kind = 'live' and v.channel_name is null and v.iptv_theme is null and v.iptv_match is null and nullif(s.title, '') is not null`);
}

/**
 * The end of a pipeline run: the grouping, then the filters that judge what it made. A version the
 * filters have not seen is left out.
 */
export async function groupAndFilter() {
  await knowChannels();
  const stats = await runGrouping();
  const judged = await applyFilters();
  return { ...stats, variants_hidden: judged.variants_hidden, waitlist_available: stats.waitlist_available + judged.waitlist_available };
}

/** The variants of the streams matching `where` (a condition on `xtream_streams`), for a test that writes `catalog_variants`. */
export const ofStreams = (where: SQL) =>
  inArray(schema.catalogVariants.id, db.select({ id: schema.xtreamStreams.id }).from(schema.xtreamStreams).where(where));
