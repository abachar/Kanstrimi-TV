import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import {
  checkRuleQuery,
  listRules,
  saveRule,
  deleteRule,
  setRuleEnabled,
  previewRule,
  ruleById,
  rulesPending,
  isTaskRunning,
} from "@/catalog";
import { KINDS, type Kind } from "@/db";
import { page, back, checked, zerr, intParam } from "../http";
import { RulesView, RulePage, RulePreview, KindChoice } from "./view";

const kind = z.enum(KINDS as unknown as [Kind, ...Kind[]]);
const ruleSchema = z.object({
  id: z.coerce.number().optional(),
  name: z.string().trim().min(1),
  kind,
  query: z.string().trim().min(1),
  enabled: z.coerce.boolean().default(false),
});
const previewSchema = z.object({ query: z.string().default(""), kind });

/**
 * `/admin/rules`: every rule in one list; a rule is written on a page of its own, for one kind chosen
 * first. Saving only marks the catalogue behind; a pass from « Filtres » applies every rule.
 */
export const rulesRoutes = new Hono();
/** A rule's page sits under « Règles » in the breadcrumb. */
const RULES = { under: "/admin/rules" };

rulesRoutes.get("/", async (c) => {
  const [rules, pending] = await Promise.all([listRules(), rulesPending()]);
  return page(c, "Règles", <RulesView rules={rules} pending={pending} busy={isTaskRunning("pipeline")} />);
});
/** A new rule: its kind first (each has its own fields), then its form. */
rulesRoutes.get("/new", (c) => {
  const k = kind.safeParse(c.req.query("kind"));
  return k.success ? page(c, "Nouvelle règle", <RulePage kind={k.data} />, RULES) : page(c, "Nouvelle règle", <KindChoice />, RULES);
});
rulesRoutes.get("/:id{[0-9]+}", async (c) => {
  const rule = await ruleById(intParam(c, "id"));
  if (!rule) return c.notFound();
  return page(c, rule.name, <RulePage kind={rule.kind} rule={rule} />, RULES);
});
rulesRoutes.post(
  "/",
  zValidator("form", ruleSchema, (r, c) => {
    if (!r.success) return back(c, "/admin/rules", { err: zerr(r.error) });
  }),
  async (c) => {
    const rule = c.req.valid("form");
    const err = await checkRuleQuery(rule.query, rule.kind);
    // Back to the rule's page: the mistake is fixed where it was made.
    if (err)
      return back(c, rule.id ? `/admin/rules/${rule.id}` : `/admin/rules/new?kind=${rule.kind}`, { err: `Requête invalide : ${err}` });
    await saveRule(rule);
    return back(c, "/admin/rules", { ok: "Règle enregistrée — à appliquer par un passage du traitement" });
  },
);
rulesRoutes.post("/:id/delete", async (c) => {
  await deleteRule(intParam(c, "id"));
  return back(c, "/admin/rules", { ok: "Règle supprimée" });
});
/** The switch answers by reloading the page: the « to apply » banner may have to appear. */
rulesRoutes.post("/:id/toggle", async (c) => {
  await setRuleEnabled(intParam(c, "id"), await checked(c, "enabled"));
  c.header("HX-Refresh", "true");
  return c.body(null, 204);
});
rulesRoutes.post("/preview", zValidator("form", previewSchema), async (c) =>
  c.html(<RulePreview preview={await previewRule(c.req.valid("form"))} />),
);
