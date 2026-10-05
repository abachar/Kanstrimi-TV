import { sql } from "drizzle-orm";
import { db, schema, KINDS, type Kind } from "@/db";
import { checkCancelled } from "@/shared";
import { compileFilter, filtersApplied, listFilters } from "./filters";
import { refreshVisibility } from "../grouping/group";
import { withCatalogLock } from "../lock";

/**
 * The `filters` step, after the grouping: each version judged by the filter of its kind, kept or left out
 * (`catalog_variants.hidden_by_rule`), then the contents whose versions moved count again only what is
 * left: their aggregates, `visible` (one version served) and the waitlist's arrivals. No filter: everything
 * kept. A filter that no longer compiles leaves its kind as it was, said in the log. `contentIds`: only
 * the versions of those (a manual regroup).
 */
export function applyFilters(opts: { contentIds?: number[] } = {}) {
  return withCatalogLock(() => apply(opts.contentIds));
}

async function apply(contentIds?: number[]) {
  if (contentIds && !contentIds.length) return { variants_hidden: 0, waitlist_available: 0 };
  const filters = await listFilters();
  const v = schema.catalogVariants;
  const scope = contentIds ? sql`and ${v.contentId} = any(${`{${contentIds.join(",")}}`}::int[])` : sql``;
  const touched = new Set<number>();
  for (const kind of KINDS as readonly Kind[]) {
    checkCancelled();
    const filter = filters[kind];
    let hidden = sql`false`;
    if (filter) {
      const where = await compileFilter(filter.query, kind);
      if (typeof where === "string") {
        console.warn(`[filtres] filtre ${kind} ignoré : ${where}`);
        continue;
      }
      hidden = sql`not coalesce(${where}, false)`;
    }
    const rows = await db.execute<{ content_id: number | null }>(sql`
      update ${v} set hidden_by_rule = ${hidden}
      where ${v.kind} = ${kind} ${scope} and ${v.hiddenByRule} is distinct from (${hidden})
      returning content_id`);
    for (const r of rows) if (r.content_id !== null) touched.add(r.content_id);
  }
  checkCancelled();
  const waitlist_available = touched.size ? await refreshVisibility([...touched]) : 0;
  if (!contentIds) await filtersApplied();
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(v).where(sql`${v.hiddenByRule}`);
  return { variants_hidden: r.n, waitlist_available };
}
