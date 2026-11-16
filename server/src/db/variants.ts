import { eq, sql } from "drizzle-orm";
import { client, db, schema } from "./client";

/**
 * A variant as the catalogue reads it: a provider's stream (`xtream_streams`: what it sends, what its
 * name says) with what the catalogue decided about it (`catalog_variants`), one row under the stream's
 * id. Reads go through here; writes name the table that owns the column.
 *
 * The fields keep the names the readers know (`xtreamId` is the stream's `upstream_id`, `cleanTitle`
 * its `title`, `nameAdult`, `nameTheme` and `nameCountry` what its name says). `adult` and `theme`
 * are derived: adult by its name or by iptv-org, the reference's theme before the name's.
 *
 * In SQL the columns bear their table's names, but for the three a stream and its variant both have
 * (`name_adult`, `name_theme`, `name_country` are the stream's) and the two derived ones
 * (`variant_adult`, `variant_theme`): names no other table has, since Drizzle writes a computed field
 * without its table.
 */
const v = schema.catalogVariants;
const s = schema.xtreamStreams;

const variantQuery = db
  .select({
    id: v.id,
    accountId: s.accountId,
    kind: s.kind,
    xtreamId: s.upstreamId,
    name: s.name,
    categoryXtreamId: s.categoryXtreamId,
    position: s.position,
    raw: s.raw,
    addedAt: s.addedAt,
    changedAt: s.changedAt,
    section: s.section,
    cleanTitle: s.title,
    year: s.year,
    market: s.market,
    lang: s.lang,
    quality: s.quality,
    qualityRank: s.qualityRank,
    dynamicRange: s.dynamicRange,
    tags: s.tags,
    seasonHint: s.seasonHint,
    edition: s.edition,
    nameAdult: sql<boolean>`${s.adult}`.as("name_adult"),
    nameTheme: sql<string | null>`${s.theme}`.as("name_theme"),
    nameCountry: sql<string | null>`${s.country}`.as("name_country"),
    hiddenManual: v.hiddenManual,
    hiddenByRule: v.hiddenByRule,
    tmdbId: v.tmdbId,
    matchStatus: v.matchStatus,
    matchScore: v.matchScore,
    matchedAt: v.matchedAt,
    matchAttempts: v.matchAttempts,
    aiKind: v.aiKind,
    aiTitle: v.aiTitle,
    aiOriginalTitle: v.aiOriginalTitle,
    aiYear: v.aiYear,
    aiAskedAt: v.aiAskedAt,
    contentKey: v.contentKey,
    contentId: v.contentId,
    keyOverride: v.keyOverride,
    iptvAdult: v.iptvAdult,
    iptvTheme: v.iptvTheme,
    adult: sql<boolean>`(${s.adult} or ${v.iptvAdult})`.as("variant_adult"),
    theme: sql<string | null>`coalesce(${v.iptvTheme}, ${s.theme})`.as("variant_theme"),
    iptvId: v.iptvId,
    iptvMatch: v.iptvMatch,
    epgMismatch: v.epgMismatch,
    country: v.country,
    channelName: v.channelName,
    channelId: v.channelId,
  })
  .from(v)
  .innerJoin(s, eq(s.id, v.id));

export type Variant = Awaited<typeof variantQuery>[number];

/** The variants, for the query builder and for SQL that names them `variants`: `from ${variants} where ${variants.kind} = …`. */
export const variants = variantQuery.as("variants");

/** The same rows for SQL that gives them its own alias: `from ${variantRows} v`. */
export const variantRows = sql`(${variantQuery})`;

/** The same again for the postgres-js templates (`pg`), which do not take Drizzle's SQL: `from ${pgVariantRows()} v`. */
export const pgVariantRows = () => client.unsafe(`(${variantQuery.toSQL().sql})`);
