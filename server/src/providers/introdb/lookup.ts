import { and, eq, sql } from "drizzle-orm";
import { db, type MarkerSegment, schema } from "@/db";
import { dayBudget, describeError, singleFlight, within } from "@/shared";

/**
 * IntroDB (introdb.app): the recaps and the intros its users timed, by the IMDb id of a series, asked episode by
 * episode when one plays and kept in `introdb_cache` (its terms allow a player to ask title by title, and forbid
 * copying the base). It does not say which file a segment was measured on: the recap and the intro only, which may
 * be given unchecked, never the credits. One request per episode. Never fails: an outage, a refusal or the day's
 * budget spent answer what was kept, or nothing.
 */

/** An episode by its series' IMDb id, its season and its number. */
export type EpisodeRef = { imdbId: string; season: number; episode: number };

const API = "https://api.introdb.app/segments";
const HEADERS = { "User-Agent": "Kanstrimi/1.0", Accept: "application/json" };
const KNOWN_TTL_MS = 30 * 24 * 3600 * 1000;
const UNKNOWN_TTL_MS = 7 * 24 * 3600 * 1000;
/** Requests a day: the base asks for a fair use and gives no number, TheIntroDB's reserve is taken. */
export const DAILY_BUDGET = 400;
/** After a refusal (429) without a delay of its own, the base is left alone this long. */
const REFUSED_PAUSE_MS = 3600 * 1000;

type Span = { start_ms?: number | null; end_ms?: number | null } | null;
type Answer = { recap?: Span; intro?: Span };
type Row = { segments: MarkerSegment[]; fetchedAt: Date };

/** After a failed lookup, that episode leaves the base alone ten minutes. */
const once = singleFlight<MarkerSegment[] | null>(null, {
  retryAfterMs: 10 * 60 * 1000,
  onError: (e, k) => console.error(`[introdb] ${k} : ${describeError(e)}`),
});
const budget = dayBudget(DAILY_BUDGET);

const seconds = (ms: unknown) => (typeof ms === "number" && Number.isFinite(ms) && ms >= 0 ? ms / 1000 : null);

/** The base's recap and intro as segments; an episode it does not know answers without any. */
function segmentsOf(answer: Answer): MarkerSegment[] {
  const span = (kind: MarkerSegment["kind"], s: Span | undefined): MarkerSegment[] => {
    const [start, end] = [seconds(s?.start_ms), seconds(s?.end_ms)];
    return start === null || end === null || end <= start ? [] : [{ kind, start, end, measuredOn: null }];
  };
  return [...span("recap", answer.recap), ...span("intro", answer.intro)];
}

const where = (ref: EpisodeRef) =>
  and(eq(schema.introdbCache.imdbId, ref.imdbId), eq(schema.introdbCache.season, ref.season), eq(schema.introdbCache.episode, ref.episode));

/** Ask the base and replace what was kept; null when it could not be asked. */
function fetchOnce(ref: EpisodeRef): Promise<MarkerSegment[] | null> {
  return once(`${ref.imdbId}:${ref.season}:${ref.episode}`, async () => {
    if (!budget.take()) return null;
    const u = new URL(API);
    u.searchParams.set("imdb_id", ref.imdbId);
    u.searchParams.set("season", String(ref.season));
    u.searchParams.set("episode", String(ref.episode));
    const res = await fetch(u, { headers: HEADERS, signal: AbortSignal.timeout(10_000) });
    if (res.status === 429) {
      const wait = Number(res.headers.get("retry-after"));
      budget.pause(wait > 0 ? wait * 1000 : REFUSED_PAUSE_MS);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const segments = segmentsOf((await res.json()) as Answer);
    await db
      .insert(schema.introdbCache)
      .values({ ...ref, segments, fetchedAt: new Date() })
      .onConflictDoUpdate({
        target: [schema.introdbCache.imdbId, schema.introdbCache.season, schema.introdbCache.episode],
        set: { segments: sql`excluded.segments`, fetchedAt: sql`excluded.fetched_at` },
      });
    return segments;
  });
}

/**
 * The recap and the intro the base knows of an episode, measured on a file it does not name. An answer kept less than a month (a
 * week when the base did not know the episode) comes at once; otherwise the base is asked, `waitMs` at most, past
 * which what was kept (or nothing) answers and the lookup lands for the next call.
 */
export async function introdbSegments(ref: EpisodeRef, waitMs: number): Promise<MarkerSegment[]> {
  const [row]: Row[] = await db.select().from(schema.introdbCache).where(where(ref));
  if (row && Date.now() - row.fetchedAt.getTime() < (row.segments.length ? KNOWN_TTL_MS : UNKNOWN_TTL_MS)) return row.segments;
  return (await within(fetchOnce(ref), waitMs, null)) ?? row?.segments ?? [];
}

/** Resolves once the lookups started so far are done (tests). */
export const introdbSettled = () => once.idle();

/** Forget the failures, the lookups in flight, the day's count and the pause (tests). */
export function resetIntrodb() {
  once.reset();
  budget.reset();
}
