import { and, asc, desc, eq, gt, lt, sql } from "drizzle-orm";
import { getSettings } from "@/config";
import { db, schema, sqlTmdbMediaType, type Studio, visibleItem } from "@/db";

/**
 * The studio hubs, chosen in the admin: a TMDB production company or a TV network. Names and
 * logos come from the TMDB documents already cached, so adding one needs no network.
 */
export type StudioKind = Studio["kind"];
/** `country`: TMDB's `origin_country`, what tells apart namesakes (ARTE France, ARTE Deutschland). */
export type StudioRow = Studio & { movies: number; series: number; country: string | null };
export type StudioSuggestion = {
  kind: StudioKind;
  tmdbId: number;
  name: string;
  logoPath: string | null;
  country: string | null;
  count: number;
};

/** The column a studio filters on. */
export const studioColumn = (kind: StudioKind) =>
  kind === "company" ? schema.catalogContents.companyIds : schema.catalogContents.networkIds;

/** The chosen studios in their order, with what they hold among visible contents. */
export async function listStudios(): Promise<StudioRow[]> {
  return db.execute<StudioRow>(sql`
    select s.id, s.kind, s.tmdb_id as "tmdbId", s.name, s.logo_path as "logoPath", s.position, max(k.country) as country,
      count(c.id) filter (where c.kind = 'vod')::int as movies, count(c.id) filter (where c.kind = 'series')::int as series
    from ${schema.curationStudios} s
    left join (select kind, "tmdbId", min(country) as country from (${cachedStudios(await tmdbLanguage())}) x group by 1, 2) k
      on k.kind = s.kind and k."tmdbId" = s.tmdb_id
    left join ${schema.catalogContents} c on c.visible
      and case s.kind when 'company' then c.company_ids @> array[s.tmdb_id] else c.network_ids @> array[s.tmdb_id] end
    group by s.id order by s.position, s.id`);
}

/**
 * Companies and networks of the visible catalogue, most represented first, not chosen yet; those
 * whose name holds `q` (any case) when given, so that one outside the first `limit` can be found.
 */
export async function studioSuggestions(limit = 40, q = ""): Promise<StudioSuggestion[]> {
  const needle = q.trim().toLowerCase();
  return db.execute<StudioSuggestion>(sql`
    select kind, "tmdbId", min(name) as name, min("logoPath") as "logoPath", min(country) as country, count(*)::int as count
    from (${cachedStudios(await tmdbLanguage())}) x
    where not exists (select 1 from ${schema.curationStudios} s where s.kind = x.kind and s.tmdb_id = x."tmdbId")
      ${needle ? sql`and strpos(lower(x.name), ${needle}) > 0` : sql``}
    group by kind, "tmdbId" order by count desc, name limit ${limit}`);
}

/** Add a studio at the end of the list, named after its TMDB document. False when the catalogue does not know it. */
export async function addStudio(kind: StudioKind, tmdbId: number): Promise<boolean> {
  const [found] = await db.execute<{ name: string; logoPath: string | null }>(sql`
    select min(name) as name, min("logoPath") as "logoPath"
    from (${cachedStudios(await tmdbLanguage())}) x where kind = ${kind} and "tmdbId" = ${tmdbId} having count(*) > 0`);
  if (!found) return false;
  const [{ last }] = await db
    .select({ last: sql<number>`coalesce(max(${schema.curationStudios.position}), 0)::int` })
    .from(schema.curationStudios);
  await db
    .insert(schema.curationStudios)
    .values({ kind, tmdbId, name: found.name, logoPath: found.logoPath, position: last + 1 })
    .onConflictDoNothing();
  return true;
}

export type StudioTitle = {
  id: number;
  kind: "vod" | "series";
  title: string;
  year: number | null;
  posterPath: string | null;
  /** A variant to open in the admin: a visible one first, the best quality. */
  itemId: number | null;
};
export type StudioDetail = {
  kind: StudioKind;
  tmdbId: number;
  name: string;
  logoPath: string | null;
  country: string | null;
  /** Its row when it is shown in the app. */
  chosenId: number | null;
  titles: StudioTitle[];
};

/**
 * `company:3` or `network:49`: TMDB numbers companies and networks apart, so the kind is part of
 * the id (the same form as the app's `studio=` filter). Null when malformed.
 */
export function parseStudioRef(ref: string): { kind: StudioKind; tmdbId: number } | null {
  const m = /^(company|network):(\d+)$/.exec(ref);
  return m ? { kind: m[1] as StudioKind, tmdbId: Number(m[2]) } : null;
}

/** A studio and the visible contents it holds, newest first; null when no visible content carries it. */
export async function studioDetail(kind: StudioKind, tmdbId: number): Promise<StudioDetail | null> {
  const [found] = await db.execute<{ name: string; logoPath: string | null; country: string | null }>(sql`
    select min(name) as name, min("logoPath") as "logoPath", min(country) as country
    from (${cachedStudios(await tmdbLanguage())}) x where kind = ${kind} and "tmdbId" = ${tmdbId} having count(*) > 0`);
  if (!found) return null;
  const [chosen] = await db
    .select({ id: schema.curationStudios.id })
    .from(schema.curationStudios)
    .where(and(eq(schema.curationStudios.kind, kind), eq(schema.curationStudios.tmdbId, tmdbId)));
  const titles = await db.execute<StudioTitle>(sql`
    select ${schema.catalogContents.id}, ${schema.catalogContents.kind}, ${schema.catalogContents.title}, ${schema.catalogContents.year},
      ${schema.catalogContents.posterPath} as "posterPath",
      (select ${schema.catalogVariants.id} from ${schema.catalogVariants}
        where ${schema.catalogVariants.contentId} = ${schema.catalogContents.id}
        order by (${visibleItem}) desc, ${schema.catalogVariants.qualityRank} desc nulls last, ${schema.catalogVariants.id} limit 1) as "itemId"
    from ${schema.catalogContents}
    where ${schema.catalogContents.visible} and ${studioColumn(kind)} @> array[${tmdbId}]::int[]
    order by ${schema.catalogContents.year} desc nulls last, ${schema.catalogContents.title}`);
  return { kind, tmdbId, name: found.name, logoPath: found.logoPath, country: found.country, chosenId: chosen?.id ?? null, titles };
}

export async function removeStudio(id: number) {
  await db.delete(schema.curationStudios).where(eq(schema.curationStudios.id, id));
}

/** Swap a studio with its neighbour above (`up`) or below. */
export async function moveStudio(id: number, direction: "up" | "down") {
  await db.transaction(async (tx) => {
    const [me] = await tx.select().from(schema.curationStudios).where(eq(schema.curationStudios.id, id));
    if (!me) return;
    const [other] = await tx
      .select()
      .from(schema.curationStudios)
      .where(direction === "up" ? lt(schema.curationStudios.position, me.position) : gt(schema.curationStudios.position, me.position))
      .orderBy(direction === "up" ? desc(schema.curationStudios.position) : asc(schema.curationStudios.position))
      .limit(1);
    if (!other) return;
    await tx.update(schema.curationStudios).set({ position: other.position }).where(eq(schema.curationStudios.id, me.id));
    await tx.update(schema.curationStudios).set({ position: me.position }).where(eq(schema.curationStudios.id, other.id));
  });
}

const tmdbLanguage = async () => (await getSettings()).tmdb_language;

/** One row per (visible content, company or network) from the cached TMDB documents. */
const cachedStudios = (lang: string) => sql`
  select 'company' as kind, (x->>'id')::int as "tmdbId", x->>'name' as name, x->>'logo_path' as "logoPath",
    nullif(x->>'origin_country', '') as country
  from ${schema.catalogContents} c
  join ${schema.tmdbCache} t on t.tmdb_id = c.tmdb_id and t.lang = ${lang} and t.media_type = ${sqlTmdbMediaType(sql`c.kind`)}
  cross join jsonb_array_elements(coalesce(t.data->'production_companies', '[]'::jsonb)) x
  where c.visible
  union all
  select 'network', (x->>'id')::int, x->>'name', x->>'logo_path', nullif(x->>'origin_country', '')
  from ${schema.catalogContents} c
  join ${schema.tmdbCache} t on t.tmdb_id = c.tmdb_id and t.lang = ${lang} and t.media_type = 'tv'
  cross join jsonb_array_elements(coalesce(t.data->'networks', '[]'::jsonb)) x
  where c.visible and c.kind = 'series'`;
