import { tmdbMediaType } from "@/db";
import { extras } from "@/providers/tmdb";
import { stripAccents } from "@/shared";
import { parseKey } from "./keys";

/**
 * Where the intro and the end credits of a file are: « Passer l'intro », and « À suivre » shown when the
 * credits start rather than in the last seconds. The player says what it read in the file it opened (its
 * length and its chapters, in seconds); nothing here opens a file. A marker is given only when it is sure:
 * a wrong start of the credits would cut the end of the title.
 */

export type FileChapter = { name: string; start: number; end: number };
export type FileFacts = { duration: number; chapters: FileChapter[] };
/** `credits`: where the end credits start, nothing but them until the end of the file. */
export type Markers = { intro: { start: number; end: number } | null; credits: number | null };

/** Chapter names as releases write them (Netflix « Intro », « Credits »), compared without case, accents or numbering. */
const INTRO_NAMES = new Set([
  "intro",
  "introduction",
  "opening",
  "op",
  "title sequence",
  "main title",
  "main titles",
  "main title sequence",
  "opening credits",
  "opening titles",
  "generique de debut",
  "generique d'ouverture",
]);
const CREDITS_NAMES = new Set(["credits", "end credits", "closing credits", "ending credits", "ending", "ed", "outro", "generique de fin"]);
/** Says neither which: the half of the file it starts in decides. */
const EITHER_NAMES = new Set(["generique"]);

const INTRO_MIN_SECONDS = 2;
const INTRO_MAX_SECONDS = 10 * 60;
/** Credits shorter than this are left to the last seconds of the file, as without a marker. */
const CREDITS_MIN_SECONDS = 30;
/** The player waits this long for TMDB's keywords; past it, the credits are not given this time. */
const KEYWORDS_WAIT_MS = 3000;

/** « 3. Main Title Sequence », « (02) Générique » → « main title sequence », « generique ». */
const nameKey = (name: string) =>
  stripAccents(name)
    .toLowerCase()
    .replace(/^\s*\(?\d+\)?\s*[.:)\-–]?\s*/, "")
    .replace(/[\s.:!]+$/, "")
    .replace(/\s+/g, " ")
    .trim();

/** What the chapters of a file say, by their names alone. */
export function chapterMarkers(file: FileFacts): Markers {
  const { duration } = file;
  const chapters = file.chapters.filter((c) => c.start >= 0 && c.start < duration && c.end > c.start).sort((a, b) => a.start - b.start);
  const half = duration / 2;
  const named = (c: FileChapter, names: Set<string>) => names.has(nameKey(c.name)) || EITHER_NAMES.has(nameKey(c.name));

  const opening = chapters.find((c) => c.start < half && named(c, INTRO_NAMES));
  const length = opening ? Math.min(opening.end, duration) - opening.start : 0;
  const intro =
    opening && length >= INTRO_MIN_SECONDS && length <= INTRO_MAX_SECONDS
      ? { start: opening.start, end: Math.min(opening.end, duration) }
      : null;

  // The last chapter only: after a « Credits » chapter followed by another one, something still plays.
  const last = chapters.at(-1);
  const credits =
    last && last.start > half && duration - last.start >= CREDITS_MIN_SECONDS && named(last, CREDITS_NAMES) ? last.start : null;
  return { intro, credits };
}

/**
 * Does the title end where its credits start? An episode: yes, nothing announces otherwise. A movie: only when
 * TMDB's keywords are known and announce no scene during or after the credits.
 */
async function endsAtCredits(key: string): Promise<boolean> {
  const p = parseKey(key);
  if (!p || p.kind === "live") return false;
  if (p.episode !== undefined) return true;
  if (p.kind !== "vod" || p.tmdbId === undefined) return false;
  const known = await extras({ mediaType: tmdbMediaType(p.kind), tmdbId: p.tmdbId }, KEYWORDS_WAIT_MS);
  return known !== null && !known.creditsScene;
}

/** The markers of the file the player opened for `key` (a movie or an episode). */
export async function markersOf(key: string, file: FileFacts): Promise<Markers> {
  const found = chapterMarkers(file);
  return { intro: found.intro, credits: found.credits !== null && (await endsAtCredits(key)) ? found.credits : null };
}
