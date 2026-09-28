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

/**
 * The `group` step: no network, idempotent, all set-based SQL.
 *
 *  1. items → parsed name + category hints → content_key and variant columns
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

let current: Promise<unknown> | null = null;
/** Serialise runs: the pipeline's full pass and the admin's partial regroups touch the same rows. */
async function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  while (current) await current.catch(() => {});
  const p = fn();
  current = p;
  try {
    return await p;
  } finally {
    current = null;
  }
}

export async function runGrouping(): Promise<GroupStats> {
  return exclusive(async () => {
    const n = await assignKeys();
    await upsertContents();
    await fillCardFields();
    await refreshAggregates();
    const orphans = await deleteOrphans();
    const [c] = await db
      .select({ n: sql<number>`count(*)::int`, multi: sql<number>`count(*) filter (where variant_count > 1)::int` })
      .from(schema.contents);
    return { items_grouped: n, contents: c.n, multi_variant: c.multi, orphans_removed: orphans } satisfies GroupStats;
  });
}

/** Regroup a handful of items (manual TMDB assignment, merge, split) without a full run. */
export async function regroupItems(ids: number[]) {
  if (!ids.length) return;
  return exclusive(async () => {
    const before = await db.select({ id: schema.items.contentId }).from(schema.items).where(inArray(schema.items.id, ids));
    await assignKeys(ids);
    await upsertContents(ids);
    const after = await db.select({ id: schema.items.contentId }).from(schema.items).where(inArray(schema.items.id, ids));
    const touched = [...new Set([...before, ...after].map((r) => r.id).filter((x): x is number => x !== null))];
    await fillCardFields(touched);
    await refreshAggregates(touched);
    await deleteOrphans();
  });
}

/** Aggregates only: what the admin visibility switches and the filters need. */
export async function refreshVisibility() {
  await refreshAggregates();
}

// ---------------------------------------------------------------- 1. keys

async function categoryHints() {
  const cats = await db
    .select({ kind: schema.categories.kind, xtreamId: schema.categories.xtreamId, name: schema.categories.name })
    .from(schema.categories);
  const map = new Map<string, CategoryHints & { adult: boolean }>();
  for (const c of cats) map.set(`${c.kind}:${c.xtreamId}`, { ...parseCategory(c.name), adult: isAdultCategory(c.name) });
  return map;
}

async function assignKeys(onlyIds?: number[]): Promise<number> {
  const hints = await categoryHints();
  let last = 0,
    total = 0;
  for (;;) {
    const where = [gt(schema.items.id, last)];
    if (onlyIds) where.push(inArray(schema.items.id, onlyIds));
    const rows = await db
      .select({
        id: schema.items.id,
        kind: schema.items.kind,
        name: schema.items.name,
        cat: schema.items.categoryXtreamId,
        tmdbId: schema.items.tmdbId,
        matchStatus: schema.items.matchStatus,
        keyOverride: schema.items.keyOverride,
        section: schema.items.section,
      })
      .from(schema.items)
      .where(and(...where))
      .orderBy(asc(schema.items.id))
      .limit(CHUNK);
    if (!rows.length) break;
    last = rows[rows.length - 1].id;
    total += rows.length;

    const ids: number[] = [],
      keys: string[] = [],
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
      keys.push(
        contentKey({
          kind: r.kind,
          title: p.title,
          year: p.year,
          market,
          tmdbId: r.tmdbId,
          matchStatus: r.matchStatus,
          keyOverride: r.keyOverride,
        }),
      );
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
      themes.push(r.kind === "live" ? liveTheme(r.section, h?.title ?? null) : null);
    }
    await pg`
      update items i set
        content_key = u.key, clean_title = u.title, year = u.year,
        market = u.market, lang = u.lang, quality = u.quality, quality_rank = u.qrank, dynamic_range = u.dr,
        tags = string_to_array(u.tags, ','), season_hint = u.season, adult = u.adult::boolean, theme = u.theme
      from unnest(${ids}::int[], ${keys}::text[], ${titles}::text[], ${years}::int[], ${markets}::text[], ${langs}::text[],
                  ${qualities}::text[], ${qranks}::int[], ${drs}::text[], ${tags}::text[], ${seasons}::int[], ${adults.map(String)}::text[], ${themes}::text[])
        as u(id, key, title, year, market, lang, quality, qrank, dr, tags, season, adult, theme)
      where i.id = u.id`;
    if (rows.length < CHUNK) break;
  }
  return total;
}

// ---------------------------------------------------------------- 2. contents

async function upsertContents(onlyIds?: number[]) {
  const scope = onlyIds ? pg`and i.id = any(${onlyIds}::int[])` : pg``;
  // The provisional title comes from the best variant; TMDB overwrites it in step 3.
  await pg`
    insert into contents (key, kind, tmdb_id, title, year, market, added_at)
    select distinct on (i.content_key) i.content_key, i.kind,
      case when i.match_status in ('matched', 'manual') and i.content_key like 'tmdb:%' then i.tmdb_id end,
      coalesce(nullif(i.clean_title, ''), i.name), i.year, i.market, i.added_at
    from items i
    where i.content_key is not null ${scope}
    order by i.content_key, i.quality_rank desc, i.id
    on conflict (key) do update set
      kind = excluded.kind, tmdb_id = excluded.tmdb_id, title = excluded.title, year = excluded.year,
      market = coalesce(excluded.market, contents.market), updated_at = now()`;
  await pg`
    update items i set content_id = c.id
    from contents c
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
      from contents c
      left join tmdb_cache t on t.tmdb_id = c.tmdb_id and t.lang = ${lang}
        and t.media_type = case c.kind when 'vod' then 'movie' else 'tv' end
      where c.id > ${last} ${onlyIds ? pg`and c.id = any(${onlyIds}::int[])` : pg``}
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
      }
    }
    // Fallback rows must keep the year computed from the variants: only TMDB rows overwrite it.
    await pg`
      update contents c set
        title = u.title, original_title = u.original_title, title_en = u.title_en,
        adult = u.tmdb_adult::boolean or exists (select 1 from items i where i.content_id = c.id) and not exists (select 1 from items i where i.content_id = c.id and not i.adult),
        year = case when c.tmdb_id is not null and u.year is not null then u.year else c.year end, end_year = u.end_year,
        poster_path = u.poster, backdrop_path = u.backdrop, overview = u.overview, rating = u.rating, vote_count = u.votes,
        genre_ids = coalesce(string_to_array(nullif(u.genre_ids, ''), ',')::int[], '{}'), genres = coalesce(string_to_array(nullif(u.genres, ''), E'\\x1f'), '{}'),
        runtime = u.runtime, certification = u.cert, "cast" = u.cast::jsonb, director = u.director, trailer_key = u.trailer, status = u.status,
        search = to_tsvector('simple', u.search), updated_at = now()
      from unnest(${ids}::int[], ${(f.tmdb_adult as boolean[]).map(String)}::text[], ${f.title as string[]}::text[], ${f.original_title as string[]}::text[], ${f.title_en as string[]}::text[], ${f.year as number[]}::int[], ${f.end_year as number[]}::int[],
                  ${f.poster as string[]}::text[], ${f.backdrop as string[]}::text[], ${f.overview as string[]}::text[], ${f.rating as number[]}::real[], ${f.votes as number[]}::int[],
                  ${f.genre_ids as string[]}::text[], ${f.genres as string[]}::text[], ${f.runtime as number[]}::int[], ${f.cert as string[]}::text[],
                  ${f.cast as string[]}::text[], ${f.director as string[]}::text[], ${f.trailer as string[]}::text[], ${f.status as string[]}::text[], ${f.search as string[]}::text[])
        as u(id, tmdb_adult, title, original_title, title_en, year, end_year, poster, backdrop, overview, rating, votes, genre_ids, genres, runtime, cert, "cast", director, trailer, status, search)
      where c.id = u.id`;
    if (rows.length < CARD_CHUNK) break;
  }
}

// ---------------------------------------------------------------- 4. aggregates

/** The variant visibility is the shared predicate, so the app and the admin can never disagree with the aggregate. */
async function refreshAggregates(onlyIds?: number[]) {
  const scope = onlyIds ? sql`and ${inArray(schema.contents.id, onlyIds)}` : sql``;
  await db.execute(sql`
    update contents set
      variant_count = a.n, added_at = a.added_at, visible = a.visible,
      max_quality_rank = a.max_q, languages = a.langs, dynamic_range = a.dr, themes = a.themes,
      market = coalesce(contents.market, a.market), logo_url = a.logo, category_xtream_id = a.cat,
      channel_number = a.num, epg_channel_id = a.epg, updated_at = now()
    from (
      select content_id, count(*)::int as n, min(added_at) as added_at, bool_or(vis) as visible,
        max(quality_rank)::int as max_q,
        coalesce(array_agg(distinct lang) filter (where lang is not null), '{}') as langs,
        coalesce(array_agg(distinct theme) filter (where theme is not null and vis), '{}') as themes,
        case max(case dynamic_range when 'DV' then 2 when 'HDR' then 1 else 0 end) when 2 then 'DV' when 1 then 'HDR' end as dr,
        (array_agg(market order by vis desc, quality_rank desc, position, id))[1] as market,
        (array_agg(nullif(raw->>'stream_icon', '') order by vis desc, quality_rank desc, position, id))[1] as logo,
        (array_agg(category_xtream_id order by vis desc, quality_rank desc, position, id))[1] as cat,
        (array_agg(nullif(regexp_replace(coalesce(raw->>'num', ''), '\\D', '', 'g'), '')::int order by vis desc, quality_rank desc, position, id))[1] as num,
        (array_agg(nullif(raw->>'epg_channel_id', '') order by vis desc, quality_rank desc, position, id))[1] as epg
      from (
        select id, content_id, added_at, quality_rank, lang, dynamic_range, market, position, category_xtream_id, raw, theme,
          (${visibleItem}) as vis
        from ${schema.items} where content_id is not null
      ) i
      group by content_id
    ) a
    where a.content_id = contents.id ${scope}`);
}

// ---------------------------------------------------------------- 5. orphans

async function deleteOrphans(): Promise<number> {
  const rows = await db
    .delete(schema.contents)
    .where(sql`not exists (select 1 from ${schema.items} i where i.content_id = ${schema.contents.id})`)
    .returning({ id: schema.contents.id });
  return rows.length;
}

/**
 * Counters for the dashboard, over what the app sees: a content counts when one of its variants
 * is visible, and « several variants » means several visible ones (`variant_count` counts hidden ones too).
 */
export async function groupingCounts() {
  const v = db
    .select({ contentId: schema.items.contentId, n: sql<number>`count(*)::int`.as("n") })
    .from(schema.items)
    .where(visibleItem)
    .groupBy(schema.items.contentId)
    .as("v");
  return db
    .select({
      kind: schema.contents.kind,
      visible: sql<number>`count(*)::int`,
      multi: sql<number>`count(*) filter (where ${v.n} > 1)::int`,
      fallback: sql<number>`count(*) filter (where ${hasFallbackKey})::int`,
      adult: sql<number>`count(*) filter (where ${schema.contents.adult})::int`,
    })
    .from(schema.contents)
    .innerJoin(v, sql`${v.contentId} = ${schema.contents.id}`)
    .groupBy(schema.contents.kind);
}
