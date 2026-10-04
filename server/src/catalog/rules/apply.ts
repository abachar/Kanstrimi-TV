import { asc, sql, type SQL } from "drizzle-orm";
import { db, schema, KINDS, type FilterRule, type Kind } from "@/db";
import { getSettings, setSettings } from "@/config";
import { checkCancelled } from "@/shared";
import { checkRegexes, compileQuery, QueryError } from "../query";
import { refreshVisibility } from "../grouping/group";
import { withCatalogLock } from "../lock";

/**
 * The `filters` step: every rule, a query of the filter language, sets `hidden_by_rule` on the
 * variants, in one `UPDATE` per kind. In order, the last matching rule wins; a « keep » rule for a
 * kind turns it into a whitelist (what no rule keeps is hidden). A category is marked hidden by a
 * rule when every variant in it is. Saving a rule no longer runs this: `rules_pending` says the
 * catalogue lags behind the rules until the next `filters` step.
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

/** Whether a variant of `kind` is hidden: the last matching rule's action, else the whitelist default. */
function hiddenCase(rules: { rule: FilterRule; where: SQL }[]): SQL {
  const keepMode = rules.some((r) => r.rule.action === "keep");
  if (!rules.length) return sql`false`;
  const whens = [...rules].reverse().map((r) => sql`when ${r.where} then ${r.rule.action === "hide"}`);
  return sql`case ${sql.join(whens, sql` `)} else ${keepMode} end`;
}

export function applyRules(opts: { refresh?: boolean } = {}) {
  return withCatalogLock(() => apply(opts.refresh ?? true));
}

async function apply(refresh: boolean) {
  const rules = await compiled();
  let items = 0;
  for (const kind of KINDS as readonly Kind[]) {
    checkCancelled();
    const mine = rules.filter((r) => r.rule.kind === null || r.rule.kind === kind);
    const changed = await db.execute(sql`
      update ${schema.catalogVariants} set hidden_by_rule = not hidden_by_rule
      where ${schema.catalogVariants.kind} = ${kind}
        and ${schema.catalogVariants.hiddenByRule} is distinct from (${hiddenCase(mine)})`);
    items += changed.count;
  }
  checkCancelled();
  // A category every variant of which a rule hides is itself hidden by a rule; an empty one is not.
  const cats = await db.execute(sql`
    update ${schema.catalogCategories} k set hidden_by_rule = x.hidden
    from (
      select k2.id, coalesce(bool_and(v.hidden_by_rule), false) as hidden
      from ${schema.catalogCategories} k2
      left join ${schema.catalogVariants} v on v.kind = k2.kind and v.category_xtream_id = k2.xtream_id
      group by k2.id
    ) x
    where x.id = k.id and k.hidden_by_rule is distinct from x.hidden`);
  if (refresh && (items || cats.count)) await refreshVisibility();
  await setSettings({ rules_pending: "" });
  return { categories: cats.count, items };
}

/** Saving, deleting or switching a rule only says the catalogue now lags behind: the `filters` step applies them. */
export const markRulesPending = () => setSettings({ rules_pending: "1" });
export const rulesPending = async () => (await getSettings()).rules_pending === "1";
