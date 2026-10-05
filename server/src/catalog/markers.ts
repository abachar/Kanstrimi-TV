import { tmdbMediaType } from "@/db";
import { type Segment, segmentsOf } from "@/providers/skipdb";
import { extras } from "@/providers/tmdb";
import { stripAccents } from "@/shared";
import { parseKey } from "./keys";

/**
 * Where the intro and the end credits of a file are: « Passer l'intro », and « À suivre » shown when the
 * credits start rather than in the last seconds. The player says what it read in the file it opened (its
 * length and its chapters, in seconds); nothing here opens a file. The chapters of the file come first, then
 * the public bases of markers (SkipDB). The start of the credits is given only when it is sure, a wrong one
 * would cut the end of the title: a named chapter, or a base that measured a file of the same length. An
 * intro is given even unchecked: a button badly placed costs nothing.
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
/** Two files this close in length are the same release: what was measured on one holds on the other. */
const SAME_FILE_SECONDS = 3;
/** Credits a base ends further than this from the end of the file are followed by something (a scene, a preview). */
const CREDITS_END_SLACK_SECONDS = 10;
/** The player waits this long for TMDB (a movie's keywords, the IMDb id); past it, it goes without this time. */
const TMDB_WAIT_MS = 3000;

/** An intro in the first half of the file, of a believable length; null otherwise. */
function introIn(start: number, end: number, duration: number): Markers["intro"] {
  const stop = Math.min(end, duration);
  const ok = start >= 0 && start < duration / 2 && stop - start >= INTRO_MIN_SECONDS && stop - start <= INTRO_MAX_SECONDS;
  return ok ? { start, end: stop } : null;
}
/** End credits in the second half of the file, long enough to be worth a card. */
const creditsIn = (start: number, duration: number) => start > duration / 2 && duration - start >= CREDITS_MIN_SECONDS;

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
  const named = (c: FileChapter, names: Set<string>) => names.has(nameKey(c.name)) || EITHER_NAMES.has(nameKey(c.name));
  const opening = chapters.find((c) => c.start < duration / 2 && named(c, INTRO_NAMES));
  // The last chapter only: after a « Credits » chapter followed by another one, something still plays.
  const last = chapters.at(-1);
  return {
    intro: opening ? introIn(opening.start, opening.end, duration) : null,
    credits: last && creditsIn(last.start, duration) && named(last, CREDITS_NAMES) ? last.start : null,
  };
}

/**
 * What the bases say of a file `duration` long. The credits: only segments measured on a file of that length and
 * running to its end, the latest start when several. The intro: one measured on a file of that length, else the
 * one whose file was the closest.
 */
export function baseMarkers(segments: Segment[], duration: number): Markers {
  const gap = (s: Segment) => (s.measuredOn === null ? Number.POSITIVE_INFINITY : Math.abs(s.measuredOn - duration));
  const intros = segments
    .filter((s) => s.kind === "intro" && s.end !== null && introIn(s.start, s.end, duration))
    .sort((a, b) => gap(a) - gap(b));
  const credits = segments
    .filter((s) => s.kind === "credits" && gap(s) <= SAME_FILE_SECONDS && creditsIn(s.start, duration))
    .filter((s) => s.end === null || s.end >= duration - CREDITS_END_SLACK_SECONDS)
    .map((s) => s.start);
  return {
    intro: intros.length ? introIn(intros[0].start, intros[0].end as number, duration) : null,
    credits: credits.length ? Math.max(...credits) : null,
  };
}

/** The markers of the file the player opened for `key` (a movie or an episode). */
export async function markersOf(key: string, file: FileFacts): Promise<Markers> {
  const p = parseKey(key);
  const movie = p?.kind === "vod";
  if (!p || !(movie || p.episode !== undefined)) return { intro: null, credits: null };
  let { intro, credits } = chapterMarkers(file);
  const missing = intro === null || credits === null;
  // TMDB is asked only for what it is needed for: the IMDb id the bases know a title by, a movie's keywords.
  const tmdb =
    p.tmdbId !== undefined && (missing || movie)
      ? await extras({ mediaType: tmdbMediaType(p.kind), tmdbId: p.tmdbId }, TMDB_WAIT_MS)
      : null;
  if (missing && tmdb?.imdbId) {
    const base = baseMarkers(await segmentsOf({ imdbId: tmdb.imdbId, season: p.season, episode: p.episode }), file.duration);
    intro ??= base.intro;
    credits ??= base.credits;
  }
  // A movie ends where its credits start only when TMDB's keywords are known and announce no scene during or
  // after them; an episode always, nothing announces otherwise.
  if (movie && !(tmdb && !tmdb.creditsScene)) credits = null;
  return { intro, credits };
}
