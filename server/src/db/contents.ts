import { getTableColumns, sql } from "drizzle-orm";
import { schema } from "./client";
import type { Kind } from "./kind";
import type { Title } from "./schema";

/**
 * A content as the app's lists, cards and sheets read it: a title (`catalog_titles`: a movie, a series)
 * or a channel (`catalog_channels`), in one shape. A query names its table and selects through the
 * matching map: `db.select(titleContent).from(schema.catalogTitles)`, `db.select(channelContent).from(schema.catalogChannels)`;
 * conditions and sorts are written on the table's own columns. What a table does not have comes out
 * empty (a channel has no TMDB card, a title no logo nor guide).
 */
export type Content = Omit<Title, "sourceCount"> & {
  variantCount: number;
  market: string | null;
  country: string | null;
  themes: string[];
  logoUrl: string | null;
  iptvId: string | null;
  channelNumber: number | null;
  epgChannelId: string | null;
  epgFallbackId: string | null;
};

const t = schema.catalogTitles;
const c = schema.catalogChannels;
const { sourceCount, ...titleColumns } = getTableColumns(t);
const none = {
  text: (name: string) => sql<string | null>`null::text`.as(name),
  int: (name: string) => sql<number | null>`null::int`.as(name),
};

export const titleContent = {
  ...titleColumns,
  variantCount: sourceCount,
  market: none.text("market"),
  country: none.text("country"),
  themes: sql<string[]>`'{}'::text[]`.as("themes"),
  logoUrl: none.text("logo_url"),
  iptvId: none.text("iptv_id"),
  channelNumber: none.int("channel_number"),
  epgChannelId: none.text("epg_channel_id"),
  epgFallbackId: none.text("epg_fallback_id"),
};

export const channelContent = {
  id: c.id,
  key: c.key,
  kind: sql<Kind>`'live'::content_kind`.as("kind"),
  tmdbId: none.int("tmdb_id"),
  title: c.name,
  originalTitle: none.text("original_title"),
  titleEn: none.text("title_en"),
  year: none.int("year"),
  endYear: none.int("end_year"),
  posterPath: none.text("poster_path"),
  backdropPath: none.text("backdrop_path"),
  titleLogoPath: none.text("title_logo_path"),
  overview: none.text("overview"),
  rating: sql<number | null>`null::real`.as("rating"),
  voteCount: none.int("vote_count"),
  genreIds: sql<number[]>`'{}'::int[]`.as("genre_ids"),
  genres: sql<string[]>`'{}'::text[]`.as("genres"),
  runtime: none.int("runtime"),
  certification: none.text("certification"),
  cast: sql<Title["cast"]>`null::jsonb`.as("cast"),
  director: none.text("director"),
  trailerKey: none.text("trailer_key"),
  status: none.text("status"),
  maxQualityRank: c.maxQualityRank,
  languages: c.languages,
  dynamicRange: none.text("dynamic_range"),
  visible: c.visible,
  adult: c.adult,
  tmdbAdult: sql<boolean>`false`.as("tmdb_adult"),
  cardsAt: sql<Date | null>`null::timestamptz`.as("cards_at"),
  cardsLang: none.text("cards_lang"),
  addedAt: c.addedAt,
  releaseDate: sql<string | null>`null::date`.as("release_date"),
  sagaId: none.int("saga_id"),
  sagaName: none.text("saga_name"),
  sagaPosterPath: none.text("saga_poster_path"),
  sagaBackdropPath: none.text("saga_backdrop_path"),
  companyIds: sql<number[]>`'{}'::int[]`.as("company_ids"),
  networkIds: sql<number[]>`'{}'::int[]`.as("network_ids"),
  search: c.search,
  updatedAt: c.updatedAt,
  variantCount: c.sourceCount,
  market: c.market,
  country: c.country,
  themes: sql<string[]>`case when ${c.theme} is null then '{}'::text[] else array[${c.theme}] end`.as("themes"),
  logoUrl: c.logoUrl,
  iptvId: c.iptvId,
  channelNumber: c.number,
  epgChannelId: c.epgId,
  epgFallbackId: c.epgFallbackId,
};

/**
 * A channel of ours as the admin edits it (`catalog_channels` with aliases or fields set by hand): what
 * we say of it, null where iptv-org or the usual rule decides. `theme` null: iptv-org's; `country`, in
 * a regional market: null the usual rule (iptv-org, the provider's hints), "" the whole region, else a code.
 */
export type ReferenceChannel = {
  id: number;
  name: string;
  market: string;
  country: string | null;
  theme: string | null;
  aliases: string[];
  iptvId: string | null;
};
