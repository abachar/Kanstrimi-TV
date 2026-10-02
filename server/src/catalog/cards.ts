import { tmdbMediaType, type Content } from "@/db";
import { describeError, within } from "@/shared";
import { refreshDetails } from "@/providers/tmdb";
import { refreshCards } from "./grouping/group";

/** The sheet waits this long for TMDB, then answers with what it has; the refresh lands for the next opening. */
const WAIT_MS = 2000;

const inFlight = new Map<number, Promise<boolean>>();

/**
 * The sheet being opened brings its TMDB card up to date: rating, status, logo. Returns true when
 * the card was rewritten in time, the caller then reads the content again. Never fails: a TMDB
 * outage leaves the sheet as it was.
 */
export async function refreshCardOnOpen(content: Content): Promise<boolean> {
  if (content.tmdbId === null || content.kind === "live") return false;
  let run = inFlight.get(content.id);
  if (!run) {
    run = refreshDetails(tmdbMediaType(content.kind), content.tmdbId)
      .then(async (fetched) => {
        if (fetched) await refreshCards([content.id]);
        return fetched;
      })
      .catch((e) => {
        console.error(`[sheet] copie de la carte ${content.key} : ${describeError(e)}`);
        return false;
      })
      .finally(() => inFlight.delete(content.id));
    inFlight.set(content.id, run);
  }
  return within(run, WAIT_MS, false);
}
