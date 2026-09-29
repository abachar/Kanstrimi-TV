import { asc, desc, eq, gt, lt, sql } from "drizzle-orm";
import { getSettings } from "@/config";
import { db, schema, type Studio } from "@/db";

/**
 * The studio hubs, chosen in the admin: a TMDB production company or a TV network. Names and
 * logos come from the TMDB documents already cached, so adding one needs no network.
 */
export type StudioKind = Studio["kind"];
export type StudioRow = Studio & { movies: number; series: number };
export type StudioSuggestion = { kind: StudioKind; tmdbId: number; name: string; logoPath: string | null; count: number };

/** The column a studio filters on. */
export const studioColumn = (kind: StudioKind) => (kind === "company" ? schema.contents.companyIds : schema.contents.networkIds);

/** The chosen studios in their order, with what they hold among visible contents. */
export async function listStudios(): Promise<StudioRow[]> {
  return db.execute<StudioRow>(sql`
    select s.id, s.kind, s.tmdb_id as "tmdbId", s.name, s.logo_path as "logoPath", s.position,
      count(c.id) filter (where c.kind = 'vod')::int as movies, count(c.id) filter (where c.kind = 'series')::int as series
    from ${schema.studios} s
    left join ${schema.contents} c on c.visible
      and case s.kind when 'company' then c.company_ids @> array[s.tmdb_id] else c.network_ids @> array[s.tmdb_id] end
    group by s.id order by s.position, s.id`);
}

/** Companies and networks of the visible catalogue, most represented first, not chosen yet. */
export async function studioSuggestions(limit = 40): Promise<StudioSuggestion[]> {
  return db.execute<StudioSuggestion>(sql`
    select kind, "tmdbId", min(name) as name, min("logoPath") as "logoPath", count(*)::int as count
    from (${cachedStudios(await tmdbLanguage())}) x
    where not exists (select 1 from ${schema.studios} s where s.kind = x.kind and s.tmdb_id = x."tmdbId")
    group by kind, "tmdbId" order by count desc, name limit ${limit}`);
}

/** Add a studio at the end of the list, named after its TMDB document. False when the catalogue does not know it. */
export async function addStudio(kind: StudioKind, tmdbId: number): Promise<boolean> {
  const [found] = await db.execute<{ name: string; logoPath: string | null }>(sql`
    select min(name) as name, min("logoPath") as "logoPath"
    from (${cachedStudios(await tmdbLanguage())}) x where kind = ${kind} and "tmdbId" = ${tmdbId} having count(*) > 0`);
  if (!found) return false;
  const [{ last }] = await db.select({ last: sql<number>`coalesce(max(${schema.studios.position}), 0)::int` }).from(schema.studios);
  await db
    .insert(schema.studios)
    .values({ kind, tmdbId, name: found.name, logoPath: found.logoPath, position: last + 1 })
    .onConflictDoNothing();
  return true;
}

export async function removeStudio(id: number) {
  await db.delete(schema.studios).where(eq(schema.studios.id, id));
}

/** Swap a studio with its neighbour above (`up`) or below. */
export async function moveStudio(id: number, direction: "up" | "down") {
  await db.transaction(async (tx) => {
    const [me] = await tx.select().from(schema.studios).where(eq(schema.studios.id, id));
    if (!me) return;
    const [other] = await tx
      .select()
      .from(schema.studios)
      .where(direction === "up" ? lt(schema.studios.position, me.position) : gt(schema.studios.position, me.position))
      .orderBy(direction === "up" ? desc(schema.studios.position) : asc(schema.studios.position))
      .limit(1);
    if (!other) return;
    await tx.update(schema.studios).set({ position: other.position }).where(eq(schema.studios.id, me.id));
    await tx.update(schema.studios).set({ position: me.position }).where(eq(schema.studios.id, other.id));
  });
}

const tmdbLanguage = async () => (await getSettings()).tmdb_language;

/** One row per (visible content, company or network) from the cached TMDB documents. */
const cachedStudios = (lang: string) => sql`
  select 'company' as kind, (x->>'id')::int as "tmdbId", x->>'name' as name, x->>'logo_path' as "logoPath"
  from ${schema.contents} c
  join ${schema.tmdbCache} t on t.tmdb_id = c.tmdb_id and t.lang = ${lang} and t.media_type = case c.kind when 'vod' then 'movie' else 'tv' end
  cross join jsonb_array_elements(coalesce(t.data->'production_companies', '[]'::jsonb)) x
  where c.visible
  union all
  select 'network', (x->>'id')::int, x->>'name', x->>'logo_path'
  from ${schema.contents} c
  join ${schema.tmdbCache} t on t.tmdb_id = c.tmdb_id and t.lang = ${lang} and t.media_type = 'tv'
  cross join jsonb_array_elements(coalesce(t.data->'networks', '[]'::jsonb)) x
  where c.visible and c.kind = 'series'`;
