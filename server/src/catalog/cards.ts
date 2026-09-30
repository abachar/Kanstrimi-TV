import { and, eq, sql } from "drizzle-orm";
import { db, schema, tmdbMediaType, type Content } from "@/db";
import { describeError } from "@/shared";
import { fetchDetails, getTmdbClient } from "@/providers/tmdb";
import { refreshCards } from "./grouping/group";

/** An opened sheet re-reads its TMDB document past this age, or at once when it predates the logos. */
const SHEET_TTL_MS = 7 * 24 * 3600 * 1000;
/** The sheet waits this long for TMDB, then answers with what it has; the refresh lands for the next opening. */
const WAIT_MS = 2000;
/** After a failed read, the sheets of that content leave TMDB alone this long. */
const RETRY_MS = 10 * 60 * 1000;

const inFlight = new Map<number, Promise<boolean>>();
const failedAt = new Map<number, number>();

/**
 * The sheet being opened brings its TMDB card up to date: rating, status, logo. Returns true when
 * the card was rewritten in time, the caller then reads the content again. Never fails: a TMDB
 * outage leaves the sheet as it was.
 */
export async function refreshCardOnOpen(content: Content): Promise<boolean> {
  if (content.tmdbId === null || content.kind === "live") return false;
  if (Date.now() - (failedAt.get(content.id) ?? 0) < RETRY_MS) return false;
  const client = await getTmdbClient();
  if (!client) return false;
  const mediaType = tmdbMediaType(content.kind);
  const tmdbId = content.tmdbId;
  const [cached] = await db
    .select({
      fetchedAt: schema.tmdbCache.fetchedAt,
      hasLogos: sql<boolean>`coalesce(${schema.tmdbCache.data} -> 'images' ? 'logos', false)`,
    })
    .from(schema.tmdbCache)
    .where(and(eq(schema.tmdbCache.mediaType, mediaType), eq(schema.tmdbCache.tmdbId, tmdbId), eq(schema.tmdbCache.lang, client.language)));
  if (cached?.hasLogos && Date.now() - cached.fetchedAt.getTime() < SHEET_TTL_MS) return false;

  let run = inFlight.get(content.id);
  if (!run) {
    run = fetchDetails(client, mediaType, tmdbId)
      .then(() => refreshCards([content.id]))
      .then(
        () => true,
        (e) => {
          failedAt.set(content.id, Date.now());
          console.error(`[sheet] rafraîchissement TMDB ${mediaType} ${tmdbId} : ${describeError(e)}`);
          return false;
        },
      )
      .finally(() => inFlight.delete(content.id));
    inFlight.set(content.id, run);
  }
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), WAIT_MS);
  });
  try {
    return await Promise.race([run, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
