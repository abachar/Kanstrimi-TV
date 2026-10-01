import { sql } from "drizzle-orm";
import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  pgEnum,
  uniqueIndex,
  primaryKey,
  index,
  real,
  customType,
  date,
} from "drizzle-orm/pg-core";

const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

export const kindEnum = pgEnum("content_kind", ["live", "vod", "series"]);
export const ruleActionEnum = pgEnum("rule_action", ["hide", "keep"]);
export const ruleTargetEnum = pgEnum("rule_target", ["name", "category"]);
export const matchStatusEnum = pgEnum("match_status", ["pending", "matched", "unmatched", "manual", "skipped"]);
export const syncStatusEnum = pgEnum("sync_status", ["running", "success", "error", "killed"]);

/** Key/value settings (xtream creds, proxy creds, tmdb key, ...). */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * The provider's lists as the `source` step last read them, untouched: categories and entries
 * (separator lines included), one row per id, replaced as a whole at each import once they pass
 * the sanity checks. The `merge` step derives the catalogue from them. Created UNLOGGED by the
 * migration: a crash loses them, the next import rewrites them.
 */
export const xtreamCategories = pgTable(
  "xtream_categories",
  {
    kind: kindEnum("kind").notNull(),
    xtreamId: text("xtream_id").notNull(),
    position: integer("position").notNull(),
    raw: jsonb("raw").$type<Record<string, unknown>>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.kind, t.xtreamId] })],
);
export const xtreamStreams = pgTable(
  "xtream_streams",
  {
    kind: kindEnum("kind").notNull(),
    /** stream_id (live, vod) or series_id (series), trimmed: an opaque string. */
    xtreamId: text("xtream_id").notNull(),
    /** Rank in the provider's list: separators name the section of what follows them. */
    position: integer("position").notNull(),
    raw: jsonb("raw").$type<Record<string, unknown>>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.kind, t.xtreamId] })],
);

/** The provider's categories in the catalogue, where the admin hides them (by rule or by hand). */
export const catalogCategories = pgTable(
  "catalog_categories",
  {
    id: serial("id").primaryKey(),
    kind: kindEnum("kind").notNull(),
    xtreamId: text("xtream_id").notNull(),
    name: text("name").notNull(),
    parentId: integer("parent_id").default(0).notNull(),
    position: integer("position").default(0).notNull(),
    hiddenByRule: boolean("hidden_by_rule").default(false).notNull(),
    hiddenManual: boolean("hidden_manual").default(false).notNull(),
    raw: jsonb("raw").$type<Record<string, unknown>>().notNull(),
    /** Last time the provider's copy of this row changed (`merge`). */
    changedAt: timestamp("changed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("catalog_categories_kind_xtream_idx").on(t.kind, t.xtreamId)],
);

/**
 * One variant = one entry of the provider's lists: a live channel or a movie (a playable stream),
 * a series (its episodes are `catalog_episode_variants`). Written by `merge` (provider fields), the
 * naming (`name_*` and parsed fields), `channels` (`iptv_*`), `enrich` (`match_*`, `tmdb_id`),
 * `filters` (`hidden_by_rule`) and `group` (`content_key`, `content_id`).
 */
export const catalogVariants = pgTable(
  "catalog_variants",
  {
    id: serial("id").primaryKey(),
    kind: kindEnum("kind").notNull(),
    /**
     * stream_id (live/vod) or series_id (series) as sent by the provider — an opaque string.
     * Providers are careless: ids may be non-numeric, repeated across categories, or missing.
     */
    xtreamId: text("xtream_id").notNull(),
    name: text("name").notNull(),
    categoryXtreamId: text("category_xtream_id"),
    position: integer("position").default(0).notNull(),
    hiddenByRule: boolean("hidden_by_rule").default(false).notNull(),
    hiddenManual: boolean("hidden_manual").default(false).notNull(),
    /** Raw JSON object as returned by upstream get_*_streams / get_series. */
    raw: jsonb("raw").$type<Record<string, unknown>>().notNull(),
    // TMDB matching (vod + series only)
    cleanTitle: text("clean_title"),
    year: integer("year"),
    tmdbId: integer("tmdb_id"),
    matchStatus: matchStatusEnum("match_status").default("pending").notNull(),
    matchScore: real("match_score"),
    matchedAt: timestamp("matched_at", { withTimezone: true }),
    /** Failed matching attempts in a row (errors other than an outage): three and it is `unmatched`. */
    matchAttempts: integer("match_attempts").default(0).notNull(),
    addedAt: timestamp("added_at", { withTimezone: true }).defaultNow().notNull(),
    /** Last time the provider's copy of this row changed (`merge`). */
    changedAt: timestamp("changed_at", { withTimezone: true }).defaultNow().notNull(),
    // Grouping (block 1): one item is one playable variant of a content.
    /** Computed key, joins `catalog_contents.key`; the row it currently belongs to is `content_id`. */
    contentKey: text("content_key"),
    contentId: integer("content_id").references(() => catalogContents.id, { onDelete: "set null" }),
    /** Manual merge / split from the admin: wins over the computed key. */
    keyOverride: text("key_override"),
    /** Market code from the prefix or the category ("fr", "it"…). */
    market: text("market"),
    /** API vocabulary: VF · VOSTFR · VO · ISO code. */
    lang: text("lang"),
    /** API vocabulary: SD · HD · FHD · 4K. Null = the provider said nothing. */
    quality: text("quality"),
    qualityRank: integer("quality_rank").default(0).notNull(),
    /** HDR · DV, null = SDR. */
    dynamicRange: text("dynamic_range"),
    tags: text("tags").array().default([]).notNull(),
    seasonHint: integer("season_hint"),
    /** The name says so: adult category or tag in the name (naming). */
    nameAdult: boolean("name_adult").default(false).notNull(),
    /** Live: the label of the separator line preceding the entry in its category, as the provider wrote it. */
    section: text("section"),
    /** Live: the theme the name gives (section, category, name), written by the naming. */
    nameTheme: text("name_theme"),
    /** Live: iptv-org's channel says so (`is_nsfw`, `xxx`), and the theme it gives merged with the name's; written by `channels`, kept when it fails. */
    iptvAdult: boolean("iptv_adult").default(false).notNull(),
    iptvTheme: text("iptv_theme"),
    /** Derived, never written: each source keeps its own column, so one step failing cannot undo another's. */
    adult: boolean("adult").generatedAlwaysAs(sql`name_adult or iptv_adult`).notNull(),
    /** Live: the theme the app groups by (« Sport », « Cinéma »…): iptv-org's, else the name's. */
    theme: text("theme").generatedAlwaysAs(sql`coalesce(iptv_theme, name_theme)`),
    /** Live: the iptv-org channel this variant is (`TF1.fr`), and how it was found: epg · name · name-global · manual. */
    iptvId: text("iptv_id"),
    iptvMatch: text("iptv_match"),
    /** Live: the provider's EPG id names another channel (iptv-org says so): its guide is not this channel's. */
    epgMismatch: boolean("epg_mismatch").default(false).notNull(),
  },
  (t) => [
    uniqueIndex("catalog_variants_kind_xtream_idx").on(t.kind, t.xtreamId),
    index("catalog_variants_kind_cat_idx").on(t.kind, t.categoryXtreamId),
    index("catalog_variants_match_idx").on(t.kind, t.matchStatus),
    index("catalog_variants_content_idx").on(t.contentId),
    index("catalog_variants_content_key_idx").on(t.contentKey),
  ],
);

/**
 * One content = one work (a movie, a series, a channel), the thing the app lists, plays,
 * favourites and resumes. Filled by the `group` job from `items` and `tmdb_cache`; every
 * column is derived and rewritten in place at each run. External references (favourites,
 * progress) use `key`, never `id`: a row may vanish and come back with a new id.
 */
export const catalogContents = pgTable(
  "catalog_contents",
  {
    id: serial("id").primaryKey(),
    key: text("key").notNull().unique(),
    kind: kindEnum("kind").notNull(),
    tmdbId: integer("tmdb_id"),
    // Card fields, denormalised so lists sort and filter without touching the TMDB JSON
    title: text("title").notNull(),
    originalTitle: text("original_title"),
    /** English title from TMDB translations: the name most providers and most people search by. */
    titleEn: text("title_en"),
    year: integer("year"),
    endYear: integer("end_year"),
    posterPath: text("poster_path"),
    backdropPath: text("backdrop_path"),
    /** TMDB logo of the title, drawn in place of the title on the sheet (`logoOf`). */
    titleLogoPath: text("title_logo_path"),
    overview: text("overview"),
    rating: real("rating"),
    voteCount: integer("vote_count"),
    genreIds: integer("genre_ids").array().default([]).notNull(),
    genres: text("genres").array().default([]).notNull(),
    runtime: integer("runtime"),
    certification: text("certification"),
    cast: jsonb("cast").$type<{ name: string; role: string | null; id?: number | null; profile?: string | null }[]>(),
    director: text("director"),
    trailerKey: text("trailer_key"),
    status: text("status"),
    // Live
    market: text("market"),
    /** iptv-org's logo through `/img/logos` when the channel is known there, else the provider's URL. */
    logoUrl: text("logo_url"),
    iptvId: text("iptv_id"),
    categoryXtreamId: text("category_xtream_id"),
    channelNumber: integer("channel_number"),
    epgChannelId: text("epg_channel_id"),
    // Aggregates over the variants
    variantCount: integer("variant_count").default(0).notNull(),
    maxQualityRank: integer("max_quality_rank").default(0).notNull(),
    languages: text("languages").array().default([]).notNull(),
    dynamicRange: text("dynamic_range"),
    /** Live: every theme of its variants; a channel sits in each of its groups. */
    themes: text("themes").array().default([]).notNull(),
    visible: boolean("visible").default(false).notNull(),
    /** TMDB's adult flag, or every variant flagged adult. Served to the app only when `serve_adult` is on. */
    adult: boolean("adult").default(false).notNull(),
    /** TMDB's own adult flag, copied with the card: `adult` is computed from it and the variants. */
    tmdbAdult: boolean("tmdb_adult").default(false).notNull(),
    /** When and in which language the card fields were last copied from `tmdb_cache`: older than the cache entry = copied again. */
    cardsAt: timestamp("cards_at", { withTimezone: true }),
    cardsLang: text("cards_lang"),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull(),
    releaseDate: date("release_date"),
    /** Movies: the TMDB collection (« Harry Potter - Saga »), served as a saga once two of its movies are visible. */
    sagaId: integer("saga_id"),
    sagaName: text("saga_name"),
    sagaPosterPath: text("saga_poster_path"),
    sagaBackdropPath: text("saga_backdrop_path"),
    /** TMDB production companies (movies and series) and networks (series): what the studio hubs filter on. */
    companyIds: integer("company_ids").array().default([]).notNull(),
    networkIds: integer("network_ids").array().default([]).notNull(),
    search: tsvector("search"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("catalog_contents_list_idx").on(t.kind, t.visible, t.addedAt.desc(), t.id),
    // The sort keys of `player/lists.ts`, expression for expression, or the planner cannot use them.
    index("catalog_contents_release_idx").on(t.kind, t.visible, sql`coalesce(${t.releaseDate}, '0001-01-01'::date) desc`, t.id),
    index("catalog_contents_saga_idx").on(t.sagaId),
    // Every join from a TMDB document to its contents: the cache refresh of `enrich`, the trending rows, the studios.
    index("catalog_contents_tmdb_idx").on(t.tmdbId),
    index("catalog_contents_companies_idx").using("gin", t.companyIds),
    index("catalog_contents_networks_idx").using("gin", t.networkIds),
    index("catalog_contents_title_idx").on(t.kind, t.visible, t.title, t.id),
    index("catalog_contents_rating_idx").on(t.kind, t.visible, sql`coalesce(${t.rating}, 0) desc`, t.id),
    index("catalog_contents_year_idx").on(t.kind, t.visible, sql`coalesce(${t.year}, 0) desc`, t.id),
    index("catalog_contents_genres_idx").using("gin", t.genreIds),
    index("catalog_contents_search_idx").using("gin", t.search),
    // Serves `"cast" @> '[{"id": …}]'`, the titles of an actor's screen.
    index("catalog_contents_cast_idx").using("gin", sql`${t.cast} jsonb_path_ops`),
    // Typo-tolerant fallback of the search: trigrams of the accent-free titles. `search_titles()`
    // (unaccent, lower) is created by migration 0021; the query must repeat this expression.
    index("catalog_contents_titles_trgm_idx").using("gin", sql`search_titles(${t.title}, ${t.originalTitle}, ${t.titleEn}) gin_trgm_ops`),
  ],
);

/** Cached TMDB details (movie or tv), one row per (type, id, lang). */
export const tmdbCache = pgTable(
  "tmdb_cache",
  {
    id: serial("id").primaryKey(),
    mediaType: text("media_type").notNull(), // movie | tv
    tmdbId: integer("tmdb_id").notNull(),
    lang: text("lang").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("tmdb_cache_idx").on(t.mediaType, t.tmdbId, t.lang)],
);

/** Cached upstream get_vod_info / get_series_info responses. */
export const xtreamInfoCache = pgTable(
  "xtream_info_cache",
  {
    id: serial("id").primaryKey(),
    kind: kindEnum("kind").notNull(),
    xtreamId: text("xtream_id").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("xtream_info_cache_idx").on(t.kind, t.xtreamId)],
);

export const curationFilterRules = pgTable("curation_filter_rules", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  /** null = all kinds */
  kind: kindEnum("kind"),
  target: ruleTargetEnum("target").default("name").notNull(),
  pattern: text("pattern").notNull(),
  flags: text("flags").default("i").notNull(),
  action: ruleActionEnum("action").default("hide").notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  position: integer("position").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * The channels of the iptv-org database (github.com/iptv-org/database), refreshed daily by the
 * `channels` step: what the live variants are matched against, for their logo, theme and details.
 */
export const iptvorgChannels = pgTable(
  "iptvorg_channels",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    altNames: text("alt_names").array().default([]).notNull(),
    network: text("network"),
    owners: text("owners").array().default([]).notNull(),
    country: text("country").notNull(),
    categories: text("categories").array().default([]).notNull(),
    isNsfw: boolean("is_nsfw").default(false).notNull(),
    launched: text("launched"),
    closed: text("closed"),
    replacedBy: text("replaced_by"),
    website: text("website"),
    /** The upstream logo, and the path it is served at by this server (`/img/logos/<id>-<hash>.<ext>`). */
    logoUrl: text("logo_url"),
    logoPath: text("logo_path"),
  },
  (t) => [index("iptvorg_channels_country_idx").on(t.country)],
);

/**
 * One run of a task: the full pipeline, the EPG, or a lone step. Its steps are `sync_logs`
 * rows; its detail is a text file under DATA_DIR/logs (`log_file`), written even when the
 * database is down.
 */
export const taskRuns = pgTable(
  "task_runs",
  {
    id: serial("id").primaryKey(),
    task: text("task").notNull(), // pipeline | epg | a lone step
    trigger: text("trigger").notNull(), // cron | manual (unknown for the runs before this table)
    status: syncStatusEnum("status").default("running").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    message: text("message"),
    logFile: text("log_file"),
  },
  (t) => [index("task_runs_task_started_idx").on(t.task, t.startedAt)],
);

export const taskSteps = pgTable("task_steps", {
  id: serial("id").primaryKey(),
  runId: integer("run_id").references(() => taskRuns.id, { onDelete: "cascade" }),
  step: text("step").notNull(), // a pipeline step
  status: syncStatusEnum("status").default("running").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  message: text("message"),
  stats: jsonb("stats").$type<Record<string, unknown>>(),
});

/**
 * Episodes of a series content, merged across its variants by (season, number). Refreshed
 * from the provider's get_series_info (one call per variant, cached) and TMDB season data
 * when a series sheet is opened. `key` is the REST id: `tmdb:tv:1396:s01e05`.
 */
export const catalogEpisodes = pgTable(
  "catalog_episodes",
  {
    id: serial("id").primaryKey(),
    contentId: integer("content_id")
      .notNull()
      .references(() => catalogContents.id, { onDelete: "cascade" }),
    key: text("key").notNull().unique(),
    season: integer("season").notNull(),
    number: integer("number").notNull(),
    title: text("title"),
    overview: text("overview"),
    runtime: integer("runtime"),
    stillPath: text("still_path"),
    airDate: date("air_date"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("catalog_episodes_content_season_number_idx").on(t.contentId, t.season, t.number)],
);

/** One playable stream of an episode: the provider's episode id under one series variant (item). */
export const catalogEpisodeVariants = pgTable(
  "catalog_episode_variants",
  {
    id: serial("id").primaryKey(),
    episodeId: integer("episode_id")
      .notNull()
      .references(() => catalogEpisodes.id, { onDelete: "cascade" }),
    itemId: integer("item_id")
      .notNull()
      .references(() => catalogVariants.id, { onDelete: "cascade" }),
    /** Provider episode id, an opaque string, never exposed. */
    xtreamId: text("xtream_id").notNull(),
    container: text("container"),
    seenAt: timestamp("seen_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("catalog_episode_variants_episode_item_idx").on(t.episodeId, t.itemId),
    index("catalog_episode_variants_item_idx").on(t.itemId),
  ],
);

/**
 * The programme guide of the channels the app can see, from the provider's XMLTV. `channel_id`
 * is the provider's EPG id (`catalog_contents.epg_channel_id`). Each import tags its rows with
 * `imported_at` and drops the previous ones once it has landed, so a failed import keeps the guide.
 */
export const catalogEpgProgrammes = pgTable(
  "catalog_epg_programmes",
  {
    id: serial("id").primaryKey(),
    channelId: text("channel_id").notNull(),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    title: text("title").notNull(),
    overview: text("overview"),
    importedAt: timestamp("imported_at", { withTimezone: true }).notNull(),
    /** The correction applied to the provider's times (`epg_offsets`), so a new rule shifts by the difference. */
    offsetMinutes: integer("offset_minutes").default(0).notNull(),
  },
  (t) => [
    index("catalog_epg_programmes_channel_start_idx").on(t.channelId, t.startAt),
    index("catalog_epg_programmes_end_idx").on(t.endAt),
  ],
);
export type EpgProgramme = typeof catalogEpgProgrammes.$inferSelect;

/**
 * Corrections of the provider's guide times: a guide id (`beINSports3.qa`) or every id of a
 * suffix (`*.qa`), shifted by `minutes`. The exact id wins over a suffix; set from the EPG page.
 */
export const curationEpgOffsets = pgTable("curation_epg_offsets", {
  pattern: text("pattern").primaryKey(),
  minutes: integer("minutes").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
export type EpgOffset = typeof curationEpgOffsets.$inferSelect;

/** Playback position per content key (movie or episode). Single user: no device column. */
export const appWatchProgress = pgTable("app_watch_progress", {
  contentKey: text("content_key").primaryKey(),
  /** Seconds. */
  position: integer("position").notNull(),
  duration: integer("duration").notNull(),
  /** Derived at write time: position ≥ 90 % of duration. */
  finished: boolean("finished").default(false).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** "Ma liste": movies, series and channels by content key. */
export const appFavorites = pgTable("app_favorites", {
  contentKey: text("content_key").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const deviceStatusEnum = pgEnum("device_status", ["pending", "approved", "revoked"]);

/**
 * A paired TV. The 6-character code is its public identifier for life; the token (stored
 * hashed) authenticates every REST call; `wrapped_key` is the vault key encrypted with a
 * key derived from the token, so the first call after a restart unlocks the vault.
 */
export const appDevices = pgTable("app_devices", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name"),
  tokenHash: text("token_hash").unique(),
  wrappedKey: text("wrapped_key"),
  status: deviceStatusEnum("status").default("pending").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  lastIp: text("last_ip"),
  createdIp: text("created_ip"),
});

/**
 * The studio hubs the app shows, chosen and ordered in the admin: a TMDB production company
 * (`company`: Pixar, A24) or a TV network (`network`: HBO, Netflix). Name and logo are copied
 * from TMDB when the studio is added.
 */
export const curationStudios = pgTable(
  "curation_studios",
  {
    id: serial("id").primaryKey(),
    kind: text("kind").$type<"company" | "network">().notNull(),
    tmdbId: integer("tmdb_id").notNull(),
    name: text("name").notNull(),
    logoPath: text("logo_path"),
    position: integer("position").default(0).notNull(),
  },
  (t) => [uniqueIndex("curation_studios_kind_tmdb_idx").on(t.kind, t.tmdbId)],
);

/** TMDB's weekly trending lists, replaced by the `trending` step: the « Top 10 » rows cross them with the catalogue. */
export const tmdbTrending = pgTable(
  "tmdb_trending",
  {
    mediaType: text("media_type").$type<"movie" | "tv">().notNull(),
    rank: integer("rank").notNull(),
    tmdbId: integer("tmdb_id").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.mediaType, t.rank] })],
);

export type Variant = typeof catalogVariants.$inferSelect;
export type Episode = typeof catalogEpisodes.$inferSelect;
export type Device = typeof appDevices.$inferSelect;
export type Content = typeof catalogContents.$inferSelect;
export type Category = typeof catalogCategories.$inferSelect;
export type FilterRule = typeof curationFilterRules.$inferSelect;
export type TaskStep = typeof taskSteps.$inferSelect;
export type TaskRun = typeof taskRuns.$inferSelect;
export type IptvorgChannel = typeof iptvorgChannels.$inferSelect;
export type Studio = typeof curationStudios.$inferSelect;
