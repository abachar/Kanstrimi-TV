import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";

/** A movie by its IMDb id; an episode by its series' IMDb id, its season and its number. */
export type TitleRef = { imdbId: string; season?: number; episode?: number };
/**
 * An intro or the end credits of a title as a base of markers knows them, in seconds. `end`: null, to the end
 * of the file. `measuredOn`: the length of the file it was measured on, null when the base does not say.
 */
export type Segment = { kind: "intro" | "credits"; start: number; end: number | null; measuredOn: number | null };

/** What SkipDB's last import holds of a title. */
export async function segmentsOf(ref: TitleRef): Promise<Segment[]> {
  const rows = await db
    .select()
    .from(schema.skipdbSegments)
    .where(
      and(
        eq(schema.skipdbSegments.imdbId, ref.imdbId),
        eq(schema.skipdbSegments.season, ref.season ?? 0),
        eq(schema.skipdbSegments.episode, ref.episode ?? 0),
      ),
    );
  return rows.map((r) => ({
    kind: r.kind,
    start: r.startMs / 1000,
    end: r.endMs / 1000,
    measuredOn: r.durationMs === null ? null : r.durationMs / 1000,
  }));
}
