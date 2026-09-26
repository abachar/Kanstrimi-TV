import { Hono } from "hono";
import { z } from "zod";
import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { getSettings } from "@/lib/settings";
import { publicBaseUrl } from "@/lib/api/context";
import { XtreamClient } from "@/lib/xtream/client";
import { isUnlocked } from "@/lib/auth/vault";
import { parseKey } from "@/lib/grouping/tags";
import { createPairing, pollPairing, authenticateToken, revokeDevice, isCode, TooManyRequests, getDevice } from "@/lib/rest/devices";
import { setProgress } from "@/lib/rest/progress";
import { setFavorite } from "@/lib/rest/favorites";
import { verifyStreamSignature, parseSourceId, type RestContext } from "@/lib/rest/serialize";
import { BadRequest, catalogRows, channelGroups, channelSheet, contentByKey, home, keyExists, listContents, movieSheet, playback, search, seriesSheet, serverInfo, type ListQuery } from "@/lib/rest/catalog";
import { UpstreamUnavailable } from "@/lib/rest/episodes";
import type { ApiError } from "@/lib/rest/types";
import type { Device } from "@/db/schema";

/**
 * `/api/v1`, the contract of `docs/api-v1-tvos.md`. Bearer device token everywhere but
 * `/devices` (pairing) and `/stream` (signed URLs for the player). JSON snake_case,
 * errors as `{ error: { code, message } }`. The video never flows through here: `/stream`
 * answers 302 to the provider.
 */
type Env = { Variables: { device: Device; ctx: RestContext } };
export const api = new Hono<Env>();

const STATUS: Record<ApiError["error"]["code"], 400 | 401 | 404 | 429 | 502 | 503> = { bad_request: 400, unauthorized: 401, not_found: 404, too_many_requests: 429, upstream: 502, locked: 503 };
const fail = (code: ApiError["error"]["code"], message: string) =>
  new Response(JSON.stringify({ error: { code, message } } satisfies ApiError), { status: STATUS[code], headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
const noContent = () => new Response(null, { status: 204 });
const clientIp = (req: Request) => (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";

api.onError((err, c) => {
  if (err instanceof BadRequest) return fail("bad_request", err.message);
  if (err instanceof UpstreamUnavailable) return fail("upstream", err.message);
  if (err instanceof TooManyRequests) return fail("too_many_requests", err.message);
  console.error("[api]", err);
  return c.json({ error: { code: "internal", message: "Erreur interne" } }, 500);
});
api.notFound(() => fail("not_found", "Route inconnue"));

// ---------------------------------------------------------------- pairing (no token)

api.post("/devices", async (c) => {
  const s = await getSettings();
  const { code, expiresAt } = await createPairing(clientIp(c.req.raw));
  return json({ code, expires_at: expiresAt.toISOString(), url: `${publicBaseUrl(c.req.raw, s)}/admin/pair/${code}` }, 201);
});
api.get("/devices/:code", async (c) => {
  const code = c.req.param("code").toUpperCase();
  if (!isCode(code)) return fail("bad_request", "Code invalide");
  const r = await pollPairing(code);
  return json(r.status === "approved" ? { status: "approved", token: r.token, device_name: r.deviceName } : r);
});

// ---------------------------------------------------------------- stream redirect (signed URL, no token)

api.get("/stream/:source", async (c) => {
  const src = parseSourceId(c.req.param("source"));
  const code = (c.req.query("d") ?? "").toUpperCase(), exp = Number(c.req.query("e")), sig = c.req.query("s") ?? "";
  if (!src || !isCode(code) || !verifyStreamSignature(c.req.param("source"), code, exp, sig)) return fail("unauthorized", "Lien de lecture invalide ou expiré");
  const device = await getDevice(code);
  if (!device || device.status !== "approved") return fail("unauthorized", "Appareil dissocié");
  if (!isUnlocked()) return fail("locked", "Serveur verrouillé : rouvrir l'application");
  const s = await getSettings();
  if (!s.xtream_url) return fail("upstream", "Fournisseur non configuré");
  const up = new XtreamClient(s.xtream_url, s.xtream_username, s.xtream_password);
  if (src.kind === "item") {
    const [it] = await db.select().from(schema.items).where(and(eq(schema.items.id, src.id), eq(schema.items.hiddenByRule, false), eq(schema.items.hiddenManual, false)));
    if (!it || it.kind === "series") return fail("not_found", "Source introuvable");
    const ext = String(it.raw.container_extension ?? (it.kind === "live" ? "ts" : "mp4"));
    return c.redirect(up.streamUrl(it.kind === "live" ? "live" : "movie", it.xtreamId, ext), 302);
  }
  const [row] = await db.select({ s: schema.episodeSources, it: schema.items }).from(schema.episodeSources)
    .innerJoin(schema.items, eq(schema.items.id, schema.episodeSources.itemId)).where(eq(schema.episodeSources.id, src.id));
  if (!row || row.it.hiddenByRule || row.it.hiddenManual) return fail("not_found", "Source introuvable");
  return c.redirect(up.streamUrl("series", row.s.xtreamId, row.s.container ?? "mp4"), 302);
});

// ---------------------------------------------------------------- everything else: Bearer

api.use("*", async (c, next) => {
  const auth = c.req.header("authorization") ?? "";
  const token = /^Bearer\s+(\S+)$/i.exec(auth)?.[1] ?? "";
  const device = token ? await authenticateToken(token, clientIp(c.req.raw)) : null;
  if (!device) return fail("unauthorized", "Appareil inconnu ou dissocié");
  const s = await getSettings();
  let providerName = "Fournisseur";
  try { providerName = new URL(s.xtream_url.startsWith("http") ? s.xtream_url : `http://${s.xtream_url}`).hostname; } catch { /* keep default */ }
  c.set("device", device);
  c.set("ctx", { baseUrl: publicBaseUrl(c.req.raw, s), device, tmdbLang: s.tmdb_language || "fr-FR", providerName });
  await next();
});

api.delete("/devices/:code", async (c) => {
  const code = c.req.param("code").toUpperCase();
  // Only its own: a TV cannot unpair another one.
  if (code !== c.get("device").code) return fail("not_found", "Appareil inconnu");
  await revokeDevice(code);
  return noContent();
});

api.get("/info", async () => json(await serverInfo()));
api.get("/home", async (c) => json(await home(c.get("ctx"))));

// ---------------------------------------------------------------- movies, series

const listQuery = z.object({
  genre: z.string().optional(), sort: z.string().optional(), language: z.string().optional(), min_quality: z.string().optional(),
  dynamic_range: z.string().optional(), vf_available: z.string().optional(), cursor: z.string().optional(), limit: z.string().optional(),
});
for (const [path, kind] of [["/movies", "vod"], ["/series", "series"]] as const) {
  api.get(path, async (c) => {
    const q = listQuery.parse(c.req.query()) as ListQuery;
    const isList = Boolean(q.genre || q.cursor || q.sort || q.language || q.min_quality || q.dynamic_range || q.vf_available || q.limit);
    return json(isList ? await listContents(c.get("ctx"), kind, q) : await catalogRows(c.get("ctx"), kind));
  });
  api.get(`${path}/:id`, async (c) => {
    const key = c.req.param("id");
    const parsed = parseKey(key);
    if (!parsed || parsed.kind !== kind || parsed.episode !== undefined) return fail("not_found", "Contenu introuvable");
    const content = await contentByKey(key);
    if (!content) return fail("not_found", "Contenu introuvable");
    return json(kind === "vod" ? await movieSheet(c.get("ctx"), content) : await seriesSheet(c.get("ctx"), content));
  });
}

// ---------------------------------------------------------------- live

api.get("/channels", async (c) => json(await channelGroups(c.get("ctx"))));
api.get("/channels/:id", async (c) => {
  const key = c.req.param("id");
  if (parseKey(key)?.kind !== "live") return fail("not_found", "Chaîne introuvable");
  const content = await contentByKey(key);
  if (!content) return fail("not_found", "Chaîne introuvable");
  return json(await channelSheet(c.get("ctx"), content));
});

// ---------------------------------------------------------------- playback

api.get("/playback/:id", async (c) => {
  const key = c.req.param("id");
  if (!parseKey(key)) return fail("not_found", "Contenu introuvable");
  const p = await playback(c.get("ctx"), key);
  return p ? json(p) : fail("not_found", "Contenu introuvable");
});
const progressBody = z.object({ position: z.number().min(0).finite(), duration: z.number().min(0).finite() });
api.put("/playback/:id/progress", async (c) => {
  const key = c.req.param("id");
  const parsed = parseKey(key);
  if (!parsed || parsed.kind === "live") return fail("not_found", "Contenu introuvable");
  const body = progressBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return fail("bad_request", "position et duration (secondes, ≥ 0) attendus");
  if (!(await keyExists(key))) return fail("not_found", "Contenu introuvable");
  await setProgress(key, body.data.position, body.data.duration);
  return noContent();
});

// ---------------------------------------------------------------- search, favourites

api.get("/search", async (c) => {
  const scope = c.req.query("scope") ?? "all";
  if (!["all", "movies", "series", "live"].includes(scope)) return fail("bad_request", "scope doit valoir all, movies, series ou live");
  return json(await search(c.get("ctx"), c.req.query("q") ?? "", scope as "all" | "movies" | "series" | "live"));
});
for (const method of ["put", "delete"] as const) {
  api[method]("/favorites/:id", async (c) => {
    const key = c.req.param("id");
    const parsed = parseKey(key);
    if (!parsed || parsed.episode !== undefined || !(await keyExists(key))) return fail("not_found", "Contenu introuvable");
    await setFavorite(key, method === "put");
    return noContent();
  });
}
