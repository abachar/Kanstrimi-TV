import { asc, and, eq, sql, type SQL } from "drizzle-orm";
import { db, schema, type FilterRule } from "@/db";
import { getSettings, setSettings } from "@/config";
import { checkRegexes, compileQuery, QueryError, type Level } from "../query";

/**
 * What the rules on versions and on contents share: the enabled rules of a level compiled, the
 * condition that tells hidden from kept, and whether the catalogue lags behind them (`rules_pending`).
 */

export type CompiledRule = { rule: FilterRule; where: SQL };

/** The enabled rules judging `target`, in their order, each compiled; one that no longer compiles is skipped, said in the log. */
export async function enabledRules(target: Level): Promise<CompiledRule[]> {
  const lang = (await getSettings()).tmdb_language;
  const r = schema.curationFilterRules;
  const rules = await db
    .select()
    .from(r)
    .where(and(eq(r.enabled, true), eq(r.target, target)))
    .orderBy(asc(r.name), asc(r.id));
  const out: CompiledRule[] = [];
  for (const rule of rules) {
    try {
      const compiled = compileQuery(rule.query, { kind: rule.kind, lang, rule: true });
      if (!compiled) continue;
      if (compiled.target !== target) throw new QueryError("sa requête ne vise plus le même niveau : à enregistrer de nouveau", 0);
      await checkRegexes(rule.query);
      out.push({ rule, where: compiled.where });
    } catch (e) {
      if (!(e instanceof QueryError)) throw e;
      console.warn(`[règles] « ${rule.name} » ignorée : ${e.message}`);
    }
  }
  return out;
}

/** Whether a row is hidden: one rule matching it is enough, in no order (a rule only hides). */
export function hiddenCase(rules: CompiledRule[]): SQL {
  if (!rules.length) return sql`false`;
  return sql`(${sql.join(
    rules.map((r) => sql`coalesce(${r.where}, false)`),
    sql` or `,
  )})`;
}

/** A rule changed since the last `filters` step: the catalogue does not follow it yet. */
export const rulesPending = async () => Boolean((await getSettings()).rules_pending);
export const markRulesPending = () => setSettings({ rules_pending: "1" });
export const rulesApplied = () => setSettings({ rules_pending: "" });
