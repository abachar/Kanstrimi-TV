import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { validatePattern } from "@/sync";
import { listRules, saveRule, deleteRule, setRuleEnabled, previewRule } from "@/admin/rules/data";
import { page, back, checked, zerr } from "../http";
import { RulesView, RulePreview } from "./view";

const ruleSchema = z.object({
  id: z.coerce.number().optional(), name: z.string().trim().min(1),
  kind: z.enum(["all", "live", "vod", "series"]), target: z.enum(["name", "category"]),
  pattern: z.string().min(1), flags: z.string().default("i"), action: z.enum(["hide", "keep"]),
  enabled: z.coerce.boolean().default(false), position: z.coerce.number().int().default(0),
});
const previewSchema = z.object({
  pattern: z.string().default(""), flags: z.string().default("i"),
  kind: z.enum(["all", "live", "vod", "series"]).default("all"), target: z.enum(["name", "category"]).default("name"),
});

export const rulesRoutes = new Hono();

rulesRoutes.get("/rules", async (c) => page(c, "Règles", <RulesView rules={await listRules()} />));
rulesRoutes.post("/rules", zValidator("form", ruleSchema, (r, c) => { if (!r.success) return back(c, "/admin/rules", { err: zerr(r.error) }); }), async (c) => {
  const rule = c.req.valid("form");
  const err = validatePattern(rule.pattern, rule.flags);
  if (err) return back(c, "/admin/rules", { err: `Regex invalide : ${err}` });
  const r = await saveRule(rule);
  return back(c, "/admin/rules", { ok: `Règle enregistrée — ${r.items} éléments et ${r.categories} catégories mis à jour` });
});
rulesRoutes.post("/rules/:id/delete", async (c) => {
  await deleteRule(Number(c.req.param("id")));
  c.header("HX-Redirect", "/admin/rules?ok=R%C3%A8gle+supprim%C3%A9e");
  return back(c, "/admin/rules", { ok: "Règle supprimée" });
});
rulesRoutes.post("/rules/:id/toggle", async (c) => {
  await setRuleEnabled(Number(c.req.param("id")), await checked(c, "enabled"));
  return c.body(null, 204);
});
rulesRoutes.post("/rules/preview", zValidator("form", previewSchema), async (c) =>
  c.html(<RulePreview preview={await previewRule(c.req.valid("form"))} />));
