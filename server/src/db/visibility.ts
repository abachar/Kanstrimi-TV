import { and, eq, or, sql, type SQL } from "drizzle-orm";
import { schema } from "./client";
import type { Category } from "./schema";
import { variants, type Variant } from "./variants";

/**
 * The predicates below are about `variants` (`db/variants.ts`): the query they go in reads its versions `from ${variants}`.
 *
 * An item sitting in a category hidden by hand is hidden too, without touching its own columns:
 * the category switch stays reversible and never overwrites a per-item choice. Written as `exists`
 * on purpose: an item whose category is missing upstream stays visible rather than silently disappearing.
 */
export const inHiddenCategory: SQL = sql`exists (
  select 1 from ${schema.xtreamCategories} c
  where c.account_id = ${variants.accountId} and c.kind = ${variants.kind}
    and c.xtream_id = ${variants.categoryXtreamId} and c.hidden)`;

/** The variant's provider account is disabled (Fournisseurs): its whole catalogue is kept but served no more. */
export const inDisabledAccount: SQL = sql`exists (
  select 1 from ${schema.xtreamAccounts} a where a.id = ${variants.accountId} and not a.enabled)`;

/**
 * Served to the players: kept by the filter of its kind (null = not judged yet: not served), hidden
 * neither by hand nor through its category, its provider enabled. A content is visible when one of its versions is.
 */
export const visibleItem: SQL = and(
  sql`${variants.hiddenByRule} is false`,
  eq(variants.hiddenManual, false),
  sql`not ${inHiddenCategory}`,
  sql`not ${inDisabledAccount}`,
)!;
export const hiddenItem: SQL = or(
  sql`${variants.hiddenByRule} is not false`,
  eq(variants.hiddenManual, true),
  inHiddenCategory,
  inDisabledAccount,
)!;
export const visibleCategory: SQL = eq(schema.xtreamCategories.hidden, false);

/** The same rule as `inHiddenCategory`, on a row already loaded. */
export function isCategoryHidden(c: Pick<Category, "hidden"> | null | undefined): boolean {
  return Boolean(c?.hidden);
}

/** The same rule as `hiddenItem`, on rows already loaded; the category may be unknown. */
export function isItemHidden(it: Pick<Variant, "hiddenByRule" | "hiddenManual">, category?: Pick<Category, "hidden"> | null): boolean {
  return it.hiddenByRule !== false || it.hiddenManual || isCategoryHidden(category);
}
