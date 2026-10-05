import { asc, eq, sql } from "drizzle-orm";
import type { FilterRule, Kind } from "@/db";
import { db, schema } from "@/db";
import { getSettings } from "@/config";
import { checkRegexes, compileQuery, QueryError, type CompiledQuery, type Level } from "../query";
import { markRulesPending } from "./compiled";

/** A rule as the admin writes it: it only hides; its kind is fixed once created, what it judges is read from its query. */
export type RuleInput = {
  id?: number;
  name: string;
  kind: Kind;
  query: string;
  enabled: boolean;
};
/** What a rule would hide: contents, or versions for a rule on versions. */
export type RulePreview = { target: Level; matches: string[]; total: number } | { error: string };
export const PREVIEW_LIMIT = 50;

const r = schema.curationFilterRules;

export async function listRules(): Promise<FilterRule[]> {
  return db.select().from(r).orderBy(asc(r.kind), asc(r.name), asc(r.id));
}

export async function ruleById(id: number): Promise<FilterRule | null> {
  const [rule] = await db.select().from(r).where(eq(r.id, id));
  return rule ?? null;
}

/** The query compiled as a rule of `kind`, or what is wrong with it, said in a sentence with its column. */
async function compileRule(query: string, kind: Kind): Promise<CompiledQuery | string> {
  try {
    const compiled = compileQuery(query, { kind, lang: (await getSettings()).tmdb_language, rule: true });
    if (!compiled) return "Requête vide";
    await checkRegexes(query);
    return compiled;
  } catch (e) {
    if (e instanceof QueryError) return `${e.message} (colonne ${e.at + 1})`;
    throw e;
  }
}

/** What is wrong with a rule's query; null when it compiles. */
export async function checkRuleQuery(query: string, kind: Kind): Promise<string | null> {
  const compiled = await compileRule(query, kind);
  return typeof compiled === "string" ? compiled : null;
}

/** Insert or update, its query checked first; the catalogue follows at the step that applies it. */
export async function saveRule(input: RuleInput) {
  const existing = input.id ? await ruleById(input.id) : null;
  const kind = existing?.kind ?? input.kind;
  const compiled = await compileRule(input.query, kind);
  if (typeof compiled === "string") throw new QueryError(compiled, 0);
  const row = {
    name: input.name,
    query: input.query.trim(),
    target: compiled.target,
    enabled: input.enabled,
  };
  if (existing) await db.update(r).set(row).where(eq(r.id, existing.id));
  else await db.insert(r).values({ ...row, kind });
  await markRulesPending();
}

export async function deleteRule(id: number) {
  const [gone] = await db.delete(r).where(eq(r.id, id)).returning({ target: r.target });
  if (gone) await markRulesPending();
}

export async function setRuleEnabled(id: number, enabled: boolean) {
  const [rule] = await db.update(r).set({ enabled }).where(eq(r.id, id)).returning({ target: r.target });
  if (rule) await markRulesPending();
}

/** What a rule would hide: the contents, or the versions, of its kind it matches, the first ones and the count. */
export async function previewRule(input: Pick<RuleInput, "query" | "kind">): Promise<RulePreview> {
  const compiled = await compileRule(input.query, input.kind);
  if (typeof compiled === "string") return { error: compiled };
  const table = compiled.target === "variant" ? schema.catalogVariants : schema.catalogContents;
  const label = compiled.target === "variant" ? schema.catalogVariants.name : schema.catalogContents.title;
  const scope = sql`${table.kind} = ${input.kind} and ${compiled.where}`;
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local statement_timeout = '15s'`);
    const [[{ n }], rows] = await Promise.all([
      tx.select({ n: sql<number>`count(*)::int` }).from(table).where(scope),
      tx.select({ label }).from(table).where(scope).orderBy(asc(label)).limit(PREVIEW_LIMIT),
    ]);
    return { target: compiled.target, matches: rows.map((row) => row.label), total: n };
  });
}
