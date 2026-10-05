import { asc, eq, sql } from "drizzle-orm";
import type { FilterRule, Kind } from "@/db";
import { db, schema } from "@/db";
import { getSettings } from "@/config";
import { checkRegexes, compileQuery, QueryError } from "../query";
import { markRulesPending } from "./apply";

export type RuleInput = {
  id?: number;
  name: string;
  kind: Kind | "all";
  query: string;
  action: "hide" | "keep";
  enabled: boolean;
  position: number;
};
export type RulePreview = { matches: string[]; total: number } | { error: string };
export const PREVIEW_LIMIT = 50;

export async function listRules(): Promise<FilterRule[]> {
  return db.select().from(schema.curationFilterRules).orderBy(asc(schema.curationFilterRules.position), asc(schema.curationFilterRules.id));
}

const kindOf = (k: Kind | "all") => (k === "all" ? null : k);

/** What is wrong with a rule's query, said in a sentence with its column; null when it compiles. */
export async function checkRuleQuery(query: string, kind: Kind | "all"): Promise<string | null> {
  try {
    if (!compileQuery(query, { kind: kindOf(kind), lang: (await getSettings()).tmdb_language, rule: true })) return "Requête vide";
    await checkRegexes(query);
    return null;
  } catch (e) {
    if (e instanceof QueryError) return `${e.message} (colonne ${e.at + 1})`;
    throw e;
  }
}

/** Insert or update; the catalogue follows at the next `filters` step. */
export async function saveRule(input: RuleInput) {
  const row = {
    name: input.name,
    kind: kindOf(input.kind),
    query: input.query.trim(),
    action: input.action,
    enabled: input.enabled,
    position: input.position,
  };
  if (input.id) await db.update(schema.curationFilterRules).set(row).where(eq(schema.curationFilterRules.id, input.id));
  else await db.insert(schema.curationFilterRules).values(row);
  await markRulesPending();
}

export async function deleteRule(id: number) {
  await db.delete(schema.curationFilterRules).where(eq(schema.curationFilterRules.id, id));
  await markRulesPending();
}

export async function setRuleEnabled(id: number, enabled: boolean) {
  await db.update(schema.curationFilterRules).set({ enabled }).where(eq(schema.curationFilterRules.id, id));
  await markRulesPending();
}

/** What a rule would match: the search of its query on the contents of its kind, the first titles and the count. */
export async function previewRule(r: Pick<RuleInput, "query" | "kind">): Promise<RulePreview> {
  const error = await checkRuleQuery(r.query, r.kind);
  if (error) return { error };
  const where = compileQuery(r.query, { kind: kindOf(r.kind), lang: (await getSettings()).tmdb_language, rule: true })!;
  const c = schema.catalogContents;
  const scope = r.kind === "all" ? where : sql`${c.kind} = ${r.kind} and ${where}`;
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local statement_timeout = '15s'`);
    const [[{ n }], rows] = await Promise.all([
      tx.select({ n: sql<number>`count(*)::int` }).from(c).where(scope),
      tx.select({ title: c.title, kind: c.kind }).from(c).where(scope).orderBy(asc(c.kind), asc(c.title)).limit(PREVIEW_LIMIT),
    ]);
    return { matches: rows.map((row) => `[${row.kind}] ${row.title}`), total: n };
  });
}
