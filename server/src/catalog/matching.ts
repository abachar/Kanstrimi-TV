import { and, asc, eq, gte, inArray, isNull, lt, ne, or, sql, type SQL } from "drizzle-orm";
import pLimit from "p-limit";
import { db, schema, sqlTmdbMediaType, tmdbHasLogos, tmdbMediaType, type Variant, visibleItem } from "@/db";
import { suggestTitles, type TitleQuery } from "@/providers/claude";
import { cancelGuard, describeError, isUnreachable, progress } from "@/shared";
import {
  DETAILS_TTL_MS,
  detailsWithNames,
  type Evidence,
  fetchDetails,
  getDetails,
  getTmdbClient,
  ID_THRESHOLD,
  idEvidence,
  MATCH_THRESHOLD,
  namesOf,
  type ScoredDetail,
  scoreAll,
  type TmdbClient,
  type TmdbDetails,
} from "@/providers/tmdb";
import { regroupItems } from "./grouping/group";
import { applyFilters } from "./filters/apply";

/**
 * The TMDB matching of the variants: the `enrich` step, the admin's « Pourquoi ? » and its manual
 * corrections. The match is catalogue data; TMDB only supplies the documents, the candidates and the score.
 * Claude (providers/claude) reads once the names TMDB gave up on and suggests what to search; its
 * suggestion is one more title to try, judged by the same scores, never a verdict.
 */

/** This many outages in a row (DNS, network, database) and the step stops: the rest stays pending. */
const MAX_UNREACHABLE = 20;
/** An entry that fails this many times in a row for another reason (a title TMDB rejects) is given up: `unmatched`. */
const MAX_ATTEMPTS = 3;
/** Unmatched entries are tried again after this long: TMDB may have the title by then. */
const RETRY_UNMATCHED_MS = 7 * 24 * 3600 * 1000;
/** Names given up on that Claude reads per run, the visible ones only, each once; a run or two covers a provider's leftovers. */
const AI_PER_RUN = 2000;
/**
 * A suggested title is a guess, not the provider's word: a candidate found through it must carry the
 * year we know (the provider's, else Claude's), or, with no year to check, bear the title almost exactly.
 */
const SUGGESTED_NO_YEAR_THRESHOLD = 0.9;
/** Entries judged at once; the client keeps the pace TMDB allows (`TMDB_PER_SECOND`) whatever this is. */
const CONCURRENCY = 20;
/**
 * Cache entries older than the TTL refreshed per run, the oldest first: ratings, a series' status,
 * a new saga reach the cards without a burst (four runs a day cover ~60 000 entries in a month).
 */
const REFRESH_PER_RUN = 500;
/**
 * Entries cached before the logos were kept (no `images.logos`), fetched again on top of the
 * above, visible titles and latest releases first: ~60 000 entries take a dozen runs, about
 * three days, then this finds none. A sheet opened meanwhile catches up at once (`catalog/cards`).
 */
const BACKFILL_PER_RUN = 5000;

export type PendingItem = Pick<Variant, "id" | "kind" | "name" | "cleanTitle" | "year" | "raw"> &
  Partial<Pick<Variant, "aiKind" | "aiTitle" | "aiOriginalTitle" | "aiYear">>;

/** The titles Claude suggested for an entry, when it saw a movie or a series in it and they add to the cleaned title. */
export function suggestedTitles(it: PendingItem): string[] {
  if (it.aiKind !== "movie" && it.aiKind !== "series") return [];
  const own = (it.cleanTitle || it.name).toLowerCase();
  return [...new Set([it.aiTitle, it.aiOriginalTitle].filter((t): t is string => Boolean(t) && t!.toLowerCase() !== own))];
}

function providedTmdbId(it: PendingItem): number | null {
  const n = Number(it.raw.tmdb ?? it.raw.tmdb_id ?? 0);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// ---------------------------------------------------------------- the algorithm

export type MatchExplanation = {
  cleaned: { title: string; year?: number };
  threshold: number;
  idThreshold: number;
  provided: {
    id: number;
    found: boolean;
    title?: string;
    year?: number;
    similarity: number;
    accepted: boolean;
    evidence?: Evidence;
  } | null;
  /** `title` is set when the search used another title than the cleaned one: one Claude suggested. */
  searches: { title?: string; withYear: number | undefined; adult?: boolean; candidates: ScoredDetail[] }[];
  /** Best candidate re-judged against all its names (alternative titles included). */
  alternative?: { id: number; names: string[]; similarity: number; evidence?: Evidence };
  verdict: {
    status: "matched" | "unmatched";
    tmdbId: number | null;
    score: number;
    via: "id" | "search" | "alternative" | "suggestion" | "none";
  };
};

/**
 * The matching of one entry, step by step, without writing anything but the TMDB cache: the verdict
 * `runEnrich` applies, and what the admin shows under « Pourquoi ? ». The provider's id first, then
 * the searches (with the year, without, among adult titles) until one candidate passes the threshold,
 * last the best candidate judged against every name it carries; when Claude suggested other titles,
 * each is searched in turn under the stricter rule of `SUGGESTED_NO_YEAR_THRESHOLD`. `known.provided`:
 * the document of the provider's id, already fetched once for every entry that carries it.
 */
export async function explainMatch(
  client: TmdbClient,
  it: PendingItem,
  known?: { provided: TmdbDetails | null },
): Promise<MatchExplanation> {
  const mediaType = tmdbMediaType(it.kind);
  const ct = { title: it.cleanTitle || it.name, year: it.year ?? undefined };
  const out: MatchExplanation = {
    cleaned: ct,
    threshold: MATCH_THRESHOLD,
    idThreshold: ID_THRESHOLD,
    provided: null,
    searches: [],
    verdict: { status: "unmatched", tmdbId: null, score: 0, via: "none" },
  };
  const pid = providedTmdbId(it);
  if (pid) {
    const d = known ? known.provided : await detailsWithNames(client, mediaType, pid, (d) => !idEvidence(d, it).accepted);
    if (d) {
      const ev = idEvidence(d, it);
      out.provided = {
        id: pid,
        found: true,
        title: d.title ?? d.name,
        year: Number((d.release_date ?? d.first_air_date ?? "").slice(0, 4)) || undefined,
        similarity: ev.similarity,
        accepted: ev.accepted,
        evidence: ev,
      };
      if (ev.accepted) {
        out.verdict = { status: "matched", tmdbId: pid, score: 1, via: "id" };
        return out;
      }
    } else out.provided = { id: pid, found: false, similarity: 0, accepted: false };
  }
  const search = async (title: string, year?: number, adult = false) =>
    mediaType === "movie" ? client.searchMovie(title, year, adult) : client.searchTv(title, year, adult);
  // Adult-flagged titles never appear in a default search: last resort.
  const rounds: [number | undefined, boolean][] = ct.year
    ? [
        [ct.year, false],
        [undefined, false],
        [undefined, true],
      ]
    : [
        [undefined, false],
        [undefined, true],
      ];
  let best: ScoredDetail | undefined;
  for (const [year, adult] of rounds) {
    const candidates = scoreAll((await search(ct.title, year, adult)).results ?? [], ct.title, ct.year).slice(0, 8);
    out.searches.push({ withYear: year, adult, candidates });
    if (candidates[0] && (!best || candidates[0].score > best.score)) best = candidates[0];
    if (best && best.score >= MATCH_THRESHOLD) break;
  }
  if (best && best.score >= MATCH_THRESHOLD) {
    out.verdict = { status: "matched", tmdbId: best.result.id, score: best.score, via: "search" };
    return out;
  }
  // The search may have hit through an alternative title (English name of a non-English film):
  // one details call on the best candidate settles it against every name it carries.
  if (best) {
    const d = await detailsWithNames(client, mediaType, best.result.id);
    const ev = d ? idEvidence(d, it) : null;
    out.alternative = { id: best.result.id, names: d ? namesOf(d) : [], similarity: ev?.similarity ?? 0, evidence: ev ?? undefined };
    if (ev?.accepted) {
      out.verdict = { status: "matched", tmdbId: best.result.id, score: Math.max(ev.similarity, ID_THRESHOLD), via: "alternative" };
      return out;
    }
  }
  // Claude's reading of the name: another title to search, with the year the provider gave, else the one it gave.
  const year = ct.year ?? it.aiYear ?? undefined;
  for (const title of suggestedTitles(it)) {
    const candidates = scoreAll((await search(title, year)).results ?? [], title, year).slice(0, 8);
    out.searches.push({ title, withYear: year, candidates });
    const hit = candidates.find((c) =>
      year
        ? c.similarity >= MATCH_THRESHOLD && c.year !== undefined && Math.abs(c.year - year) <= 1
        : c.similarity >= SUGGESTED_NO_YEAR_THRESHOLD,
    );
    if (hit) {
      out.verdict = { status: "matched", tmdbId: hit.result.id, score: hit.score, via: "suggestion" };
      return out;
    }
    if (candidates[0] && (!best || candidates[0].score > best.score)) best = candidates[0];
  }
  out.verdict = { status: "unmatched", tmdbId: null, score: best?.score ?? 0, via: "none" };
  return out;
}

/** Writes a verdict. A match found by search caches its document now: the card is built from it. */
async function applyVerdict(client: TmdbClient, it: PendingItem, v: MatchExplanation["verdict"]) {
  if ((v.via === "search" || v.via === "suggestion") && v.tmdbId) await getDetails(client, tmdbMediaType(it.kind), v.tmdbId);
  await setMatch(it.id, v.tmdbId, v.score, v.status);
}

export async function setMatch(
  itemId: number,
  tmdbId: number | null,
  score: number | null,
  status: "matched" | "unmatched" | "manual" | "pending",
) {
  await db
    .update(schema.catalogVariants)
    .set({ tmdbId, matchScore: score, matchStatus: status, matchAttempts: 0, matchedAt: new Date() })
    .where(eq(schema.catalogVariants.id, itemId));
}

// ---------------------------------------------------------------- the `enrich` step

/**
 * Match every pending vod/series entry against TMDB, hidden ones included, and cache its
 * details. Reads the `clean_title` and `year` the naming wrote after the import; the pipeline
 * filters and regroups afterwards. Before: the week-old failures go back to pending (those Claude
 * judged outside TMDB excepted), and Claude reads the visible names given up on that it has not seen
 * yet: what it identifies goes back to pending with its suggestion, judged right after. After: a
 * share of the stale cache is fetched again, which `group` then copies into the cards.
 */
export async function runEnrich(opts: { limit?: number } = {}) {
  const client = await getTmdbClient();
  if (!client) throw new Error("Clé API TMDB non configurée");
  const stats = {
    processed: 0,
    matched: 0,
    unmatched: 0,
    errors: 0,
    ids_rejected: 0,
    retried: 0,
    refreshed: 0,
    ai_asked: 0,
    ai_titled: 0,
    ai_other: 0,
  };
  const retried = await db
    .update(schema.catalogVariants)
    .set({ matchStatus: "pending", matchAttempts: 0 })
    .where(
      and(
        inArray(schema.catalogVariants.kind, ["vod", "series"]),
        eq(schema.catalogVariants.matchStatus, "unmatched"),
        or(isNull(schema.catalogVariants.aiKind), ne(schema.catalogVariants.aiKind, "other")),
        or(isNull(schema.catalogVariants.matchedAt), lt(schema.catalogVariants.matchedAt, new Date(Date.now() - RETRY_UNMATCHED_MS))),
      ),
    )
    .returning({ id: schema.catalogVariants.id });
  stats.retried = retried.length;
  Object.assign(stats, await askClaude());
  const pending = await db
    .select({
      id: schema.catalogVariants.id,
      kind: schema.catalogVariants.kind,
      name: schema.catalogVariants.name,
      cleanTitle: schema.catalogVariants.cleanTitle,
      year: schema.catalogVariants.year,
      raw: schema.catalogVariants.raw,
      aiKind: schema.catalogVariants.aiKind,
      aiTitle: schema.catalogVariants.aiTitle,
      aiOriginalTitle: schema.catalogVariants.aiOriginalTitle,
      aiYear: schema.catalogVariants.aiYear,
    })
    .from(schema.catalogVariants)
    .where(and(inArray(schema.catalogVariants.kind, ["vod", "series"]), eq(schema.catalogVariants.matchStatus, "pending")))
    .limit(opts.limit ?? 100_000);
  // One details call per distinct provider id: 70 000 items carry ~45 000 ids.
  const byProvidedId = new Map<string, PendingItem[]>();
  const noId: PendingItem[] = [];
  for (const it of pending) {
    const pid = providedTmdbId(it);
    if (pid) {
      const k = `${it.kind}:${pid}`;
      byProvidedId.set(k, [...(byProvidedId.get(k) ?? []), it]);
    } else noId.push(it);
  }
  const n = (x: number) => x.toLocaleString("fr-FR");
  console.log(
    `[enrich] ${n(pending.length)} en attente : ${n(byProvidedId.size)} identifiants TMDB fournis par la source, ${n(noId.length)} sans`,
  );
  const beat = progress(
    "enrich",
    pending.length,
    () => `${n(stats.matched)} associés · ${n(stats.unmatched)} non trouvés · ${n(stats.errors)} erreurs`,
  );
  const limit = pLimit(CONCURRENCY);
  // p-limit may run a queued call outside this context: the stop check is bound here.
  const checkCancelled = cancelGuard();
  let unreachable = 0;
  let halted: string | null = null;
  const fail = async (it: PendingItem, e: unknown) => {
    beat.tick();
    stats.errors++;
    const pid = providedTmdbId(it);
    console.error(`[enrich] ${it.kind} élément ${it.id}${pid ? ` (TMDB fourni ${pid})` : ""} « ${it.name} » : ${describeError(e)}`);
    if (isUnreachable(e)) {
      if (++unreachable >= MAX_UNREACHABLE && !halted) {
        halted = describeError(e);
        console.error(`[enrich] ${MAX_UNREACHABLE} échecs d'accès d'affilée : arrêt, le reste reste en attente`);
      }
      return;
    }
    unreachable = 0;
    // The entry itself fails (not the way to TMDB): after MAX_ATTEMPTS runs it is given up until the weekly retry.
    await db
      .update(schema.catalogVariants)
      .set({
        matchAttempts: sql`${schema.catalogVariants.matchAttempts} + 1`,
        matchStatus: sql`case when ${schema.catalogVariants.matchAttempts} + 1 >= ${MAX_ATTEMPTS} then 'unmatched'::match_status else ${schema.catalogVariants.matchStatus} end`,
        matchedAt: new Date(),
      })
      .where(eq(schema.catalogVariants.id, it.id))
      .catch((e2) => console.error(`[enrich] élément ${it.id} : échec non compté (${describeError(e2)})`));
  };
  const judge = async (it: PendingItem, known?: { provided: TmdbDetails | null }) => {
    if (halted) return;
    checkCancelled();
    try {
      const e = await explainMatch(client, it, known);
      if (e.provided?.found && !e.provided.accepted) stats.ids_rejected++;
      await applyVerdict(client, it, e.verdict);
      unreachable = 0;
      beat.tick();
      stats.processed++;
      if (e.verdict.status === "matched") stats.matched++;
      else stats.unmatched++;
    } catch (e) {
      await fail(it, e);
    }
  };
  try {
    await Promise.all([
      ...[...byProvidedId.values()].map((group) =>
        limit(async () => {
          if (halted) return;
          checkCancelled();
          const pid = providedTmdbId(group[0])!;
          // Cached before alternative and translated titles were requested: one refresh before judging.
          let provided: TmdbDetails | null;
          try {
            provided = await detailsWithNames(
              client,
              tmdbMediaType(group[0].kind),
              pid,
              (d) => !group.every((it) => idEvidence(d, it).accepted),
            );
          } catch (e) {
            for (const it of group) await fail(it, e);
            return;
          }
          for (const it of group) await judge(it, { provided });
        }),
      ),
      ...noId.map((it) => limit(() => judge(it))),
    ]);
  } finally {
    beat.stop();
  }
  checkCancelled();
  if (!halted) stats.refreshed = await refreshStale(client, limit, checkCancelled);
  console.log(
    `[enrich] ${n(stats.processed)} traités : ${n(stats.matched)} associés, ${n(stats.unmatched)} non trouvés, ${n(stats.errors)} erreurs, ${n(stats.ids_rejected)} identifiants fournis rejetés, ${n(stats.retried)} non trouvés retentés, ${n(stats.ai_asked)} noms lus par Claude (${n(stats.ai_titled)} titres suggérés, ${n(stats.ai_other)} hors TMDB), ${n(stats.refreshed)} fiches rafraîchies`,
  );
  if (halted)
    throw new Error(
      `TMDB injoignable (${halted}) : arrêt après ${n(stats.processed)} traités, ${n(pending.length - stats.processed)} restent en attente`,
    );
  return stats;
}

/**
 * Claude reads the visible names TMDB gave up on and that it has not read yet, AI_PER_RUN at most:
 * the ones it identifies go back to pending with its suggestion, the others keep their verdict with
 * what it said (`other`, or nothing). Each name is asked once; a request that fails leaves its names
 * for the next run. Without a key, nothing happens.
 */
async function askClaude(): Promise<{ ai_asked: number; ai_titled: number; ai_other: number }> {
  const stats = { ai_asked: 0, ai_titled: 0, ai_other: 0 };
  const v = schema.catalogVariants;
  const c = schema.catalogCategories;
  const rows: TitleQuery[] = await db
    .select({ id: v.id, kind: sql<"vod" | "series">`${v.kind}`, name: v.name, year: v.year, category: c.name })
    .from(v)
    .leftJoin(c, and(eq(c.accountId, v.accountId), eq(c.kind, v.kind), eq(c.xtreamId, v.categoryXtreamId)))
    .where(and(inArray(v.kind, ["vod", "series"]), eq(v.matchStatus, "unmatched"), isNull(v.aiAskedAt), visibleItem))
    .orderBy(asc(v.id))
    .limit(AI_PER_RUN);
  if (!rows.length) return stats;
  const n = (x: number) => x.toLocaleString("fr-FR");
  const suggestions = await suggestTitles(rows);
  if (!suggestions) return stats;
  console.log(`[enrich] ${n(rows.length)} noms non reconnus lus par Claude : ${n(suggestions.length)} réponses`);
  const now = new Date();
  for (const s of suggestions) {
    const titled = s.kind !== "other" && Boolean(s.title || s.originalTitle);
    await db
      .update(v)
      .set({
        aiKind: s.kind,
        aiTitle: s.title,
        aiOriginalTitle: s.originalTitle,
        aiYear: s.year,
        aiAskedAt: now,
        ...(titled ? { matchStatus: "pending" as const, matchAttempts: 0 } : {}),
      })
      .where(eq(v.id, s.id));
    stats.ai_asked++;
    if (titled) stats.ai_titled++;
    if (s.kind === "other") stats.ai_other++;
  }
  // Asked and not answered: not asked again, there is nothing more to learn from the same name.
  const answered = new Set(suggestions.map((s) => s.id));
  const silent = rows.filter((r) => !answered.has(r.id)).map((r) => r.id);
  if (silent.length) {
    await db.update(v).set({ aiAskedAt: now }).where(inArray(v.id, silent));
    stats.ai_asked += silent.length;
  }
  return stats;
}

/**
 * The oldest cache entries past the TTL that a content still uses, fetched again: at most
 * REFRESH_PER_RUN; plus at most BACKFILL_PER_RUN used entries that predate the logos. A failure
 * keeps the old entry (tried again next run). Returns how many landed.
 */
async function refreshStale(client: TmdbClient, limit: ReturnType<typeof pLimit>, checkCancelled: () => void): Promise<number> {
  const users = sql`from ${schema.catalogContents} c where c.tmdb_id = ${schema.cacheTmdb.tmdbId}
    and ${sqlTmdbMediaType(sql`c.kind`)} = ${schema.cacheTmdb.mediaType}`;
  const pick = (cond: SQL, max: number, order: SQL[]) =>
    db
      .select({ mediaType: schema.cacheTmdb.mediaType, tmdbId: schema.cacheTmdb.tmdbId })
      .from(schema.cacheTmdb)
      .where(and(eq(schema.cacheTmdb.lang, client.language), cond, sql`exists (select 1 ${users})`))
      .orderBy(...order)
      .limit(max);
  const cutoff = new Date(Date.now() - DETAILS_TTL_MS);
  const withoutLogos = sql`not ${tmdbHasLogos}`;
  const old = await pick(lt(schema.cacheTmdb.fetchedAt, cutoff)!, REFRESH_PER_RUN, [asc(schema.cacheTmdb.fetchedAt)]);
  // What the app shows first gets its logo first: visible titles, the latest releases.
  const logoless = await pick(and(withoutLogos, gte(schema.cacheTmdb.fetchedAt, cutoff))!, BACKFILL_PER_RUN, [
    sql`(select bool_or(c.visible) ${users}) desc`,
    sql`(select max(c.release_date) ${users}) desc nulls last`,
  ]);
  const stale = [...old, ...logoless];
  if (!stale.length) return 0;
  const n = (x: number) => x.toLocaleString("fr-FR");
  console.log(
    `[enrich] ${n(stale.length)} fiches TMDB à relire : ${n(old.length)} de plus de 30 jours, ${n(logoless.length)} d'avant les logos`,
  );
  let done = 0,
    failed = 0;
  const beat = progress("enrich", stale.length, () => `${n(done)} fiches relues · ${n(failed)} erreurs`);
  try {
    await Promise.all(
      stale.map((r) =>
        limit(async () => {
          checkCancelled();
          try {
            await fetchDetails(client, r.mediaType as "movie" | "tv", r.tmdbId);
            done++;
          } catch (e) {
            failed++;
            console.error(`[enrich] rafraîchissement TMDB ${r.mediaType} ${r.tmdbId} : ${describeError(e)}`);
          } finally {
            beat.tick();
          }
        }),
      ),
    );
  } finally {
    beat.stop();
  }
  return done;
}

// ---------------------------------------------------------------- manual corrections (admin)

export type TmdbCandidate = { id: number; label: string };

/** Up to ten search hits, labelled "Title (year)". Empty when no TMDB key is configured. */
export async function searchCandidates(item: Variant, query: string, limit = 10): Promise<TmdbCandidate[]> {
  const client = await getTmdbClient();
  if (!client) return [];
  const res = item.kind === "vod" ? await client.searchMovie(query) : await client.searchTv(query);
  return (res.results ?? [])
    .slice(0, limit)
    .map((r) => ({ id: r.id, label: `${r.title ?? r.name} (${(r.release_date ?? r.first_air_date ?? "").slice(0, 4) || "?"})` }));
}

/** Assign a TMDB id by hand (null removes the association); the item is regrouped at once. */
export async function assignManual(itemId: number, tmdbId: number | null) {
  const [it] = await db.select().from(schema.catalogVariants).where(eq(schema.catalogVariants.id, itemId));
  if (!it) throw new Error("Variante introuvable");
  if (tmdbId) {
    const client = await getTmdbClient();
    if (!client) throw new Error("Clé API TMDB non configurée");
    await getDetails(client, tmdbMediaType(it.kind), tmdbId, true);
  }
  await setMatch(itemId, tmdbId, null, tmdbId ? "manual" : "unmatched");
  await applyFilters({ contentIds: await regroupItems([itemId]) });
}

/** Only the failures go back to pending: what a better rule or a fresh TMDB may now find. */
export async function retryUnmatched(): Promise<number> {
  const rows = await db
    .update(schema.catalogVariants)
    .set({ matchStatus: "pending", matchAttempts: 0 })
    .where(and(inArray(schema.catalogVariants.kind, ["vod", "series"]), eq(schema.catalogVariants.matchStatus, "unmatched")))
    .returning({ id: schema.catalogVariants.id });
  return rows.length;
}

/** Back to pending for automatic matches; manual ones and grouping overrides stay unless asked. */
export async function resetMatches(kind?: "vod" | "series", clearOverrides = false) {
  await db
    .update(schema.catalogVariants)
    .set({ matchStatus: "pending", tmdbId: null, matchScore: null, matchAttempts: 0 })
    .where(
      and(inArray(schema.catalogVariants.kind, kind ? [kind] : ["vod", "series"]), sql`${schema.catalogVariants.matchStatus} <> 'manual'`),
    );
  if (clearOverrides)
    await db
      .update(schema.catalogVariants)
      .set({ keyOverride: null })
      .where(inArray(schema.catalogVariants.kind, kind ? [kind] : ["vod", "series"]));
}
