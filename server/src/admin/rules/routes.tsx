import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { checkRuleQuery, listRules, saveRule, deleteRule, setRuleEnabled, previewRule, rulesPending, isTaskRunning } from "@/catalog";
import { page, back, checked, zerr, intParam } from "../http";
import { RulesView, RulePreview } from "./view";

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

rulesRoutes.get("/", async (c) =>
  page(c, "Règles", <RulesView rules={await listRules()} pending={await rulesPending()} busy={isTaskRunning("pipeline")} />),
);
rulesRoutes.post(
  "/",
  zValidator("form", ruleSchema, (r, c) => {
    if (!r.success) return back(c, "/admin/rules", { err: zerr(r.error) });
  }),
  async (c) => {
    const rule = c.req.valid("form");
    const err = await checkRuleQuery(rule.query, rule.kind);
    if (err) return back(c, "/admin/rules", { err: `Requête invalide : ${err}` });
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
