import { and, eq, or, sql, type SQL } from "drizzle-orm";
import { db, schema } from "../client";
import type { Category } from "../schema";

/**
 * An item sitting in a hidden category is hidden too, without touching its own columns:
 * the category switch stays reversible and never overwrites a per-item choice.
 * `applyRules` already propagates *rule* hiding at write time; this covers the manual one
 * and costs nothing to keep. Written as `exists` on purpose: an item whose category is
 * missing upstream stays visible rather than silently disappearing.
 */
export const inHiddenCategory: SQL = sql`exists (
  select 1 from ${schema.categories} c
  where c.kind = ${schema.items.kind} and c.xtream_id = ${schema.items.categoryXtreamId}
    and (c.hidden_by_rule or c.hidden_manual))`;

/** Served to the players: neither hidden by a rule, nor by hand, nor through its category. */
export const visibleItem: SQL = and(eq(schema.items.hiddenByRule, false), eq(schema.items.hiddenManual, false), sql`not ${inHiddenCategory}`)!;
export const hiddenItem: SQL = or(eq(schema.items.hiddenByRule, true), eq(schema.items.hiddenManual, true), inHiddenCategory)!;
export const visibleCategory: SQL = and(eq(schema.categories.hiddenByRule, false), eq(schema.categories.hiddenManual, false))!;

/** The same rule as `inHiddenCategory`, on a row already loaded. */
export function isCategoryHidden(c: Pick<Category, "hiddenByRule" | "hiddenManual"> | null | undefined): boolean {
  return Boolean(c && (c.hiddenByRule || c.hiddenManual));
}

/** The admin switch reads "Visible"; the column stores the opposite. */
export async function setItemHiddenManual(id: number, hiddenManual: boolean) {
  await db.update(schema.items).set({ hiddenManual }).where(eq(schema.items.id, id));
}
export async function setCategoryHiddenManual(id: number, hiddenManual: boolean) {
  await db.update(schema.categories).set({ hiddenManual }).where(eq(schema.categories.id, id));
}
