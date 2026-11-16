import { db, schema, client, variants, type Profile, type ProviderAccount } from "@/db";
import { invalidateAccounts, invalidateSettings } from "@/config";
import { and, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import type { XStream } from "@/providers/xtream";
import { applyFilters, attachTitles, contentKey, contentsByKey, parseName, runGrouping } from "@/catalog";

/** A title or a channel by its key, hidden or not, in the shape the app reads. */
export const contentOfKey = async (key: string) => (await contentsByKey([key]))[0];

/** Empty every catalogue table between test files, then seed the default profile and the provider account. */
export async function resetDb() {
  await db.execute(
    sql`truncate table xtream_accounts, xtream_streams, xtream_categories, catalog_streams, catalog_titles, catalog_channels, catalog_episodes, catalog_episode_sources, cache_tmdb, cache_xtream_info, app_profiles, app_profile_filters, app_profile_streams, app_profile_titles, app_profile_channels, task_steps, task_runs, cache_iptvorg_channels, settings, app_watch_progress, app_live_watch, app_favorites, app_profile_versions, app_plays, app_devices, cache_epg_programmes, settings_epg_offsets, settings_epg_sources, cache_epg_source_channels, catalog_channel_guides, catalog_studios, app_waitlist, cache_tmdb_trending, cache_tmdb_recommendations, cache_tmdb_extras, cache_skipdb_segments, cache_theintrodb, cache_introdb restart identity cascade`,
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
    sql`insert into app_profile_titles (title_id, profile_id) select id, ${PROFILE} from catalog_titles where visible on conflict do nothing`,
  );
  await db.execute(
    sql`insert into app_profile_channels (channel_id, profile_id) select id, ${PROFILE} from catalog_channels where visible on conflict do nothing`,
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
  /** The id the provider gives the stream. */
  upstreamId: string;
  name: string;
  cat?: string;
  tmdbId?: number;
  matchStatus?: "pending" | "matched" | "unmatched" | "manual" | "skipped";
  hidden?: boolean;
  raw?: Partial<XStream>;
  addedAt?: Date;
  section?: string;
};

export async function seedCategories(
  rows: { accountId?: number; kind: "live" | "vod" | "series"; xtreamId: string; name: string; hidden?: boolean }[],
) {
  if (!rows.length) return;
  await db.insert(schema.xtreamCategories).values(
    rows.map((c, i) => ({
      accountId: c.accountId ?? ACCOUNT,
      kind: c.kind,
      xtreamId: c.xtreamId,
      name: c.name,
      position: i,
      hidden: c.hidden ?? false,
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
        upstreamId: r.upstreamId,
        name: r.name,
        categoryXtreamId: r.cat ?? null,
        position: i,
        section: r.section ?? null,
        raw: {
          name: r.name,
          stream_id: Number(r.upstreamId) || r.upstreamId,
          container_extension: r.kind === "live" ? "ts" : "mkv",
          ...r.raw,
        } as Record<string, unknown>,
        addedAt: r.addedAt ?? new Date("2026-09-20T04:10:00Z"),
      })),
    )
    .returning({ id: schema.xtreamStreams.id, upstreamId: schema.xtreamStreams.upstreamId });
  await db.insert(schema.catalogStreams).values(
    rows.map((r, i) => ({
      xtreamId: streams[i].id,
      hidden: r.hidden ?? false,
    })),
  );
  // A movie or a series seeded as matched has its TMDB title already, and one seeded as unmatched its
  // title without a card, as a past identification left them (TMDB asked). The others (pending) get
  // theirs when the test groups (`groupAndFilter`: without a TMDB key, a title without a card, never asked).
  for (const [i, r] of rows.entries()) {
    if (r.kind === "live") continue;
    const matched = Boolean(r.tmdbId) && (r.matchStatus === "matched" || r.matchStatus === "manual");
    if (!matched && r.matchStatus !== "unmatched") continue;
    const read = parseName(r.name, r.kind);
    const tmdbId = matched ? r.tmdbId! : null;
    const key = contentKey({ kind: r.kind, title: read.title, year: read.year, tmdbId, matchStatus: matched ? "matched" : "unmatched" });
    await db
      .insert(schema.catalogTitles)
      .values({
        key,
        kind: r.kind,
        tmdbId,
        title: read.title,
        year: read.year ?? null,
        searchTitle: read.title,
        searchYear: read.year ?? null,
        matchStatus: matched ? "matched" : "unmatched",
        matchedAt: new Date(),
        addedAt: new Date(),
      })
      .onConflictDoNothing();
    const [title] = await db.select({ id: schema.catalogTitles.id }).from(schema.catalogTitles).where(eq(schema.catalogTitles.key, key));
    const manual = r.matchStatus === "manual";
    await db
      .update(schema.catalogStreams)
      .set({ titleId: title.id, how: manual ? "manual" : matched ? "search" : "none", manual })
      .where(eq(schema.catalogStreams.xtreamId, streams[i].id));
  }
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
 * A test that never runs `channels` gets a reference that knows every channel by its own name: each
 * live stream without a channel is put on a recognised one of that name, with the theme its names give.
 * A stream `channels` has attached (even to a name the reference does not know) is left alone.
 */
export async function knowChannels() {
  const rows = await db
    .select({
      id: variants.id,
      title: sql<string>`coalesce(nullif(${variants.title}, ''), ${variants.name})`,
      market: variants.market,
      theme: variants.nameTheme,
      adult: variants.nameAdult,
    })
    .from(variants)
    .where(and(eq(variants.kind, "live"), isNull(variants.channelId)));
  const byKey = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = contentKey({ kind: "live", title: r.title, market: r.market, channelName: r.title });
    byKey.set(key, [...(byKey.get(key) ?? []), r]);
  }
  for (const [key, streams] of byKey) {
    const themes = streams.map((r) => r.theme).filter((t): t is string => t !== null);
    const theme = themes.sort((a, b) => themes.filter((t) => t === b).length - themes.filter((t) => t === a).length)[0] ?? null;
    await db
      .insert(schema.catalogChannels)
      .values({
        key,
        name: streams[0].title,
        market: streams[0].market,
        status: "known",
        theme,
        adult: streams.every((r) => r.adult),
        addedAt: new Date(),
      })
      .onConflictDoNothing();
    const [channel] = await db
      .select({ id: schema.catalogChannels.id })
      .from(schema.catalogChannels)
      .where(eq(schema.catalogChannels.key, key));
    await db
      .update(schema.catalogStreams)
      .set({ channelId: channel.id, how: "name" })
      .where(
        inArray(
          schema.catalogStreams.xtreamId,
          streams.map((r) => r.id),
        ),
      );
  }
}

/**
 * The end of a pipeline run: the grouping, then the filters that judge what it made. A version the
 * filters have not seen is left out.
 */
export async function groupAndFilter() {
  await knowChannels();
  await attachTitles();
  const stats = await runGrouping();
  const judged = await applyFilters();
  return { ...stats, variants_hidden: judged.variants_hidden, waitlist_available: stats.waitlist_available + judged.waitlist_available };
}

/** The variants of the streams matching `where` (a condition on `xtream_streams`), for a test that writes `catalog_streams`. */
export const ofStreams = (where: SQL) =>
  inArray(schema.catalogStreams.xtreamId, db.select({ id: schema.xtreamStreams.id }).from(schema.xtreamStreams).where(where));

/** What `channels` does with a live name the reference does not know: each of these streams on a channel of its own name, « Non reconnus ». */
export async function leaveUnknown(names: string[]) {
  const rows = await db
    .select({
      id: variants.id,
      title: sql<string>`coalesce(nullif(${variants.title}, ''), ${variants.name})`,
      market: variants.market,
    })
    .from(variants)
    .where(and(eq(variants.kind, "live"), inArray(variants.name, names)));
  for (const r of rows) {
    const key = contentKey({ kind: "live", title: r.title, market: r.market });
    await db
      .insert(schema.catalogChannels)
      .values({ key, name: r.title, market: r.market, status: "unknown", theme: "Non reconnus", addedAt: new Date() })
      .onConflictDoNothing();
    const [channel] = await db
      .select({ id: schema.catalogChannels.id })
      .from(schema.catalogChannels)
      .where(eq(schema.catalogChannels.key, key));
    await db.update(schema.catalogStreams).set({ channelId: channel.id, how: null }).where(eq(schema.catalogStreams.xtreamId, r.id));
  }
}
