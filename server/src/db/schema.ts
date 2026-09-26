import {
  pgTable, serial, text, integer, boolean, timestamp, jsonb, pgEnum, uniqueIndex, index, real, customType,
} from "drizzle-orm/pg-core";

const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

export const kindEnum = pgEnum("content_kind", ["live", "vod", "series"]);
export const ruleActionEnum = pgEnum("rule_action", ["hide", "keep"]);
export const ruleTargetEnum = pgEnum("rule_target", ["name", "category"]);
export const matchStatusEnum = pgEnum("match_status", ["pending", "matched", "unmatched", "manual", "skipped"]);
export const syncStatusEnum = pgEnum("sync_status", ["running", "success", "error"]);

/** Key/value settings (xtream creds, proxy creds, tmdb key, ...). */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  kind: kindEnum("kind").notNull(),
  xtreamId: text("xtream_id").notNull(),
  name: text("name").notNull(),
  parentId: integer("parent_id").default(0).notNull(),
  position: integer("position").default(0).notNull(),
  hiddenByRule: boolean("hidden_by_rule").default(false).notNull(),
  hiddenManual: boolean("hidden_manual").default(false).notNull(),
  raw: jsonb("raw").$type<Record<string, unknown>>().notNull(),
  seenAt: timestamp("seen_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex("categories_kind_xtream_idx").on(t.kind, t.xtreamId)]);

/** Live channels, VOD movies and series (list-level entries) share one table. */
export const items = pgTable("items", {
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
  addedAt: timestamp("added_at", { withTimezone: true }).defaultNow().notNull(),
  seenAt: timestamp("seen_at", { withTimezone: true }).defaultNow().notNull(),
  // Grouping (block 1): one item is one playable variant of a content.
  /** Computed key, joins `contents.key`; the row it currently belongs to is `content_id`. */
  contentKey: text("content_key"),
  contentId: integer("content_id").references(() => contents.id, { onDelete: "set null" }),
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
}, (t) => [
  uniqueIndex("items_kind_xtream_idx").on(t.kind, t.xtreamId),
  index("items_kind_cat_idx").on(t.kind, t.categoryXtreamId),
  index("items_match_idx").on(t.kind, t.matchStatus),
  index("items_content_idx").on(t.contentId),
  index("items_content_key_idx").on(t.contentKey),
]);

/**
 * One content = one work (a movie, a series, a channel), the thing the app lists, plays,
 * favourites and resumes. Filled by the `group` job from `items` and `tmdb_cache`; every
 * column is derived and rewritten in place at each run. External references (favourites,
 * progress) use `key`, never `id`: a row may vanish and come back with a new id.
 */
export const contents = pgTable("contents", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  kind: kindEnum("kind").notNull(),
  tmdbId: integer("tmdb_id"),
  // Card fields, denormalised so lists sort and filter without touching the TMDB JSON
  title: text("title").notNull(),
  originalTitle: text("original_title"),
  year: integer("year"),
  endYear: integer("end_year"),
  posterPath: text("poster_path"),
  backdropPath: text("backdrop_path"),
  overview: text("overview"),
  rating: real("rating"),
  voteCount: integer("vote_count"),
  genreIds: integer("genre_ids").array().default([]).notNull(),
  genres: text("genres").array().default([]).notNull(),
  runtime: integer("runtime"),
  certification: text("certification"),
  cast: jsonb("cast").$type<{ name: string; role: string | null }[]>(),
  director: text("director"),
  trailerKey: text("trailer_key"),
  status: text("status"),
  // Live
  market: text("market"),
  logoUrl: text("logo_url"),
  categoryXtreamId: text("category_xtream_id"),
  channelNumber: integer("channel_number"),
  epgChannelId: text("epg_channel_id"),
  // Aggregates over the variants
  variantCount: integer("variant_count").default(0).notNull(),
  maxQualityRank: integer("max_quality_rank").default(0).notNull(),
  languages: text("languages").array().default([]).notNull(),
  dynamicRange: text("dynamic_range"),
  visible: boolean("visible").default(false).notNull(),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull(),
  search: tsvector("search"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("contents_list_idx").on(t.kind, t.visible, t.addedAt.desc(), t.id),
  index("contents_title_idx").on(t.kind, t.visible, t.title, t.id),
  index("contents_rating_idx").on(t.kind, t.visible, t.rating.desc().nullsLast(), t.id),
  index("contents_year_idx").on(t.kind, t.visible, t.year.desc().nullsLast(), t.id),
  index("contents_genres_idx").using("gin", t.genreIds),
  index("contents_search_idx").using("gin", t.search),
]);

/** Cached TMDB details (movie or tv), one row per (type, id, lang). */
export const tmdbCache = pgTable("tmdb_cache", {
  id: serial("id").primaryKey(),
  mediaType: text("media_type").notNull(), // movie | tv
  tmdbId: integer("tmdb_id").notNull(),
  lang: text("lang").notNull(),
  data: jsonb("data").$type<Record<string, unknown>>().notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex("tmdb_cache_idx").on(t.mediaType, t.tmdbId, t.lang)]);

/** Cached upstream get_vod_info / get_series_info responses. */
export const infoCache = pgTable("info_cache", {
  id: serial("id").primaryKey(),
  kind: kindEnum("kind").notNull(),
  xtreamId: text("xtream_id").notNull(),
  data: jsonb("data").$type<Record<string, unknown>>().notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex("info_cache_idx").on(t.kind, t.xtreamId)]);

export const filterRules = pgTable("filter_rules", {
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

export const syncLogs = pgTable("sync_logs", {
  id: serial("id").primaryKey(),
  job: text("job").notNull(), // sync | enrich
  status: syncStatusEnum("status").default("running").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  message: text("message"),
  stats: jsonb("stats").$type<Record<string, unknown>>(),
});

export type Item = typeof items.$inferSelect;
export type Content = typeof contents.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type FilterRule = typeof filterRules.$inferSelect;
export type SyncLog = typeof syncLogs.$inferSelect;
