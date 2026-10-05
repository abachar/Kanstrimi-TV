import { sql } from "drizzle-orm";
import { db, schema, KINDS, type Kind } from "@/db";
import { checkCancelled } from "@/shared";
import { enabledRules, hiddenCase, rulesApplied } from "./compiled";
import { applyVariantRules } from "./variants";
import { refreshContentVisibility, refreshVisibility } from "../grouping/group";
import { withCatalogLock } from "../lock";

/**
 * The rules, queries of the filter language, all applied by the `filters` step after the grouping: those
 * on versions hide versions, those on contents judge contents (`catalog_contents.hidden_by_rule`), one
 * `UPDATE` per kind. A rule only hides: one matching is enough, in no order. After the grouping, a rule
 * reads the content as the app shows it. Saving a rule does not run this: `rules_pending` says the
 * catalogue lags behind the rules (`compiled.ts`).
 */

/**
 * Why the rules hide a content: the name of an enabled rule that matches it (the first by name). Null
 * when none does.
 */
export async function hidingRule(content: { id: number; kind: Kind }): Promise<string | null> {
  const rules = (await enabledRules("content")).filter((r) => r.rule.kind === content.kind);
  const c = schema.catalogContents;
  for (const r of rules) {
    const [hit] = await db.select({ id: c.id }).from(c).where(sql`${c.id} = ${content.id} and ${r.where}`);
    if (hit) return r.rule.name;
  }
  return null;
}

/**
 * The `filters` step, every rule in this order, on every content or only `contentIds` (a manual regroup):
 * 1. the rules on versions hide versions (`variants.ts`);
 * 2. the contents whose versions moved count again only what is left (their aggregates);
 * 3. the rules on contents judge them;
 * 4. visibility: a content is visible when one of its versions is and no rule hides it, so a content
 *    left without versions is hidden; the waitlist learns of its arrivals with it.
 */
export function applyRules(opts: { contentIds?: number[] } = {}) {
  return withCatalogLock(() => apply(opts.contentIds));
}

async function apply(contentIds?: number[]) {
  if (contentIds && !contentIds.length) return { variants_hidden: 0, contents: 0, waitlist_available: 0 };
  const { touched, variants_hidden } = await applyVariantRules(contentIds);
  checkCancelled();
  if (touched.length) await refreshVisibility(touched);
  const rules = await enabledRules("content");
  const c = schema.catalogContents;
  const scope = contentIds ? sql`and ${c.id} = any(${`{${contentIds.join(",")}}`}::int[])` : sql``;
  let contents = 0;
  for (const kind of KINDS as readonly Kind[]) {
    checkCancelled();
    const hidden = hiddenCase(rules.filter((r) => r.rule.kind === kind));
    const changed = await db.execute(sql`
      update ${c} set hidden_by_rule = ${hidden}
      where ${c.kind} = ${kind} ${scope} and ${c.hiddenByRule} is distinct from (${hidden})`);
    contents += changed.count;
  }
  checkCancelled();
  const waitlist_available = await refreshContentVisibility(contentIds);
  if (!contentIds) await rulesApplied();
  return { variants_hidden, contents, waitlist_available };
}
