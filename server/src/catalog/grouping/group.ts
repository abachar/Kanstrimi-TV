import { getSettings } from "@/config";
import { db, schema, client as pg, sqlTmdbMediaType, tmdbMediaType, variants, visibleItem, type Kind } from "@/db";
import { and, asc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import {
  liveMarket,
  liveTheme,
  parseName,
  parseCategory,
  defaultLanguage,
  isAdultCategory,
  isAdultEntryName,
  QUALITY_RANK,
  DEFAULT_LANGUAGE_ORDER,
  type CategoryHints,
  type Quality,
  type DynamicRange,
} from "../naming";
import { cardFields, type TmdbDetails } from "@/providers/tmdb";
import { hasFallbackKey } from "../keys";
import { checkCancelled, searchText } from "@/shared";
import { withCatalogLock } from "../lock";
import { markWaitlistAvailable } from "../waitlist";

/**
 * The `group` step, once every stream is on its title (`attachTitles`) or its channel (`channels`):
 * idempotent, all set-based SQL, no network.
 *
 *  1. card fields copied from cache_tmdb (or just the title, for a title without a card); a channel's
 *     name indexed for the search
 *  2. aggregates (source count, languages, quality, visibility)
 *  3. titles and channels left without a stream are removed (a channel the admin said something of stays)
 *
 * Bulk updates go through `unnest()` on array parameters, with the postgres-js template
 * directly: Drizzle's `sql` spreads a JS array into `($1, $2, …)`, one placeholder per value.
 */

const CHUNK = 5000;

const CARD_CHUNK = 500;

export type GroupStats = {
  items_grouped: number;
  contents: number;
  multi_variant: number;
  orphans_removed: number;
  waitlist_available: number;
};

/**
 * Moves each time the contents may have changed (cards, visibility, rows removed), even after a
 * failure halfway: what the app's in-memory lists (`player`'s genres) compare to know they are stale.
 */
let generation = 0;
export const contentsGeneration = () => generation;
async function rewritingContents<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } finally {
    generation++;
  }
}

/** The pipeline's full pass and the admin's partial regroups touch the same rows: one at a time (`withCatalogLock`). */
export async function runGrouping(): Promise<GroupStats> {
  return withCatalogLock(() =>
    rewritingContents(async () => {
      await fillCardFields();
      await fillChannelSearch();
      const available = await refreshAggregates();
      const orphans = await deleteOrphans();
      const [c] = await db.execute<{ n: number; multi: number; grouped: number }>(sql`
        select count(*)::int as n, (count(*) filter (where source_count > 1))::int as multi,
          (select count(*)::int from catalog_variants where title_id is not null or channel_id is not null) as grouped
        from (select source_count from catalog_titles union all select source_count from catalog_channels) x`);
      return {
        items_grouped: c.grouped,
        contents: c.n,
        multi_variant: c.multi,
        orphans_removed: orphans,
        waitlist_available: available,
      } satisfies GroupStats;
    }),
  );
}

/**
 * The contents a handful of variants are on, and those they left (`also`), brought up to date without a
 * full run once their caller moved them (a title or a channel changed by hand, a channel's reference).
 * Returns them: a new version is not judged by the filters yet, its caller has them judge it (`applyFilters`).
 */
export async function regroupItems(ids: number[], also: number[] = []): Promise<number[]> {
  if (!ids.length) return [];
  return withCatalogLock(() =>
    rewritingContents(async () => {
      const now = await db.select({ id: variants.contentId }).from(variants).where(inArray(variants.id, ids));
      // `also`: the contents the caller took these variants from.
      const touched = [...new Set([...also, ...now.map((r) => r.id).filter((x): x is number => x !== null)])];
      await fillCardFields(touched);
      await fillChannelSearch();
      await refreshAggregates(touched);
      await deleteOrphans();
      return touched;
    }),
  );
}

/**
 * Card fields of a few contents, copied again from their cache entry (a sheet that just re-read
 * TMDB). No lock: it rewrites the same columns from the same cache as a full pass would, and a
 * sheet must not wait behind a pipeline run.
 */
export async function refreshCards(contentIds: number[]) {
  if (contentIds.length) await rewritingContents(() => fillCardFields(contentIds));
}

/**
 * Aggregates only, of every content or of `contentIds`: what the admin visibility switches and the
 * filters need. Takes no lock: its callers hold it. Returns the waitlist's arrivals.
 */
export function refreshVisibility(contentIds?: number[]): Promise<number> {
  return rewritingContents(() => refreshAggregates(contentIds));
}

// ---------------------------------------------------------------- names

async function categoryHints() {
  const c = schema.xtreamCategories;
  const cats = await db.select({ accountId: c.accountId, kind: c.kind, xtreamId: c.xtreamId, name: c.name }).from(c);
  const map = new Map<string, CategoryHints & { adult: boolean }>();
  for (const k of cats) map.set(`${k.accountId}:${k.kind}:${k.xtreamId}`, { ...parseCategory(k.name), adult: isAdultCategory(k.name) });
  return map;
}

/**
 * Names → what is read in them (`xtream_streams`: title, year, market, language, quality, tags, edition, adult, theme, country).
 * Depends on the name, the section and the category only, so it runs right after the import: TMDB
 * matching reads the title and the year, the grouping reads them all. Every name is parsed, only
 * the rows whose result changed are written: a new grammar applies everywhere at the next run.
 *
 * A stream on a title without a card, whose title or year the grammar now reads otherwise than it had (a
 * first reading is not a change), leaves it and is identified again: what was searched was the old reading.
 */
export async function runNaming(onlyIds?: number[]): Promise<{ items_named: number }> {
  const hints = await categoryHints();
  let written = 0;
  const s = schema.xtreamStreams;
  let last = 0;
  for (;;) {
    checkCancelled();
    const rows = await db
      .select({ id: s.id, accountId: s.accountId, kind: s.kind, name: s.name, cat: s.categoryXtreamId, section: s.section })
      .from(s)
      .where(and(gt(s.id, last), eq(s.separator, false), onlyIds ? inArray(s.id, onlyIds) : undefined))
      .orderBy(asc(s.id))
      .limit(CHUNK);
    if (!rows.length) break;
    last = rows[rows.length - 1].id;
    const ids: number[] = [],
      titles: string[] = [],
      years: (number | null)[] = [],
      markets: (string | null)[] = [];
    const langs: string[] = [],
      qualities: (Quality | null)[] = [],
      qranks: number[] = [],
      drs: (DynamicRange | null)[] = [],
      tags: string[] = [],
      seasons: (number | null)[] = [],
      editions: (string | null)[] = [],
      adults: boolean[] = [],
      themes: (string | null)[] = [],
      countries: (string | null)[] = [];
    for (const r of rows) {
      const p = parseName(r.name, r.kind);
      const h = hints.get(`${r.accountId}:${r.kind}:${r.cat}`);
      const live = r.kind === "live" ? liveMarket(p.market, h?.market) : null;
      const market = live ? live.market : (p.market ?? h?.market ?? null);
      const quality = p.quality ?? h?.quality ?? null;
      const dr = p.dynamicRange ?? h?.dynamicRange ?? null;
      ids.push(r.id);
      titles.push(p.title);
      years.push(p.year ?? null);
      markets.push(market);
      langs.push(p.language ?? h?.language ?? defaultLanguage(market ?? undefined));
      qualities.push(quality);
      qranks.push(quality ? QUALITY_RANK[quality] : 0);
      drs.push(dr);
      tags.push([...new Set([...p.tags, ...(h?.tags ?? [])])].sort().join(","));
      seasons.push(p.seasonHint ?? null);
      editions.push(p.edition ?? null);
      adults.push(Boolean(h?.adult) || isAdultEntryName(r.name));
      themes.push(r.kind === "live" ? liveTheme(r.section, h?.title ?? null, p.title) : null);
      countries.push(live?.country ?? null);
    }
    const changed = await pg.begin(async (tx) => {
      // Before the new reading replaces the old one: a stream on a title without a card leaves it, to be identified again.
      await tx`
        update catalog_variants v set title_id = null, how = null
        from unnest(${ids}::int[], ${titles}::text[], ${years}::int[]) as u(id, title, year)
        join xtream_streams s on s.id = u.id, catalog_titles t
        where v.id = u.id and t.id = v.title_id and t.tmdb_id is null and not v.manual
          and s.title is not null and (s.title, s.year) is distinct from (u.title, u.year)`;
      return tx`
        update xtream_streams i set
          title = u.title, year = u.year,
          market = u.market, lang = u.lang, quality = u.quality, quality_rank = u.qrank, dynamic_range = u.dr,
          tags = u.tags, season_hint = u.season, edition = u.edition, adult = u.adult, theme = u.theme, country = u.country
        from (
          select id, title, year, market, lang, quality, qrank, dr, coalesce(string_to_array(nullif(tags, ''), ','), '{}') as tags, season, edition,
                 adult::boolean as adult, theme, country
          from unnest(${ids}::int[], ${titles}::text[], ${years}::int[], ${markets}::text[], ${langs}::text[],
                      ${qualities}::text[], ${qranks}::int[], ${drs}::text[], ${tags}::text[], ${seasons}::int[], ${editions}::text[], ${adults.map(String)}::text[], ${themes}::text[],
                      ${countries}::text[])
            as x(id, title, year, market, lang, quality, qrank, dr, tags, season, edition, adult, theme, country)
        ) u
        where i.id = u.id
          and (i.title, i.year, i.market, i.lang, i.quality, i.quality_rank, i.dynamic_range, i.tags, i.season_hint, i.edition, i.adult, i.theme, i.country)
              is distinct from (u.title, u.year, u.market, u.lang, u.quality, u.qrank, u.dr, u.tags, u.season, u.edition, u.adult, u.theme, u.country)
        returning 1`;
    });
    written += changed.length;
    if (rows.length < CHUNK) break;
  }
  return { items_named: written };
}

/**
 * What is recorded under a channel's key, each with what makes a row its own besides the key: a
 * profile's list, its time watched day by day, the version it chose; the guide linked by hand in a
 * fallback source.
 */
const LIVE_MARKS = [
  { table: "app_favorites", same: () => pg`x.profile_id = m.profile_id` },
  { table: "app_live_watch", same: () => pg`x.profile_id = m.profile_id and x.day = m.day` },
  { table: "app_profile_versions", same: () => pg`x.profile_id = m.profile_id` },
] as const;

/**
 * The channel keys no variant bears any more, each with the key most of its variants went to: what
 * was recorded under the old key follows, one old key at a time (two may land on the same new one).
 * A mark already there under the new key stays; the time watched the same day adds up.
 */
export async function followLiveKeys(moves: Map<string, Map<string, number>>) {
  if (!moves.size) return;
  const olds = [...moves.keys()];
  const marked = await pg<{ key: string }[]>`
    select key from unnest(${olds}::text[]) as o(key)
    where not exists (select 1 from catalog_variants v join catalog_channels c on c.id = v.channel_id where c.key = o.key)
      and (exists (select 1 from app_favorites f where f.content_key = o.key)
        or exists (select 1 from app_live_watch w where w.content_key = o.key)
        or exists (select 1 from app_profile_versions p where p.content_key = o.key)
        or exists (select 1 from catalog_channel_guides g join catalog_channels c on c.id = g.channel_id where c.key = o.key))`;
  for (const { key } of marked) {
    const [to] = [...moves.get(key)!].sort((a, b) => b[1] - a[1])[0];
    await pg`
      update app_live_watch t set seconds = t.seconds + m.seconds, updated_at = greatest(t.updated_at, m.updated_at)
      from app_live_watch m
      where m.content_key = ${key} and t.content_key = ${to} and t.profile_id = m.profile_id and t.day = m.day`;
    for (const { table, same } of LIVE_MARKS) {
      const t = pg(table);
      await pg`
        update ${t} m set content_key = ${to}
        where m.content_key = ${key} and not exists (select 1 from ${t} x where x.content_key = ${to} and ${same()})`;
      await pg`delete from ${t} where content_key = ${key}`;
    }
    // The guides linked by hand are the channel's own: they go to the channel its variants now make.
    await pg`
      update catalog_channel_guides g set channel_id = n.id
      from catalog_channels o, catalog_channels n
      where o.key = ${key} and n.key = ${to} and g.channel_id = o.id
        and not exists (select 1 from catalog_channel_guides x where x.channel_id = n.id and x.source_id = g.source_id)`;
    await pg`delete from catalog_channel_guides g using catalog_channels o where o.key = ${key} and g.channel_id = o.id`;
  }
}

// ---------------------------------------------------------------- 1. card fields

/** The names of the channels the search has not indexed yet: new ones, renamed ones. */
async function fillChannelSearch() {
  const c = schema.catalogChannels;
  const rows = await db.select({ id: c.id, name: c.name }).from(c).where(isNull(c.search));
  for (let i = 0; i < rows.length; i += CHUNK) {
    const part = rows.slice(i, i + CHUNK);
    await pg`
      update catalog_channels c set search = to_tsvector('simple', u.search)
      from unnest(${part.map((r) => r.id)}::int[], ${part.map((r) => searchText(r.name))}::text[]) as u(id, search)
      where c.id = u.id`;
  }
}

/** One card as `fillCardFields` writes it, keyed by the columns of `catalog_titles`. */
type Card = {
  tmdb_adult: boolean;
  title: string;
  original_title: string | null;
  title_en: string | null;
  year: number | null;
  end_year: number | null;
  poster_path: string | null;
  backdrop_path: string | null;
  title_logo_path: string | null;
  overview: string | null;
  rating: number | null;
  vote_count: number | null;
  genre_ids: number[];
  genres: string[];
  runtime: number | null;
  certification: string | null;
  cast: unknown[] | null;
  director: string | null;
  trailer_key: string | null;
  status: string | null;
  search: string;
  release_date: string | null;
  saga_id: number | null;
  saga_name: string | null;
  saga_poster_path: string | null;
  saga_backdrop_path: string | null;
  company_ids: number[];
  network_ids: number[];
};

/**
 * Every card column once: its type in the record `jsonb_to_recordset` reads, and what is written
 * when it is not the record's value. A column left out here does not compile. Fallback rows keep the
 * year computed from the variants: only TMDB rows overwrite it (`final_year`).
 */
const CARD_COLUMNS: Record<keyof Card, { type: string; value?: string }> = {
  tmdb_adult: { type: "boolean" },
  title: { type: "text" },
  original_title: { type: "text" },
  title_en: { type: "text" },
  year: { type: "int", value: "u.final_year" },
  end_year: { type: "int" },
  poster_path: { type: "text" },
  backdrop_path: { type: "text" },
  title_logo_path: { type: "text" },
  overview: { type: "text" },
  rating: { type: "real" },
  vote_count: { type: "int" },
  genre_ids: { type: "int[]" },
  genres: { type: "text[]" },
  runtime: { type: "int" },
  certification: { type: "text" },
  cast: { type: "jsonb" },
  director: { type: "text" },
  trailer_key: { type: "text" },
  status: { type: "text" },
  search: { type: "text", value: "to_tsvector('simple', u.search)" },
  release_date: {
    type: "date",
    value:
      "coalesce(case when c.tmdb_id is not null then u.release_date end, case when u.final_year is not null then make_date(u.final_year, 1, 1) end)",
  },
  saga_id: { type: "int" },
  saga_name: { type: "text" },
  saga_poster_path: { type: "text" },
  saga_backdrop_path: { type: "text" },
  company_ids: { type: "int[]" },
  network_ids: { type: "int[]" },
};
const cardColumns = Object.entries(CARD_COLUMNS).map(([name, c]) => ({ name: `"${name}"`, type: c.type, value: c.value ?? `u."${name}"` }));
const CARD_RECORD = sql.raw(["id int", ...cardColumns.map((c) => `${c.name} ${c.type}`)].join(", "));
const CARD_SET = sql.raw(cardColumns.map((c) => `${c.name} = ${c.value}`).join(", "));
const CARD_CHANGED = sql.raw(
  `(${cardColumns.map((c) => `c.${c.name}`).join(", ")}) is distinct from (${cardColumns.map((c) => c.value).join(", ")})`,
);

function cardOf(r: { kind: Kind; tmdb_id: number | null; title: string; data: TmdbDetails | null }, lang: string): Card {
  if (r.data && r.tmdb_id) {
    const c = cardFields(tmdbMediaType(r.kind), r.data, lang, r.title);
    return {
      tmdb_adult: c.adult,
      title: c.title,
      original_title: c.originalTitle,
      title_en: c.titleEn,
      year: c.year,
      end_year: c.endYear,
      poster_path: c.posterPath,
      backdrop_path: c.backdropPath,
      title_logo_path: c.logoPath,
      overview: c.overview,
      rating: c.rating,
      vote_count: c.voteCount,
      genre_ids: c.genreIds,
      genres: c.genres,
      runtime: c.runtime,
      certification: c.certification,
      cast: c.cast,
      director: c.director,
      trailer_key: c.trailerKey,
      status: c.status,
      search: searchText([...c.names, ...c.cast.map((p) => p.name), c.director].filter(Boolean).join(" ")),
      release_date: c.releaseDate,
      saga_id: c.saga?.id ?? null,
      saga_name: c.saga?.name ?? null,
      saga_poster_path: c.saga?.posterPath ?? null,
      saga_backdrop_path: c.saga?.backdropPath ?? null,
      company_ids: c.companyIds,
      network_ids: c.networkIds,
    };
  }
  // Fallback: keep what the variants gave, index the title only.
  return {
    tmdb_adult: false,
    title: r.title,
    original_title: null,
    title_en: null,
    year: null,
    end_year: null,
    poster_path: null,
    backdrop_path: null,
    title_logo_path: null,
    overview: null,
    rating: null,
    vote_count: null,
    genre_ids: [],
    genres: [],
    runtime: null,
    certification: null,
    cast: null,
    director: null,
    trailer_key: null,
    status: null,
    search: searchText(r.title),
    release_date: null,
    saga_id: null,
    saga_name: null,
    saga_poster_path: null,
    saga_backdrop_path: null,
    company_ids: [],
    network_ids: [],
  };
}

/**
 * Card fields copied from the TMDB cache: the contents without a card, in another language, or
 * whose cache entry is newer than their card. A card is written only when it changed; otherwise
 * only the date of the copy moves, which touches no indexed column.
 */
async function fillCardFields(onlyIds?: number[]) {
  const lang = (await getSettings()).tmdb_language;
  const c = schema.catalogTitles;
  let last = 0;
  for (;;) {
    checkCancelled();
    const rows = await db.execute<{ id: number; kind: Kind; tmdb_id: number | null; title: string; data: TmdbDetails | null }>(sql`
      select c.id, c.kind, c.tmdb_id, c.title, t.data
      from ${c} c
      left join ${schema.cacheTmdb} t on t.tmdb_id = c.tmdb_id and t.lang = ${lang} and t.media_type = ${sqlTmdbMediaType(sql`c.kind`)}
      where c.id > ${last} ${onlyIds ? sql`and c.id = any(${`{${onlyIds.join(",")}}`}::int[])` : sql``}
        and (c.cards_at is null or c.cards_lang is distinct from ${lang} or t.fetched_at > c.cards_at)
      order by c.id limit ${CARD_CHUNK}`);
    if (!rows.length) break;
    last = rows[rows.length - 1].id;
    const cards = JSON.stringify(rows.map((r) => ({ id: r.id, ...cardOf(r, lang) })));
    await db.transaction(async (tx) => {
      await tx.execute(sql`
        with u as (
          select r.*, case when c.tmdb_id is not null and r.year is not null then r.year else c.year end as final_year
          from jsonb_to_recordset(${cards}::jsonb) as r(${CARD_RECORD})
          join ${c} c on c.id = r.id
        )
        update ${c} c set ${CARD_SET}, cards_at = now(), cards_lang = ${lang}, updated_at = now()
        from u
        where c.id = u.id and ${CARD_CHANGED}`);
      // now() is the transaction's: the rows written above are left alone.
      await tx.execute(sql`
        update ${c} set cards_at = now(), cards_lang = ${lang}
        where id = any(${`{${rows.map((r) => r.id).join(",")}}`}::int[]) and cards_at is distinct from now()`);
    });
    if (rows.length < CARD_CHUNK) break;
  }
}

// ---------------------------------------------------------------- 2. aggregates

/**
 * A variant's EPG id. A provider id naming another channel gives way to the iptv-org id of the channel
 * found by name, but only when the provider files no programme under it: a guide is never lost for nothing.
 */
const variantEpgId = sql`case
  when epg_mismatch and not exists (select 1 from ${schema.cacheEpgProgrammes} p where p.channel_id = raw->>'epg_channel_id')
  then iptv_id else nullif(raw->>'epg_channel_id', '') end`;

/**
 * The variant visibility is the shared predicate, so the app and the admin can never disagree with the
 * aggregate. A content is written only when one of its aggregates moved. Every visibility change goes
 * through here: what each profile sees follows, and the waitlist learns of its arrivals at the same time. Returns those.
 */
async function refreshAggregates(onlyIds?: number[]): Promise<number> {
  const scope = onlyIds ? sql`and content_id = any(${`{${onlyIds.join(",")}}`}::int[])` : sql``;
  const langOrder = `{${DEFAULT_LANGUAGE_ORDER.join(",")}}`;
  // The variants of one side, each with whether it is visible and whether it counts: the visible ones,
  // or all of them when none is (a hidden content still says what it is made of).
  const counted = (live: boolean) => sql`
    select *, variant_theme as theme, variant_adult as adult,
      ${variantEpgId} as epg_id,
      exists (select 1 from ${schema.cacheEpgProgrammes} p where p.channel_id = ${variantEpgId}) as has_epg,
      coalesce(array_position(${langOrder}::text[], lang), ${DEFAULT_LANGUAGE_ORDER.length + 1}) as lang_rank,
      (${visibleItem}) as vis,
      (${visibleItem} or not bool_or(${visibleItem}) over (partition by content_id)) as counted
    from ${variants} where content_id is not null and ${live ? sql`kind = 'live'` : sql`kind <> 'live'`} ${scope}`;
  await db.execute(sql`
    update catalog_titles c set
      source_count = a.n, added_at = a.added_at, visible = a.visible,
      max_quality_rank = a.max_q, languages = a.langs, dynamic_range = a.dr, adult = c.tmdb_adult or a.all_adult, updated_at = now()
    from (
      select content_id,
        count(*) filter (where counted)::int as n,
        max(added_at) filter (where counted) as added_at,
        bool_or(vis) as visible,
        -- Every variant flagged adult by its name: the title is.
        bool_and(adult) as all_adult,
        max(quality_rank) filter (where counted)::int as max_q,
        coalesce(array_agg(distinct lang) filter (where lang is not null and counted), '{}') as langs,
        case max(case dynamic_range when 'DV' then 2 when 'HDR' then 1 else 0 end) filter (where counted)
          when 2 then 'DV' when 1 then 'HDR'
        end as dr
      from (${counted(false)}) i
      group by content_id
    ) a
    where a.content_id = c.id
      and (c.source_count, c.added_at, c.visible, c.max_quality_rank, c.languages, c.dynamic_range, c.adult)
          is distinct from (a.n, a.added_at, a.visible, a.max_q, a.langs, a.dr, c.tmdb_adult or a.all_adult)`);
  await db.execute(sql`
    update catalog_channels c set
      source_count = a.n, added_at = a.added_at, visible = a.visible,
      max_quality_rank = a.max_q, languages = a.langs,
      market = coalesce(c.market, a.market), logo_url = a.logo_url, number = a.num, epg_id = a.epg, updated_at = now()
    from (
      select g.*, coalesce(ic.logo_path, g.logo) as logo_url
      from (
        select content_id,
          count(*) filter (where counted)::int as n,
          max(added_at) filter (where counted) as added_at,
          bool_or(vis) as visible,
          max(quality_rank) filter (where counted)::int as max_q,
          coalesce(array_agg(distinct lang) filter (where lang is not null and counted), '{}') as langs,
          (array_agg(market order by vis desc, quality_rank desc, position, id))[1] as market,
          (array_agg(nullif(raw->>'stream_icon', '') order by vis desc, quality_rank desc, position, id))[1] as logo,
          (array_agg(nullif(regexp_replace(coalesce(raw->>'num', ''), '\\D', '', 'g'), '')::int order by vis desc, quality_rank desc, position, id))[1] as num,
          -- The app's guide is the first version's (best language, then best quality; player/versions.ts).
          -- Same order here, among the variants that have a guide with programmes (« TF1 4K » files none,
          -- « TF1 FHD » does). They can still differ when that first version has no guide in its language:
          -- the app then takes the closest quality, every language mixed (player/guides.ts).
          (array_agg(epg_id order by vis desc, lang_rank, has_epg desc, quality_rank desc, position, id) filter (where epg_id is not null))[1] as epg
        from (${counted(true)}) i
        group by content_id
      ) g
      join catalog_channels gc on gc.id = g.content_id
      left join ${schema.cacheIptvorgChannels} ic on ic.id = gc.iptv_id
    ) a
    where a.content_id = c.id
      and (c.source_count, c.added_at, c.visible, c.max_quality_rank, c.languages, c.market, c.logo_url, c.number, c.epg_id)
          is distinct from (a.n, a.added_at, a.visible, a.max_q, a.langs, coalesce(c.market, a.market), a.logo_url, a.num, a.epg)`);
  // A channel of ours no provider lists any more stays, with nothing to play.
  await db.execute(sql`
    update catalog_channels c set source_count = 0, visible = false, updated_at = now()
    where (c.source_count <> 0 or c.visible) ${onlyIds ? sql`and c.id = any(${`{${onlyIds.join(",")}}`}::int[])` : sql``}
      and not exists (select 1 from catalog_variants v where v.channel_id = c.id)`);
  await refreshProfileVisibility(onlyIds);
  return markWaitlistAvailable();
}

/**
 * What each profile sees, from the same predicate: a title or a channel is visible to a profile when one
 * of its versions is kept by the profile's filter (`app_profile_streams`) and hidden neither by hand
 * nor through its category. Rows removed then added, only where it changed.
 */
async function refreshProfileVisibility(onlyIds?: number[]) {
  const ids = onlyIds ? sql`${`{${onlyIds.join(",")}}`}::int[]` : null;
  for (const side of [
    { table: sql`app_profile_titles`, id: sql`title_id` },
    { table: sql`app_profile_channels`, id: sql`channel_id` },
  ]) {
    const seen = sql`exists (
      select 1 from ${variants} join app_profile_streams vp on vp.xtream_id = variants.id
      where variants.${side.id} = ${side.table}.${side.id} and vp.profile_id = ${side.table}.profile_id
        and ${visibleItem})`;
    await db.execute(sql`
      delete from ${side.table}
      where ${ids ? sql`${side.table}.${side.id} = any(${ids}) and` : sql``} not ${seen}`);
    await db.execute(sql`
      insert into ${side.table} (${side.id}, profile_id)
      select distinct variants.${side.id}, vp.profile_id
      from ${variants} join app_profile_streams vp on vp.xtream_id = variants.id
      where variants.${side.id} is not null ${ids ? sql`and variants.${side.id} = any(${ids})` : sql``} and ${visibleItem}
      on conflict do nothing`);
  }
}

// ---------------------------------------------------------------- 3. orphans

async function deleteOrphans(): Promise<number> {
  const titles = await db
    .delete(schema.catalogTitles)
    .where(sql`not exists (select 1 from ${schema.catalogVariants} i where i.title_id = ${schema.catalogTitles.id})`)
    .returning({ id: schema.catalogTitles.id });
  const channels = await db
    .delete(schema.catalogChannels)
    // A channel the admin said something of (aliases, fields set by hand, a guide linked by hand), or whose name Claude has
    // read, stays when its variants are gone: what was said of it is not lost, the name is not asked again.
    .where(
      sql`not exists (select 1 from ${schema.catalogVariants} i where i.channel_id = ${schema.catalogChannels.id})
        and cardinality(${schema.catalogChannels.aliases}) = 0 and cardinality(${schema.catalogChannels.edited}) = 0
        and ${schema.catalogChannels.aiAskedAt} is null
        and not exists (select 1 from ${schema.catalogChannelGuides} g where g.channel_id = ${schema.catalogChannels.id})`,
    )
    .returning({ id: schema.catalogChannels.id });
  return titles.length + channels.length;
}

/**
 * Counters for the dashboard, over what the app sees: a content counts when one of its variants
 * is visible, and « several variants » means several visible ones (recomputed here: `source_count` only follows the switches after `refreshVisibility`).
 * Sagas: the TMDB collections with at least two visible movies, as `/player/movies/sagas` lists them.
 */
export async function groupingCounts() {
  const v = db
    .select({ contentId: variants.contentId, n: sql<number>`count(*)::int`.as("n") })
    .from(variants)
    .where(visibleItem)
    .groupBy(variants.contentId)
    .as("v");
  const t = schema.catalogTitles;
  const c = schema.catalogChannels;
  const [titles, channels] = await Promise.all([
    db
      .select({
        kind: t.kind,
        visible: sql<number>`count(*)::int`,
        multi: sql<number>`count(*) filter (where ${v.n} > 1)::int`,
        fallback: sql<number>`count(*) filter (where ${hasFallbackKey})::int`,
        adult: sql<number>`count(*) filter (where ${t.adult})::int`,
        iptv: sql<number>`0`,
        sagas: sql<number>`(select count(*)::int from (
          select 1 from ${t} s where s.kind = ${t.kind} and s.visible and s.saga_id is not null
          group by s.saga_id having count(*) >= 2) x)`,
      })
      .from(t)
      .innerJoin(v, sql`${v.contentId} = ${t.id}`)
      .groupBy(t.kind),
    db
      .select({
        kind: sql<Kind>`'live'`,
        visible: sql<number>`count(*)::int`,
        multi: sql<number>`count(*) filter (where ${v.n} > 1)::int`,
        fallback: sql<number>`0`,
        adult: sql<number>`count(*) filter (where ${c.adult})::int`,
        iptv: sql<number>`count(*) filter (where ${c.iptvId} is not null)::int`,
        sagas: sql<number>`0`,
      })
      .from(c)
      .innerJoin(v, sql`${v.contentId} = ${c.id}`),
  ]);
  return [...titles, ...channels.filter((r) => r.visible > 0)];
}
