import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { getSettings, setSettings, DEFAULTS } from "@/config";
import { isValidCron } from "../format";
import { TmdbClient } from "@/providers/tmdb";
import { retryUnmatched, resetMatches } from "@/catalog";
import { page, back, form, checked, zerr } from "../http";
import { logout, revokeSessions } from "../session";
import { InlineResult } from "../ui";
import { SettingsView } from "./view";

const settingsSchema = z.object({
  tmdb_language: z.string().trim().default(""), // empty = DEFAULTS, filled by getSettings
  sync_cron: z.string().trim().refine(isValidCron, "expression cron invalide (5 champs)"),
  epg_cron: z.string().trim().refine(isValidCron, "expression cron invalide (5 champs)"),
  trending_cron: z.string().trim().refine(isValidCron, "expression cron invalide (5 champs)"),
  markers_cron: z.string().trim().refine(isValidCron, "expression cron invalide (5 champs)"),
  public_base_url: z.string().trim(),
  /** Checkbox: present ("on") when checked, absent otherwise. */
  serve_adult: z.string().optional(),
});

const ok = (text: string) => <InlineResult ok text={text} />;
const ko = (text: string) => <InlineResult ok={false} text={text} />;

export const settingsRoutes = new Hono();

settingsRoutes.get("/", async (c) => page(c, "Paramètres", <SettingsView s={await getSettings()} />));
settingsRoutes.post(
  "/",
  zValidator("form", settingsSchema, (r, c) => {
    if (!r.success) return back(c, "/admin/settings", { err: zerr(r.error) });
  }),
  async (c) => {
    const { serve_adult, ...values } = c.req.valid("form");
    await setSettings({ ...values, serve_adult: serve_adult ? "1" : "0" });
    return back(c, "/admin/settings", { ok: "Paramètres enregistrés" });
  },
);
settingsRoutes.post("/test-tmdb", async (c) => {
  const f = await form(c);
  try {
    await new TmdbClient((await getSettings()).tmdb_api_key, f.tmdb_language || DEFAULTS.tmdb_language).ping();
    return c.html(ok("TMDB OK"));
  } catch (e) {
    return c.html(ko((e as Error).message));
  }
});
settingsRoutes.post("/revoke-sessions", async (c) => {
  await revokeSessions();
  logout(c);
  return back(c, "/admin/login", {});
});
settingsRoutes.post("/retry-unmatched", async (c) => {
  const n = await retryUnmatched();
  return back(c, "/admin/settings", {
    ok: `${n} élément(s) introuvable(s) remis en attente — relancer le traitement à partir de « enrich »`,
  });
});
settingsRoutes.post("/reset-matches", async (c) => {
  await resetMatches(undefined, await checked(c, "overrides"));
  return back(c, "/admin/settings", { ok: "Matching réinitialisé — relancer le traitement à partir de « enrich »" });
});
