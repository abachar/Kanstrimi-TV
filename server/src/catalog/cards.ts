import { tmdbMediaType, type Content } from "@/db";
import { describeError, singleFlight, within } from "@/shared";
import { refreshDetails } from "@/providers/tmdb";
import { refreshCards } from "./grouping/group";

/** The sheet waits this long for TMDB, then answers with what it has; the refresh lands for the next opening. */
const WAIT_MS = 2000;

const once = singleFlight(false, { onError: (e, key) => console.error(`[sheet] copie de la carte ${key} : ${describeError(e)}`) });

/**
 * The sheet being opened brings its TMDB card up to date: rating, status, logo. Returns true when
 * the card was rewritten in time, the caller then reads the content again. Never fails: a TMDB
 * outage leaves the sheet as it was.
 */
export async function refreshCardOnOpen(content: Content): Promise<boolean> {
  if (content.tmdbId === null || content.kind === "live") return false;
  const tmdbId = content.tmdbId;
  const run = once(content.key, async () => {
    const fetched = await refreshDetails(tmdbMediaType(content.kind), tmdbId);
    if (fetched) await refreshCards([content.id]);
    return fetched;
  });
  return within(run, WAIT_MS, false);
}
