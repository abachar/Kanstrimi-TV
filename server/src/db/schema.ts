import {
  pgTable, serial, text, integer, boolean, timestamp, jsonb, pgEnum, uniqueIndex, index, real,
} from "drizzle-orm/pg-core";

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
}, (t) => [
  uniqueIndex("items_kind_xtream_idx").on(t.kind, t.xtreamId),
  index("items_kind_cat_idx").on(t.kind, t.categoryXtreamId),
  index("items_match_idx").on(t.kind, t.matchStatus),
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
export type Category = typeof categories.$inferSelect;
export type FilterRule = typeof filterRules.$inferSelect;
export type SyncLog = typeof syncLogs.$inferSelect;
