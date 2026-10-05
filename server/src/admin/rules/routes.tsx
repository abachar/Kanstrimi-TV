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
  rulesPending,
  isTaskRunning,
  languagesOfCatalogue,
  languagesPending,
  saveServedLanguages,
} from "@/catalog";
import { getSettings, servedLanguages } from "@/config";
import { page, back, checked, zerr, intParam } from "../http";
import { RulesView, RulePage, RulePreview } from "./view";

const ruleSchema = z.object({
  id: z.coerce.number().optional(),
  name: z.string().trim().min(1),
  kind: z.enum(["all", "live", "vod", "series"]),
  query: z.string().trim().min(1),
  action: z.enum(["hide", "keep"]),
  enabled: z.coerce.boolean().default(false),
  position: z.coerce.number().int().default(0),
});
const previewSchema = z.object({
  query: z.string().default(""),
  kind: z.enum(["all", "live", "vod", "series"]).default("all"),
});

/** `/admin/rules`: the rules in the filter language; saving only marks them pending, the `filters` step applies them. */
export const rulesRoutes = new Hono();

rulesRoutes.get("/", async (c) => {
  const [rules, pending, langsPending, languages, s] = await Promise.all([
    listRules(),
    rulesPending(),
    languagesPending(),
    languagesOfCatalogue(),
    getSettings(),
  ]);
  return page(
    c,
    "Règles",
    <RulesView
      rules={rules}
      pending={pending}
      languagesPending={langsPending}
      busy={isTaskRunning("pipeline")}
      languages={languages}
      served={servedLanguages(s)}
    />,
  );
});
/** A rule on a page of its own: `new` for a blank one. Under « Règles » in the breadcrumb. */
const RULES = { under: "/admin/rules" };
rulesRoutes.get("/new", (c) => page(c, "Nouvelle règle", <RulePage />, RULES));
rulesRoutes.get("/:id{[0-9]+}", async (c) => {
  const id = intParam(c, "id");
  const rule = (await listRules()).find((r) => r.id === id);
  if (!rule) return c.notFound();
  return page(c, rule.name, <RulePage rule={rule} />, RULES);
});
/** The served languages: the boxes ticked, among the catalogue's own languages; at least one. */
rulesRoutes.post("/languages", async (c) => {
  const langs = await saveServedLanguages((await c.req.formData()).getAll("lang").map(String));
  if (!langs.length) return back(c, "/admin/rules", { err: "Choisir au moins une langue" });
  return back(c, "/admin/rules", { ok: `Langues servies : ${langs.join(", ")} — à appliquer par un passage à partir de « Groupement »` });
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
    if (err) return back(c, rule.id ? `/admin/rules/${rule.id}` : "/admin/rules/new", { err: `Requête invalide : ${err}` });
    await saveRule(rule);
    return back(c, "/admin/rules", { ok: "Règle enregistrée — à appliquer par un passage à partir de « Filtres »" });
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
