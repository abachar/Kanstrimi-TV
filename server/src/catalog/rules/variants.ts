import { sql } from "drizzle-orm";
import { db, schema, KINDS, type Kind } from "@/db";
import { checkCancelled } from "@/shared";
import { enabledRules, hiddenCase } from "./compiled";

/**
 * The rules on versions (`-variant.langue:"vf","vo"`, `marché:"ar" xtream.nom:2m`): the first thing the
 * `filters` step does, on the contents the grouping made. They write `catalog_variants.hidden_by_rule`
 * and return the contents whose versions moved, for their aggregates to count only what is left.
 * `contentIds`: only the versions of those (a manual regroup). Takes no lock: `filters` holds it.
 */
export async function applyVariantRules(contentIds?: number[]): Promise<{ touched: number[]; variants_hidden: number }> {
  const rules = await enabledRules("variant");
  const v = schema.catalogVariants;
  const scope = contentIds ? sql`and ${v.contentId} = any(${`{${contentIds.join(",")}}`}::int[])` : sql``;
  const touched = new Set<number>();
  for (const kind of KINDS as readonly Kind[]) {
    checkCancelled();
    const hidden = hiddenCase(rules.filter((r) => r.rule.kind === kind));
    const rows = await db.execute<{ content_id: number | null }>(sql`
      update ${v} set hidden_by_rule = ${hidden}
      where ${v.kind} = ${kind} ${scope} and ${v.hiddenByRule} is distinct from (${hidden})
      returning content_id`);
    for (const r of rows) if (r.content_id !== null) touched.add(r.content_id);
  }
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(v).where(sql`${v.hiddenByRule}`);
  return { touched: [...touched], variants_hidden: r.n };
}

/** The rule that hides a version: an enabled rule on versions of its kind that matches it (the first by name). */
export async function variantHidingRule(variant: { id: number; kind: Kind }): Promise<string | null> {
  const rules = (await enabledRules("variant")).filter((r) => r.rule.kind === variant.kind);
  const v = schema.catalogVariants;
  for (const r of rules) {
    const [hit] = await db.select({ id: v.id }).from(v).where(sql`${v.id} = ${variant.id} and ${r.where}`);
    if (hit) return r.rule.name;
  }
  return null;
}
