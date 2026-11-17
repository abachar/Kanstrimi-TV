import { and, asc, eq, gte, inArray, isNull, lt, ne, or, sql, type SQL } from "drizzle-orm";
import pLimit from "p-limit";
import { getSettings } from "@/config";
import {
  client as pg,
  db,
  schema,
  sqlTmdbMediaType,
  tmdbHasLogos,
  tmdbMediaType,
  variants,
  type Kind,
  type Variant,
  visibleItem,
} from "@/db";
import { suggestTitles, type TitleQuery } from "@/providers/claude";
import { cancelGuard, describeError, isUnreachable, progress } from "@/shared";
import {
  DETAILS_TTL_MS,
  detailsWithNames,
  type Evidence,
  fetchDetails,
  forgetDetails,
  getCachedDetails,
  getDetails,
  getTmdbClient,
  ID_THRESHOLD,
  idEvidence,
  isGone,
  MATCH_THRESHOLD,
  namesOf,
  type ScoredDetail,
  scoreAll,
  type TmdbClient,
  type TmdbDetails,
} from "@/providers/tmdb";
import { regroupItems } from "./grouping/group";
import { contentKey } from "./keys";
import { applyFilters } from "./filters/apply";

/**
 * The identification of movies and series: `attachTitles` (the `group` step) gives each new stream its
 * title, `runEnrich` asks TMDB again about the titles without a card; and the admin's « Pourquoi ? » and
 * its manual corrections. The match is catalogue data; TMDB only supplies the documents, the candidates and the score.
 * Claude (providers/claude) reads once the names TMDB gave up on and suggests what to search; its
 * suggestion is one more title to try, judged by the same scores, never a verdict.
 */

/** This many outages in a row (DNS, network, database) and the step stops: the rest stays pending. */
const MAX_UNREACHABLE = 20;
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

export type PendingItem = Pick<Variant, "id" | "kind" | "name" | "title" | "year" | "raw"> &
  Partial<Pick<Variant, "aiKind" | "aiTitle" | "aiOriginalTitle" | "aiYear">>;

/** The titles Claude suggested for an entry, when it saw a movie or a series in it and they add to the cleaned title. */
export function suggestedTitles(it: PendingItem): string[] {
  if (it.aiKind !== "movie" && it.aiKind !== "series") return [];
  const own = (it.title || it.name).toLowerCase();
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
  const ct = { title: it.title || it.name, year: it.year ?? undefined };
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

// ---------------------------------------------------------------- titles

type TitleKind = "vod" | "series";
/** What a title is asked for: the stream that brings it, read. */
type Reading = Pick<Variant, "kind" | "name" | "title" | "year">;

/**
 * The title of a TMDB id (`tmdb:movie:603`), or the one without a card a reading gives
 * (`fallback:movie:<title>:<year>`): found, or created with what was searched. Returns its id.
 */
async function titleFor(it: Reading, tmdbId: number | null, more: { score?: number | null; asked?: boolean; manual?: boolean } = {}) {
  const t = schema.catalogTitles;
  const title = it.title || it.name;
  const key = contentKey({ kind: it.kind, title, year: it.year, tmdbId, matchStatus: tmdbId ? "matched" : "unmatched" });
  const [made] = await db
    .insert(t)
    .values({
      key,
      kind: it.kind,
      tmdbId,
      title,
      year: it.year,
      searchTitle: title,
      searchYear: it.year,
      matchStatus: tmdbId ? "matched" : more.manual ? "manual" : "unmatched",
      matchScore: more.score ?? null,
      matchedAt: more.asked === false ? null : new Date(),
      addedAt: new Date(),
    })
    .onConflictDoNothing({ target: t.key })
    .returning({ id: t.id });
  if (made) return made.id;
  const [known] = await db.select({ id: t.id }).from(t).where(eq(t.key, key));
  // Left without a card by hand: the weekly retry leaves it alone.
  if (more.manual && !tmdbId) await db.update(t).set({ matchStatus: "manual" }).where(eq(t.id, known.id));
  return known.id;
}

/** A title made for one stream alone, under a key of its own (`manual:<id>`): split out by hand. */
export async function titleApart(it: Reading & { id: number }): Promise<number> {
  const t = schema.catalogTitles;
  const title = it.title || it.name;
  const values = {
    key: `manual:${it.id}`,
    kind: it.kind,
    title,
    year: it.year,
    searchTitle: title,
    searchYear: it.year,
    matchStatus: "manual" as const,
  };
  const [made] = await db
    .insert(t)
    .values({ ...values, addedAt: new Date() })
    .onConflictDoUpdate({ target: t.key, set: { matchStatus: "manual" } })
    .returning({ id: t.id });
  return made.id;
}

/** Hangs streams on a title; `manual`: the identification leaves them there. */
export async function attachTo(ids: number[], titleId: number, how: string, manual = false) {
  if (ids.length) await db.update(schema.catalogStreams).set({ titleId, how, manual }).where(inArray(schema.catalogStreams.xtreamId, ids));
}

export type AttachStats = {
  /** Streams of movies and series that had no title. */
  to_attach: number;
  by_id: number;
  by_title: number;
  by_search: number;
  without_card: number;
  ids_rejected: number;
  errors: number;
  /** Left without a title: TMDB could not be reached. They are not served until it answers. */
  waiting: number;
};

type PendingStream = PendingItem & { kind: TitleKind };

/**
 * Identifies the streams of movies and series that have no title yet, and attaches each to its title;
 * a title is created only when the catalogue has none for it. In this order, the network last:
 *
 *  1. the TMDB id the provider gives, when the document bears the stream's name (`idEvidence`): from
 *     the cache when the catalogue already has that title, else TMDB confirms it;
 *  2. the same title and year as a stream already attached (not by hand): its title, without a call;
 *  3. a TMDB search, once per reading (`explainMatch`);
 *  4. nothing found: a title without a card, tried again every week and read by Claude once visible (`runEnrich`).
 *
 * Without a TMDB key every reading gets its title without a card. TMDB unreachable: the streams wait
 * without a title, unseen, for the next run (`waiting`).
 */
export async function attachTitles(onlyIds?: number[]): Promise<AttachStats> {
  const stats: AttachStats = { to_attach: 0, by_id: 0, by_title: 0, by_search: 0, without_card: 0, ids_rejected: 0, errors: 0, waiting: 0 };
  let pending: PendingStream[] = (await db
    .select({
      id: variants.id,
      kind: variants.kind,
      name: variants.name,
      title: variants.title,
      year: variants.year,
      raw: variants.raw,
    })
    .from(variants)
    .where(
      and(inArray(variants.kind, ["vod", "series"]), isNull(variants.titleId), onlyIds ? inArray(variants.id, onlyIds) : undefined),
    )) as PendingStream[];
  stats.to_attach = pending.length;
  if (!pending.length) return stats;
  const client = await getTmdbClient();
  const lang = (await getSettings()).tmdb_language;
  const n = (x: number) => x.toLocaleString("fr-FR");
  const beat = progress(
    "group",
    pending.length,
    () =>
      `${n(stats.by_id + stats.by_title + stats.by_search)} attachés · ${n(stats.without_card)} sans fiche · ${n(stats.errors)} erreurs`,
  );
  const limit = pLimit(CONCURRENCY);
  // p-limit may run a queued call outside this context: the stop check is bound here.
  const checkCancelled = cancelGuard();
  let unreachable = 0;
  let halted: string | null = null;
  const out = (e: unknown, what: string) => {
    stats.errors++;
    console.error(`[group] ${what} : ${describeError(e)}`);
    if (!isUnreachable(e)) return false;
    if (++unreachable >= MAX_UNREACHABLE && !halted) {
      halted = describeError(e);
      console.error(`[group] ${MAX_UNREACHABLE} échecs d'accès à TMDB d'affilée : arrêt, le reste attend le prochain passage`);
    }
    return true;
  };
  const done = (ids: number[]) => {
    const gone = new Set(ids);
    pending = pending.filter((p) => !gone.has(p.id));
    for (const _ of ids) beat.tick();
  };
  try {
    // 1. The id the provider gives: one document per id, each stream judged against it.
    const byId = new Map<string, PendingStream[]>();
    for (const it of pending) {
      const pid = providedTmdbId(it);
      if (pid) byId.set(`${it.kind}:${pid}`, [...(byId.get(`${it.kind}:${pid}`) ?? []), it]);
    }
    await Promise.all(
      [...byId.values()].map((group) =>
        limit(async () => {
          if (halted) return;
          checkCancelled();
          const pid = providedTmdbId(group[0])!;
          const mediaType = tmdbMediaType(group[0].kind);
          let d: TmdbDetails | null;
          try {
            // Cached: no call. One cached before every name was kept is read again when a stream's name does not fit yet.
            d = client
              ? await detailsWithNames(client, mediaType, pid, (doc) => !group.every((it) => idEvidence(doc, it).accepted))
              : await getCachedDetails(mediaType, pid, lang);
          } catch (e) {
            out(e, `${group[0].kind} TMDB fourni ${pid} « ${group[0].name} »`);
            return;
          }
          unreachable = 0;
          const fits = d ? group.filter((it) => idEvidence(d, it).accepted) : [];
          stats.ids_rejected += d ? group.length - fits.length : 0;
          if (!fits.length) return;
          await attachTo(
            fits.map((it) => it.id),
            await titleFor(fits[0], pid, { score: 1 }),
            "provided",
          );
          stats.by_id += fits.length;
          done(fits.map((it) => it.id));
        }),
      ),
    );
    checkCancelled();
    // 2. The same reading as a stream that has its title: that title, most of them agreeing.
    for (let i = 0; i < pending.length; i += 5000) {
      const part = pending.slice(i, i + 5000).filter((it) => it.title);
      if (!part.length) continue;
      const known = await pg<{ id: number; title_id: number }[]>`
        select p.id, k.title_id
        from unnest(${part.map((it) => it.id)}::int[], ${part.map((it) => it.kind)}::text[], ${part.map((it) => it.title)}::text[],
                    ${part.map((it) => it.year)}::int[]) as p(id, kind, title, year)
        cross join lateral (
          select v.title_id from xtream_streams s join catalog_streams v on v.xtream_id = s.id
          where s.kind = p.kind::content_kind and s.title = p.title and s.year is not distinct from p.year
            and v.title_id is not null and not v.manual
          group by v.title_id order by count(*) desc, v.title_id limit 1
        ) k`;
      const byTitle = new Map<number, number[]>();
      for (const r of known) byTitle.set(r.title_id, [...(byTitle.get(r.title_id) ?? []), r.id]);
      for (const [titleId, ids] of byTitle) await attachTo(ids, titleId, "title");
      stats.by_title += known.length;
      const found = new Set(known.map((r) => r.id));
      pending = pending.filter((p) => !found.has(p.id));
      for (const _ of known) beat.tick();
    }
    checkCancelled();
    // 3. and 4. One search per reading; what TMDB does not know gets a title without a card.
    const byReading = new Map<string, PendingStream[]>();
    for (const it of pending) {
      const k = `${it.kind}|${it.title || it.name}|${it.year ?? ""}`;
      byReading.set(k, [...(byReading.get(k) ?? []), it]);
    }
    await Promise.all(
      [...byReading.values()].map((group) =>
        limit(async () => {
          if (halted) return;
          checkCancelled();
          const it = group[0];
          const ids = group.map((g) => g.id);
          let verdict: MatchExplanation["verdict"] | null = null;
          if (client)
            try {
              // The provider's id, if it gave one, was judged above: only the searches are left.
              verdict = (await explainMatch(client, it, { provided: null })).verdict;
              if ((verdict.via === "search" || verdict.via === "suggestion") && verdict.tmdbId)
                await getDetails(client, tmdbMediaType(it.kind), verdict.tmdbId);
              unreachable = 0;
            } catch (e) {
              // No way to TMDB: they wait. A title TMDB itself rejects gets none of its cards.
              if (out(e, `${it.kind} « ${it.name} »`)) return;
            }
          if (verdict?.status === "matched" && verdict.tmdbId) {
            await attachTo(ids, await titleFor(it, verdict.tmdbId, { score: verdict.score }), "search");
            stats.by_search += ids.length;
          } else {
            await attachTo(ids, await titleFor(it, null, { score: verdict?.score ?? null, asked: Boolean(client) }), "none");
            stats.without_card += ids.length;
          }
          done(ids);
        }),
      ),
    );
  } finally {
    beat.stop();
  }
  stats.waiting = pending.length;
  console.log(
    `[group] ${n(stats.to_attach)} flux sans titre : ${n(stats.by_id)} par l'identifiant TMDB fourni, ${n(stats.by_title)} par un titre déjà au catalogue, ${n(stats.by_search)} par une recherche TMDB, ${n(stats.without_card)} sans fiche, ${n(stats.ids_rejected)} identifiants fournis rejetés, ${n(stats.errors)} erreurs, ${n(stats.waiting)} en attente`,
  );
  return stats;
}

/** How many streams of movies and series wait for their title (TMDB did not answer): the catalogue does not serve them. */
export async function waitingStreams(): Promise<number> {
  const [r] = await db.execute<{ n: number }>(sql`
    select count(*)::int as n from catalog_streams v join xtream_streams s on s.id = v.xtream_id
    where v.title_id is null and s.kind <> 'live'`);
  return r.n;
}

// ---------------------------------------------------------------- the `enrich` step

type CardlessTitle = { id: number; kind: TitleKind; key: string } & PendingItem;

/**
 * A title changes key by a look then a write (`adopt`, `disown`), and the step judges twenty at once:
 * two titles without a card that TMDB names alike in the same instant would both find the key free.
 * One at a time: the second finds the first and joins it.
 */
const oneKeyAtATime = pLimit(1);

/**
 * A title without a card that TMDB now knows becomes that title: the same row under its TMDB key, or,
 * when the catalogue already has it, its streams join the one that is there.
 */
async function adopt(title: CardlessTitle, tmdbId: number, score: number) {
  const t = schema.catalogTitles;
  const key = contentKey({ kind: title.kind, title: "", tmdbId, matchStatus: "matched" });
  const [there] = await db.select({ id: t.id }).from(t).where(eq(t.key, key));
  if (there) {
    await db.update(schema.catalogStreams).set({ titleId: there.id }).where(eq(schema.catalogStreams.titleId, title.id));
    await db.delete(t).where(eq(t.id, title.id));
    return;
  }
  // Its episodes were listed under the old key: they are built again when the sheet opens.
  await db.delete(schema.catalogEpisodes).where(eq(schema.catalogEpisodes.titleId, title.id));
  await db
    .update(t)
    .set({
      key,
      tmdbId,
      matchStatus: "matched",
      matchScore: score,
      matchedAt: new Date(),
      matchAttempts: 0,
      cardsAt: null,
      updatedAt: new Date(),
    })
    .where(eq(t.id, title.id));
}

/**
 * TMDB no longer has a document (deleted, or merged into another id): its cached copy goes, and the
 * titles that bore it are without a card again and never asked, so that the next run searches them
 * by what their streams read; the reverse of `adopt`. One that meets a title without a card of the
 * same reading gives it its streams.
 */
async function disown(mediaType: "movie" | "tv", tmdbId: number) {
  const t = schema.catalogTitles;
  const kind: TitleKind = mediaType === "movie" ? "vod" : "series";
  await forgetDetails(mediaType, tmdbId);
  const bearers = await db
    .select({ id: t.id, title: t.title, year: t.year, searchTitle: t.searchTitle, searchYear: t.searchYear })
    .from(t)
    .where(and(eq(t.kind, kind), eq(t.tmdbId, tmdbId)));
  for (const b of bearers) {
    // What was searched, not what TMDB called it: the card's title goes with the card.
    const [title, year] = b.searchTitle ? [b.searchTitle, b.searchYear] : [b.title, b.year];
    const key = contentKey({ kind, title, year, tmdbId: null, matchStatus: "unmatched" });
    const [there] = await db.select({ id: t.id }).from(t).where(eq(t.key, key));
    if (there) {
      await db.update(schema.catalogStreams).set({ titleId: there.id }).where(eq(schema.catalogStreams.titleId, b.id));
      await db.delete(t).where(eq(t.id, b.id));
      continue;
    }
    // Its episodes were listed under the old key: they are built again when the sheet opens.
    await db.delete(schema.catalogEpisodes).where(eq(schema.catalogEpisodes.titleId, b.id));
    await db
      .update(t)
      .set({
        key,
        tmdbId: null,
        title,
        year,
        matchStatus: "unmatched",
        matchScore: null,
        matchedAt: null,
        matchAttempts: 0,
        cardsAt: null,
        updatedAt: new Date(),
      })
      .where(eq(t.id, b.id));
  }
}

/**
 * The titles without a card, asked again: those never asked, those asked more than a week ago (TMDB
 * may have the title by now), and those Claude just read (visible ones, each once: what it suggests is
 * one more title to search, judged by the same scores). Then a share of the stale cache is fetched
 * again, which `group` copies into the cards. New streams are not this step's: `group` identifies them
 * as it attaches them (`attachTitles`).
 */
export async function runEnrich(opts: { limit?: number } = {}) {
  const client = await getTmdbClient();
  if (!client) throw new Error("Clé API TMDB non configurée");
  const stats = {
    processed: 0,
    matched: 0,
    unmatched: 0,
    errors: 0,
    retried: 0,
    refreshed: 0,
    cards_gone: 0,
    ai_asked: 0,
    ai_titled: 0,
    ai_other: 0,
  };
  Object.assign(stats, await askClaude());
  const t = schema.catalogTitles;
  const due = await db
    .selectDistinctOn([t.id], {
      id: t.id,
      kind: sql<TitleKind>`${t.kind}`,
      key: t.key,
      name: variants.name,
      title: t.searchTitle,
      year: t.searchYear,
      raw: variants.raw,
      aiKind: t.aiKind,
      aiTitle: t.aiTitle,
      aiOriginalTitle: t.aiOriginalTitle,
      aiYear: t.aiYear,
    })
    .from(t)
    .innerJoin(variants, eq(variants.titleId, t.id))
    .where(
      and(
        isNull(t.tmdbId),
        eq(t.matchStatus, "unmatched"),
        or(isNull(t.aiKind), ne(t.aiKind, "other")),
        or(isNull(t.matchedAt), lt(t.matchedAt, new Date(Date.now() - RETRY_UNMATCHED_MS))),
      ),
    )
    .orderBy(t.id, asc(variants.id))
    .limit(opts.limit ?? 100_000);
  stats.retried = due.length;
  const n = (x: number) => x.toLocaleString("fr-FR");
  console.log(`[enrich] ${n(due.length)} titres sans fiche à redemander à TMDB`);
  const beat = progress(
    "enrich",
    due.length,
    () => `${n(stats.matched)} associés · ${n(stats.unmatched)} non trouvés · ${n(stats.errors)} erreurs`,
  );
  const limit = pLimit(CONCURRENCY);
  // p-limit may run a queued call outside this context: the stop check is bound here.
  const checkCancelled = cancelGuard();
  let unreachable = 0;
  let halted: string | null = null;
  try {
    await Promise.all(
      due.map((title) =>
        limit(async () => {
          if (halted) return;
          checkCancelled();
          try {
            const { verdict } = await explainMatch(client, title);
            if ((verdict.via === "search" || verdict.via === "suggestion") && verdict.tmdbId)
              await getDetails(client, tmdbMediaType(title.kind), verdict.tmdbId);
            if (verdict.status === "matched" && verdict.tmdbId) {
              const tmdbId = verdict.tmdbId;
              await oneKeyAtATime(() => adopt(title, tmdbId, verdict.score));
              stats.matched++;
            } else {
              await db
                .update(t)
                .set({ matchScore: verdict.score, matchedAt: new Date(), matchAttempts: sql`${t.matchAttempts} + 1` })
                .where(eq(t.id, title.id));
              stats.unmatched++;
            }
            unreachable = 0;
            stats.processed++;
          } catch (e) {
            stats.errors++;
            console.error(`[enrich] ${title.kind} titre ${title.id} « ${title.title ?? title.name} » : ${describeError(e)}`);
            if (isUnreachable(e)) {
              if (++unreachable >= MAX_UNREACHABLE && !halted) {
                halted = describeError(e);
                console.error(`[enrich] ${MAX_UNREACHABLE} échecs d'accès d'affilée : arrêt, le reste sera redemandé au prochain passage`);
              }
              return;
            }
            unreachable = 0;
            // The title itself fails (not the way to TMDB): not asked again before a week.
            await db
              .update(t)
              .set({ matchedAt: new Date(), matchAttempts: sql`${t.matchAttempts} + 1` })
              .where(eq(t.id, title.id))
              .catch((e2) => console.error(`[enrich] titre ${title.id} : échec non compté (${describeError(e2)})`));
          } finally {
            beat.tick();
          }
        }),
      ),
    );
  } finally {
    beat.stop();
  }
  checkCancelled();
  if (!halted) Object.assign(stats, await refreshStale(client, limit, checkCancelled));
  console.log(
    `[enrich] ${n(stats.retried)} titres sans fiche redemandés : ${n(stats.matched)} associés, ${n(stats.unmatched)} non trouvés, ${n(stats.errors)} erreurs, ${n(stats.ai_asked)} noms lus par Claude (${n(stats.ai_titled)} titres suggérés, ${n(stats.ai_other)} hors TMDB), ${n(stats.refreshed)} fiches rafraîchies, ${n(stats.cards_gone)} retirées par TMDB`,
  );
  if (halted)
    throw new Error(
      `TMDB injoignable (${halted}) : arrêt après ${n(stats.processed)} titres, ${n(due.length - stats.processed)} restent à redemander`,
    );
  return stats;
}

/**
 * Claude reads the visible titles TMDB gave up on and that it has not read yet, AI_PER_RUN at most:
 * the ones it identifies are asked again right after with its suggestion, the others keep what it said
 * (`other`, or nothing). Each title is asked once; a request that fails leaves its titles for the next
 * run. Without a key, nothing happens.
 */
async function askClaude(): Promise<{ ai_asked: number; ai_titled: number; ai_other: number }> {
  const stats = { ai_asked: 0, ai_titled: 0, ai_other: 0 };
  const t = schema.catalogTitles;
  const c = schema.xtreamCategories;
  const rows: TitleQuery[] = await db
    .selectDistinctOn([t.id], { id: t.id, kind: sql<TitleKind>`${t.kind}`, name: variants.name, year: t.searchYear, category: c.name })
    .from(t)
    .innerJoin(variants, eq(variants.titleId, t.id))
    .leftJoin(c, and(eq(c.accountId, variants.accountId), eq(c.kind, variants.kind), eq(c.xtreamId, variants.categoryXtreamId)))
    .where(and(isNull(t.tmdbId), eq(t.matchStatus, "unmatched"), isNull(t.aiAskedAt), eq(t.visible, true), visibleItem))
    .orderBy(t.id, asc(variants.id))
    .limit(AI_PER_RUN);
  if (!rows.length) return stats;
  const n = (x: number) => x.toLocaleString("fr-FR");
  const suggestions = await suggestTitles(rows);
  if (!suggestions) return stats;
  console.log(`[enrich] ${n(rows.length)} titres sans fiche lus par Claude : ${n(suggestions.length)} réponses`);
  const now = new Date();
  for (const s of suggestions) {
    const titled = s.kind !== "other" && Boolean(s.title || s.originalTitle);
    await db
      .update(t)
      .set({
        aiKind: s.kind,
        aiTitle: s.title,
        aiOriginalTitle: s.originalTitle,
        aiYear: s.year,
        aiAskedAt: now,
        // Asked again in this run, with what Claude read.
        ...(titled ? { matchedAt: null, matchAttempts: 0 } : {}),
      })
      .where(eq(t.id, s.id));
    stats.ai_asked++;
    if (titled) stats.ai_titled++;
    if (s.kind === "other") stats.ai_other++;
  }
  // Asked and not answered: not asked again, there is nothing more to learn from the same name.
  const answered = new Set(suggestions.map((s) => s.id));
  const silent = rows.filter((r) => !answered.has(r.id)).map((r) => r.id);
  if (silent.length) {
    await db.update(t).set({ aiAskedAt: now }).where(inArray(t.id, silent));
    stats.ai_asked += silent.length;
  }
  return stats;
}

/**
 * The oldest cache entries past the TTL that a content still uses, fetched again: at most
 * REFRESH_PER_RUN; plus at most BACKFILL_PER_RUN used entries that predate the logos. A failure
 * keeps the old entry (tried again next run), except a document TMDB no longer has: its titles go
 * back to being identified (`disown`). Returns how many landed and how many were gone.
 */
async function refreshStale(
  client: TmdbClient,
  limit: ReturnType<typeof pLimit>,
  checkCancelled: () => void,
): Promise<{ refreshed: number; cards_gone: number }> {
  const users = sql`from ${schema.catalogTitles} c where c.tmdb_id = ${schema.cacheTmdb.tmdbId}
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
  if (!stale.length) return { refreshed: 0, cards_gone: 0 };
  const n = (x: number) => x.toLocaleString("fr-FR");
  console.log(
    `[enrich] ${n(stale.length)} fiches TMDB à relire : ${n(old.length)} de plus de 30 jours, ${n(logoless.length)} d'avant les logos`,
  );
  let done = 0,
    gone = 0,
    failed = 0;
  const beat = progress("enrich", stale.length, () => `${n(done)} fiches relues · ${n(gone)} retirées par TMDB · ${n(failed)} erreurs`);
  try {
    await Promise.all(
      stale.map((r) =>
        limit(async () => {
          checkCancelled();
          const mediaType = r.mediaType as "movie" | "tv";
          try {
            const d = await fetchDetails(client, mediaType, r.tmdbId).catch((e) => {
              if (isGone(e)) return null;
              throw e;
            });
            if (d) done++;
            else {
              await oneKeyAtATime(() => disown(mediaType, r.tmdbId));
              gone++;
              console.log(`[enrich] TMDB n'a plus ${mediaType} ${r.tmdbId} : son titre sera cherché de nouveau par son nom`);
            }
          } catch (e) {
            failed++;
            console.error(`[enrich] rafraîchissement TMDB ${mediaType} ${r.tmdbId} : ${describeError(e)}`);
          } finally {
            beat.tick();
          }
        }),
      ),
    );
  } finally {
    beat.stop();
  }
  return { refreshed: done, cards_gone: gone };
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

/**
 * Says by hand which TMDB title a stream is (null: none, it gets a title without a card that is not
 * asked again); it stays there whatever the identification finds, and what it touches is regrouped at once.
 */
export async function assignManual(itemId: number, tmdbId: number | null) {
  const [it] = await db.select().from(variants).where(eq(variants.id, itemId));
  if (!it) throw new Error("Variante introuvable");
  if (it.kind === "live") throw new Error("Une chaîne n'a pas de fiche TMDB");
  if (tmdbId) {
    const client = await getTmdbClient();
    if (!client) throw new Error("Clé API TMDB non configurée");
    await getDetails(client, tmdbMediaType(it.kind), tmdbId, true);
  }
  await attachTo([itemId], await titleFor(it, tmdbId, { manual: true }), "manual", true);
  await applyFilters({ contentIds: await regroupItems([itemId], it.contentId ? [it.contentId] : []) });
}

/** The titles without a card are all asked again at the next `enrich`: what a better rule or a fresh TMDB may now find. */
export async function retryUnmatched(): Promise<number> {
  const t = schema.catalogTitles;
  const rows = await db
    .update(t)
    .set({ matchedAt: null, matchAttempts: 0 })
    .where(and(isNull(t.tmdbId), eq(t.matchStatus, "unmatched")))
    .returning({ id: t.id });
  return rows.length;
}

/**
 * Every stream of movies and series (of one kind) leaves its title, to be identified again at the next
 * `group`; those attached by hand stay unless asked. Until then the catalogue does not serve them.
 */
export async function resetMatches(kind?: TitleKind, clearOverrides = false) {
  const kinds: Kind[] = kind ? [kind] : ["vod", "series"];
  const v = schema.catalogStreams;
  await db
    .update(v)
    .set({ titleId: null, how: null, manual: false })
    .where(
      and(
        inArray(
          v.xtreamId,
          db.select({ id: schema.xtreamStreams.id }).from(schema.xtreamStreams).where(inArray(schema.xtreamStreams.kind, kinds)),
        ),
        clearOverrides ? undefined : eq(v.manual, false),
      ),
    );
}
