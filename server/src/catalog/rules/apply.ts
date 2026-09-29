import { inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { compileRules, isHidden } from "./engine";
import { refreshVisibility } from "../grouping/group";
import { withCatalogLock } from "../lock";

const CHUNK = 500;

/**
 * Recompute hidden_by_rule for all categories and items from the current rule set, under the
 * catalogue lock (the admin changes rules while a run may be grouping). The contents' visibility
 * follows when something changed, unless `refresh` is off: in the pipeline, `group` recomputes it next.
 */
export function applyRules(opts: { refresh?: boolean } = {}) {
  return withCatalogLock(() => apply(opts.refresh ?? true));
}

async function apply(refresh: boolean) {
  const rules = await db.select().from(schema.curationFilterRules);
  const compiled = compileRules(rules);
  const cats = await db
    .select({
      id: schema.catalogCategories.id,
      kind: schema.catalogCategories.kind,
      name: schema.catalogCategories.name,
      xtreamId: schema.catalogCategories.xtreamId,
      hidden: schema.catalogCategories.hiddenByRule,
    })
    .from(schema.catalogCategories);
  const hiddenCatKeys = new Set<string>();
  const catName = new Map<string, string>();
  const catUpdates: { ids: number[]; hidden: boolean }[] = [
    { ids: [], hidden: true },
    { ids: [], hidden: false },
  ];
  for (const c of cats) {
    const h = isHidden(compiled, c.kind, "category", c.name);
    catName.set(`${c.kind}:${c.xtreamId}`, c.name);
    if (h) hiddenCatKeys.add(`${c.kind}:${c.xtreamId}`);
    if (h !== c.hidden) catUpdates[h ? 0 : 1].ids.push(c.id);
  }
  for (const u of catUpdates)
    for (let i = 0; i < u.ids.length; i += CHUNK)
      await db
        .update(schema.catalogCategories)
        .set({ hiddenByRule: u.hidden })
        .where(inArray(schema.catalogCategories.id, u.ids.slice(i, i + CHUNK)));

  const its = await db
    .select({
      id: schema.catalogVariants.id,
      kind: schema.catalogVariants.kind,
      name: schema.catalogVariants.name,
      cat: schema.catalogVariants.categoryXtreamId,
      hidden: schema.catalogVariants.hiddenByRule,
    })
    .from(schema.catalogVariants);
  const itemUpdates: { ids: number[]; hidden: boolean }[] = [
    { ids: [], hidden: true },
    { ids: [], hidden: false },
  ];
  for (const it of its) {
    const key = `${it.kind}:${it.cat}`;
    const h = hiddenCatKeys.has(key) || isHidden(compiled, it.kind, "name", it.name);
    if (h !== it.hidden) itemUpdates[h ? 0 : 1].ids.push(it.id);
  }
  for (const u of itemUpdates)
    for (let i = 0; i < u.ids.length; i += CHUNK)
      await db
        .update(schema.catalogVariants)
        .set({ hiddenByRule: u.hidden })
        .where(inArray(schema.catalogVariants.id, u.ids.slice(i, i + CHUNK)));
  const changed = catUpdates.some((u) => u.ids.length) || itemUpdates.some((u) => u.ids.length);
  if (refresh && changed) await refreshVisibility();
  return { categories: catUpdates[0].ids.length + catUpdates[1].ids.length, items: itemUpdates[0].ids.length + itemUpdates[1].ids.length };
}
