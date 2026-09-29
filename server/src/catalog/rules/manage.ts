import { asc, eq } from "drizzle-orm";
import type { FilterRule, Kind } from "@/db";
import { db, schema } from "@/db";
import { applyRules } from "./apply";
import { sanitizeFlags, validatePattern } from "./engine";

export type RuleInput = {
  id?: number;
  name: string;
  kind: Kind | "all";
  target: "name" | "category";
  pattern: string;
  flags: string;
  action: "hide" | "keep";
  enabled: boolean;
  position: number;
};
export type RulePreview = { matches: string[]; total: number };
export const PREVIEW_LIMIT = 50;

export async function listRules(): Promise<FilterRule[]> {
  return db.select().from(schema.curationFilterRules).orderBy(asc(schema.curationFilterRules.position), asc(schema.curationFilterRules.id));
}

/** Insert or update, then reapply every rule: the catalogue never lags behind the rule set. */
export async function saveRule(input: RuleInput) {
  const row = {
    name: input.name,
    kind: input.kind === "all" ? null : input.kind,
    target: input.target,
    pattern: input.pattern,
    flags: input.flags,
    action: input.action,
    enabled: input.enabled,
    position: input.position,
  };
  if (input.id) await db.update(schema.curationFilterRules).set(row).where(eq(schema.curationFilterRules.id, input.id));
  else await db.insert(schema.curationFilterRules).values(row);
  return applyRules();
}

export async function deleteRule(id: number) {
  await db.delete(schema.curationFilterRules).where(eq(schema.curationFilterRules.id, id));
  return applyRules();
}

export async function setRuleEnabled(id: number, enabled: boolean) {
  await db.update(schema.curationFilterRules).set({ enabled }).where(eq(schema.curationFilterRules.id, id));
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
  const t = r.target === "category" ? schema.catalogCategories : schema.catalogVariants;
  const rows = await db
    .select({ name: t.name, kind: t.kind })
    .from(t)
    .where(r.kind === "all" ? undefined : eq(t.kind, r.kind))
    .orderBy(asc(t.kind), asc(t.position));
  const hits = rows.filter((row) => re.test(row.name));
  return { matches: hits.slice(0, PREVIEW_LIMIT).map((row) => `[${row.kind}] ${row.name}`), total: hits.length };
}
