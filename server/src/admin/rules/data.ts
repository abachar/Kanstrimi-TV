import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { FilterRule } from "@/db";
import { applyRules } from "@/sync";
import type { Kind } from "@/db";
import { sanitizeFlags, validatePattern } from "@/sync";

export type RuleInput = {
  id?: number; name: string; kind: Kind | "all"; target: "name" | "category";
  pattern: string; flags: string; action: "hide" | "keep"; enabled: boolean; position: number;
};
export type RulePreview = { matches: string[]; total: number };
export const PREVIEW_LIMIT = 50;

export async function listRules(): Promise<FilterRule[]> {
  return db.select().from(schema.filterRules).orderBy(asc(schema.filterRules.position), asc(schema.filterRules.id));
}

/** Insert or update, then reapply every rule: the catalogue never lags behind the rule set. */
export async function saveRule(input: RuleInput) {
  const row = { name: input.name, kind: input.kind === "all" ? null : input.kind, target: input.target, pattern: input.pattern, flags: input.flags, action: input.action, enabled: input.enabled, position: input.position };
  if (input.id) await db.update(schema.filterRules).set(row).where(eq(schema.filterRules.id, input.id));
  else await db.insert(schema.filterRules).values(row);
  return applyRules();
}

export async function deleteRule(id: number) {
  await db.delete(schema.filterRules).where(eq(schema.filterRules.id, id));
  return applyRules();
}

export async function setRuleEnabled(id: number, enabled: boolean) {
  await db.update(schema.filterRules).set({ enabled }).where(eq(schema.filterRules.id, id));
  return applyRules();
}

/**
 * What a rule would match, on the same engine as `applyRules`, on purpose: Postgres regexes
 * differ from JavaScript's (`\b` is a backspace there), so a database-side preview would lie
 * about `\b`, `\d` or lookarounds. Names only, so even the whole catalogue is a few megabytes.
 */
export async function previewRule(r: Pick<RuleInput, "pattern" | "flags" | "kind" | "target">): Promise<RulePreview> {
  if (validatePattern(r.pattern, r.flags)) return { matches: [], total: 0 };
  const re = new RegExp(r.pattern, sanitizeFlags(r.flags).replace("g", ""));
  const t = r.target === "category" ? schema.categories : schema.items;
  const rows = await db.select({ name: t.name, kind: t.kind }).from(t)
    .where(r.kind === "all" ? undefined : eq(t.kind, r.kind)).orderBy(asc(t.kind), asc(t.position));
  const hits = rows.filter((row) => re.test(row.name));
  return { matches: hits.slice(0, PREVIEW_LIMIT).map((row) => `[${row.kind}] ${row.name}`), total: hits.length };
}
