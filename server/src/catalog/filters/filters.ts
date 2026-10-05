import { eq, sql, type SQL } from "drizzle-orm";
import { db, schema, type Filter, type Kind } from "@/db";
import { getSettings, setSettings } from "@/config";
import { checkRegexes, compileQuery, QueryError } from "../query";

/**
 * The filters: at most one per kind, a query of the filter language saying what the app keeps, as a
 * search says what it shows. Judged version by version: a content left without a version disappears.
 * Saving one only marks the catalogue behind (`filters_pending`): the `filters` step applies them (`apply.ts`).
 */

/** What a filter would keep: versions and contents, out of all of its kind, and the first contents kept and left out. */
export type FilterPreview =
  | { versions: number; keptVersions: number; contents: number; keptContents: number; kept: string[]; left: string[] }
  | { error: string };
export const PREVIEW_LIMIT = 50;

const f = schema.curationFilters;

export async function listFilters(): Promise<Partial<Record<Kind, Filter>>> {
  return Object.fromEntries((await db.select().from(f)).map((row) => [row.kind, row]));
}

/** A filter's query compiled for `kind`, about `catalog_variants`; or what is wrong with it, in a sentence with its column. */
export async function compileFilter(query: string, kind: Kind): Promise<SQL | string> {
  try {
    const where = compileQuery(query, { kind, lang: (await getSettings()).tmdb_language, filter: true });
    if (!where) return "Requête vide";
    await checkRegexes(query);
    return where;
  } catch (e) {
    if (e instanceof QueryError) return `${e.message} (colonne ${e.at + 1})`;
    throw e;
  }
}

/**
 * The filter of `kind`, its query checked first; an empty query removes it, everything kept. Returns
 * what is wrong with the query, null once saved. The catalogue follows at the step that applies it.
 */
export async function saveFilter(kind: Kind, query: string): Promise<string | null> {
  const q = query.trim();
  const [current] = await db.select().from(f).where(eq(f.kind, kind));
  if ((current?.query ?? "") === q) return null;
  if (q) {
    const where = await compileFilter(q, kind);
    if (typeof where === "string") return where;
    await db
      .insert(f)
      .values({ kind, query: q })
      .onConflictDoUpdate({ target: f.kind, set: { query: q, updatedAt: new Date() } });
  } else await db.delete(f).where(eq(f.kind, kind));
  await setSettings({ filters_pending: "1" });
  return null;
}

/** What a query would keep as the filter of `kind`, without saving it. */
export async function previewFilter(kind: Kind, query: string): Promise<FilterPreview> {
  const where = await compileFilter(query, kind);
  if (typeof where === "string") return { error: where };
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local statement_timeout = '15s'`);
    const titles = (kept: boolean) => sql`(select coalesce(json_agg(t.title), '[]') from (
      select c.title from j join catalog_contents c on c.id = j.content_id where (j.kept > 0) = ${kept} order by c.title limit ${PREVIEW_LIMIT}) t)`;
    const [row] = await tx.execute<{
      versions: number;
      kept_versions: number;
      contents: number;
      kept_contents: number;
      kept: string[];
      left: string[];
    }>(sql`
      with j as materialized (
        select content_id, count(*)::int as n, (count(*) filter (where coalesce(${where}, false)))::int as kept
        from catalog_variants where kind = ${kind} and content_id is not null group by content_id)
      select coalesce(sum(n), 0)::int as versions, coalesce(sum(kept), 0)::int as kept_versions,
        count(*)::int as contents, (count(*) filter (where kept > 0))::int as kept_contents,
        ${titles(true)} as kept, ${titles(false)} as left
      from j`);
    return {
      versions: row.versions,
      keptVersions: row.kept_versions,
      contents: row.contents,
      keptContents: row.kept_contents,
      kept: row.kept,
      left: row.left,
    };
  });
}

/** A filter changed since the last `filters` step: the catalogue does not follow it yet. */
export const filtersPending = async () => Boolean((await getSettings()).filters_pending);
export const filtersApplied = () => setSettings({ filters_pending: "" });
