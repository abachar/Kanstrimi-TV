import { asc, sql, type SQL } from "drizzle-orm";
import { db, schema, KINDS, type FilterRule, type Kind } from "@/db";
import { getSettings, setSettings } from "@/config";
import { checkCancelled } from "@/shared";
import { checkRegexes, compileQuery, QueryError } from "../query";
import { refreshContentVisibility } from "../grouping/group";
import { withCatalogLock } from "../lock";

/**
 * The `filters` step: every rule, a query of the filter language, judges the contents
 * (`catalog_contents.hidden_by_rule`), in one `UPDATE` per kind, then `visible` follows. In order, the
 * last matching rule wins; a « keep » rule for a kind turns it into a whitelist (what no rule keeps is
 * hidden). It runs after the grouping: a rule reads the content as the app shows it. Saving a rule no
 * longer runs this: `rules_pending` says the catalogue lags behind the rules until the next `filters` step.
 */

/** The enabled rules in their order, each with its compiled condition; a rule that no longer compiles is skipped. */
async function compiled(): Promise<{ rule: FilterRule; where: SQL }[]> {
  const lang = (await getSettings()).tmdb_language;
  const rules = await db
    .select()
    .from(schema.curationFilterRules)
    .orderBy(asc(schema.curationFilterRules.position), asc(schema.curationFilterRules.id));
  const out: { rule: FilterRule; where: SQL }[] = [];
  for (const rule of rules.filter((r) => r.enabled)) {
    try {
      const where = compileQuery(rule.query, { kind: rule.kind, lang, rule: true });
      if (!where) continue;
      await checkRegexes(rule.query);
      out.push({ rule, where });
    } catch (e) {
      if (!(e instanceof QueryError)) throw e;
      console.warn(`[filters] règle « ${rule.name} » ignorée : ${e.message}`);
    }
  }
  return out;
}

/** Whether a content of `kind` is hidden: the last matching rule's action, else the whitelist default. */
function hiddenCase(rules: { rule: FilterRule; where: SQL }[]): SQL {
  const keepMode = rules.some((r) => r.rule.action === "keep");
  if (!rules.length) return sql`false`;
  const whens = [...rules].reverse().map((r) => sql`when ${r.where} then ${r.rule.action === "hide"}`);
  return sql`case ${sql.join(whens, sql` `)} else ${keepMode} end`;
}

/**
 * Why the rules hide a content: the name of the last enabled rule that matches it (the one that decides),
 * or, for a kind in whitelist mode, that no « keep » rule does. Null when no rule hides it.
 */
export async function hidingRule(content: { id: number; kind: Kind }): Promise<string | null> {
  const rules = (await compiled()).filter((r) => r.rule.kind === null || r.rule.kind === content.kind);
  const c = schema.catalogContents;
  for (const r of [...rules].reverse()) {
    const [hit] = await db.select({ id: c.id }).from(c).where(sql`${c.id} = ${content.id} and ${r.where}`);
    if (hit) return r.rule.action === "hide" ? r.rule.name : null;
  }
  return rules.some((r) => r.rule.action === "keep") ? "aucune règle « garder » ne la retient" : null;
}

/**
 * Judges every content, or only `contentIds` (a manual regroup that made or changed a few): their
 * verdict, then their visibility, and the waitlist's arrivals with it.
 */
export function applyRules(opts: { contentIds?: number[] } = {}) {
  return withCatalogLock(() => apply(opts.contentIds));
}

async function apply(contentIds?: number[]) {
  if (contentIds && !contentIds.length) return { contents: 0, waitlist_available: 0 };
  const rules = await compiled();
  const c = schema.catalogContents;
  const scope = contentIds ? sql`and ${c.id} = any(${`{${contentIds.join(",")}}`}::int[])` : sql``;
  let contents = 0;
  for (const kind of KINDS as readonly Kind[]) {
    checkCancelled();
    const mine = rules.filter((r) => r.rule.kind === null || r.rule.kind === kind);
    const changed = await db.execute(sql`
      update ${c} set hidden_by_rule = ${hiddenCase(mine)}
      where ${c.kind} = ${kind} ${scope} and ${c.hiddenByRule} is distinct from (${hiddenCase(mine)})`);
    contents += changed.count;
  }
  checkCancelled();
  const waitlist_available = await refreshContentVisibility(contentIds);
  if (!contentIds) await setSettings({ rules_pending: "" });
  return { contents, waitlist_available };
}

/** Saving, deleting or switching a rule only says the catalogue now lags behind: the `filters` step applies them. */
export const markRulesPending = () => setSettings({ rules_pending: "1" });
export const rulesPending = async () => (await getSettings()).rules_pending === "1";
