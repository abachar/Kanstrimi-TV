import { getSettings } from "@/config";
import { db, schema, client as pg, sqlTmdbMediaType, tmdbMediaType, visibleItem, type Kind } from "@/db";
import { and, asc, gt, inArray, sql, type SQL } from "drizzle-orm";
import {
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
import { contentKey, hasFallbackKey } from "../keys";
import { checkCancelled, searchText } from "@/shared";
import { withCatalogLock } from "../lock";
import { markWaitlistAvailable } from "../waitlist";
import { applyServedLanguages } from "../languages";

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

export type GroupStats = {
  items_grouped: number;
  contents: number;
  multi_variant: number;
  orphans_removed: number;
  waitlist_available: number;
  not_served: number;
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
      // First: the aggregates below count only the variants in a served language.
      const { not_served } = await applyServedLanguages();
      const n = await assignKeys();
      await upsertContents();
      await fillCardFields();
      const available = await refreshAggregates();
      const orphans = await deleteOrphans();
      const [c] = await db
        .select({ n: sql<number>`count(*)::int`, multi: sql<number>`count(*) filter (where variant_count > 1)::int` })
        .from(schema.catalogContents);
      return {
        items_grouped: n,
        contents: c.n,
        multi_variant: c.multi,
        orphans_removed: orphans,
        waitlist_available: available,
        not_served,
      } satisfies GroupStats;
    }),
  );
}

/**
 * Regroup a handful of items (manual TMDB assignment, merge, split) without a full run. Returns the
 * contents touched: a new one is not judged by the rules yet, its caller has them judge it (`applyRules`).
 */
export async function regroupItems(ids: number[]): Promise<number[]> {
  if (!ids.length) return [];
  return withCatalogLock(() =>
    rewritingContents(async () => {
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
 * Aggregates only, of every content or of `contentIds`: what the admin visibility switches need.
 * Takes no lock: its callers hold it.
 */
export async function refreshVisibility(contentIds?: number[]) {
  await rewritingContents(() => refreshAggregates(contentIds));
}

/**
 * `visible` alone, of every content or of `contentIds`, once the rules gave their verdict: one of its
 * variants is served and no rule hides it. The aggregates do not move. Takes no lock: its callers hold
 * it. Returns the waitlist's arrivals.
 */
export async function refreshContentVisibility(contentIds?: number[]): Promise<number> {
  const scope = contentIds ? sql`and c.id = any(${`{${contentIds.join(",")}}`}::int[])` : sql``;
  return rewritingContents(async () => {
    await db.execute(sql`
      update catalog_contents c set visible = x.visible, updated_at = now()
      from (
        select c2.id, exists (select 1 from ${schema.catalogVariants} where content_id = c2.id and ${visibleItem})
          and coalesce(not c2.hidden_by_rule, false) as visible
        from catalog_contents c2
      ) x
      where x.id = c.id and c.visible is distinct from x.visible ${scope}`);
    return markWaitlistAvailable();
  });
}

// ---------------------------------------------------------------- 1. keys

/**
 * The variants by id, CHUNK at a time: all of them, or `onlyIds`. `select` runs one page from its
 * condition, ordered by id, CHUNK at most; a stop request is checked before each page.
 */
async function* chunksOf<T extends { id: number }>(select: (where: SQL) => Promise<T[]>, onlyIds?: number[]): AsyncGenerator<T[]> {
  let last = 0;
  for (;;) {
    checkCancelled();
    const rows = await select(and(gt(schema.catalogVariants.id, last), onlyIds ? inArray(schema.catalogVariants.id, onlyIds) : undefined)!);
    if (!rows.length) return;
    last = rows[rows.length - 1].id;
    yield rows;
    if (rows.length < CHUNK) return;
  }
}

async function categoryHints() {
  const cats = await db
    .select({ kind: schema.catalogCategories.kind, xtreamId: schema.catalogCategories.xtreamId, name: schema.catalogCategories.name })
    .from(schema.catalogCategories);
  const map = new Map<string, CategoryHints & { adult: boolean }>();
  for (const c of cats) map.set(`${c.kind}:${c.xtreamId}`, { ...parseCategory(c.name), adult: isAdultCategory(c.name) });
  return map;
}

/**
 * Names → variant columns (clean_title, year, market, language, quality, tags, edition, name_adult, name_theme).
 * Depends on the name, the section and the category only, so it runs right after `merge`: TMDB
 * matching reads `clean_title` and `year`, the grouping reads them all. Every name is parsed, only
 * the rows whose result changed are written: a new grammar applies everywhere at the next run.
 */
export async function runNaming(onlyIds?: number[]): Promise<{ items_named: number }> {
  const hints = await categoryHints();
  let written = 0;
  const v = schema.catalogVariants;
  const chunks = chunksOf(
    (where) =>
      db
        .select({ id: v.id, kind: v.kind, name: v.name, cat: v.categoryXtreamId, section: v.section })
        .from(v)
        .where(where)
        .orderBy(asc(v.id))
        .limit(CHUNK),
    onlyIds,
  );
  for await (const rows of chunks) {
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
      editions.push(p.edition ?? null);
      adults.push(Boolean(h?.adult) || isAdultEntryName(r.name));
      themes.push(r.kind === "live" ? liveTheme(r.section, h?.title ?? null, p.title) : null);
    }
    const changed = await pg`
      update catalog_variants i set
        clean_title = u.title, year = u.year,
        market = u.market, lang = u.lang, quality = u.quality, quality_rank = u.qrank, dynamic_range = u.dr,
        tags = u.tags, season_hint = u.season, edition = u.edition, name_adult = u.adult, name_theme = u.theme
      from (
        select id, title, year, market, lang, quality, qrank, dr, coalesce(string_to_array(nullif(tags, ''), ','), '{}') as tags, season, edition,
               adult::boolean as adult, theme
        from unnest(${ids}::int[], ${titles}::text[], ${years}::int[], ${markets}::text[], ${langs}::text[],
                    ${qualities}::text[], ${qranks}::int[], ${drs}::text[], ${tags}::text[], ${seasons}::int[], ${editions}::text[], ${adults.map(String)}::text[], ${themes}::text[])
          as x(id, title, year, market, lang, quality, qrank, dr, tags, season, edition, adult, theme)
      ) u
      where i.id = u.id
        and (i.clean_title, i.year, i.market, i.lang, i.quality, i.quality_rank, i.dynamic_range, i.tags, i.season_hint, i.edition, i.name_adult, i.name_theme)
            is distinct from (u.title, u.year, u.market, u.lang, u.quality, u.qrank, u.dr, u.tags, u.season, u.edition, u.adult, u.theme)
      returning 1`;
    written += changed.length;
  }
  return { items_named: written };
}

/** content_key from the columns `runNaming` wrote and the TMDB match. */
async function assignKeys(onlyIds?: number[]): Promise<number> {
  let total = 0;
  const v = schema.catalogVariants;
  const chunks = chunksOf(
    (where) =>
      db
        .select({
          id: v.id,
          kind: v.kind,
          name: v.name,
          cleanTitle: v.cleanTitle,
          year: v.year,
          market: v.market,
          tmdbId: v.tmdbId,
          matchStatus: v.matchStatus,
          keyOverride: v.keyOverride,
        })
        .from(v)
        .where(where)
        .orderBy(asc(v.id))
        .limit(CHUNK),
    onlyIds,
  );
  for await (const rows of chunks) {
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

/** One card as `fillCardFields` writes it, keyed by the columns of `catalog_contents`. */
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
  // Fallback and live: keep what the variants gave, index the title only.
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
  const c = schema.catalogContents;
  let last = 0;
  for (;;) {
    checkCancelled();
    const rows = await db.execute<{ id: number; kind: Kind; tmdb_id: number | null; title: string; data: TmdbDetails | null }>(sql`
      select c.id, c.kind, c.tmdb_id, c.title, t.data
      from ${c} c
      left join ${schema.tmdbCache} t on t.tmdb_id = c.tmdb_id and t.lang = ${lang} and t.media_type = ${sqlTmdbMediaType(sql`c.kind`)}
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

// ---------------------------------------------------------------- 4. aggregates

/**
 * A variant's EPG id. A provider id naming another channel gives way to the iptv-org id of the channel
 * found by name, but only when the provider files no programme under it: a guide is never lost for nothing.
 */
const variantEpgId = sql`case
  when epg_mismatch and not exists (select 1 from ${schema.catalogEpgProgrammes} p where p.channel_id = raw->>'epg_channel_id')
  then iptv_id else nullif(raw->>'epg_channel_id', '') end`;

/**
 * The variant visibility is the shared predicate, so the app and the admin can never disagree with the
 * aggregate. A content is written only when one of its aggregates moved. Every visibility change goes
 * through here: the waitlist learns of its arrivals at the same time. Returns those.
 */
async function refreshAggregates(onlyIds?: number[]): Promise<number> {
  const scope = onlyIds ? sql`and content_id = any(${`{${onlyIds.join(",")}}`}::int[])` : sql``;
  const langOrder = `{${DEFAULT_LANGUAGE_ORDER.join(",")}}`;
  await db.execute(sql`
    update catalog_contents c set
      variant_count = a.n, added_at = a.added_at, visible = a.visible and coalesce(not c.hidden_by_rule, false),
      max_quality_rank = a.max_q, languages = a.langs, dynamic_range = a.dr, themes = a.themes,
      market = coalesce(c.market, a.market), country = a.country, category_xtream_id = a.cat, iptv_id = a.iptv, logo_url = a.logo_url,
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
          (array_agg(country order by vis desc, quality_rank desc, position, id) filter (where country is not null))[1] as country,
          (array_agg(nullif(raw->>'stream_icon', '') order by vis desc, quality_rank desc, position, id))[1] as logo,
          (array_agg(iptv_id order by vis desc, quality_rank desc, position, id) filter (where iptv_id is not null))[1] as iptv,
          (array_agg(category_xtream_id order by vis desc, quality_rank desc, position, id))[1] as cat,
          (array_agg(nullif(regexp_replace(coalesce(raw->>'num', ''), '\\D', '', 'g'), '')::int order by vis desc, quality_rank desc, position, id))[1] as num,
          -- The app's guide is the first version's (best language, then best quality; player/versions.ts).
          -- Same order here, among the variants that have a guide with programmes (« TF1 4K » files none,
          -- « TF1 FHD » does). They can still differ when that first version has no guide in its language:
          -- the app then takes the closest quality, every language mixed (player/guides.ts).
          (array_agg(epg_id order by vis desc, lang_rank, has_epg desc, quality_rank desc, position, id) filter (where epg_id is not null))[1] as epg
        from (
          select id, content_id, added_at, quality_rank, lang, dynamic_range, market, country, position, category_xtream_id, raw, theme, adult, iptv_id,
            ${variantEpgId} as epg_id,
            exists (select 1 from ${schema.catalogEpgProgrammes} p where p.channel_id = ${variantEpgId}) as has_epg,
            coalesce(array_position(${langOrder}::text[], lang), ${DEFAULT_LANGUAGE_ORDER.length + 1}) as lang_rank,
            (${visibleItem}) as vis,
            (${visibleItem} or not bool_or(${visibleItem}) over (partition by content_id)) as counted
          from ${schema.catalogVariants} where content_id is not null ${scope}
        ) i
        group by content_id
      ) g
      left join ${schema.iptvorgChannels} ic on ic.id = g.iptv
    ) a
    where a.content_id = c.id
      and (c.variant_count, c.added_at, c.visible, c.max_quality_rank, c.languages, c.dynamic_range, c.themes, c.market, c.country,
           c.category_xtream_id, c.iptv_id, c.logo_url, c.channel_number, c.epg_channel_id, c.adult)
          is distinct from
          (a.n, a.added_at, a.visible and coalesce(not c.hidden_by_rule, false), a.max_q, a.langs, a.dr, a.themes, coalesce(c.market, a.market), a.country,
           a.cat, a.iptv, a.logo_url, a.num, a.epg, c.tmdb_adult or a.all_adult)`);
  return markWaitlistAvailable();
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
 * is visible, and « several variants » means several visible ones (recomputed here: `variant_count` only follows the switches after `refreshVisibility`).
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
