import { Hono, type Context } from "hono";
import { z } from "zod";
import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { Layout } from "./layout";
import { LoginView, DashboardView, JobsStatus, LogsView, SettingsView, RulesView, RulePreview, CatalogView, TmdbCell, ItemRow, CategoryItems, type CatalogQuery } from "./views";
import { isLoggedIn, login, logout } from "@/lib/auth/session";
import { isUnlocked } from "@/lib/auth/vault";
import { getSettings, setSettings, type SettingKey } from "@/lib/settings";
import { counts, inHiddenCategory } from "@/lib/api/catalog";
import { cacheStats } from "@/lib/tmdb/images";
import { epgCacheStat } from "@/lib/epg/rebuild";
import { testXtream, applyRules } from "@/lib/sync/sync";
import { validatePattern, sanitizeFlags, type Kind } from "@/lib/filters/rules";
import { isValidCron } from "@/lib/jobs/cron";
import { describeError } from "@/lib/errors";
import { start, pipeline, runningJobs, getLastError, type Job } from "@/lib/jobs/jobs";
import { assignManual, resetMatches, getTmdbClient, getCachedDetails, explainMatch } from "@/lib/tmdb/enrich";
import { TmdbClient } from "@/lib/tmdb/client";
import { groupingCounts, regroupItems } from "@/lib/grouping/group";
import { GroupRow, GroupVariants, MergeForm, GROUPS_PAGE, type GroupsQuery } from "./groups";
import { PairView, DevicesView } from "./devices";
import { ItemView, ExplainView } from "./item";
import { approvePairing, getDevice, listDevices, revokeDevice, forgetDevice, isCode } from "@/lib/rest/devices";

export const admin = new Hono();

// ---------------------------------------------------------------- helpers
const page = (c: Context, title: string, body: unknown, loggedIn = true) =>
  c.html(Layout({ title, path: new URL(c.req.url).pathname + new URL(c.req.url).search, flash: { ok: c.req.query("ok"), err: c.req.query("err") }, loggedIn, children: body as never }) as never);
const back = (c: Context, to: string, msg: { ok?: string; err?: string }) => {
  const u = new URL(to, "http://x"); if (msg.ok) u.searchParams.set("ok", msg.ok); if (msg.err) u.searchParams.set("err", msg.err);
  return c.redirect(u.pathname + u.search, 303);
};
const form = async (c: Context) => Object.fromEntries((await c.req.formData()).entries()) as Record<string, string>;
/** HTMX checkbox: an unchecked box is never sent, so absence of the field means false. */
const checked = async (c: Context, name: string) => (await c.req.formData()).has(name);
const zerr = (e: z.ZodError) => e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");

// ---------------------------------------------------------------- auth
/** Only our own pages, so a crafted link cannot send the admin elsewhere after login. */
const safeNext = (s?: string) => s && /^\/admin\/[A-Za-z0-9/_-]*$/.test(s) ? s : "/admin";
admin.use("*", async (c, next) => {
  const p = new URL(c.req.url).pathname;
  if (p === "/admin/login" || (await isLoggedIn(c))) return next();
  // The pairing page is reached from a QR code: come back to it once logged in.
  return c.redirect(p.startsWith("/admin/pair/") ? `/admin/login?next=${encodeURIComponent(p)}` : "/admin/login");
});

admin.get("/login", (c) => page(c, "Connexion", <LoginView locked={!isUnlocked()} error={c.req.query("err")} next={c.req.query("next")} />, false));
admin.post("/login", async (c) => {
  const next = safeNext(c.req.query("next"));
  if (!(await login(c, (await form(c)).password ?? ""))) return back(c, `/admin/login${next !== "/admin" ? `?next=${encodeURIComponent(next)}` : ""}`, { err: "Mot de passe incorrect" });
  return c.redirect(next, 303);
});

// ---------------------------------------------------------------- devices (block 3)
const pairState = async (code: string) => {
  const d = await getDevice(code);
  if (!d) return "unknown" as const;
  if (d.status === "approved") return "done" as const;
  if (d.status === "revoked" || d.expiresAt.getTime() < Date.now()) return "expired" as const;
  return "pending" as const;
};
admin.get("/pair/:code", async (c) => {
  const code = c.req.param("code").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!isCode(code)) return page(c, "Appairage", <PairView code={code} state="unknown" />);
  return page(c, "Appairage", <PairView code={code} state={await pairState(code)} error={c.req.query("err")} />);
});
admin.post("/pair/:code", async (c) => {
  const code = c.req.param("code").toUpperCase();
  const f = await form(c);
  try { await approvePairing(code, (f.name ?? "").slice(0, 40)); }
  catch (e) { return page(c, "Appairage", <PairView code={code} state={await pairState(code)} error={(e as Error).message} />); }
  return page(c, "Appairage", <PairView code={code} state="done" />);
});
admin.get("/devices", async (c) => page(c, "Appareils", <DevicesView devices={await listDevices()} />));
admin.post("/devices/:code/revoke", async (c) => {
  const ok = await revokeDevice(c.req.param("code").toUpperCase());
  return back(c, "/admin/devices", ok ? { ok: "Appareil dissocié" } : { err: "Appareil introuvable ou déjà dissocié" });
});
admin.post("/devices/:code/forget", async (c) => {
  await forgetDevice(c.req.param("code").toUpperCase());
  return back(c, "/admin/devices", { ok: "Appareil oublié" });
});
admin.post("/logout", (c) => { logout(c); c.header("HX-Redirect", "/admin/login"); return c.redirect("/admin/login", 303); });

// ---------------------------------------------------------------- dashboard & jobs
admin.get("/", async (c) => {
  const [s, cnt, logs, img, epg, groups] = await Promise.all([
    getSettings(), counts(),
    db.select().from(schema.syncLogs).orderBy(desc(schema.syncLogs.startedAt)).limit(6),
    cacheStats(), epgCacheStat(), groupingCounts(),
  ]);
  return page(c, "Tableau de bord", <DashboardView d={{ s, items: cnt.items, cats: cnt.categories, logs, img, epg, groups }} jobs={{ running: runningJobs(), lastError: getLastError() }} />);
});
admin.get("/jobs/status", (c) => c.html(<JobsStatus running={runningJobs()} lastError={getLastError()} />));
admin.post("/jobs/:job", async (c) => {
  const job = c.req.param("job");
  const labels: Record<string, string> = { source: "Lecture de la source lancée", filters: "Filtres appliqués", enrich: "Enrichissement lancé", group: "Groupement lancé", epg: "Reconstruction EPG lancée", pipeline: "Traitement complet lancé" };
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
admin.post("/settings/reset-matches", async (c) => {
  await resetMatches(undefined, await checked(c, "overrides"));
  return back(c, "/admin/settings", { ok: "Matching réinitialisé — relancer l'étape 3" });
});

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
  await db.update(schema.filterRules).set({ enabled: await checked(c, "enabled") }).where(eq(schema.filterRules.id, Number(c.req.param("id"))));
  await applyRules();
  return c.body(null, 204);
});
admin.post("/rules/preview", async (c) => {
  const f = await form(c);
  const pattern = f.pattern ?? "", flags = f.flags ?? "i", kind = f.kind ?? "all", target = f.target ?? "name";
  if (validatePattern(pattern, flags)) return c.html(<RulePreview preview={{ matches: [], total: 0 }} />);
  // Same engine as applyRules, on purpose: Postgres regexes differ from JavaScript's
  // (`\b` is a backspace there), so a database-side preview would lie about `\b`, `\d`
  // or lookarounds. Names only, so even the whole catalogue is a few megabytes.
  const re = new RegExp(pattern, sanitizeFlags(flags).replace("g", ""));
  const t = target === "category" ? schema.categories : schema.items;
  const rows = await db.select({ name: t.name, kind: t.kind }).from(t)
    .where(kind === "all" ? undefined : eq(t.kind, kind as Kind)).orderBy(asc(t.kind), asc(t.position));
  const hits = rows.filter((r) => re.test(r.name));
  return c.html(<RulePreview preview={{ matches: hits.slice(0, 50).map((r) => `[${r.kind}] ${r.name}`), total: hits.length }} />);
});

// ---------------------------------------------------------------- catalog
const PAGE = 100;
const kindTitle = (k: string) => (k === "live" ? "Live" : k === "vod" ? "Films" : "Séries");
const catalogQuery = (q: Record<string, string>): CatalogQuery => ({
  kind: (["live", "vod", "series"].includes(q.kind ?? "") ? q.kind : "vod") as CatalogQuery["kind"],
  q: q.q?.trim() ?? "", cat: q.cat ?? "",
  vis: (["visible", "hidden"].includes(q.vis ?? "") ? q.vis : "") as CatalogQuery["vis"],
  tmdb: (["matched", "unmatched", "pending"].includes(q.tmdb ?? "") ? q.tmdb : "") as CatalogQuery["tmdb"],
  page: Math.max(1, Number(q.page) || 1),
  view: q.view === "flat" ? "flat" : q.view === "groups" ? "groups" : "grouped",
});
const groupsQuery = (q: Record<string, string>): GroupsQuery => ({
  kind: (["live", "vod", "series"].includes(q.kind ?? "") ? q.kind : "vod") as GroupsQuery["kind"],
  q: q.q?.trim() ?? "", only: (["multi", "fallback", "hidden"].includes(q.only ?? "") ? q.only : "") as GroupsQuery["only"],
  page: Math.max(1, Number(q.page) || 1),
});
/** Filters shared by the flat list and by one category's slice of the grouped view. */
const catalogWhere = (qy: CatalogQuery) => {
  const where: SQL[] = [eq(schema.items.kind, qy.kind)];
  if (qy.q) where.push(ilike(schema.items.name, `%${qy.q}%`));
  if (qy.cat) where.push(eq(schema.items.categoryXtreamId, qy.cat));
  if (qy.vis === "hidden") where.push(or(eq(schema.items.hiddenByRule, true), eq(schema.items.hiddenManual, true), inHiddenCategory)!);
  if (qy.vis === "visible") where.push(and(eq(schema.items.hiddenByRule, false), eq(schema.items.hiddenManual, false), sql`not ${inHiddenCategory}`)!);
  if (qy.tmdb === "unmatched") where.push(eq(schema.items.matchStatus, "unmatched"));
  if (qy.tmdb === "pending") where.push(eq(schema.items.matchStatus, "pending"));
  if (qy.tmdb === "matched") where.push(sql`${schema.items.matchStatus} in ('matched','manual')`);
  return where;
};
admin.get("/catalog", async (c) => {
  const qy = catalogQuery(c.req.query());
  const cats = await db.select().from(schema.categories).where(eq(schema.categories.kind, qy.kind)).orderBy(asc(schema.categories.position));
  if (qy.view === "groups") {
    const gq = groupsQuery(c.req.query());
    const where: SQL[] = [eq(schema.contents.kind, gq.kind)];
    if (gq.q) where.push(ilike(schema.contents.title, `%${gq.q}%`));
    if (gq.only === "multi") where.push(sql`${schema.contents.variantCount} > 1`);
    if (gq.only === "fallback") where.push(sql`${schema.contents.key} like 'fallback:%'`);
    if (gq.only === "hidden") where.push(eq(schema.contents.visible, false));
    const [{ n: total }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.contents).where(and(...where));
    const rows = await db.select().from(schema.contents).where(and(...where))
      .orderBy(desc(schema.contents.variantCount), asc(schema.contents.title)).limit(GROUPS_PAGE).offset((gq.page - 1) * GROUPS_PAGE);
    return page(c, kindTitle(qy.kind), <CatalogView qy={qy} cats={cats} rows={[]} total={0} catCounts={new Map()} groups={{ qy: gq, rows, total }} />);
  }
  const where = catalogWhere(qy);
  const [{ n: total }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.items).where(and(...where));
  // Grouped view lists categories only; the rows arrive later, one category at a time.
  const rows = qy.view === "grouped" ? []
    : await db.select().from(schema.items).where(and(...where)).orderBy(asc(schema.items.position)).limit(PAGE).offset((qy.page - 1) * PAGE);
  const counted = qy.view === "grouped"
    ? await db.select({ cat: schema.items.categoryXtreamId, n: sql<number>`count(*)::int` })
      .from(schema.items).where(eq(schema.items.kind, qy.kind)).groupBy(schema.items.categoryXtreamId)
    : [];
  const catCounts = new Map(counted.map((r) => [r.cat ?? "", r.n]));
  return page(c, kindTitle(qy.kind), <CatalogView qy={qy} cats={cats} rows={rows} total={total} catCounts={catCounts} />);
});
/** One page of a category, for the grouped view's lazy loading and its infinite scroll. */
admin.get("/catalog/items", async (c) => {
  const qy = catalogQuery(c.req.query());
  if (!qy.cat) return c.body(null, 204);
  const [cat] = await db.select().from(schema.categories)
    .where(and(eq(schema.categories.kind, qy.kind), eq(schema.categories.xtreamId, qy.cat)));
  const where = catalogWhere(qy);
  // Ask for one row past the page: cheaper than a second count(*) just to know if more remain.
  const rows = await db.select().from(schema.items).where(and(...where))
    .orderBy(asc(schema.items.position)).limit(PAGE + 1).offset((qy.page - 1) * PAGE);
  const hasMore = rows.length > PAGE;
  return c.html(<CategoryItems qy={qy} cat={qy.cat} rows={rows.slice(0, PAGE)}
    catHidden={Boolean(cat && (cat.hiddenByRule || cat.hiddenManual))} hasMore={hasMore} />);
});
/**
 * The switch says "Visible", the column stores `hidden_manual`: invert on the way in.
 * Answers with the whole row so the struck-through name follows the switch; the current
 * filters travel in the query string because the row links back to the catalog.
 */
admin.post("/catalog/:scope{item|category}/:id/visible", async (c) => {
  const id = Number(c.req.param("id"));
  const scope = c.req.param("scope") as "item" | "category";
  const qy = catalogQuery(c.req.query());
  const hiddenManual = !(await checked(c, "visible"));
  if (scope === "item") {
    await db.update(schema.items).set({ hiddenManual }).where(eq(schema.items.id, id));
    const [r] = await db.select().from(schema.items).where(eq(schema.items.id, id));
    if (!r) return c.notFound();
    const [cat] = r.categoryXtreamId
      ? await db.select().from(schema.categories).where(and(eq(schema.categories.kind, r.kind), eq(schema.categories.xtreamId, r.categoryXtreamId)))
      : [];
    return c.html(<ItemRow r={r} qy={qy} catLabel={cat?.name ?? r.categoryXtreamId ?? ""} catHidden={Boolean(cat && (cat.hiddenByRule || cat.hiddenManual))} />);
  }
  await db.update(schema.categories).set({ hiddenManual }).where(eq(schema.categories.id, id));
  // A category carries every row under it: reload rather than patch each one back into shape.
  c.header("HX-Refresh", "true");
  return c.body(null, 204);
});
const item = async (id: number) => (await db.select().from(schema.items).where(eq(schema.items.id, id)))[0];

// ---------------------------------------------------------------- one entry, in full
admin.get("/item/:id", async (c) => {
  const it = await item(Number(c.req.param("id")));
  if (!it) return c.notFound();
  const s = await getSettings();
  const lang = s.tmdb_language || "fr-FR";
  const [cat] = it.categoryXtreamId ? await db.select().from(schema.categories).where(and(eq(schema.categories.kind, it.kind), eq(schema.categories.xtreamId, it.categoryXtreamId))) : [];
  const content = it.contentId ? (await db.select().from(schema.contents).where(eq(schema.contents.id, it.contentId)))[0] ?? null : null;
  const siblings = content ? await db.select().from(schema.items).where(eq(schema.items.contentId, content.id)).orderBy(desc(schema.items.qualityRank), asc(schema.items.id)) : [it];
  const tmdb = it.tmdbId && it.kind !== "live" ? await getCachedDetails(it.kind === "vod" ? "movie" : "tv", it.tmdbId, lang) : null;
  return page(c, it.name, <ItemView it={it} cat={cat ?? null} content={content} siblings={siblings} tmdb={tmdb} tmdbLang={lang} />);
});
admin.get("/item/:id/explain", async (c) => {
  const it = await item(Number(c.req.param("id")));
  if (!it || it.kind === "live") return c.notFound();
  const client = await getTmdbClient();
  if (!client) return c.html(<span class="text-danger small">Clé TMDB absente.</span>);
  try { return c.html(<ExplainView e={await explainMatch(client, it)} kind={it.kind} />); }
  catch (e) { return c.html(<span class="text-danger small">{describeError(e)}</span>); }
});

// ---------------------------------------------------------------- groups (block 1)
const contentById = async (id: number) => (await db.select().from(schema.contents).where(eq(schema.contents.id, id)))[0];
/** The whole row again after an action: the content may have changed, or vanished. */
async function groupRowResponse(c: Context, contentId: number | null) {
  const row = contentId ? await contentById(contentId) : undefined;
  if (!row) return c.html(<></>);
  return c.html(<GroupRow c={row} />);
}
admin.get("/catalog/groups/:id", async (c) => {
  const content = await contentById(Number(c.req.param("id")));
  if (!content) return c.notFound();
  const items = await db.select().from(schema.items).where(eq(schema.items.contentId, content.id)).orderBy(desc(schema.items.qualityRank), asc(schema.items.id));
  const cats = new Map((await db.select().from(schema.categories).where(eq(schema.categories.kind, content.kind))).map((k) => [`${k.kind}:${k.xtreamId}`, k]));
  return c.html(<GroupVariants c={content} items={items} cats={cats} />);
});
admin.post("/catalog/groups/split/:id", async (c) => {
  const it = await item(Number(c.req.param("id")));
  if (!it) return c.notFound();
  await db.update(schema.items).set({ keyOverride: `manual:${it.id}` }).where(eq(schema.items.id, it.id));
  await regroupItems([it.id]);
  return groupRowResponse(c, it.contentId);
});
admin.post("/catalog/groups/reset/:id", async (c) => {
  const it = await item(Number(c.req.param("id")));
  if (!it) return c.notFound();
  await db.update(schema.items).set({ keyOverride: null }).where(eq(schema.items.id, it.id));
  await regroupItems([it.id]);
  const after = await item(it.id);
  return groupRowResponse(c, after?.contentId ?? null);
});
admin.get("/catalog/groups/merge-form/:id", (c) => c.html(<MergeForm itemId={Number(c.req.param("id"))} />));
admin.post("/catalog/groups/merge-search", async (c) => {
  const f = await form(c);
  const it = await item(Number(f.id));
  if (!it) return c.notFound();
  const q = (f.q ?? "").trim();
  const results = q ? await db.select({ id: schema.contents.id, key: schema.contents.key, title: schema.contents.title, year: schema.contents.year, variantCount: schema.contents.variantCount })
    .from(schema.contents).where(and(eq(schema.contents.kind, it.kind), ilike(schema.contents.title, `%${q}%`), sql`${schema.contents.id} <> ${it.contentId ?? 0}`))
    .orderBy(desc(schema.contents.variantCount), asc(schema.contents.title)).limit(10) : [];
  return c.html(<MergeForm itemId={it.id} results={results} />);
});
admin.post("/catalog/groups/merge", async (c) => {
  const f = await form(c);
  const it = await item(Number(f.id));
  const target = f.key ?? "";
  if (!it || !target) return c.notFound();
  await db.update(schema.items).set({ keyOverride: target }).where(eq(schema.items.id, it.id));
  await regroupItems([it.id]);
  return groupRowResponse(c, it.contentId);
});
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
