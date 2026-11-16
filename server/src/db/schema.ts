import { sql } from "drizzle-orm";
import {
  check,
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
export const matchStatusEnum = pgEnum("match_status", ["pending", "matched", "unmatched", "manual", "skipped"]);
export const syncStatusEnum = pgEnum("sync_status", ["running", "success", "error", "killed"]);

/** Key/value settings edited in Paramètres (SETTING_KEYS); never a secret. */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * An Xtream account, one per provider: the catalogue imports every enabled one, and a title found at
 * several providers lists one source per account (`position`: the preferred provider first, the one that
 * plays by default). Disabled: its catalogue stays but is served no more; deleted: everything it brought goes.
 */
export const xtreamAccounts = pgTable("xtream_accounts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  username: text("username").notNull(),
  password: text("password").notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  position: integer("position").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
/** The account a provider row came from; its rows go with it. */
const accountId = () =>
  integer("account_id")
    .notNull()
    .references(() => xtreamAccounts.id, { onDelete: "cascade" });

/**
 * A provider's categories, as the `source` step last read them, written by difference; one of ours beside
 * them for the radios an account lists without a category (`_radio`). `hidden` is the only column of ours:
 * a category hidden by hand in the admin.
 */
export const xtreamCategories = pgTable(
  "xtream_categories",
  {
    accountId: accountId(),
    kind: kindEnum("kind").notNull(),
    xtreamId: text("xtream_id").notNull(),
    name: text("name").notNull(),
    parentId: integer("parent_id").default(0).notNull(),
    position: integer("position").default(0).notNull(),
    hidden: boolean("hidden").default(false).notNull(),
    raw: jsonb("raw").$type<Record<string, unknown>>().notNull(),
    /** Last time the provider's copy of this row changed. */
    changedAt: timestamp("changed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.kind, t.xtreamId] })],
);

/**
 * One entry of a provider's lists: a live channel or a movie (a playable stream), a series (its episodes
 * are `catalog_episode_sources`), or a separator line. The `source` step writes it by difference (a
 * changed entry updated, a new one inserted, a vanished one deleted), so `id` is stable: the catalogue
 * hangs its own decisions on it (`catalog_streams`).
 *
 * Two halves: what the provider sends, and what is read in its name (`title` … `theme`), which depends
 * on the name, the section and the category only and can be read again at any time, without the network.
 */
export const xtreamStreams = pgTable(
  "xtream_streams",
  {
    id: serial("id").primaryKey(),
    accountId: accountId(),
    kind: kindEnum("kind").notNull(),
    /**
     * stream_id (live/vod) or series_id (series) as sent by the provider — an opaque string, its own:
     * two providers reuse the same numbers. Providers are careless: ids may be non-numeric, repeated
     * across categories, or missing.
     */
    upstreamId: text("upstream_id").notNull(),
    name: text("name").notNull(),
    categoryXtreamId: text("category_xtream_id"),
    /** Rank in the provider's list. Refreshed at each import for live; for movies and series only when the entry changes. */
    position: integer("position").default(0).notNull(),
    /** A separator line (« ----|FR| SPORT |FR|---- »): no variant, it names the section of the entries that follow it. */
    separator: boolean("separator").default(false).notNull(),
    /** Raw JSON object as returned by upstream get_*_streams / get_series. */
    raw: jsonb("raw").$type<Record<string, unknown>>().notNull(),
    /** The provider's arrival date (`added`, `last_modified` for a series), else the first time it was seen. */
    addedAt: timestamp("added_at", { withTimezone: true }).defaultNow().notNull(),
    /** Last time the provider's copy of this row changed. */
    changedAt: timestamp("changed_at", { withTimezone: true }).defaultNow().notNull(),
    /** The label of the separator line preceding the entry in its category, as the provider wrote it. */
    section: text("section"),
    // What is read in the name (`runNaming`).
    /** The cleaned title. Null = the name was never read: a new entry, or one the provider renamed (the import clears it). */
    title: text("title"),
    year: integer("year"),
    /** Market code from the prefix or the category ("fr", "it"…). */
    market: text("market"),
    /** Live: the country the name's own prefix says inside a region (« MA - 2M » → `MA`). */
    country: text("country"),
    /** API vocabulary: VF · VOSTFR · VO · ISO code. */
    lang: text("lang"),
    /** API vocabulary: SD · HD · FHD · 4K. Null = the provider said nothing. */
    quality: text("quality"),
    qualityRank: integer("quality_rank").default(0).notNull(),
    /** HDR · DV, null = SDR. */
    dynamicRange: text("dynamic_range"),
    tags: text("tags").array().default([]).notNull(),
    seasonHint: integer("season_hint"),
    /** A cut other than the theatrical one, as the app shows it (« Version longue »); null = the usual cut. */
    edition: text("edition"),
    /** The name says so: adult category or tag in the name. */
    adult: boolean("adult").default(false).notNull(),
    /** Live: the theme the name gives (section, category, name). */
    theme: text("theme"),
  },
  (t) => [
    uniqueIndex("xtream_streams_account_kind_upstream_idx").on(t.accountId, t.kind, t.upstreamId),
    // A new stream finds the title of the streams that read the same (`attachTitles`).
    index("xtream_streams_reading_idx").on(t.kind, t.title, t.year),
    index("xtream_streams_kind_cat_idx").on(t.accountId, t.kind, t.categoryXtreamId),
  ],
);

/**
 * What the catalogue decides about a stream, one row per entry that is not a separator, under the
 * stream's own id: created with its stream (`merge`), attached to its title by `group` (`attachTitles`) or
 * to its channel by `channels`, judged by `filters` (`filtered`). What identifies a title or a
 * channel is on the title or the channel. Read with its stream through `variants` (`db/variants.ts`).
 */
export const catalogStreams = pgTable(
  "catalog_streams",
  {
    xtreamId: integer("xtream_id")
      .primaryKey()
      .references(() => xtreamStreams.id, { onDelete: "cascade" }),
    /** Hidden by hand. */
    hidden: boolean("hidden").default(false).notNull(),
    /**
     * No profile's filter keeps it, written by the `filters` step. Null = not
     * judged yet, a new version: left out until the filter has seen it.
     */
    filtered: boolean("filtered"),
    /**
     * How it came to its title or its channel. A movie, a series: `provided` (the TMDB id the provider gave,
     * checked), `title` (the same title and year as a stream already there), `search` (TMDB found it),
     * `none` (a title without a card). A channel: `epg`, `name`, `name-global` (iptv-org), `alias` (a name
     * of ours), `ai` (the name Claude read), null for a name the reference does not know. `manual`: the
     * admin said so.
     */
    how: text("how"),
    /** Attached by hand: the identification leaves it where it is. */
    manual: boolean("manual").default(false).notNull(),
    /**
     * Its title (a movie, a series) or its channel (live), one of the two at most, read as one `content_id`
     * through `variants`. Without either: a stream waiting to be identified.
     */
    titleId: integer("title_id").references(() => catalogTitles.id, { onDelete: "set null" }),
    channelId: integer("channel_id").references(() => catalogChannels.id, { onDelete: "set null" }),
    /** Live: the provider's EPG id names another channel (iptv-org says so): its guide is not this channel's. */
    epgMismatch: boolean("epg_mismatch").default(false).notNull(),
  },
  (t) => [
    // The expression `variants` reads as `content_id` (`db/variants.ts`): keep the two in step.
    index("catalog_streams_content_idx").on(sql`coalesce(${t.titleId}, ${t.channelId})`),
    // What a deleted title or channel looks its variants up by.
    index("catalog_streams_title_idx").on(t.titleId),
    index("catalog_streams_channel_idx").on(t.channelId),
    check("catalog_streams_one_content", sql`num_nonnulls(${t.titleId}, ${t.channelId}) <= 1`),
  ],
);

/**
 * One title = one work, a movie or a series: what the app lists, plays, favourites and resumes.
 * Filled by the `group` step from its variants and `cache_tmdb`; every column is derived and
 * rewritten in place at each run. External references (favourites, progress) use `key`, never
 * `id`: a row may vanish and come back with a new id. Its `id` and a channel's come from the same
 * sequence: a content id names one row, whichever table it is in.
 */
export const catalogTitles = pgTable(
  "catalog_titles",
  {
    id: serial("id").primaryKey(),
    key: text("key").notNull().unique(),
    kind: kindEnum("kind").notNull(),
    // Identification, once per title: its streams are attached to it, none is searched again.
    /** What was searched on TMDB: the title and the year read in the name of the stream that brought it. */
    searchTitle: text("search_title"),
    searchYear: integer("search_year"),
    tmdbId: integer("tmdb_id"),
    /** `matched`: a TMDB title; `unmatched`: no card (tried again every week); `manual`: left without a card by hand. */
    matchStatus: matchStatusEnum("match_status").default("unmatched").notNull(),
    matchScore: real("match_score"),
    /** The last time TMDB was asked; null: never (no key at the time). */
    matchedAt: timestamp("matched_at", { withTimezone: true }),
    matchAttempts: integer("match_attempts").default(0).notNull(),
    /**
     * What Claude read in the name once TMDB had given the title up (`enrich`, visible titles only, asked
     * once): `movie` or `series` with the title TMDB would know, its original title and year, or `other`
     * for what is neither (a concert, a fight night, a karaoke track). Null `ai_asked_at` = never asked.
     */
    aiKind: text("ai_kind"),
    aiTitle: text("ai_title"),
    aiOriginalTitle: text("ai_original_title"),
    aiYear: integer("ai_year"),
    aiAskedAt: timestamp("ai_asked_at", { withTimezone: true }),
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
    // Aggregates over the variants
    sourceCount: integer("source_count").default(0).notNull(),
    maxQualityRank: integer("max_quality_rank").default(0).notNull(),
    languages: text("languages").array().default([]).notNull(),
    dynamicRange: text("dynamic_range"),
    /** Visible for the app: one of its variants is (`visibleItem`). */
    visible: boolean("visible").default(false).notNull(),
    /** TMDB's adult flag, or every variant flagged adult. Served to the app only when `serve_adult` is on. */
    adult: boolean("adult").default(false).notNull(),
    /** TMDB's own adult flag, copied with the card: `adult` is computed from it and the variants. */
    tmdbAdult: boolean("tmdb_adult").default(false).notNull(),
    /** When and in which language the card fields were last copied from `cache_tmdb`: older than the cache entry = copied again. */
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
    // « Nouveautés », « Derniers épisodes »: `order by added_at desc, id desc`, as Postgres sorts it (nulls
    // first), or the planner cannot read the index in order and sorts the whole kind instead.
    index("catalog_titles_list_idx").on(t.kind, t.visible, t.addedAt.desc().nullsFirst(), t.id.desc().nullsFirst()),
    // The sort keys of `player/lists.ts`, expression for expression, or the planner cannot use them.
    index("catalog_titles_release_idx").on(t.kind, t.visible, sql`coalesce(${t.releaseDate}, '0001-01-01'::date) desc`, t.id),
    index("catalog_titles_saga_idx").on(t.sagaId),
    // Every join from a TMDB document to its contents: the cache refresh of `enrich`, the trending rows, the studios.
    index("catalog_titles_tmdb_idx").on(t.tmdbId),
    index("catalog_titles_companies_idx").using("gin", t.companyIds),
    index("catalog_titles_networks_idx").using("gin", t.networkIds),
    index("catalog_titles_title_idx").on(t.kind, t.visible, t.title, t.id),
    index("catalog_titles_rating_idx").on(t.kind, t.visible, sql`coalesce(${t.rating}, 0) desc`, t.id),
    index("catalog_titles_year_idx").on(t.kind, t.visible, sql`coalesce(${t.year}, 0) desc`, t.id),
    index("catalog_titles_genres_idx").using("gin", t.genreIds),
    index("catalog_titles_search_idx").using("gin", t.search),
    // Serves `"cast" @> '[{"id": …}]'`, the titles of an actor's screen.
    index("catalog_titles_cast_idx").using("gin", sql`${t.cast} jsonb_path_ops`),
    // Typo-tolerant fallback of the search: trigrams of the accent-free titles. `search_titles()`
    // (unaccent, lower) is created by migration 0021; the query must repeat this expression.
    index("catalog_titles_titles_trgm_idx").using("gin", sql`search_titles(${t.title}, ${t.originalTitle}, ${t.titleEn}) gin_trgm_ops`),
  ],
);

/**
 * One channel in a market: what the Direct lists and plays, and the reference the live variants are
 * matched against besides iptv-org. Filled by the `group` step from its live variants, as a title is
 * from its own; `key` is its identity for the app (`live:fr-tf1`, or `live:x:…` for a name the
 * reference does not know).
 *
 * A channel is ours once the admin said something of it (the Live screen, its page): the names the
 * providers give it (`aliases`), or a field set by hand (`edited`). It then stays when no provider
 * lists it any more, and its variants are found by its names before any guess. A channel may stand
 * alone (one iptv-org does not know: « beIN Sports 1 » of France) or be an iptv-org channel (`iptv_id`).
 */
export const catalogChannels = pgTable(
  "catalog_channels",
  {
    /** Drawn from the titles' sequence: a content id names one row, whichever table it is in. */
    id: integer("id").primaryKey().default(sql`nextval('catalog_titles_id_seq')`),
    key: text("key").notNull().unique(),
    name: text("name").notNull(),
    market: text("market"),
    /** `known`: a channel of the reference; `event`: an event feed; `unknown`: a name left to attach. Written with the aggregates. */
    status: text("status").$type<"known" | "unknown" | "event">().default("unknown").notNull(),
    /** The names the providers give it, set in the admin: a variant bearing one in this market is this channel. */
    aliases: text("aliases").array().default([]).notNull(),
    /** The fields set by hand (`name`, `theme`, `country`): iptv-org and the variants no longer decide them. */
    edited: text("edited").array().default([]).notNull(),
    /** Regional market only: its variants' country (`MA`), the app's group « Maroc · … »; null = the whole region, or the market's. */
    country: text("country"),
    /** The theme the app groups it under (« Sport », « Cinéma »…): ours when set by hand, else the reference's, « Événements » or « Non reconnus » without one. */
    theme: text("theme"),
    /**
     * What Claude read in the name of a channel the reference does not know (`channels`, asked once per
     * name of a watched market): `channel` with its usual name, `event`, or `other`. Kept when its streams
     * are gone: the same name is not asked again.
     */
    aiKind: text("ai_kind"),
    aiName: text("ai_name"),
    aiAskedAt: timestamp("ai_asked_at", { withTimezone: true }),
    /** iptv-org's logo through `/img/logos` when the channel is known there, else the provider's URL. */
    logoUrl: text("logo_url"),
    iptvId: text("iptv_id"),
    number: integer("number"),
    epgId: text("epg_id"),
    /**
     * The guide of a fallback source (`@<source>/<channel>`, `catalog/epg-sources.ts`) when the provider files no
     * programme for the channel: written by the EPG import and by the admin's links, never by the grouping.
     */
    epgFallbackId: text("epg_fallback_id"),
    // Aggregates over the variants
    sourceCount: integer("source_count").default(0).notNull(),
    maxQualityRank: integer("max_quality_rank").default(0).notNull(),
    languages: text("languages").array().default([]).notNull(),
    /** Visible for the app: one of its variants is (`visibleItem`). */
    visible: boolean("visible").default(false).notNull(),
    /** iptv-org says so, or every one of its streams' names does. Served to the app only when `serve_adult` is on. */
    adult: boolean("adult").default(false).notNull(),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull(),
    search: tsvector("search"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("catalog_channels_list_idx").on(t.visible, t.number, t.name, t.id),
    index("catalog_channels_search_idx").using("gin", t.search),
    // The same expression as the titles' trigram index, for a search that reads both (`player/search.ts`).
    index("catalog_channels_names_trgm_idx").using("gin", sql`search_titles(${t.name}, null, null) gin_trgm_ops`),
  ],
);

/** Cached TMDB details (movie or tv), one row per (type, id, lang). */
export const cacheTmdb = pgTable(
  "cache_tmdb",
  {
    id: serial("id").primaryKey(),
    mediaType: text("media_type").notNull(), // movie | tv
    tmdbId: integer("tmdb_id").notNull(),
    lang: text("lang").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("cache_tmdb_idx").on(t.mediaType, t.tmdbId, t.lang),
    // The entries cached before the logos, which `enrich` fetches again: found without reading
    // (and detoasting) every document. Empties itself as the backfill goes. Keep in step with `tmdbHasLogos`
    // (`tmdb-cache.ts`), which renders qualified columns and imports this file.
    index("cache_tmdb_logoless_idx")
      .on(t.lang, t.mediaType, t.tmdbId, t.fetchedAt)
      .where(sql`not coalesce(${t.data} -> 'images' ? 'logos', false)`),
  ],
);

/** Cached upstream get_vod_info / get_series_info responses. */
export const cacheXtreamInfo = pgTable(
  "cache_xtream_info",
  {
    id: serial("id").primaryKey(),
    accountId: accountId(),
    kind: kindEnum("kind").notNull(),
    xtreamId: text("xtream_id").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("cache_xtream_info_idx").on(t.accountId, t.kind, t.xtreamId)],
);

const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" });

/**
 * A person of the household: what the app records (positions, « Ma liste », live time, the waitlist)
 * is theirs, and their filters (`app_profile_filters`) say what they see. One is the default: the
 * profile a device starts on, the Top Shelf's, the admin's « through the app's eyes ».
 */
export const appProfiles = pgTable(
  "app_profiles",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull().unique(),
    /** A square WebP, served by `/img/avatars/{id}`; null only for a profile the migration created. */
    avatar: bytea("avatar"),
    isDefault: boolean("is_default").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    /** The last time the `filters` step judged every version for it; null until the first time: it sees nothing yet. */
    judgedAt: timestamp("judged_at", { withTimezone: true }),
    // Playback settings, the same on every device the profile watches on (Réglages › Lecture in the apps, admin › Profils).
    /** The highest quality played by default (« SD », « HD », « FHD », « 4K »); a device still caps it (a phone stops at FHD). */
    maxQuality: text("max_quality").default("4K").notNull(),
    autoPlayNext: boolean("auto_play_next").default(true).notNull(),
    /** The version chosen in the picker is kept for the title (`app_profile_versions`) and served back. */
    rememberVersions: boolean("remember_versions").default(true).notNull(),
    switchSourceOnFailure: boolean("switch_source_on_failure").default(true).notNull(),
  },
  (t) => [uniqueIndex("app_profiles_default_idx").on(t.isDefault).where(sql`is_default`)],
);

/**
 * The version a profile chose for a title, in the picker or by changing quality in the player: a movie
 * or a channel plays it again; a series' row (its key, written from any episode) is the language ×
 * quality × dynamic range × edition applied to every episode. `version_id` is the contract's id
 * (`vf-4k-dv`), the other columns what it is made of, for the apps' fallback on an episode without it.
 */
export const appProfileVersions = pgTable(
  "app_profile_versions",
  {
    profileId: integer("profile_id")
      .notNull()
      .references(() => appProfiles.id, { onDelete: "cascade" }),
    contentKey: text("content_key").notNull(),
    versionId: text("version_id").notNull(),
    language: text("language").notNull(),
    quality: text("quality").notNull(),
    dynamicRange: text("dynamic_range"),
    edition: text("edition"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.profileId, t.contentKey] })],
);

/**
 * How many times a profile played a movie or an episode: a play begins with the first progress report
 * after 6 hours without one (`player/plays.ts`). Nothing deletes a row but the profile: « non vu »
 * forgets the position, not that it was watched. « Vos plus regardés » on the home.
 */
export const appPlays = pgTable(
  "app_plays",
  {
    profileId: integer("profile_id")
      .notNull()
      .references(() => appProfiles.id, { onDelete: "cascade" }),
    contentKey: text("content_key").notNull(),
    plays: integer("plays").default(0).notNull(),
    firstAt: timestamp("first_at", { withTimezone: true }).defaultNow().notNull(),
    /** The last progress report: a new play starts 6 hours after it. */
    lastAt: timestamp("last_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.profileId, t.contentKey] })],
);

/**
 * The filter of a profile for a kind: a query of the filter language (`catalog/query`) saying what
 * this profile sees, judged version by version at the `filters` step. No row, or an empty query:
 * everything. `applied_at` null: saved since the step last judged it, the catalogue does not follow it yet.
 */
export const appProfileFilters = pgTable(
  "app_profile_filters",
  {
    profileId: integer("profile_id")
      .notNull()
      .references(() => appProfiles.id, { onDelete: "cascade" }),
    kind: kindEnum("kind").notNull(),
    query: text("query").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.profileId, t.kind] })],
);

/** The streams a profile's filter keeps (a row = kept), by the stream's id; `catalog_streams.filtered` is « kept by no profile ». */
export const appProfileStreams = pgTable(
  "app_profile_streams",
  {
    xtreamId: integer("xtream_id")
      .notNull()
      .references(() => xtreamStreams.id, { onDelete: "cascade" }),
    profileId: integer("profile_id")
      .notNull()
      .references(() => appProfiles.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.xtreamId, t.profileId] }), index("app_profile_streams_profile_idx").on(t.profileId, t.xtreamId)],
);

/**
 * The titles and the channels a profile sees (a row = visible): one of its versions kept by the
 * profile's filter and hidden neither by hand nor through its category. Rewritten with the aggregates
 * (`refreshAggregates`); `visible` on the title or the channel is « seen by one profile at least ».
 */
export const appProfileTitles = pgTable(
  "app_profile_titles",
  {
    titleId: integer("title_id")
      .notNull()
      .references(() => catalogTitles.id, { onDelete: "cascade" }),
    profileId: integer("profile_id")
      .notNull()
      .references(() => appProfiles.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.titleId, t.profileId] }), index("app_profile_titles_profile_idx").on(t.profileId, t.titleId)],
);
export const appProfileChannels = pgTable(
  "app_profile_channels",
  {
    channelId: integer("channel_id")
      .notNull()
      .references(() => catalogChannels.id, { onDelete: "cascade" }),
    profileId: integer("profile_id")
      .notNull()
      .references(() => appProfiles.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.channelId, t.profileId] }), index("app_profile_channels_profile_idx").on(t.profileId, t.channelId)],
);

/**
 * The channels of the iptv-org database (github.com/iptv-org/database), refreshed daily by the
 * `channels` step: what the live variants are matched against, for their logo, theme and details.
 */
export const cacheIptvorgChannels = pgTable(
  "cache_iptvorg_channels",
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
  (t) => [index("cache_iptvorg_channels_country_idx").on(t.country)],
);

/**
 * One run of a task: the full pipeline, the EPG, or a lone step. Its steps are `task_steps`
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
 * Episodes of a series, merged across its variants by (season, number). Refreshed
 * from the provider's get_series_info (one call per variant, cached) and TMDB season data
 * when a series sheet is opened. `key` is the REST id: `tmdb:tv:1396:s01e05`.
 */
export const catalogEpisodes = pgTable(
  "catalog_episodes",
  {
    id: serial("id").primaryKey(),
    titleId: integer("title_id")
      .notNull()
      .references(() => catalogTitles.id, { onDelete: "cascade" }),
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
  (t) => [uniqueIndex("catalog_episodes_title_season_number_idx").on(t.titleId, t.season, t.number)],
);

/** One playable stream of an episode: the provider's episode id (`upstream_id`) under one stream of the series (`xtream_id`). */
export const catalogEpisodeSources = pgTable(
  "catalog_episode_sources",
  {
    id: serial("id").primaryKey(),
    episodeId: integer("episode_id")
      .notNull()
      .references(() => catalogEpisodes.id, { onDelete: "cascade" }),
    /** The series' stream this episode was listed under (`xtream_streams.id`). */
    xtreamId: integer("xtream_id")
      .notNull()
      .references(() => xtreamStreams.id, { onDelete: "cascade" }),
    /** Provider episode id, an opaque string, never exposed. */
    upstreamId: text("upstream_id").notNull(),
    container: text("container"),
    seenAt: timestamp("seen_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("catalog_episode_sources_episode_stream_idx").on(t.episodeId, t.xtreamId),
    index("catalog_episode_sources_stream_idx").on(t.xtreamId),
  ],
);

/**
 * The programme guide of the channels the app can see, from the provider's XMLTV and the fallback
 * sources. `channel_id` is the provider's EPG id (`catalog_channels.epg_id`) or a fallback
 * source's, `@<source>/<channel>` (`epg_fallback_id`). Each import replaces, channel by channel, what
 * it brings: a channel missing from a file keeps its programmes until they are over.
 */
export const cacheEpgProgrammes = pgTable(
  "cache_epg_programmes",
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
  (t) => [index("cache_epg_programmes_channel_start_idx").on(t.channelId, t.startAt), index("cache_epg_programmes_end_idx").on(t.endAt)],
);
export type EpgProgramme = typeof cacheEpgProgrammes.$inferSelect;

/**
 * Corrections of the provider's guide times: a guide id (`beINSports3.qa`) or every id of a
 * suffix (`*.qa`), shifted by `minutes`. The exact id wins over a suffix; set from the EPG page.
 */
export const settingsEpgOffsets = pgTable("settings_epg_offsets", {
  pattern: text("pattern").primaryKey(),
  minutes: integer("minutes").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
export type EpgOffset = typeof settingsEpgOffsets.$inferSelect;

/**
 * The fallback guides: XMLTV files that complete the provider's for the visible channels it leaves
 * without programmes (open-epg…), tried in `position` order. Set on the EPG page; `fetched_at`,
 * `fetch_error` and `channel_count` are the last import's outcome. `offset_minutes` shifts the whole file.
 */
export const settingsEpgSources = pgTable("settings_epg_sources", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  url: text("url").notNull().unique(),
  enabled: boolean("enabled").default(true).notNull(),
  position: integer("position").default(0).notNull(),
  offsetMinutes: integer("offset_minutes").default(0).notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }),
  fetchError: text("fetch_error"),
  channelCount: integer("channel_count"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
export type EpgSource = typeof settingsEpgSources.$inferSelect;

/** The channels a fallback source declares or files programmes for, as of its last successful import. */
export const cacheEpgSourceChannels = pgTable(
  "cache_epg_source_channels",
  {
    sourceId: integer("source_id")
      .notNull()
      .references(() => settingsEpgSources.id, { onDelete: "cascade" }),
    channelId: text("channel_id").notNull(),
    names: text("names").array().default([]).notNull(),
    programmes: integer("programmes").default(0).notNull(),
    /** The end of its last programme: how far ahead the file goes for it. */
    lastEndAt: timestamp("last_end_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.sourceId, t.channelId] })],
);
export type EpgSourceChannel = typeof cacheEpgSourceChannels.$inferSelect;

/**
 * The guide the admin linked by hand to a channel in a fallback source: `guide_id` forces one of the
 * source's channels, null forbids the source for this channel. Without a row the link is found by name.
 * A channel that has one stays when no provider lists it any more.
 */
export const catalogChannelGuides = pgTable(
  "catalog_channel_guides",
  {
    channelId: integer("channel_id")
      .notNull()
      .references(() => catalogChannels.id, { onDelete: "cascade" }),
    sourceId: integer("source_id")
      .notNull()
      .references(() => settingsEpgSources.id, { onDelete: "cascade" }),
    guideId: text("guide_id"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.channelId, t.sourceId] })],
);
export type ChannelGuide = typeof catalogChannelGuides.$inferSelect;

/** Playback position per profile and content key (movie or episode). */
export const appWatchProgress = pgTable(
  "app_watch_progress",
  {
    profileId: integer("profile_id")
      .notNull()
      .references(() => appProfiles.id, { onDelete: "cascade" }),
    contentKey: text("content_key").notNull(),
    /** Seconds. */
    position: integer("position").notNull(),
    duration: integer("duration").notNull(),
    /** Derived at write time: position ≥ 90 % of duration. */
    finished: boolean("finished").default(false).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.profileId, t.contentKey] })],
);

/**
 * Seconds of live watched, per profile, channel and day (the server's `TZ`): the app adds what it
 * played every 30 s and when it leaves a channel. « Chaînes les plus regardées » sums the last 30 days;
 * the channels watched last (« Récentes ») are the rows touched last.
 */
export const appLiveWatch = pgTable(
  "app_live_watch",
  {
    profileId: integer("profile_id")
      .notNull()
      .references(() => appProfiles.id, { onDelete: "cascade" }),
    contentKey: text("content_key").notNull(),
    day: date("day").notNull(),
    seconds: integer("seconds").default(0).notNull(),
    /** The last report of the day: the profile's recent channels (`recent_rank`) read it across days. */
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.profileId, t.contentKey, t.day] })],
);

/** "Ma liste" of a profile: movies, series and channels by content key. */
export const appFavorites = pgTable(
  "app_favorites",
  {
    profileId: integer("profile_id")
      .notNull()
      .references(() => appProfiles.id, { onDelete: "cascade" }),
    contentKey: text("content_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.profileId, t.contentKey] })],
);

export const deviceStatusEnum = pgEnum("device_status", ["pending", "approved", "revoked"]);

/**
 * A paired TV. The 6-character code is its public identifier for life; the token (stored
 * hashed), issued with the code, authenticates every REST call once the code is approved.
 */
export const appDevices = pgTable("app_devices", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name"),
  tokenHash: text("token_hash").unique(),
  status: deviceStatusEnum("status").default("pending").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  lastIp: text("last_ip"),
  createdIp: text("created_ip"),
});

/**
 * The push registration of a device: the APNs token an iPhone sends at each launch, the environment
 * it was issued for (a build from Xcode talks to APNs' sandbox, one from TestFlight to production),
 * and which alerts the admin lets it receive. One row per device; gone with it.
 */
export const appDevicePush = pgTable("app_device_push", {
  deviceId: integer("device_id")
    .primaryKey()
    .references(() => appDevices.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(), // ios
  token: text("token").notNull(),
  environment: text("environment").notNull(), // sandbox | production
  waitlist: boolean("notify_waitlist").default(true).notNull(), // « Film attendu arrivé »
  runs: boolean("notify_runs").default(true).notNull(), // « Traitement complet terminé »
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Every alert sent (or refused by APNs), for the admin's log. `link`: the `kanstrimi://` URL the alert opens. */
export const appNotifications = pgTable(
  "app_notifications",
  {
    id: serial("id").primaryKey(),
    deviceId: integer("device_id").references(() => appDevices.id, { onDelete: "set null" }),
    kind: text("kind").notNull(), // waitlist | run | test
    title: text("title").notNull(),
    body: text("body").notNull(),
    link: text("link"),
    status: text("status").notNull(), // sent | failed | unregistered
    detail: text("detail"), // APNs' reason or the error when it failed
    sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("app_notifications_sent_idx").on(t.sentAt)],
);

/**
 * The studio hubs the app shows, chosen and ordered in the admin: a TMDB production company
 * (`company`: Pixar, A24) or a TV network (`network`: HBO, Netflix). Name and logo are copied
 * from TMDB when the studio is added.
 */
export const catalogStudios = pgTable(
  "catalog_studios",
  {
    id: serial("id").primaryKey(),
    kind: text("kind").$type<"company" | "network">().notNull(),
    tmdbId: integer("tmdb_id").notNull(),
    name: text("name").notNull(),
    logoPath: text("logo_path"),
    position: integer("position").default(0).notNull(),
  },
  (t) => [uniqueIndex("catalog_studios_kind_tmdb_idx").on(t.kind, t.tmdbId)],
);

/**
 * « Liste d'attente »: movies chosen in the admin before the provider has them, by their content key
 * (`tmdb:movie:<id>`). Title, year and poster are copied at the time, the list needs no catalogue.
 * `available_at`: the first time a visible content carried the key; `started_at`: the first time the
 * app played 5 % of it. Available and not started = the home hero and the head of the Top Shelf.
 */
export const appWaitlist = pgTable(
  "app_waitlist",
  {
    profileId: integer("profile_id")
      .notNull()
      .references(() => appProfiles.id, { onDelete: "cascade" }),
    contentKey: text("content_key").notNull(),
    tmdbId: integer("tmdb_id").notNull(),
    title: text("title").notNull(),
    year: integer("year"),
    posterPath: text("poster_path"),
    releaseDate: date("release_date"),
    addedAt: timestamp("added_at", { withTimezone: true }).defaultNow().notNull(),
    availableAt: timestamp("available_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.profileId, t.contentKey] })],
);

/** TMDB's weekly trending lists, replaced by the `trending` step: the « Top 10 » rows cross them with the catalogue. */
export const cacheTmdbTrending = pgTable(
  "cache_tmdb_trending",
  {
    mediaType: text("media_type").$type<"movie" | "tv">().notNull(),
    rank: integer("rank").notNull(),
    tmdbId: integer("tmdb_id").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.mediaType, t.rank] })],
);

/**
 * TMDB's recommendations of a title (« Si vous avez aimé… »), fetched on demand: when its sheet opens, when it plays,
 * when it seeds the home row. Ids only, in TMDB's order; crossed with the catalogue at every read, so a title that
 * arrives shows up at once. Fetched again past a week.
 */
export const cacheTmdbRecommendations = pgTable(
  "cache_tmdb_recommendations",
  {
    mediaType: text("media_type").$type<"movie" | "tv">().notNull(),
    tmdbId: integer("tmdb_id").notNull(),
    ids: integer("ids").array().default([]).notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.mediaType, t.tmdbId] })],
);

/**
 * What the player asks of a title beyond its sheet, fetched on demand when it plays and kept a week.
 * `credits_scene`: TMDB's keywords announce a scene during or after the end credits of a movie.
 * `imdb_id`: the key of the public bases of markers (a series' own id, not its episodes').
 */
export const cacheTmdbExtras = pgTable(
  "cache_tmdb_extras",
  {
    mediaType: text("media_type").$type<"movie" | "tv">().notNull(),
    tmdbId: integer("tmdb_id").notNull(),
    creditsScene: boolean("credits_scene").default(false).notNull(),
    imdbId: text("imdb_id"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.mediaType, t.tmdbId] })],
);

/**
 * A recap, an intro, the end credits or the preview of the next episode as a public base of markers knows them, in seconds.
 * `end`: null, to the end of the file. `measuredOn`: the length of the file it was measured on, null when the base
 * does not say.
 */
export type MarkerSegment = {
  kind: "recap" | "intro" | "credits" | "preview";
  start: number;
  end: number | null;
  measuredOn: number | null;
};

/**
 * What TheIntroDB (theintrodb.org) answered for a movie or an episode and a file of `duration` seconds, asked when
 * it plays and SkipDB does not know it. A movie has season 0 and episode 0. An empty answer is kept too, a week;
 * a known title, a month.
 */
export const cacheTheintrodb = pgTable(
  "cache_theintrodb",
  {
    mediaType: text("media_type").$type<"movie" | "tv">().notNull(),
    tmdbId: integer("tmdb_id").notNull(),
    season: integer("season").notNull(),
    episode: integer("episode").notNull(),
    duration: integer("duration").notNull(),
    segments: jsonb("segments").$type<MarkerSegment[]>().notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.mediaType, t.tmdbId, t.season, t.episode, t.duration] })],
);

/**
 * What IntroDB (introdb.app) answered for an episode, by its series' IMDb id: its recap and its intro, measured on a
 * file the base does not name, asked when the episode plays and no other source knows them. An empty answer is kept too, a
 * week; a known episode, a month.
 */
export const cacheIntrodb = pgTable(
  "cache_introdb",
  {
    imdbId: text("imdb_id").notNull(),
    season: integer("season").notNull(),
    episode: integer("episode").notNull(),
    segments: jsonb("segments").$type<MarkerSegment[]>().notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.imdbId, t.season, t.episode] })],
);

/**
 * SkipDB's recaps, intros, end credits and previews (skipdb.tv, ODbL), its whole daily export, replaced by the `markers` task.
 * `id` is SkipDB's. A movie has season 0 and episode 0. `duration_ms`: the length of the file the segment was
 * measured on, null when SkipDB does not know it.
 */
export const cacheSkipdbSegments = pgTable(
  "cache_skipdb_segments",
  {
    id: integer("id").primaryKey(),
    imdbId: text("imdb_id").notNull(),
    season: integer("season").notNull(),
    episode: integer("episode").notNull(),
    kind: text("kind").$type<MarkerSegment["kind"]>().notNull(),
    startMs: integer("start_ms").notNull(),
    endMs: integer("end_ms").notNull(),
    durationMs: integer("duration_ms"),
  },
  (t) => [index("cache_skipdb_segments_title_idx").on(t.imdbId, t.season, t.episode)],
);

export type ProviderAccount = typeof xtreamAccounts.$inferSelect;
export type Stream = typeof xtreamStreams.$inferSelect;
export type Episode = typeof catalogEpisodes.$inferSelect;
export type Device = typeof appDevices.$inferSelect;
export type Title = typeof catalogTitles.$inferSelect;
export type Channel = typeof catalogChannels.$inferSelect;
export type Category = typeof xtreamCategories.$inferSelect;
export type ProfileFilter = typeof appProfileFilters.$inferSelect;
export type ProfileVersion = typeof appProfileVersions.$inferSelect;
export type Plays = typeof appPlays.$inferSelect;
/** A profile as the lists carry it: its avatar stays in its row (`profileAvatar`), `avatarVersion` changes with it (the image URL). */
export type Profile = Omit<typeof appProfiles.$inferSelect, "avatar"> & { avatarVersion: string };
export type TaskStep = typeof taskSteps.$inferSelect;
export type TaskRun = typeof taskRuns.$inferSelect;
export type IptvorgChannel = typeof cacheIptvorgChannels.$inferSelect;
export type Studio = typeof catalogStudios.$inferSelect;
export type WaitlistEntry = typeof appWaitlist.$inferSelect;
export type DevicePush = typeof appDevicePush.$inferSelect;
export type Notification = typeof appNotifications.$inferSelect;
