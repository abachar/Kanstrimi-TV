import { db, schema, getSettings } from "@/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import pLimit from "p-limit";
import { TmdbClient, type TmdbDetails } from "./client";
import { scoreAll, bestSimilarity, namesOf, hasAllNames, normalize, MATCH_THRESHOLD, type ScoredDetail } from "./match";
import { cleanTitle } from "../../grouping/naming";
import { startLog, finishLog } from "../../journal";
import { describeError } from "@/shared";

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

/** Match all pending vod/series items against TMDB and cache their details. The caller regroups afterwards. */
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
        let d = await getDetails(client, mediaType, pid).catch(() => null);
        // Cached before alternative and translated titles were requested: one refresh before judging.
        if (d && !hasAllNames(d) && !group.every((it) => idLooksRight(d!, it))) d = await getDetails(client, mediaType, pid, true).catch(() => d);
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
    return stats;
  } catch (e) {
    await finishLog(logId, "error", describeError(e), stats);
    throw e;
  }
}

export type PendingItem = { id: number; kind: "live" | "vod" | "series"; name: string; cleanTitle: string | null; year: number | null; raw: Record<string, unknown> };

function providedTmdbId(it: PendingItem): number | null {
  const n = Number(it.raw.tmdb ?? it.raw.tmdb_id ?? 0);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export type Evidence = {
  similarity: number; yearOk: boolean | null; castOverlap: number; directorMatch: boolean; imageMatch: boolean; trailerMatch: boolean;
  accepted: boolean; reasons: string[];
};

const splitNames = (v: unknown) => String(v ?? "").split(/[,;/]+/).map((x) => normalize(x)).filter((x) => x.length > 2);
/** "…/eDB1CCNcxnFANadgiWyFlzaqvK6..jpg" or "/eDB1CCNcxnFANadgiWyFlzaqvK6.jpg" → the TMDB file hash. */
const imageHash = (u: unknown) => { const m = /([A-Za-z0-9_-]{20,})\.*\.(?:jpg|jpeg|png|webp)$/i.exec(String(u ?? "")); return m ? m[1] : null; };

/**
 * Is the TMDB document really this entry? Titles first; when they disagree (the provider
 * uses a platform title TMDB never recorded), the other things it sends decide: the cast,
 * the director, the year, the TMDB image hashes it copied, the trailer key.
 */
export function idEvidence(d: TmdbDetails, it: Pick<PendingItem, "name" | "cleanTitle" | "year" | "raw">): Evidence {
  const title = it.cleanTitle || cleanTitle(it.name).title;
  const similarity = bestSimilarity(d, title);
  const raw = it.raw ?? {};
  const ry = Number((d.release_date ?? d.first_air_date ?? "").slice(0, 4)) || null;
  const py = it.year ?? (Number(String(raw.year ?? raw.releaseDate ?? raw.release_date ?? "").slice(0, 4)) || null);
  const yearOk = ry && py ? Math.abs(ry - py) <= 1 : null;
  const tmdbCast = new Set((d.credits?.cast ?? []).slice(0, 15).map((c) => normalize(c.name)));
  const castOverlap = splitNames(raw.cast).filter((n) => tmdbCast.has(n)).length;
  const tmdbDirectors = new Set([...(d.credits?.crew ?? []).filter((c) => c.job === "Director").map((c) => normalize(c.name)), ...((d as { created_by?: { name: string }[] }).created_by ?? []).map((c) => normalize(c.name))]);
  const directorMatch = splitNames(raw.director).some((n) => tmdbDirectors.has(n));
  const tmdbImages = new Set([d.backdrop_path, d.poster_path, ...(d.images?.backdrops ?? []).map((i) => i.file_path), ...(d.images?.posters ?? []).map((i) => i.file_path)].map(imageHash).filter(Boolean));
  const providerImages = [...(Array.isArray(raw.backdrop_path) ? raw.backdrop_path : [raw.backdrop_path]), raw.cover, raw.stream_icon, raw.movie_image].map(imageHash).filter(Boolean);
  const imageMatch = providerImages.some((h) => tmdbImages.has(h));
  const trailer = String(raw.youtube_trailer ?? "").trim();
  const trailerMatch = Boolean(trailer) && (d.videos?.results ?? []).some((v) => v.site === "YouTube" && v.key === trailer);

  const reasons: string[] = [];
  if (similarity >= MATCH_THRESHOLD) reasons.push(`titre ${Math.round(similarity * 100)} %`);
  else if (similarity >= ID_THRESHOLD && yearOk !== false) reasons.push(`titre ${Math.round(similarity * 100)} % et année compatible`);
  if (imageMatch) reasons.push("image TMDB identique");
  if (trailerMatch) reasons.push("bande-annonce identique");
  if (castOverlap >= 2) reasons.push(`${castOverlap} acteurs en commun`);
  else if (castOverlap === 1 && (yearOk || directorMatch)) reasons.push(`1 acteur en commun et ${directorMatch ? "même réalisateur" : "même année"}`);
  if (directorMatch && yearOk && !reasons.length) reasons.push("même réalisateur et même année");
  return { similarity, yearOk, castOverlap, directorMatch, imageMatch, trailerMatch, accepted: reasons.length > 0, reasons };
}

/** Does the TMDB document the provider pointed at look like this item? */
export function idLooksRight(d: TmdbDetails, it: Pick<PendingItem, "name" | "cleanTitle" | "year" | "raw">): boolean {
  return idEvidence(d, it).accepted;
}

async function matchByTitle(client: TmdbClient, it: PendingItem): Promise<boolean> {
  const mediaType = it.kind === "vod" ? "movie" : "tv";
  const ct = it.cleanTitle ? { title: it.cleanTitle, year: it.year ?? undefined } : cleanTitle(it.name);
  const search = async (year?: number, adult = false) => mediaType === "movie" ? client.searchMovie(ct.title, year, adult) : client.searchTv(ct.title, year, adult);
  let res = await search(ct.year);
  let best = scoreAll(res.results ?? [], ct.title, ct.year)[0];
  if ((!best || best.score < MATCH_THRESHOLD) && ct.year) {
    res = await search(undefined);
    const b2 = scoreAll(res.results ?? [], ct.title, ct.year)[0];
    if (b2 && (!best || b2.score > best.score)) best = b2;
  }
  // Last resort: adult-flagged titles never appear in a default search.
  if (!best || best.score < MATCH_THRESHOLD) {
    res = await search(undefined, true);
    const b3 = scoreAll(res.results ?? [], ct.title, ct.year)[0];
    if (b3 && (!best || b3.score > best.score)) best = b3;
  }
  if (best && best.score >= MATCH_THRESHOLD) {
    await getDetails(client, mediaType, best.result.id);
    await setMatch(it.id, best.result.id, best.score, "matched");
    return true;
  }
  // The search may have hit through an alternative title (English name of a non-English film):
  // one details call on the best candidate settles it against every name it carries.
  if (best) {
    let d = await getDetails(client, mediaType, best.result.id).catch(() => null);
    if (d && !hasAllNames(d)) d = await getDetails(client, mediaType, best.result.id, true).catch(() => d);
    if (d) {
      const ev = idEvidence(d, it);
      if (ev.accepted) { await setMatch(it.id, best.result.id, Math.max(ev.similarity, ID_THRESHOLD), "matched"); return true; }
    }
  }
  await setMatch(it.id, null, best?.score ?? 0, "unmatched");
  return false;
}

export type MatchExplanation = {
  cleaned: { title: string; year?: number };
  threshold: number; idThreshold: number;
  provided: { id: number; found: boolean; title?: string; year?: number; similarity: number; accepted: boolean; evidence?: Evidence } | null;
  searches: { withYear: number | undefined; adult?: boolean; candidates: ScoredDetail[] }[];
  /** Best candidate re-judged against all its names (alternative titles included). */
  alternative?: { id: number; names: string[]; similarity: number; evidence?: Evidence };
  verdict: { status: "matched" | "unmatched"; tmdbId: number | null; score: number; via: "id" | "search" | "alternative" | "none" };
};

/** The matching, step by step, without writing anything: what the admin sees under "Pourquoi ?". */
export async function explainMatch(client: TmdbClient, it: PendingItem): Promise<MatchExplanation> {
  const mediaType = it.kind === "vod" ? "movie" : "tv";
  const ct = it.cleanTitle ? { title: it.cleanTitle, year: it.year ?? undefined } : cleanTitle(it.name);
  const out: MatchExplanation = { cleaned: ct, threshold: MATCH_THRESHOLD, idThreshold: ID_THRESHOLD, provided: null, searches: [], verdict: { status: "unmatched", tmdbId: null, score: 0, via: "none" } };
  const pid = providedTmdbId(it);
  if (pid) {
    let d = await getDetails(client, mediaType, pid).catch(() => null);
    if (d && !hasAllNames(d) && !idLooksRight(d, it)) d = await getDetails(client, mediaType, pid, true).catch(() => d);
    if (d) {
      const ev = idEvidence(d, it);
      out.provided = { id: pid, found: true, title: d.title ?? d.name, year: Number((d.release_date ?? d.first_air_date ?? "").slice(0, 4)) || undefined, similarity: ev.similarity, accepted: ev.accepted, evidence: ev };
      if (ev.accepted) { out.verdict = { status: "matched", tmdbId: pid, score: 1, via: "id" }; return out; }
    } else out.provided = { id: pid, found: false, similarity: 0, accepted: false };
  }
  const search = async (year?: number, adult = false) => mediaType === "movie" ? client.searchMovie(ct.title, year, adult) : client.searchTv(ct.title, year, adult);
  let best: ScoredDetail | undefined;
  const rounds: [number | undefined, boolean][] = ct.year ? [[ct.year, false], [undefined, false], [undefined, true]] : [[undefined, false], [undefined, true]];
  for (const [year, adult] of rounds) {
    const candidates = scoreAll((await search(year, adult)).results ?? [], ct.title, ct.year).slice(0, 8);
    out.searches.push({ withYear: year, adult, candidates });
    if (candidates[0] && (!best || candidates[0].score > best.score)) best = candidates[0];
    if (best && best.score >= MATCH_THRESHOLD) break;
  }
  if (best && best.score >= MATCH_THRESHOLD) { out.verdict = { status: "matched", tmdbId: best.result.id, score: best.score, via: "search" }; return out; }
  if (best) {
    let d = await getDetails(client, mediaType, best.result.id).catch(() => null);
    if (d && !hasAllNames(d)) d = await getDetails(client, mediaType, best.result.id, true).catch(() => d);
    const ev = d ? idEvidence(d, it) : null;
    out.alternative = { id: best.result.id, names: d ? namesOf(d) : [], similarity: ev?.similarity ?? 0, evidence: ev ?? undefined };
    if (ev?.accepted) { out.verdict = { status: "matched", tmdbId: best.result.id, score: Math.max(ev.similarity, ID_THRESHOLD), via: "alternative" }; return out; }
  }
  out.verdict = { status: "unmatched", tmdbId: null, score: best?.score ?? 0, via: "none" };
  return out;
}

export async function setMatch(itemId: number, tmdbId: number | null, score: number, status: "matched" | "unmatched" | "manual" | "pending") {
  await db.update(schema.items).set({ tmdbId, matchScore: score, matchStatus: status, matchedAt: new Date() }).where(eq(schema.items.id, itemId));
}
