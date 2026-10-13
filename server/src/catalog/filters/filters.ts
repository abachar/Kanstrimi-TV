import { and, eq, isNull, sql, type SQL } from "drizzle-orm";
import { db, schema, type Kind, type ProfileFilter } from "@/db";
import { getSettings } from "@/config";
import { checkRegexes, compileQuery, parseQuery, QueryError, type QueryNode } from "../query";
import { DEFAULT_LANGUAGE_ORDER } from "../naming";

/**
 * The filters of a profile: at most one per kind, a query of the filter language saying what the
 * profile sees, as a search says what it shows. Judged version by version at the `filters` step
 * (`apply.ts`): a content left without a version disappears for that profile. No filter, or an empty
 * one: the profile sees everything. Saving one only marks it behind (`applied_at` null) until the step judges it.
 */

/** What a filter would keep: versions and contents, out of all of its kind, and the first contents kept and left out. */
export type FilterPreview =
  | { versions: number; keptVersions: number; contents: number; keptContents: number; kept: string[]; left: string[] }
  | { error: string };
export const PREVIEW_LIMIT = 50;

const f = schema.appProfileFilters;

/** The filters of a profile by kind; a kind without a row, or with an empty query, has no filter. */
export async function listFilters(profileId: number): Promise<Partial<Record<Kind, ProfileFilter>>> {
  return Object.fromEntries((await db.select().from(f).where(eq(f.profileId, profileId))).map((row) => [row.kind, row]));
}

/** Every profile's filters, by profile id (the step reads them all at once). */
export async function allFilters(): Promise<Map<number, Partial<Record<Kind, ProfileFilter>>>> {
  const out = new Map<number, Partial<Record<Kind, ProfileFilter>>>();
  for (const row of await db.select().from(f)) {
    const mine = out.get(row.profileId) ?? {};
    mine[row.kind] = row;
    out.set(row.profileId, mine);
  }
  return out;
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
 * The filter of `kind` for a profile, its query checked first; an empty query means everything is
 * seen. Returns what is wrong with the query, null once saved. The profile follows at the step that
 * applies it (`applied_at` null meanwhile).
 */
export async function saveFilter(profileId: number, kind: Kind, query: string): Promise<string | null> {
  const q = query.trim();
  const [current] = await db
    .select()
    .from(f)
    .where(and(eq(f.profileId, profileId), eq(f.kind, kind)));
  if ((current?.query ?? "") === q) return null;
  if (q) {
    const where = await compileFilter(q, kind);
    if (typeof where === "string") return where;
  }
  await db
    .insert(f)
    .values({ profileId, kind, query: q, appliedAt: null })
    .onConflictDoUpdate({ target: [f.profileId, f.kind], set: { query: q, updatedAt: new Date(), appliedAt: null } });
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

/** A filter changed since the step last judged it (of one profile, or of any): the catalogue does not follow it yet. */
export async function filtersPending(profileId?: number): Promise<boolean> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(f)
    .where(and(isNull(f.appliedAt), profileId === undefined ? undefined : eq(f.profileId, profileId)));
  return row.n > 0;
}

/** The step judged these: their verdict is in the catalogue. */
export async function filtersApplied(profileId: number, kinds: Kind[]) {
  if (!kinds.length) return;
  await db
    .update(f)
    .set({ appliedAt: new Date() })
    .where(and(eq(f.profileId, profileId), sql`${f.kind} = any(${`{${kinds.join(",")}}`}::content_kind[])`));
}

/**
 * The languages a profile's filter names for `kind`, in the order written: `variant.langue:"vf","vo"`
 * reads « VF first, then VO ». Terms negated, or under a negated group, say what is left out, not an
 * order. Without one, the default order. These are the versions the profile plays and their order.
 */
export function filterLanguages(query: string, fallback: readonly string[] = DEFAULT_LANGUAGE_ORDER): string[] {
  let tree: QueryNode | null;
  try {
    tree = parseQuery(query);
  } catch {
    return [...fallback];
  }
  const out: string[] = [];
  const walk = (node: QueryNode | null, neg: boolean) => {
    if (!node) return;
    if (node.kind !== "term") {
      for (const n of node.nodes) walk(n, neg !== node.neg);
      return;
    }
    const t = node.term;
    if (neg !== t.neg || !t.field || !["variant.langue", "variant.lang"].includes(t.field.toLowerCase()) || t.op.kind !== "match") return;
    for (const v of t.op.values) {
      const code = v.text.trim().toUpperCase();
      if (code && !out.includes(code)) out.push(code);
    }
  };
  walk(tree, false);
  return out.length ? out : [...fallback];
}

/** The language order of a profile, for the films and for the series, from its filters. */
export async function languageOrderOf(profileId: number): Promise<Record<"vod" | "series", string[]>> {
  const filters = await listFilters(profileId);
  return { vod: filterLanguages(filters.vod?.query ?? ""), series: filterLanguages(filters.series?.query ?? "") };
}
