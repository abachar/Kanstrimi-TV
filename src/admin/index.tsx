import { Hono, type Context } from "hono";
import { z } from "zod";
import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { Layout } from "./layout";
import { LoginView, DashboardView, JobsStatus, LogsView, SettingsView, RulesView, RulePreview, CatalogView, TmdbCell, VisibilityToggle, type CatalogQuery } from "./views";
import { isLoggedIn, login, logout } from "@/lib/auth/session";
import { isUnlocked } from "@/lib/auth/vault";
import { getSettings, setSettings, type SettingKey } from "@/lib/settings";
import { counts } from "@/lib/api/catalog";
import { cacheStats } from "@/lib/tmdb/images";
import { epgCacheStat } from "@/lib/epg/rebuild";
import { testXtream, applyRules } from "@/lib/sync/sync";
import { validatePattern } from "@/lib/filters/rules";
import { isValidCron } from "@/lib/jobs/cron";
import { start, pipeline, runningJobs, getLastError, type Job } from "@/lib/jobs/jobs";
import { assignManual, resetMatches, getTmdbClient } from "@/lib/tmdb/enrich";
import { TmdbClient } from "@/lib/tmdb/client";

export const admin = new Hono();

// ---------------------------------------------------------------- helpers
const page = (c: Context, title: string, body: unknown, loggedIn = true) =>
  c.html(Layout({ title, path: new URL(c.req.url).pathname, flash: { ok: c.req.query("ok"), err: c.req.query("err") }, loggedIn, children: body as never }) as never);
const back = (c: Context, to: string, msg: { ok?: string; err?: string }) => {
  const u = new URL(to, "http://x"); if (msg.ok) u.searchParams.set("ok", msg.ok); if (msg.err) u.searchParams.set("err", msg.err);
  return c.redirect(u.pathname + u.search, 303);
};
const form = async (c: Context) => Object.fromEntries((await c.req.formData()).entries()) as Record<string, string>;
/** HTMX checkbox: body is empty when unchecked. */
const checked = async (c: Context) => (await c.req.raw.text()).length > 0;
const zerr = (e: z.ZodError) => e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");

// ---------------------------------------------------------------- auth
admin.use("*", async (c, next) => {
  const p = new URL(c.req.url).pathname;
  if (p === "/admin/login" || (await isLoggedIn(c))) return next();
  return c.redirect("/admin/login");
});

admin.get("/login", (c) => page(c, "Connexion", <LoginView locked={!isUnlocked()} error={c.req.query("err")} />, false));
admin.post("/login", async (c) => {
  if (!(await login(c, (await form(c)).password ?? ""))) return back(c, "/admin/login", { err: "Mot de passe incorrect" });
  return c.redirect("/admin", 303);
});
admin.post("/logout", (c) => { logout(c); c.header("HX-Redirect", "/admin/login"); return c.redirect("/admin/login", 303); });

// ---------------------------------------------------------------- dashboard & jobs
admin.get("/", async (c) => {
  const [s, cnt, logs, img, epg] = await Promise.all([
    getSettings(), counts(),
    db.select().from(schema.syncLogs).orderBy(desc(schema.syncLogs.startedAt)).limit(6),
    cacheStats(), epgCacheStat(),
  ]);
  return page(c, "Tableau de bord", <DashboardView d={{ s, items: cnt.items, cats: cnt.categories, logs, img, epg }} jobs={{ running: runningJobs(), lastError: getLastError() }} />);
});
admin.get("/jobs/status", (c) => c.html(<JobsStatus running={runningJobs()} lastError={getLastError()} />));
admin.post("/jobs/:job", async (c) => {
  const job = c.req.param("job");
  const labels: Record<string, string> = { source: "Lecture de la source lancée", filters: "Filtres appliqués", enrich: "Enrichissement lancé", epg: "Reconstruction EPG lancée", pipeline: "Traitement complet lancé" };
  if (job === "pipeline") { void pipeline(); return back(c, "/admin", { ok: labels.pipeline }); }
  if (!(job in labels)) return c.notFound();
  if (job === "enrich" && !(await getSettings()).tmdb_api_key) return back(c, "/admin", { err: "Clé TMDB absente" });
  return back(c, "/admin", start(job as Job) ? { ok: labels[job] } : { err: "Déjà en cours" });
});

admin.get("/logs", async (c) =>
  page(c, "Journaux", <LogsView logs={await db.select().from(schema.syncLogs).orderBy(desc(schema.syncLogs.startedAt)).limit(100)} />));

// ---------------------------------------------------------------- settings
const settingsSchema = z.object({
  xtream_url: z.string().trim(), xtream_username: z.string().trim(), xtream_password: z.string(),
  proxy_username: z.string().trim().min(1),
  tmdb_api_key: z.string().trim(), tmdb_language: z.string().trim().default("fr-FR"),
  sync_cron: z.string().trim().refine(isValidCron, "expression cron invalide (5 champs)"),
  epg_cron: z.string().trim().refine(isValidCron, "expression cron invalide (5 champs)"),
  public_base_url: z.string().trim(),
});
admin.get("/settings", async (c) => page(c, "Paramètres", <SettingsView s={await getSettings()} />));
admin.post("/settings", async (c) => {
  const parsed = settingsSchema.safeParse(await form(c));
  if (!parsed.success) return back(c, "/admin/settings", { err: zerr(parsed.error) });
  await setSettings(parsed.data as Partial<Record<SettingKey, string>>);
  return back(c, "/admin/settings", { ok: "Paramètres enregistrés" });
});
admin.post("/settings/test-xtream", async (c) => {
  const f = await form(c);
  try {
    const ui = (await testXtream(f.xtream_url, f.xtream_username, f.xtream_password)).user_info;
    if (Number(ui.auth) !== 1) return c.html(<span class="text-danger">Refusé : {ui.message ?? ui.status}</span>);
    const exp = ui.exp_date ? new Date(Number(ui.exp_date) * 1000).toLocaleDateString("fr-FR") : "∞";
    return c.html(<span class="text-success">OK — statut {ui.status}, expire {exp}, connexions max {ui.max_connections ?? "?"}</span>);
  } catch (e) { return c.html(<span class="text-danger">{(e as Error).message}</span>); }
});
admin.post("/settings/test-tmdb", async (c) => {
  const f = await form(c);
  try { await new TmdbClient(f.tmdb_api_key, f.tmdb_language || "fr-FR").ping(); return c.html(<span class="text-success">TMDB OK</span>); }
  catch (e) { return c.html(<span class="text-danger">{(e as Error).message}</span>); }
});
admin.post("/settings/reset-matches", async (c) => { await resetMatches(); return back(c, "/admin/settings", { ok: "Matching réinitialisé — relancer l'étape 3" }); });

// ---------------------------------------------------------------- rules
const ruleSchema = z.object({
  id: z.coerce.number().optional(), name: z.string().trim().min(1),
  kind: z.enum(["all", "live", "vod", "series"]), target: z.enum(["name", "category"]),
  pattern: z.string().min(1), flags: z.string().default("i"), action: z.enum(["hide", "keep"]),
  enabled: z.coerce.boolean().default(false), position: z.coerce.number().int().default(0),
});
admin.get("/rules", async (c) =>
  page(c, "Règles", <RulesView rules={await db.select().from(schema.filterRules).orderBy(asc(schema.filterRules.position), asc(schema.filterRules.id))} />));
admin.post("/rules", async (c) => {
  const parsed = ruleSchema.safeParse(await form(c));
  if (!parsed.success) return back(c, "/admin/rules", { err: zerr(parsed.error) });
  const d = parsed.data;
  const err = validatePattern(d.pattern, d.flags);
  if (err) return back(c, "/admin/rules", { err: `Regex invalide : ${err}` });
  const row = { name: d.name, kind: d.kind === "all" ? null : d.kind, target: d.target, pattern: d.pattern, flags: d.flags, action: d.action, enabled: d.enabled, position: d.position };
  if (d.id) await db.update(schema.filterRules).set(row).where(eq(schema.filterRules.id, d.id));
  else await db.insert(schema.filterRules).values(row);
  const r = await applyRules();
  return back(c, "/admin/rules", { ok: `Règle enregistrée — ${r.items} éléments et ${r.categories} catégories mis à jour` });
});
admin.post("/rules/:id/delete", async (c) => {
  await db.delete(schema.filterRules).where(eq(schema.filterRules.id, Number(c.req.param("id"))));
  await applyRules();
  c.header("HX-Redirect", "/admin/rules?ok=R%C3%A8gle+supprim%C3%A9e");
  return back(c, "/admin/rules", { ok: "Règle supprimée" });
});
admin.post("/rules/:id/toggle", async (c) => {
  await db.update(schema.filterRules).set({ enabled: await checked(c) }).where(eq(schema.filterRules.id, Number(c.req.param("id"))));
  await applyRules();
  return c.body(null, 204);
});
admin.post("/rules/preview", async (c) => {
  const f = await form(c);
  const pattern = f.pattern ?? "", flags = f.flags ?? "i", kind = f.kind ?? "all", target = f.target ?? "name";
  if (validatePattern(pattern, flags)) return c.html(<RulePreview preview={{ matches: [], total: 0 }} />);
  const op = flags.includes("i") ? sql`~*` : sql`~`;
  const t = target === "category" ? schema.categories : schema.items;
  const where = kind === "all" ? sql`${t.name} ${op} ${pattern}` : sql`${t.name} ${op} ${pattern} and ${t.kind} = ${kind}`;
  const rows = await db.select({ name: t.name, kind: t.kind }).from(t).where(where).limit(50);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(t).where(where);
  return c.html(<RulePreview preview={{ matches: rows.map((r) => `[${r.kind}] ${r.name}`), total: n }} />);
});

// ---------------------------------------------------------------- catalog
const PAGE = 100;
admin.get("/catalog", async (c) => {
  const q = c.req.query();
  const qy: CatalogQuery = {
    kind: (["live", "vod", "series"].includes(q.kind ?? "") ? q.kind : "vod") as CatalogQuery["kind"],
    q: q.q?.trim() ?? "", cat: q.cat ?? "", status: q.status ?? "", page: Math.max(1, Number(q.page) || 1),
  };
  const cats = await db.select().from(schema.categories).where(eq(schema.categories.kind, qy.kind)).orderBy(asc(schema.categories.position));
  const where: SQL[] = [eq(schema.items.kind, qy.kind)];
  if (qy.q) where.push(ilike(schema.items.name, `%${qy.q}%`));
  if (qy.cat) where.push(eq(schema.items.categoryXtreamId, qy.cat));
  if (qy.status === "hidden") where.push(or(eq(schema.items.hiddenByRule, true), eq(schema.items.hiddenManual, true))!);
  if (qy.status === "visible") where.push(and(eq(schema.items.hiddenByRule, false), eq(schema.items.hiddenManual, false))!);
  if (qy.status === "unmatched") where.push(eq(schema.items.matchStatus, "unmatched"));
  if (qy.status === "pending") where.push(eq(schema.items.matchStatus, "pending"));
  if (qy.status === "matched") where.push(sql`${schema.items.matchStatus} in ('matched','manual')`);
  const [{ n: total }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.items).where(and(...where));
  const rows = await db.select().from(schema.items).where(and(...where)).orderBy(asc(schema.items.position)).limit(PAGE).offset((qy.page - 1) * PAGE);
  return page(c, "Catalogue", <CatalogView qy={qy} cats={cats} rows={rows} total={total} />);
});
/** The switch says "Visible", the column stores `hidden_manual`: invert on the way in. */
admin.post("/catalog/:scope{item|category}/:id/visible", async (c) => {
  const id = Number(c.req.param("id"));
  const scope = c.req.param("scope") as "item" | "category";
  const hiddenManual = !(await checked(c));
  if (scope === "item") {
    await db.update(schema.items).set({ hiddenManual }).where(eq(schema.items.id, id));
    const [r] = await db.select().from(schema.items).where(eq(schema.items.id, id));
    if (!r) return c.notFound();
    return c.html(<VisibilityToggle scope="item" id={r.id} hiddenByRule={r.hiddenByRule} hiddenManual={r.hiddenManual} />);
  }
  await db.update(schema.categories).set({ hiddenManual }).where(eq(schema.categories.id, id));
  const [r] = await db.select().from(schema.categories).where(eq(schema.categories.id, id));
  if (!r) return c.notFound();
  return c.html(<VisibilityToggle scope="category" id={r.id} hiddenByRule={r.hiddenByRule} hiddenManual={r.hiddenManual} />);
});
const item = async (id: number) => (await db.select().from(schema.items).where(eq(schema.items.id, id)))[0];
admin.post("/catalog/tmdb-search", async (c) => {
  const f = await form(c);
  const it = await item(Number(f.id));
  if (!it) return c.notFound();
  const client = await getTmdbClient();
  if (!client) return c.html(<TmdbCell it={it} results={[]} />);
  const res = it.kind === "vod" ? await client.searchMovie(f.q ?? "") : await client.searchTv(f.q ?? "");
  const results = (res.results ?? []).slice(0, 10).map((r) => ({ id: r.id, label: `${r.title ?? r.name} (${(r.release_date ?? r.first_air_date ?? "").slice(0, 4) || "?"})` }));
  return c.html(<TmdbCell it={it} results={results} />);
});
admin.post("/catalog/tmdb-assign", async (c) => {
  const f = await form(c);
  const id = Number(f.id);
  try { await assignManual(id, Number(f.tmdb_id) || null); } catch (e) { return c.html(<span class="text-danger">{(e as Error).message}</span>); }
  return c.html(<TmdbCell it={await item(id)} />);
});
