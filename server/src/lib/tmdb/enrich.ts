import { db, schema } from "@/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import pLimit from "p-limit";
import { TmdbClient, type TmdbDetails } from "./client";
import { pickBest, MATCH_THRESHOLD, cleanTitle } from "./match";
import { getSettings } from "@/lib/settings";
import { startLog, finishLog } from "@/lib/jobs/log";
import { describeError } from "@/lib/errors";

const TTL_MS = 30 * 24 * 3600 * 1000;

export async function getTmdbClient() {
  const s = await getSettings();
  if (!s.tmdb_api_key) return null;
  return new TmdbClient(s.tmdb_api_key, s.tmdb_language || "fr-FR");
}

/** Fetch (and cache) TMDB details for a movie/tv id. */
export async function getDetails(client: TmdbClient, mediaType: "movie" | "tv", tmdbId: number, force = false): Promise<TmdbDetails | null> {
  const [cached] = await db.select().from(schema.tmdbCache).where(and(
    eq(schema.tmdbCache.mediaType, mediaType), eq(schema.tmdbCache.tmdbId, tmdbId), eq(schema.tmdbCache.lang, client.language)));
  if (cached && !force && Date.now() - cached.fetchedAt.getTime() < TTL_MS) return cached.data as TmdbDetails;
  try {
    const data = mediaType === "movie" ? await client.movie(tmdbId) : await client.tv(tmdbId);
    await db.insert(schema.tmdbCache).values({ mediaType, tmdbId, lang: client.language, data })
      .onConflictDoUpdate({ target: [schema.tmdbCache.mediaType, schema.tmdbCache.tmdbId, schema.tmdbCache.lang], set: { data, fetchedAt: new Date() } });
    return data;
  } catch (e) {
    if (cached) return cached.data as TmdbDetails;
    throw e;
  }
}

/** Read-only cached lookup (no network). */
export async function getCachedDetails(mediaType: "movie" | "tv", tmdbId: number, lang: string) {
  const [cached] = await db.select().from(schema.tmdbCache).where(and(
    eq(schema.tmdbCache.mediaType, mediaType), eq(schema.tmdbCache.tmdbId, tmdbId), eq(schema.tmdbCache.lang, lang)));
  return (cached?.data as TmdbDetails | undefined) ?? null;
}

/** Match all pending vod/series items against TMDB and cache their details. */
export async function runEnrich(opts: { limit?: number; onlyVisible?: boolean } = {}) {
  const client = await getTmdbClient();
  if (!client) throw new Error("Clé API TMDB non configurée");
  const logId = await startLog("enrich");
  const stats = { processed: 0, matched: 0, unmatched: 0, errors: 0 };
  try {
    const where = [inArray(schema.items.kind, ["vod", "series"]), eq(schema.items.matchStatus, "pending")];
    if (opts.onlyVisible !== false) where.push(eq(schema.items.hiddenByRule, false), eq(schema.items.hiddenManual, false));
    const pending = await db.select({ id: schema.items.id, kind: schema.items.kind, name: schema.items.name, cleanTitle: schema.items.cleanTitle, year: schema.items.year, raw: schema.items.raw })
      .from(schema.items).where(and(...where)).limit(opts.limit ?? 100_000);
    const limit = pLimit(4);
    await Promise.all(pending.map((it) => limit(async () => {
      try {
        const r = await matchItem(client, it);
        stats.processed++;
        if (r) stats.matched++; else stats.unmatched++;
      } catch (e) {
        stats.errors++;
        console.error(`[enrich] ${it.kind} ${it.id} "${it.name}":`, describeError(e));
      }
    })));
    await finishLog(logId, "success", undefined, stats);
    return stats;
  } catch (e) {
    await finishLog(logId, "error", describeError(e), stats);
    throw e;
  }
}

type PendingItem = { id: number; kind: "live" | "vod" | "series"; name: string; cleanTitle: string | null; year: number | null; raw: Record<string, unknown> };

async function matchItem(client: TmdbClient, it: PendingItem): Promise<boolean> {
  const mediaType = it.kind === "vod" ? "movie" : "tv";
  // Providers sometimes ship a tmdb id already — trust it.
  const providedId = Number(it.raw.tmdb ?? it.raw.tmdb_id ?? 0);
  if (providedId > 0) {
    const d = await getDetails(client, mediaType, providedId).catch(() => null);
    if (d) { await setMatch(it.id, providedId, 1, "matched"); return true; }
  }
  const ct = it.cleanTitle ? { title: it.cleanTitle, year: it.year ?? undefined } : cleanTitle(it.name);
  const search = async (year?: number) => mediaType === "movie" ? client.searchMovie(ct.title, year) : client.searchTv(ct.title, year);
  let res = await search(ct.year);
  let best = pickBest(res.results ?? [], ct.title, ct.year);
  if ((!best || best.score < MATCH_THRESHOLD) && ct.year) {
    res = await search(undefined);
    const b2 = pickBest(res.results ?? [], ct.title, ct.year);
    if (b2 && (!best || b2.score > best.score)) best = b2;
  }
  if (best && best.score >= MATCH_THRESHOLD) {
    await getDetails(client, mediaType, best.result.id);
    await setMatch(it.id, best.result.id, best.score, "matched");
    return true;
  }
  await setMatch(it.id, null, best?.score ?? 0, "unmatched");
  return false;
}

export async function setMatch(itemId: number, tmdbId: number | null, score: number, status: "matched" | "unmatched" | "manual" | "pending") {
  await db.update(schema.items).set({ tmdbId, matchScore: score, matchStatus: status, matchedAt: new Date() }).where(eq(schema.items.id, itemId));
}

/** Manually assign a TMDB id to an item (admin). */
export async function assignManual(itemId: number, tmdbId: number | null) {
  const [it] = await db.select().from(schema.items).where(eq(schema.items.id, itemId));
  if (!it) throw new Error("Item introuvable");
  if (tmdbId) {
    const client = await getTmdbClient();
    if (!client) throw new Error("Clé API TMDB non configurée");
    await getDetails(client, it.kind === "vod" ? "movie" : "tv", tmdbId, true);
  }
  await setMatch(itemId, tmdbId, 1, tmdbId ? "manual" : "unmatched");
}

export async function resetMatches(kind?: "vod" | "series") {
  await db.update(schema.items).set({ matchStatus: "pending", tmdbId: null, matchScore: null })
    .where(and(inArray(schema.items.kind, kind ? [kind] : ["vod", "series"]), sql`${schema.items.matchStatus} <> 'manual'`));
}
