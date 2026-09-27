import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { getSettings, setSettings, DEFAULTS, type SettingKey } from "@/config";
import { isValidCron } from "../format";
import { testXtream } from "@/providers/xtream";
import { TmdbClient } from "@/providers/tmdb";
import { retryUnmatched, resetMatches } from "@/catalog";
import { page, back, form, checked, zerr } from "../http";
import { SettingsView } from "./view";

const settingsSchema = z.object({
  xtream_url: z.string().trim(),
  xtream_username: z.string().trim(),
  xtream_password: z.string(),
  tmdb_api_key: z.string().trim(),
  tmdb_language: z.string().trim().default("fr-FR"),
  sync_cron: z.string().trim().refine(isValidCron, "expression cron invalide (5 champs)"),
  epg_cron: z.string().trim().refine(isValidCron, "expression cron invalide (5 champs)"),
  public_base_url: z.string().trim(),
  /** Checkbox: present ("on") when checked, absent otherwise. */
  serve_adult: z.string().optional(),
});

const ok = (text: string) => <span class="text-success">{text}</span>;
const ko = (text: string) => <span class="text-danger">{text}</span>;

export const settingsRoutes = new Hono();

settingsRoutes.get("/", async (c) => page(c, "Paramètres", <SettingsView s={await getSettings()} />));
settingsRoutes.post(
  "/",
  zValidator("form", settingsSchema, (r, c) => {
    if (!r.success) return back(c, "/admin/settings", { err: zerr(r.error) });
  }),
  async (c) => {
    const { serve_adult, ...values } = c.req.valid("form");
    await setSettings({ ...(values as Partial<Record<SettingKey, string>>), serve_adult: serve_adult ? "1" : "0" });
    return back(c, "/admin/settings", { ok: "Paramètres enregistrés" });
  },
);
settingsRoutes.post("/test-xtream", async (c) => {
  const f = await form(c);
  try {
    const ui = (await testXtream(f.xtream_url, f.xtream_username, f.xtream_password)).user_info;
    if (Number(ui.auth) !== 1) return c.html(ko(`Refusé : ${ui.message ?? ui.status}`));
    const exp = ui.exp_date ? new Date(Number(ui.exp_date) * 1000).toLocaleDateString("fr-FR") : "∞";
    return c.html(ok(`OK — statut ${ui.status}, expire ${exp}, connexions max ${ui.max_connections ?? "?"}`));
  } catch (e) {
    return c.html(ko((e as Error).message));
  }
});
settingsRoutes.post("/test-tmdb", async (c) => {
  const f = await form(c);
  try {
    await new TmdbClient(f.tmdb_api_key, f.tmdb_language || DEFAULTS.tmdb_language).ping();
    return c.html(ok("TMDB OK"));
  } catch (e) {
    return c.html(ko((e as Error).message));
  }
});
settingsRoutes.post("/retry-unmatched", async (c) => {
  const n = await retryUnmatched();
  return back(c, "/admin/settings", { ok: `${n} élément(s) introuvable(s) remis en attente — relancer l'étape 3` });
});
settingsRoutes.post("/reset-matches", async (c) => {
  await resetMatches(undefined, await checked(c, "overrides"));
  return back(c, "/admin/settings", { ok: "Matching réinitialisé — relancer l'étape 3" });
});
