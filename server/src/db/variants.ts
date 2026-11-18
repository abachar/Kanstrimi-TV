import { eq, sql } from "drizzle-orm";
import { client, db, schema } from "./client";

/**
 * A variant as the catalogue reads it: a provider's stream (`xtream_streams`: what it sends, what its
 * name says) with what the catalogue decided about it (`catalog_streams`), one row under the stream's
 * id. Reads go through here; writes name the table that owns the column.
 *
 * `id` is the stream's (ours, stable), `upstreamId` the one its provider gives it. `nameAdult`, `nameTheme`
 * and `nameCountry` are what its name says; `adult` and `theme` are derived: adult by its name or by its
 * channel, its channel's theme before the name's. `hidden`: by hand; `filtered`: kept by no profile's filter.
 *
 * In SQL the columns bear their table's names, but for the three a stream and its variant both have
 * (`name_adult`, `name_theme`, `name_country` are the stream's) and the two derived ones
 * (`variant_adult`, `variant_theme`), `content_id` (its title or its channel, whichever it has), and what
 * is read through its title (`variant_match_status`, `variant_key`, `variant_ai_*`): names no other table
 * has, since Drizzle writes a computed field without its table.
 *
 * A movie's or a series' identification is its title's (`catalog_titles`): `tmdbId`, `matchStatus`,
 * `matchScore` and Claude's reading are read through it; a stream without a title yet is `pending`.
 * A channel's (`catalog_channels`) likewise: its name in the reference, its iptv-org channel, its theme,
 * its country, what Claude read in its name.
 */
const v = schema.catalogStreams;
const s = schema.xtreamStreams;
const t = schema.catalogTitles;
const c = schema.catalogChannels;

const variantQuery = db
  .select({
    id: s.id,
    accountId: s.accountId,
    kind: s.kind,
    upstreamId: s.upstreamId,
    name: s.name,
    categoryXtreamId: s.categoryXtreamId,
    position: s.position,
    raw: s.raw,
    addedAt: s.addedAt,
    changedAt: s.changedAt,
    section: s.section,
    title: s.title,
    year: s.year,
    market: s.market,
    lang: s.lang,
    quality: s.quality,
    qualityRank: s.qualityRank,
    announcedQuality: s.announcedQuality,
    measuredWidth: s.measuredWidth,
    measuredHeight: s.measuredHeight,
    measuredAt: s.measuredAt,
    dynamicRange: s.dynamicRange,
    tags: s.tags,
    seasonHint: s.seasonHint,
    edition: s.edition,
    nameAdult: sql<boolean>`${s.adult}`.as("name_adult"),
    nameTheme: sql<string | null>`${s.theme}`.as("name_theme"),
    nameCountry: sql<string | null>`${s.country}`.as("name_country"),
    hidden: v.hidden,
    filtered: v.filtered,
    // What its title (a movie, a series) or its channel (live) says of it: the identification is theirs, read here for each stream.
    tmdbId: t.tmdbId,
    /** `pending` while it has no title, then its title's: `matched`, `unmatched` (no card), `manual` when attached by hand. */
    matchStatus: sql<"pending" | "matched" | "unmatched" | "manual" | "skipped">`case
      when ${s.kind} = 'live' then 'skipped'
      when ${v.titleId} is null then 'pending'
      when ${v.manual} then 'manual'
      when ${t.tmdbId} is not null then 'matched'
      else 'unmatched' end`.as("variant_match_status"),
    matchScore: t.matchScore,
    matchedAt: t.matchedAt,
    aiKind: sql<string | null>`coalesce(${t.aiKind}, ${c.aiKind})`.as("variant_ai_kind"),
    aiTitle: sql<string | null>`coalesce(${t.aiTitle}, ${c.aiName})`.as("variant_ai_title"),
    aiOriginalTitle: t.aiOriginalTitle,
    aiYear: t.aiYear,
    aiAskedAt: sql<Date | null>`coalesce(${t.aiAskedAt}, ${c.aiAskedAt})`.mapWith(t.aiAskedAt).as("variant_ai_asked_at"),
    how: v.how,
    manual: v.manual,
    /** Its title's key, or its channel's. */
    contentKey: sql<string | null>`coalesce(${t.key}, ${c.key})`.as("variant_key"),
    /** The title or the channel it belongs to, whichever it is: their ids come from one sequence. The expression of `catalog_streams_content_idx`. */
    contentId: sql<number | null>`coalesce(${v.titleId}, ${v.channelId})`.as("content_id"),
    titleId: v.titleId,
    channelId: v.channelId,
    adult: sql<boolean>`(${s.adult} or coalesce(${c.adult}, false))`.as("variant_adult"),
    theme: sql<string | null>`coalesce(${c.theme}, ${s.theme})`.as("variant_theme"),
    /** Live: its channel's iptv-org channel, country in a regional market, and name in the reference (null: a name it does not know). */
    iptvId: c.iptvId,
    country: c.country,
    channelName: sql<string | null>`case when ${c.status} = 'known' then ${c.name} end`.as("channel_name"),
    epgMismatch: v.epgMismatch,
  })
  .from(v)
  .innerJoin(s, eq(s.id, v.xtreamId))
  .leftJoin(t, eq(t.id, v.titleId))
  .leftJoin(c, eq(c.id, v.channelId));

export type Variant = Awaited<typeof variantQuery>[number];

/** The variants, for the query builder and for SQL that names them `variants`: `from ${variants} where ${variants.kind} = …`. */
export const variants = variantQuery.as("variants");

/** The same rows for SQL that gives them its own alias: `from ${variantRows} v`. */
export const variantRows = sql`(${variantQuery})`;

/** The same again for the postgres-js templates (`pg`), which do not take Drizzle's SQL: `from ${pgVariantRows()} v`. */
export const pgVariantRows = () => client.unsafe(`(${variantQuery.toSQL().sql})`);
