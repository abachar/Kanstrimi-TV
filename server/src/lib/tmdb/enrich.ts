import { db, schema } from "@/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import pLimit from "p-limit";
import { TmdbClient, type TmdbDetails } from "./client";
import { pickBest, similarity, MATCH_THRESHOLD, cleanTitle } from "./match";
import { runGrouping, regroupItems } from "@/lib/grouping/group";
import { getSettings } from "@/lib/settings";
import { startLog, finishLog } from "@/lib/jobs/log";
import { describeError } from "@/lib/errors";

const TTL_MS = 30 * 24 * 3600 * 1000;
/** TMDB allows ~50 requests per second; stay well under with the retry on 429 as a safety net. */
const CONCURRENCY = 20;
/**
 * A provider-supplied TMDB id is a hint, not a fact: it is accepted only when the title of
 * the TMDB document resembles the cleaned name. Looser than the search threshold because the
 * id already narrows the field; the check only has to catch a wrong film, not a wrong spelling.
 */
export const ID_THRESHOLD = 0.55;

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
  const stats = { processed: 0, matched: 0, unmatched: 0, errors: 0, ids_rejected: 0 };
  try {
    const where = [inArray(schema.items.kind, ["vod", "series"]), eq(schema.items.matchStatus, "pending")];
    if (opts.onlyVisible !== false) where.push(eq(schema.items.hiddenByRule, false), eq(schema.items.hiddenManual, false));
    const pending = await db.select({ id: schema.items.id, kind: schema.items.kind, name: schema.items.name, cleanTitle: schema.items.cleanTitle, year: schema.items.year, raw: schema.items.raw })
      .from(schema.items).where(and(...where)).limit(opts.limit ?? 100_000);
    // One details call per distinct provider id: 70 000 items carry ~45 000 ids.
    const byProvidedId = new Map<string, PendingItem[]>();
    const noId: PendingItem[] = [];
    for (const it of pending) {
      const pid = providedTmdbId(it);
      if (pid) { const k = `${it.kind}:${pid}`; byProvidedId.set(k, [...(byProvidedId.get(k) ?? []), it]); } else noId.push(it);
    }
    const limit = pLimit(CONCURRENCY);
    const account = (r: boolean) => { stats.processed++; if (r) stats.matched++; else stats.unmatched++; };
    const fail = (it: PendingItem, e: unknown) => { stats.errors++; console.error(`[enrich] ${it.kind} ${it.id} "${it.name}":`, describeError(e)); };
    await Promise.all([
      ...[...byProvidedId.values()].map((group) => limit(async () => {
        const first = group[0];
        const mediaType = first.kind === "vod" ? "movie" : "tv";
        const pid = providedTmdbId(first)!;
        const d = await getDetails(client, mediaType, pid).catch(() => null);
        for (const it of group) {
          try {
            if (d && idLooksRight(d, it)) { await setMatch(it.id, pid, 1, "matched"); account(true); continue; }
            if (d) stats.ids_rejected++;
            account(await matchByTitle(client, it));
          } catch (e) { fail(it, e); }
        }
      })),
      ...noId.map((it) => limit(async () => {
        try { account(await matchByTitle(client, it)); } catch (e) { fail(it, e); }
      })),
    ]);
    await finishLog(logId, "success", undefined, stats);
    await runGrouping();
    return stats;
  } catch (e) {
    await finishLog(logId, "error", describeError(e), stats);
    throw e;
  }
}

type PendingItem = { id: number; kind: "live" | "vod" | "series"; name: string; cleanTitle: string | null; year: number | null; raw: Record<string, unknown> };

function providedTmdbId(it: PendingItem): number | null {
  const n = Number(it.raw.tmdb ?? it.raw.tmdb_id ?? 0);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Does the TMDB document the provider pointed at look like this item? */
export function idLooksRight(d: TmdbDetails, it: Pick<PendingItem, "name" | "cleanTitle" | "year">): boolean {
  const title = it.cleanTitle || cleanTitle(it.name).title;
  const names = [d.title, d.name, d.original_title, d.original_name].filter(Boolean) as string[];
  const sim = Math.max(0, ...names.map((n) => similarity(n, title)));
  if (sim >= MATCH_THRESHOLD) return true;
  if (sim < ID_THRESHOLD) return false;
  // Borderline: the year settles it when both sides have one.
  const ry = Number((d.release_date ?? d.first_air_date ?? "").slice(0, 4)) || undefined;
  return !it.year || !ry || Math.abs(ry - it.year) <= 1;
}

async function matchByTitle(client: TmdbClient, it: PendingItem): Promise<boolean> {
  const mediaType = it.kind === "vod" ? "movie" : "tv";
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
  await regroupItems([itemId]);
}

/** Back to pending for automatic matches; manual ones and grouping overrides stay unless asked. */
export async function resetMatches(kind?: "vod" | "series", clearOverrides = false) {
  await db.update(schema.items).set({ matchStatus: "pending", tmdbId: null, matchScore: null })
    .where(and(inArray(schema.items.kind, kind ? [kind] : ["vod", "series"]), sql`${schema.items.matchStatus} <> 'manual'`));
  if (clearOverrides) await db.update(schema.items).set({ keyOverride: null }).where(inArray(schema.items.kind, kind ? [kind] : ["vod", "series"]));
}
