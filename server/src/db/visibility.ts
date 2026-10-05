import { and, eq, or, sql, type SQL } from "drizzle-orm";
import { schema } from "./client";
import type { Category, Variant } from "./schema";

/**
 * An item sitting in a category hidden by hand is hidden too, without touching its own columns:
 * the category switch stays reversible and never overwrites a per-item choice. Written as `exists`
 * on purpose: an item whose category is missing upstream stays visible rather than silently disappearing.
 */
export const inHiddenCategory: SQL = sql`exists (
  select 1 from ${schema.catalogCategories} c
  where c.kind = ${schema.catalogVariants.kind} and c.xtream_id = ${schema.catalogVariants.categoryXtreamId}
    and c.hidden_manual)`;

/**
 * Served to the players: hidden neither by a rule on versions, nor by hand, nor through its category.
 * The rules on contents judge the content: `catalog_contents.visible` adds their verdict.
 */
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
export const visibleCategory: SQL = eq(schema.catalogCategories.hiddenManual, false);

/** The same rule as `inHiddenCategory`, on a row already loaded. */
export function isCategoryHidden(c: Pick<Category, "hiddenManual"> | null | undefined): boolean {
  return Boolean(c?.hiddenManual);
}

/** The same rule as `hiddenItem`, on rows already loaded; the category may be unknown. */
export function isItemHidden(
  it: Pick<Variant, "hiddenByRule" | "hiddenManual">,
  category?: Pick<Category, "hiddenManual"> | null,
): boolean {
  return it.hiddenByRule || it.hiddenManual || isCategoryHidden(category);
}
