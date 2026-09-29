import { getSettings } from "@/config";
import { db, schema, client as pg, tmdbMediaType, visibleItem } from "@/db";
import { and, asc, gt, inArray, sql } from "drizzle-orm";
import {
  liveTheme,
  parseName,
  parseCategory,
  defaultLanguage,
  isAdultCategory,
  isAdultEntryName,
  QUALITY_RANK,
  DYNAMIC_RANGE_RANK,
  type CategoryHints,
  type Quality,
  type DynamicRange,
} from "../naming";
import { cardFields, type TmdbDetails } from "@/providers/tmdb";
import { contentKey, hasFallbackKey } from "../keys";
import { searchText } from "@/shared";
import { withCatalogLock } from "../lock";

/**
 * The `group` step: no network, idempotent, all set-based SQL.
 *
 *  1. items → content_key, from the columns `runNaming` wrote (run after each import)
 *  2. contents upserted from the keys, items linked by id
 *  3. card fields copied from tmdb_cache (or just the title for fallbacks)
 *  4. aggregates (variant count, languages, quality, visibility)
 *  5. contents left without a variant are removed
 *
 * Bulk updates go through `unnest()` on array parameters, with the postgres-js template
 * directly: Drizzle's `sql` spreads a JS array into `($1, $2, …)`, one placeholder per value.
 */

const CHUNK = 5000;

const CARD_CHUNK = 500;

export type GroupStats = { items_grouped: number; contents: number; multi_variant: number; orphans_removed: number };

/** The pipeline's full pass and the admin's partial regroups touch the same rows: one at a time (`withCatalogLock`). */
export async function runGrouping(): Promise<GroupStats> {
  return withCatalogLock(async () => {
    const n = await assignKeys();
    await upsertContents();
    await fillCardFields();
    await refreshAggregates();
    const orphans = await deleteOrphans();
    const [c] = await db
      .select({ n: sql<number>`count(*)::int`, multi: sql<number>`count(*) filter (where variant_count > 1)::int` })
      .from(schema.catalogContents);
    return { items_grouped: n, contents: c.n, multi_variant: c.multi, orphans_removed: orphans } satisfies GroupStats;
  });
}

/** Regroup a handful of items (manual TMDB assignment, merge, split) without a full run. */
export async function regroupItems(ids: number[]) {
  if (!ids.length) return;
  return withCatalogLock(async () => {
    const before = await db
      .select({ id: schema.catalogVariants.contentId })
      .from(schema.catalogVariants)
      .where(inArray(schema.catalogVariants.id, ids));
    await assignKeys(ids);
    await upsertContents(ids);
    const after = await db
      .select({ id: schema.catalogVariants.contentId })
      .from(schema.catalogVariants)
      .where(inArray(schema.catalogVariants.id, ids));
    const touched = [...new Set([...before, ...after].map((r) => r.id).filter((x): x is number => x !== null))];
    await fillCardFields(touched);
    await refreshAggregates(touched);
    await deleteOrphans();
  });
}

/** Aggregates only: what the admin visibility switches and the filters need. Takes no lock: its callers hold it. */
export async function refreshVisibility() {
  await refreshAggregates();
}

// ---------------------------------------------------------------- 1. keys

async function categoryHints() {
  const cats = await db
    .select({ kind: schema.catalogCategories.kind, xtreamId: schema.catalogCategories.xtreamId, name: schema.catalogCategories.name })
    .from(schema.catalogCategories);
  const map = new Map<string, CategoryHints & { adult: boolean }>();
  for (const c of cats) map.set(`${c.kind}:${c.xtreamId}`, { ...parseCategory(c.name), adult: isAdultCategory(c.name) });
  return map;
}

/**
 * Names → variant columns (clean_title, year, market, language, quality, tags, name_adult, name_theme).
 * Depends on the name, the section and the category only, so it runs right after `merge`: TMDB
 * matching reads `clean_title` and `year`, the grouping reads them all. Every name is parsed, only
 * the rows whose result changed are written: a new grammar applies everywhere at the next run.
 */
export async function runNaming(onlyIds?: number[]): Promise<{ items_named: number }> {
  const hints = await categoryHints();
  let last = 0,
    written = 0;
  for (;;) {
    const where = [gt(schema.catalogVariants.id, last)];
    if (onlyIds) where.push(inArray(schema.catalogVariants.id, onlyIds));
    const rows = await db
      .select({
        id: schema.catalogVariants.id,
        kind: schema.catalogVariants.kind,
        name: schema.catalogVariants.name,
        cat: schema.catalogVariants.categoryXtreamId,
        section: schema.catalogVariants.section,
      })
      .from(schema.catalogVariants)
      .where(and(...where))
      .orderBy(asc(schema.catalogVariants.id))
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
      adults: boolean[] = [],
      themes: (string | null)[] = [];
    for (const r of rows) {
      const p = parseName(r.name, r.kind);
      const h = hints.get(`${r.kind}:${r.cat}`);
      const market = p.market ?? h?.market ?? null;
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
      adults.push(Boolean(h?.adult) || isAdultEntryName(r.name));
      themes.push(r.kind === "live" ? liveTheme(r.section, h?.title ?? null, p.title) : null);
    }
    const changed = await pg`
      update catalog_variants i set
        clean_title = u.title, year = u.year,
        market = u.market, lang = u.lang, quality = u.quality, quality_rank = u.qrank, dynamic_range = u.dr,
        tags = u.tags, season_hint = u.season, name_adult = u.adult, name_theme = u.theme
      from (
        select id, title, year, market, lang, quality, qrank, dr, coalesce(string_to_array(nullif(tags, ''), ','), '{}') as tags, season,
               adult::boolean as adult, theme
        from unnest(${ids}::int[], ${titles}::text[], ${years}::int[], ${markets}::text[], ${langs}::text[],
                    ${qualities}::text[], ${qranks}::int[], ${drs}::text[], ${tags}::text[], ${seasons}::int[], ${adults.map(String)}::text[], ${themes}::text[])
          as x(id, title, year, market, lang, quality, qrank, dr, tags, season, adult, theme)
      ) u
      where i.id = u.id
        and (i.clean_title, i.year, i.market, i.lang, i.quality, i.quality_rank, i.dynamic_range, i.tags, i.season_hint, i.name_adult, i.name_theme)
            is distinct from (u.title, u.year, u.market, u.lang, u.quality, u.qrank, u.dr, u.tags, u.season, u.adult, u.theme)
      returning 1`;
    written += changed.length;
    if (rows.length < CHUNK) break;
  }
  return { items_named: written };
}

/** content_key from the columns `runNaming` wrote and the TMDB match. */
async function assignKeys(onlyIds?: number[]): Promise<number> {
  let last = 0,
    total = 0;
  for (;;) {
    const where = [gt(schema.catalogVariants.id, last)];
    if (onlyIds) where.push(inArray(schema.catalogVariants.id, onlyIds));
    const rows = await db
      .select({
        id: schema.catalogVariants.id,
        kind: schema.catalogVariants.kind,
        name: schema.catalogVariants.name,
        cleanTitle: schema.catalogVariants.cleanTitle,
        year: schema.catalogVariants.year,
        market: schema.catalogVariants.market,
        tmdbId: schema.catalogVariants.tmdbId,
        matchStatus: schema.catalogVariants.matchStatus,
        keyOverride: schema.catalogVariants.keyOverride,
      })
      .from(schema.catalogVariants)
      .where(and(...where))
      .orderBy(asc(schema.catalogVariants.id))
      .limit(CHUNK);
    if (!rows.length) break;
    last = rows[rows.length - 1].id;
    total += rows.length;
    const ids = rows.map((r) => r.id);
    const keys = rows.map((r) =>
      contentKey({
        kind: r.kind,
        title: r.cleanTitle ?? r.name,
        year: r.year,
        market: r.market,
        tmdbId: r.tmdbId,
        matchStatus: r.matchStatus,
        keyOverride: r.keyOverride,
      }),
    );
    await pg`
      update catalog_variants i set content_key = u.key
      from unnest(${ids}::int[], ${keys}::text[]) as u(id, key)
      where i.id = u.id and i.content_key is distinct from u.key`;
    if (rows.length < CHUNK) break;
  }
  return total;
}

// ---------------------------------------------------------------- 2. contents

async function upsertContents(onlyIds?: number[]) {
  const scope = onlyIds ? pg`and i.id = any(${onlyIds}::int[])` : pg``;
  // Title and year come from the best variant, for a new content and for one without TMDB (fallback,
  // live); a TMDB content keeps the card's (step 3), so the app never sees a raw title in between.
  // A row is written only when something changed; a new TMDB id or a new fallback title calls
  // for the card again (`cards_at` cleared).
  await pg`
    insert into catalog_contents as c (key, kind, tmdb_id, title, year, market, added_at)
    select distinct on (i.content_key) i.content_key, i.kind,
      case when i.match_status in ('matched', 'manual') and i.content_key like 'tmdb:%' then i.tmdb_id end,
      coalesce(nullif(i.clean_title, ''), i.name), i.year, i.market, i.added_at
    from catalog_variants i
    where i.content_key is not null ${scope}
    order by i.content_key, i.quality_rank desc, i.id
    on conflict (key) do update set
      kind = excluded.kind, tmdb_id = excluded.tmdb_id,
      title = case when excluded.tmdb_id is null then excluded.title else c.title end,
      year = case when excluded.tmdb_id is null then excluded.year else c.year end,
      market = coalesce(excluded.market, c.market),
      cards_at = case
        when excluded.tmdb_id is distinct from c.tmdb_id or (excluded.tmdb_id is null and excluded.title is distinct from c.title) then null
        else c.cards_at end,
      updated_at = now()
    where (c.kind, c.tmdb_id) is distinct from (excluded.kind, excluded.tmdb_id)
       or (excluded.tmdb_id is null and (c.title, c.year) is distinct from (excluded.title, excluded.year))
       or (excluded.market is not null and excluded.market is distinct from c.market)`;
  await pg`
    update catalog_variants i set content_id = c.id
    from catalog_contents c
    where c.key = i.content_key and i.content_id is distinct from c.id ${scope}`;
}

// ---------------------------------------------------------------- 3. card fields

async function fillCardFields(onlyIds?: number[]) {
  const lang = (await getSettings()).tmdb_language;
  let last = 0;
  for (;;) {
    const rows = await pg<
      { id: number; kind: "live" | "vod" | "series"; tmdb_id: number | null; title: string; data: TmdbDetails | null }[]
    >`
      select c.id, c.kind, c.tmdb_id, c.title, t.data
      from catalog_contents c
      left join tmdb_cache t on t.tmdb_id = c.tmdb_id and t.lang = ${lang}
        and t.media_type = case c.kind when 'vod' then 'movie' else 'tv' end
      where c.id > ${last} ${onlyIds ? pg`and c.id = any(${onlyIds}::int[])` : pg``}
        and (c.cards_at is null or c.cards_lang is distinct from ${lang} or t.fetched_at > c.cards_at)
      order by c.id limit ${CARD_CHUNK}`;
    if (!rows.length) break;
    last = rows[rows.length - 1].id;

    const ids: number[] = [],
      f: Record<string, unknown[]> = {
        tmdb_adult: [],
        title: [],
        original_title: [],
        title_en: [],
        year: [],
        end_year: [],
        poster: [],
        backdrop: [],
        overview: [],
        rating: [],
        votes: [],
        genre_ids: [],
        genres: [],
        runtime: [],
        cert: [],
        cast: [],
        director: [],
        trailer: [],
        status: [],
        search: [],
        release_date: [],
        saga_id: [],
        saga_name: [],
        saga_poster: [],
        saga_backdrop: [],
        company_ids: [],
        network_ids: [],
      };
    for (const r of rows) {
      ids.push(r.id);
      if (r.data && r.tmdb_id) {
        const c = cardFields(tmdbMediaType(r.kind), r.data, lang, r.title);
        f.tmdb_adult.push(c.adult);
        f.title.push(c.title);
        f.original_title.push(c.originalTitle);
        f.title_en.push(c.titleEn);
        f.year.push(c.year);
        f.end_year.push(c.endYear);
        f.poster.push(c.posterPath);
        f.backdrop.push(c.backdropPath);
        f.overview.push(c.overview);
        f.rating.push(c.rating);
        f.votes.push(c.voteCount);
        f.genre_ids.push(c.genreIds.join(","));
        f.genres.push(c.genres.join("\u001f"));
        f.runtime.push(c.runtime);
        f.cert.push(c.certification);
        f.cast.push(JSON.stringify(c.cast));
        f.director.push(c.director);
        f.trailer.push(c.trailerKey);
        f.status.push(c.status);
        f.search.push(searchText([...c.names, ...c.cast.map((p) => p.name), c.director].filter(Boolean).join(" ")));
        f.release_date.push(c.releaseDate);
        f.saga_id.push(c.saga?.id ?? null);
        f.saga_name.push(c.saga?.name ?? null);
        f.saga_poster.push(c.saga?.posterPath ?? null);
        f.saga_backdrop.push(c.saga?.backdropPath ?? null);
        f.company_ids.push(c.companyIds.join(","));
        f.network_ids.push(c.networkIds.join(","));
      } else {
        // Fallback and live: keep what the variants gave, index the title only.
        f.tmdb_adult.push(false);
        f.title.push(r.title);
        f.original_title.push(null);
        f.title_en.push(null);
        f.year.push(null);
        f.end_year.push(null);
        f.poster.push(null);
        f.backdrop.push(null);
        f.overview.push(null);
        f.rating.push(null);
        f.votes.push(null);
        f.genre_ids.push("");
        f.genres.push("");
        f.runtime.push(null);
        f.cert.push(null);
        f.cast.push(null);
        f.director.push(null);
        f.trailer.push(null);
        f.status.push(null);
        f.search.push(searchText(r.title));
        f.release_date.push(null);
        f.saga_id.push(null);
        f.saga_name.push(null);
        f.saga_poster.push(null);
        f.saga_backdrop.push(null);
        f.company_ids.push("");
        f.network_ids.push("");
      }
    }
    // Fallback rows must keep the year computed from the variants: only TMDB rows overwrite it.
    await pg`
      with u_raw as (
        select * from unnest(${ids}::int[], ${(f.tmdb_adult as boolean[]).map(String)}::text[], ${f.title as string[]}::text[], ${f.original_title as string[]}::text[], ${f.title_en as string[]}::text[], ${f.year as number[]}::int[], ${f.end_year as number[]}::int[],
                  ${f.poster as string[]}::text[], ${f.backdrop as string[]}::text[], ${f.overview as string[]}::text[], ${f.rating as number[]}::real[], ${f.votes as number[]}::int[],
                  ${f.genre_ids as string[]}::text[], ${f.genres as string[]}::text[], ${f.runtime as number[]}::int[], ${f.cert as string[]}::text[],
                  ${f.cast as string[]}::text[], ${f.director as string[]}::text[], ${f.trailer as string[]}::text[], ${f.status as string[]}::text[], ${f.search as string[]}::text[], ${f.release_date as string[]}::text[],
                  ${f.saga_id as number[]}::int[], ${f.saga_name as string[]}::text[], ${f.saga_poster as string[]}::text[], ${f.saga_backdrop as string[]}::text[],
                  ${f.company_ids as string[]}::text[], ${f.network_ids as string[]}::text[])
        as u(id, tmdb_adult, title, original_title, title_en, year, end_year, poster, backdrop, overview, rating, votes, genre_ids, genres, runtime, cert, "cast", director, trailer, status, search, release_date, saga_id, saga_name, saga_poster, saga_backdrop, company_ids, network_ids)
      ),
      u as (
        select u_raw.*, case when c.tmdb_id is not null and u_raw.year is not null then u_raw.year else c.year end as final_year
        from u_raw join catalog_contents c on c.id = u_raw.id
      )
      update catalog_contents c set
        title = u.title, original_title = u.original_title, title_en = u.title_en, tmdb_adult = u.tmdb_adult::boolean,
        year = u.final_year, end_year = u.end_year,
        poster_path = u.poster, backdrop_path = u.backdrop, overview = u.overview, rating = u.rating, vote_count = u.votes,
        genre_ids = coalesce(string_to_array(nullif(u.genre_ids, ''), ',')::int[], '{}'), genres = coalesce(string_to_array(nullif(u.genres, ''), E'\\x1f'), '{}'),
        runtime = u.runtime, certification = u.cert, "cast" = u.cast::jsonb, director = u.director, trailer_key = u.trailer, status = u.status,
        search = to_tsvector('simple', u.search),
        release_date = coalesce(
          case when c.tmdb_id is not null then u.release_date::date end,
          case when u.final_year is not null then make_date(u.final_year, 1, 1) end
        ),
        saga_id = u.saga_id, saga_name = u.saga_name, saga_poster_path = u.saga_poster, saga_backdrop_path = u.saga_backdrop,
        company_ids = coalesce(string_to_array(nullif(u.company_ids, ''), ',')::int[], '{}'),
        network_ids = coalesce(string_to_array(nullif(u.network_ids, ''), ',')::int[], '{}'),
        cards_at = now(), cards_lang = ${lang}, updated_at = now()
      from u
      where c.id = u.id`;
    if (rows.length < CARD_CHUNK) break;
  }
}

// ---------------------------------------------------------------- 4. aggregates

/**
 * The variant visibility is the shared predicate, so the app and the admin can never disagree with the
 * aggregate. A content is written only when one of its aggregates moved.
 */
async function refreshAggregates(onlyIds?: number[]) {
  const scope = onlyIds ? sql`and content_id = any(${`{${onlyIds.join(",")}}`}::int[])` : sql``;
  await db.execute(sql`
    update catalog_contents c set
      variant_count = a.n, added_at = a.added_at, visible = a.visible,
      max_quality_rank = a.max_q, languages = a.langs, dynamic_range = a.dr, themes = a.themes,
      market = coalesce(c.market, a.market), category_xtream_id = a.cat, iptv_id = a.iptv, logo_url = a.logo_url,
      channel_number = a.num, epg_channel_id = a.epg, adult = c.tmdb_adult or a.all_adult, updated_at = now()
    from (
      select g.*, coalesce(ic.logo_path, g.logo) as logo_url
      from (
        select content_id,
          count(*) filter (where counted)::int as n,
          max(added_at) filter (where counted) as added_at,
          bool_or(vis) as visible,
          -- Every variant flagged adult (by its name or by iptv-org): the content is.
          bool_and(adult) as all_adult,
          max(quality_rank) filter (where counted)::int as max_q,
          coalesce(array_agg(distinct lang) filter (where lang is not null and counted), '{}') as langs,
          coalesce(array_agg(distinct theme) filter (where theme is not null and counted), '{}') as themes,
          case max(case dynamic_range when 'DV' then 2 when 'HDR' then 1 else 0 end) filter (where counted)
            when 2 then 'DV' when 1 then 'HDR'
          end as dr,
          (array_agg(market order by vis desc, quality_rank desc, position, id))[1] as market,
          (array_agg(nullif(raw->>'stream_icon', '') order by vis desc, quality_rank desc, position, id))[1] as logo,
          (array_agg(iptv_id order by vis desc, quality_rank desc, position, id) filter (where iptv_id is not null))[1] as iptv,
          (array_agg(category_xtream_id order by vis desc, quality_rank desc, position, id))[1] as cat,
          (array_agg(nullif(regexp_replace(coalesce(raw->>'num', ''), '\\D', '', 'g'), '')::int order by vis desc, quality_rank desc, position, id))[1] as num,
          -- A provider EPG id naming another channel gives way to the iptv-org id of the channel found by
          -- name, but only when the provider files no programme under it: a guide is never lost for nothing.
          (array_agg(case
              when epg_mismatch and not exists (select 1 from ${schema.catalogEpgProgrammes} p where p.channel_id = raw->>'epg_channel_id')
              then iptv_id else nullif(raw->>'epg_channel_id', '') end
            order by vis desc, quality_rank desc, position, id))[1] as epg
        from (
          select id, content_id, added_at, quality_rank, lang, dynamic_range, market, position, category_xtream_id, raw, theme, adult, iptv_id, epg_mismatch,
            (${visibleItem}) as vis,
            (${visibleItem} or not bool_or(${visibleItem}) over (partition by content_id)) as counted
          from ${schema.catalogVariants} where content_id is not null ${scope}
        ) i
        group by content_id
      ) g
      left join ${schema.iptvorgChannels} ic on ic.id = g.iptv
    ) a
    where a.content_id = c.id
      and (c.variant_count, c.added_at, c.visible, c.max_quality_rank, c.languages, c.dynamic_range, c.themes, c.market,
           c.category_xtream_id, c.iptv_id, c.logo_url, c.channel_number, c.epg_channel_id, c.adult)
          is distinct from
          (a.n, a.added_at, a.visible, a.max_q, a.langs, a.dr, a.themes, coalesce(c.market, a.market),
           a.cat, a.iptv, a.logo_url, a.num, a.epg, c.tmdb_adult or a.all_adult)`);
}

// ---------------------------------------------------------------- 5. orphans

async function deleteOrphans(): Promise<number> {
  const rows = await db
    .delete(schema.catalogContents)
    .where(sql`not exists (select 1 from ${schema.catalogVariants} i where i.content_id = ${schema.catalogContents.id})`)
    .returning({ id: schema.catalogContents.id });
  return rows.length;
}

/**
 * Counters for the dashboard, over what the app sees: a content counts when one of its variants
 * is visible, and « several variants » means several visible ones (`variant_count` counts hidden ones too).
 * Sagas: the TMDB collections with at least two visible movies, as `/player/movies/sagas` lists them.
 */
export async function groupingCounts() {
  const v = db
    .select({ contentId: schema.catalogVariants.contentId, n: sql<number>`count(*)::int`.as("n") })
    .from(schema.catalogVariants)
    .where(visibleItem)
    .groupBy(schema.catalogVariants.contentId)
    .as("v");
  return db
    .select({
      kind: schema.catalogContents.kind,
      visible: sql<number>`count(*)::int`,
      multi: sql<number>`count(*) filter (where ${v.n} > 1)::int`,
      fallback: sql<number>`count(*) filter (where ${hasFallbackKey})::int`,
      adult: sql<number>`count(*) filter (where ${schema.catalogContents.adult})::int`,
      iptv: sql<number>`count(*) filter (where ${schema.catalogContents.iptvId} is not null)::int`,
      sagas: sql<number>`(select count(*)::int from (
        select 1 from ${schema.catalogContents} s where s.kind = ${schema.catalogContents.kind} and s.visible and s.saga_id is not null
        group by s.saga_id having count(*) >= 2) x)`,
    })
    .from(schema.catalogContents)
    .innerJoin(v, sql`${v.contentId} = ${schema.catalogContents.id}`)
    .groupBy(schema.catalogContents.kind);
}
