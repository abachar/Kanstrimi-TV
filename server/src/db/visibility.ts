import { and, eq, or, sql, type SQL } from "drizzle-orm";
import { schema } from "./client";
import type { Category, Variant } from "./schema";

/**
 * An item sitting in a hidden category is hidden too, without touching its own columns:
 * the category switch stays reversible and never overwrites a per-item choice.
 * `applyRules` already propagates *rule* hiding at write time; this covers the manual one
 * and costs nothing to keep. Written as `exists` on purpose: an item whose category is
 * missing upstream stays visible rather than silently disappearing.
 */
export const inHiddenCategory: SQL = sql`exists (
  select 1 from ${schema.catalogCategories} c
  where c.kind = ${schema.catalogVariants.kind} and c.xtream_id = ${schema.catalogVariants.categoryXtreamId}
    and (c.hidden_by_rule or c.hidden_manual))`;

/** Served to the players: neither hidden by a rule, nor by hand, nor through its category. */
export const visibleItem: SQL = and(
  eq(schema.catalogVariants.hiddenByRule, false),
  eq(schema.catalogVariants.hiddenManual, false),
  sql`not ${inHiddenCategory}`,
)!;
export const hiddenItem: SQL = or(
  eq(schema.catalogVariants.hiddenByRule, true),
  eq(schema.catalogVariants.hiddenManual, true),
  inHiddenCategory,
)!;
export const visibleCategory: SQL = and(
  eq(schema.catalogCategories.hiddenByRule, false),
  eq(schema.catalogCategories.hiddenManual, false),
)!;

/** The same rule as `inHiddenCategory`, on a row already loaded. */
export function isCategoryHidden(c: Pick<Category, "hiddenByRule" | "hiddenManual"> | null | undefined): boolean {
  return Boolean(c && (c.hiddenByRule || c.hiddenManual));
}

/** The same rule as `hiddenItem`, on rows already loaded; the category may be unknown. */
export function isItemHidden(
  it: Pick<Variant, "hiddenByRule" | "hiddenManual">,
  category?: Pick<Category, "hiddenByRule" | "hiddenManual"> | null,
): boolean {
  return it.hiddenByRule || it.hiddenManual || isCategoryHidden(category);
}
