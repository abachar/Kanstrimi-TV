import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { describeError } from "@/shared";
import { refreshVisibility } from "./grouping/group";
import { withCatalogLock } from "./lock";
import { QUALITY_RANK, UNKNOWN_QUALITY, type Quality } from "./naming";

/**
 * What a player read in the stream it opened: the size of its picture. A provider's name is a promise (« 4K » on
 * a 1080p file, nothing at all on a channel); the measure is the fact, and wins wherever a quality counts: the
 * variant served, the order of the list, the best quality of a title, a filter. A stream never played keeps what
 * its name says. Nothing resets a measure: the next playback writes it again, and a stream the provider replaces
 * under the same id is measured anew the first time it plays.
 */

/**
 * The quality of a picture `width` × `height` pixels. By its width first, a film in scope being less high than
 * its name (1920 × 800 is FHD); by its height for an anamorphic or upright one (1440 × 1080 is FHD too).
 */
export function qualityOfPicture(width: number, height: number): Quality {
  if (width >= 3000 || height >= 1800) return "4K";
  if (width >= 1800 || height >= 1000) return "FHD";
  if (width >= 1200 || height >= 700) return "HD";
  return "SD";
}

/**
 * Keeps the picture a player read in stream `streamId` (a series' stream: in one of its episodes), and makes
 * its quality that of the stream. When the quality changes, the content it is on counts its aggregates again
 * (best quality, badges), behind whatever the catalogue is busy with: the player does not wait. Returns the
 * quality measured and whether it is another than the one the stream was served with; null for a stream that is gone.
 */
export async function recordMeasure(
  streamId: number,
  width: number,
  height: number,
): Promise<{ quality: Quality; changed: boolean } | null> {
  const s = schema.xtreamStreams;
  const [before] = await db.select({ quality: s.quality, measuredAt: s.measuredAt }).from(s).where(eq(s.id, streamId));
  if (!before) return null;
  const quality = qualityOfPicture(width, height);
  await db
    .update(s)
    .set({
      measuredWidth: width,
      measuredHeight: height,
      measuredAt: new Date(),
      // The first measure moves what the name says aside; the naming keeps it up to date from then on.
      ...(before.measuredAt === null ? { announcedQuality: before.quality } : {}),
      quality,
      qualityRank: QUALITY_RANK[quality],
    })
    .where(eq(s.id, streamId));
  if (quality !== before.quality)
    void recount(streamId).catch((e) => console.error(`[measure] flux ${streamId} : agrégats non recalculés,`, describeError(e)));
  // A stream whose name says nothing was served as `UNKNOWN_QUALITY`: measured as such, nothing changes for the app.
  return { quality, changed: quality !== (before.quality ?? UNKNOWN_QUALITY) };
}

/** The aggregates of the content a stream is on, once the catalogue is free. */
async function recount(streamId: number): Promise<void> {
  const v = schema.catalogStreams;
  const [row] = await db.select({ titleId: v.titleId, channelId: v.channelId }).from(v).where(eq(v.xtreamId, streamId));
  const contentId = row?.titleId ?? row?.channelId;
  if (contentId) await withCatalogLock(() => refreshVisibility([contentId]));
}
