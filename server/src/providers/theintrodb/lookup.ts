import { and, eq, sql } from "drizzle-orm";
import { db, type MarkerSegment, schema } from "@/db";
import { describeError, singleFlight, within } from "@/shared";

/**
 * TheIntroDB (theintrodb.org): the intros, end credits and previews of the next episode its users measured, asked title by title when one plays
 * and kept in `theintrodb_cache` (its terms allow a personal server to keep what it asked, and forbid copying the
 * base). Two requests per title: the segments of the version closest to the file, then the lengths of the files
 * it knows, which say whether that version is this file. Never fails: an outage, a refusal or the day's budget
 * spent answer what was kept, or nothing.
 */

/** A movie, or an episode by its series, its season and its number. */
export type TitleRef = { mediaType: "movie" | "tv"; tmdbId: number; season?: number; episode?: number };

const API = "https://api.theintrodb.org/v3/media";
const HEADERS = { "User-Agent": "Kanstrimi/1.0", Accept: "application/json" };
const KNOWN_TTL_MS = 30 * 24 * 3600 * 1000;
const UNKNOWN_TTL_MS = 7 * 24 * 3600 * 1000;
/** Requests a day, under the 500 the base allows an address without a key. */
export const DAILY_BUDGET = 400;
/** After a refusal (429) without a delay of its own, the base is left alone this long. */
const REFUSED_PAUSE_MS = 3600 * 1000;

type Span = { start_ms?: number | null; end_ms?: number | null };
type Media = { intro?: Span[]; credits?: Span[]; preview?: Span[] };
type Versions = { versions?: { duration_ms?: number | null }[] };
type Row = { segments: MarkerSegment[]; fetchedAt: Date };

/** After a failed lookup, that title leaves the base alone ten minutes. */
const once = singleFlight<MarkerSegment[] | null>(null, {
  retryAfterMs: 10 * 60 * 1000,
  onError: (e, k) => console.error(`[theintrodb] ${k} : ${describeError(e)}`),
});
let spent = { day: "", requests: 0 };
let pausedUntil = 0;

const today = () => new Date().toISOString().slice(0, 10);
/** True when a request may leave: not refused lately, and the day's budget not spent. It counts it. */
function mayAsk(): boolean {
  if (Date.now() < pausedUntil) return false;
  if (spent.day !== today()) spent = { day: today(), requests: 0 };
  if (spent.requests >= DAILY_BUDGET) return false;
  spent.requests++;
  return true;
}

/** The answer of the base; null for a title it does not know, or when nothing may be asked now. */
async function ask<T>(ref: TitleRef, params: Record<string, string | number>): Promise<T | null> {
  if (!mayAsk()) return null;
  const u = new URL(API);
  u.searchParams.set("tmdb_id", String(ref.tmdbId));
  if (ref.mediaType === "tv") {
    u.searchParams.set("season", String(ref.season));
    u.searchParams.set("episode", String(ref.episode));
  }
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  const res = await fetch(u, { headers: HEADERS, signal: AbortSignal.timeout(10_000) });
  if (res.status === 404) return null;
  if (res.status === 429) {
    const wait = Number(res.headers.get("retry-after"));
    pausedUntil = Date.now() + (wait > 0 ? wait * 1000 : REFUSED_PAUSE_MS);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

const seconds = (ms: unknown) => (typeof ms === "number" && Number.isFinite(ms) && ms >= 0 ? ms / 1000 : null);

/** The base's spans as segments; an intro of 0 to 0 is its way to say « no intro ». */
function segmentsOf(media: Media, measuredOn: number | null): MarkerSegment[] {
  const spans = (kind: MarkerSegment["kind"], list: Span[] | undefined) =>
    (Array.isArray(list) ? list : []).flatMap((s): MarkerSegment[] => {
      // No start: from the beginning of the file. No end: to its end.
      const [start, end] = [seconds(s?.start_ms ?? 0), s?.end_ms == null ? null : seconds(s.end_ms)];
      return start === null || (end !== null && end <= start) ? [] : [{ kind, start, end, measuredOn }];
    });
  return [...spans("intro", media.intro), ...spans("credits", media.credits), ...spans("preview", media.preview)];
}

const where = (ref: TitleRef, duration: number) =>
  and(
    eq(schema.theintrodbCache.mediaType, ref.mediaType),
    eq(schema.theintrodbCache.tmdbId, ref.tmdbId),
    eq(schema.theintrodbCache.season, ref.season ?? 0),
    eq(schema.theintrodbCache.episode, ref.episode ?? 0),
    eq(schema.theintrodbCache.duration, duration),
  );

/** Ask the base and replace what was kept; null when it could not be asked. */
function fetchOnce(ref: TitleRef, duration: number): Promise<MarkerSegment[] | null> {
  const key = `${ref.mediaType}:${ref.tmdbId}:${ref.season ?? 0}:${ref.episode ?? 0}:${duration}`;
  return once(key, async () => {
    const budget = spent.requests;
    const media = await ask<Media>(ref, { duration_ms: duration * 1000 });
    // Nothing left: not a title the base does not know, nothing to keep.
    if (!media && budget === spent.requests) return null;
    let segments: MarkerSegment[] = [];
    if (media) {
      // The version served is the closest to the file: it is this file when one of the lengths it knows is.
      const before = spent.requests;
      const versions = await ask<Versions>(ref, { list_versions: "true" });
      if (!versions && before === spent.requests) return null;
      const lengths = (versions?.versions ?? []).map((v) => seconds(v.duration_ms)).filter((d): d is number => d !== null && d > 0);
      const closest = lengths.sort((a, b) => Math.abs(a - duration) - Math.abs(b - duration))[0];
      segments = segmentsOf(media, closest ?? null);
    }
    await db
      .insert(schema.theintrodbCache)
      .values({ ...ref, season: ref.season ?? 0, episode: ref.episode ?? 0, duration, segments, fetchedAt: new Date() })
      .onConflictDoUpdate({
        target: [
          schema.theintrodbCache.mediaType,
          schema.theintrodbCache.tmdbId,
          schema.theintrodbCache.season,
          schema.theintrodbCache.episode,
          schema.theintrodbCache.duration,
        ],
        set: { segments: sql`excluded.segments`, fetchedAt: sql`excluded.fetched_at` },
      });
    return segments;
  });
}

/**
 * What the base knows of a title for a file `duration` seconds long. An answer kept less than a month (a week
 * when the base did not know the title) comes at once; otherwise the base is asked, `waitMs` at most, past which
 * what was kept (or nothing) answers and the lookup lands for the next call.
 */
export async function introdbSegments(ref: TitleRef, duration: number, waitMs: number): Promise<MarkerSegment[]> {
  if (ref.mediaType === "tv" && (ref.season === undefined || ref.episode === undefined)) return [];
  const length = Math.round(duration);
  const [row]: Row[] = await db.select().from(schema.theintrodbCache).where(where(ref, length));
  if (row && Date.now() - row.fetchedAt.getTime() < (row.segments.length ? KNOWN_TTL_MS : UNKNOWN_TTL_MS)) return row.segments;
  return (await within(fetchOnce(ref, length), waitMs, null)) ?? row?.segments ?? [];
}

/** Resolves once the lookups started so far are done (tests). */
export const introdbSettled = () => once.idle();

/** Forget the failures, the lookups in flight, the day's count and the pause (tests). */
export function resetIntrodb() {
  once.reset();
  spent = { day: "", requests: 0 };
  pausedUntil = 0;
}
