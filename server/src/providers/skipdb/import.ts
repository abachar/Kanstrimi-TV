import { count } from "drizzle-orm";
import { db, schema } from "@/db";

/**
 * The `markers` step: SkipDB's daily export (skipdb.tv, data under ODbL 1.0), its recaps, intros, end credits and
 * previews of the next episode, replaced as a whole. The export is a file of a dated GitHub release; nothing is asked of SkipDB's own API.
 * An unreachable, empty or half-gone export fails the step and keeps the previous import.
 */

const RELEASES = "https://api.github.com/repos/SkipDB-TV/skipdb/releases?per_page=10";
/** Dated releases only: the `data-latest` one lags months behind. */
const DATED = /^data-\d{4}-\d{2}-\d{2}$/;
const DUMP = "skipdb-dump.json";
const HEADERS = { "User-Agent": "Kanstrimi/1.0", Accept: "application/json" };
/** An import that keeps less than this share of the previous one is refused: a broken export, not a real day. */
export const SHRINK_RATIO = 0.5;
const CHUNK = 5000;
/** A film of ten hours: past it, a number of the export is not a position in a file. */
const MAX_MS = 36_000_000;

type Release = { tag_name?: string; assets?: { name?: string; browser_download_url?: string }[] };
type Row = typeof schema.skipdbSegments.$inferInsert;

async function fetchJson<T>(url: string, timeoutMs: number): Promise<T> {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`SkipDB : ${new URL(url).host} a répondu HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** The export of the latest dated release. */
async function latestDumpUrl(): Promise<string> {
  const releases = await fetchJson<Release[]>(RELEASES, 30_000);
  for (const r of Array.isArray(releases) ? releases : []) {
    if (!DATED.test(r.tag_name ?? "")) continue;
    const url = r.assets?.find((a) => a.name === DUMP)?.browser_download_url;
    if (url) return url;
  }
  throw new Error("SkipDB : aucun export daté parmi les dernières publications");
}

const ms = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= MAX_MS ? v : null);

const KINDS: Record<string, Row["kind"]> = { recap: "recap", intro: "intro", outro: "credits", preview: "preview" };

/** An approved recap, intro, outro or preview of the export as a row; null for the rest (« no intro », broken rows). */
function rowOf(s: Record<string, unknown>): Row | null {
  if (s.status !== "approved") return null;
  const kind = typeof s.segment_type === "string" ? KINDS[s.segment_type] : undefined;
  const [start, end] = [ms(s.start_ms), ms(s.end_ms)];
  if (!kind || typeof s.id !== "number" || !Number.isInteger(s.id) || start === null || end === null || end <= start) return null;
  if (typeof s.imdb_id !== "string" || !/^tt\d+$/.test(s.imdb_id)) return null;
  const movie = s.media_type === "movie";
  // A movie has neither; the few the export numbers anyway are not looked for.
  if (movie ? s.season != null || s.episode != null : !Number.isInteger(s.season) || !Number.isInteger(s.episode)) return null;
  return {
    id: s.id,
    imdbId: s.imdb_id,
    season: movie ? 0 : (s.season as number),
    episode: movie ? 0 : (s.episode as number),
    kind,
    startMs: start,
    endMs: end,
    durationMs: ms(s.duration_ms) || null,
  };
}

export async function runSkipdbImport() {
  const dump = await fetchJson<{ segments?: unknown }>(await latestDumpUrl(), 180_000);
  const seen = new Set<number>();
  const rows = (Array.isArray(dump.segments) ? dump.segments : [])
    .map((s) => (s && typeof s === "object" ? rowOf(s as Record<string, unknown>) : null))
    .filter((r): r is Row => r !== null && !seen.has(r.id) && Boolean(seen.add(r.id)));
  const [{ before }] = await db.select({ before: count() }).from(schema.skipdbSegments);
  if (!rows.length) throw new Error("SkipDB : export vide, l'import précédent est gardé");
  if (rows.length < before * SHRINK_RATIO)
    throw new Error(`SkipDB : l'export fond de ${before} à ${rows.length} segments, l'import précédent est gardé`);
  await db.transaction(async (tx) => {
    await tx.delete(schema.skipdbSegments);
    for (let i = 0; i < rows.length; i += CHUNK) await tx.insert(schema.skipdbSegments).values(rows.slice(i, i + CHUNK));
  });
  return { segments: rows.length, titles: new Set(rows.map((r) => r.imdbId)).size };
}
