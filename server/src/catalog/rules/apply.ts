import { inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { compileRules, isHidden } from "./engine";
import { refreshVisibility } from "../grouping/group";

const CHUNK = 500;

/** Recompute hidden_by_rule for all categories and items from the current rule set. */
export async function applyRules() {
  const rules = await db.select().from(schema.filterRules);
  const compiled = compileRules(rules);
  const cats = await db
    .select({
      id: schema.categories.id,
      kind: schema.categories.kind,
      name: schema.categories.name,
      xtreamId: schema.categories.xtreamId,
      hidden: schema.categories.hiddenByRule,
    })
    .from(schema.categories);
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
        .update(schema.categories)
        .set({ hiddenByRule: u.hidden })
        .where(inArray(schema.categories.id, u.ids.slice(i, i + CHUNK)));

  const its = await db
    .select({
      id: schema.items.id,
      kind: schema.items.kind,
      name: schema.items.name,
      cat: schema.items.categoryXtreamId,
      hidden: schema.items.hiddenByRule,
    })
    .from(schema.items);
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
        .update(schema.items)
        .set({ hiddenByRule: u.hidden })
        .where(inArray(schema.items.id, u.ids.slice(i, i + CHUNK)));
  await refreshVisibility();
  return { categories: catUpdates[0].ids.length + catUpdates[1].ids.length, items: itemUpdates[0].ids.length + itemUpdates[1].ids.length };
}
