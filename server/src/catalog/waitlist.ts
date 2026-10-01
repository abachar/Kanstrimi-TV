import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { getSettings } from "@/config";
import { db, schema, type WaitlistEntry } from "@/db";
import { cardFields, getDetails, getTmdbClient, type TmdbDetails } from "@/providers/tmdb";
import { tmdbKey } from "./keys";

/**
 * « Liste d'attente »: movies the provider does not have yet, chosen in the admin from a TMDB search.
 * The pipeline flags an entry available once a visible content carries its key (`markWaitlistAvailable`,
 * after every visibility change); the app then shows it as the home hero and at the head of the Top
 * Shelf until it is started (`markWaitlistStarted`, 5 % played, as « Reprendre » counts it).
 */

export type WaitlistStatus = "waiting" | "available" | "started";
/** What the admin shows of an awaited movie, from its TMDB document cached at the time it was added. */
export type WaitlistSheet = {
  originalTitle: string | null;
  overview: string | null;
  rating: number | null;
  voteCount: number | null;
  genres: string[];
  /** Minutes. */
  runtime: number | null;
  certification: string | null;
  director: string | null;
  cast: string[];
};
export type WaitlistRow = WaitlistEntry & { status: WaitlistStatus; sheet: WaitlistSheet | null };
export type WaitlistCandidate = {
  tmdbId: number;
  title: string;
  originalTitle: string | null;
  year: number | null;
  posterPath: string | null;
  overview: string | null;
  rating: number | null;
  /** A visible content already carries the key: nothing to wait for. */
  inCatalog: boolean;
  waiting: boolean;
};

const statusOf = (e: WaitlistEntry): WaitlistStatus => (e.startedAt ? "started" : e.availableAt ? "available" : "waiting");
const yearOf = (date: unknown) => (typeof date === "string" && /^\d{4}/.test(date) ? Number(date.slice(0, 4)) : null);

/** Available and not started first, then waiting, then started; the latest first in each. */
export async function listWaitlist(): Promise<WaitlistRow[]> {
  const w = schema.curationWaitlist;
  const rows = await db
    .select()
    .from(w)
    .orderBy(
      sql`case when ${w.startedAt} is not null then 2 when ${w.availableAt} is not null then 0 else 1 end`,
      desc(sql`coalesce(${w.startedAt}, ${w.availableAt}, ${w.addedAt})`),
      w.title,
    );
  const sheets = await cachedSheets(rows.map((e) => e.tmdbId));
  return rows.map((e) => ({ ...e, status: statusOf(e), sheet: sheets.get(e.tmdbId) ?? null }));
}

/** The cached TMDB documents of these movies, in the cards' language, read as a sheet. No network. */
async function cachedSheets(tmdbIds: number[]): Promise<Map<number, WaitlistSheet>> {
  if (!tmdbIds.length) return new Map();
  const lang = (await getSettings()).tmdb_language;
  const docs = await db
    .select({ tmdbId: schema.tmdbCache.tmdbId, data: schema.tmdbCache.data })
    .from(schema.tmdbCache)
    .where(and(eq(schema.tmdbCache.mediaType, "movie"), eq(schema.tmdbCache.lang, lang), inArray(schema.tmdbCache.tmdbId, tmdbIds)));
  return new Map(
    docs.map(({ tmdbId, data }) => {
      const f = cardFields("movie", data as TmdbDetails, lang, "");
      const sheet: WaitlistSheet = {
        originalTitle: f.originalTitle && f.originalTitle !== f.title ? f.originalTitle : null,
        overview: f.overview,
        rating: f.voteCount ? f.rating : null,
        voteCount: f.voteCount,
        genres: f.genres,
        runtime: f.runtime,
        certification: f.certification,
        director: f.director,
        cast: f.cast.slice(0, 4).map((p) => p.name),
      };
      return [tmdbId, sheet];
    }),
  );
}

/** Movies of TMDB matching `query`, flagged when the catalogue or the list already has them. Null without a TMDB key. */
export async function searchWaitlistCandidates(query: string, limit = 12): Promise<WaitlistCandidate[] | null> {
  const client = await getTmdbClient();
  if (!client) return null;
  const hits = ((await client.searchMovie(query)).results ?? []).slice(0, limit);
  if (!hits.length) return [];
  const keys = hits.map((h) => tmdbKey("vod", h.id));
  const [visible, waiting] = await Promise.all([
    db
      .select({ key: schema.catalogContents.key })
      .from(schema.catalogContents)
      .where(and(inArray(schema.catalogContents.key, keys), eq(schema.catalogContents.visible, true))),
    db
      .select({ key: schema.curationWaitlist.contentKey })
      .from(schema.curationWaitlist)
      .where(inArray(schema.curationWaitlist.contentKey, keys)),
  ]);
  const inCatalog = new Set(visible.map((r) => r.key));
  const listed = new Set(waiting.map((r) => r.key));
  return hits.map((h, i) => ({
    tmdbId: h.id,
    title: h.title ?? h.original_title ?? `TMDB ${h.id}`,
    originalTitle: h.original_title && h.original_title !== h.title ? h.original_title : null,
    year: yearOf(h.release_date),
    posterPath: h.poster_path ?? null,
    overview: h.overview || null,
    rating: h.vote_average || null,
    inCatalog: inCatalog.has(keys[i]),
    waiting: listed.has(keys[i]),
  }));
}

export type WaitlistAddResult = "added" | "already" | "in_catalog" | "no_tmdb" | "unknown";

/**
 * Add a movie by its TMDB id. Its TMDB document is fetched now and stays in `tmdb_cache`: the day the
 * provider lists it, its card is ready.
 */
export async function addToWaitlist(tmdbId: number): Promise<WaitlistAddResult> {
  const contentKey = tmdbKey("vod", tmdbId);
  const [listed] = await db.select().from(schema.curationWaitlist).where(eq(schema.curationWaitlist.contentKey, contentKey));
  if (listed) return "already";
  const [present] = await db
    .select({ id: schema.catalogContents.id })
    .from(schema.catalogContents)
    .where(and(eq(schema.catalogContents.key, contentKey), eq(schema.catalogContents.visible, true)));
  if (present) return "in_catalog";
  const client = await getTmdbClient();
  if (!client) return "no_tmdb";
  const d = await getDetails(client, "movie", tmdbId);
  if (!d || typeof d.title !== "string") return "unknown";
  const releaseDate = typeof d.release_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d.release_date) ? d.release_date : null;
  await db
    .insert(schema.curationWaitlist)
    .values({
      contentKey,
      tmdbId,
      title: d.title,
      year: yearOf(releaseDate),
      posterPath: typeof d.poster_path === "string" ? d.poster_path : null,
      releaseDate,
    })
    .onConflictDoNothing();
  return "added";
}

export async function removeFromWaitlist(tmdbId: number) {
  await db.delete(schema.curationWaitlist).where(eq(schema.curationWaitlist.contentKey, tmdbKey("vod", tmdbId)));
}

/** Entries whose key a visible content now carries: flagged available, once. Returns how many. */
export async function markWaitlistAvailable(): Promise<number> {
  const w = schema.curationWaitlist;
  const rows = await db
    .update(w)
    .set({ availableAt: new Date() })
    .where(and(isNull(w.availableAt), sql`exists (select 1 from ${schema.catalogContents} c where c.key = ${w.contentKey} and c.visible)`))
    .returning({ key: w.contentKey });
  return rows.length;
}

/** The app played 5 % of it: the entry leaves the hero and the Top Shelf for « Reprendre ». */
export async function markWaitlistStarted(contentKey: string) {
  const w = schema.curationWaitlist;
  await db
    .update(w)
    .set({ startedAt: new Date() })
    .where(and(eq(w.contentKey, contentKey), isNull(w.startedAt)));
}

/** Keys available and not started, the latest available first: what the hero and the Top Shelf announce. */
export async function availableWaitlistKeys(): Promise<string[]> {
  const w = schema.curationWaitlist;
  const rows = await db
    .select({ key: w.contentKey })
    .from(w)
    .where(and(isNotNull(w.availableAt), isNull(w.startedAt)))
    .orderBy(desc(w.availableAt), w.contentKey);
  return rows.map((r) => r.key);
}
