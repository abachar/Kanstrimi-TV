import { type MarkerSegment, tmdbMediaType } from "@/db";
import { introdbSegments } from "@/providers/introdb";
import { segmentsOf } from "@/providers/skipdb";
import { theintrodbSegments } from "@/providers/theintrodb";
import { extras } from "@/providers/tmdb";
import { stripAccents } from "@/shared";
import { parseKey } from "./keys";

/**
 * Where the recap, the intro and the end credits of a file are: « Passer le récap », « Passer l'intro », and
 * « À suivre » shown when the credits start rather than in the last seconds. The player says what it read in the file it opened (its
 * length and its chapters, in seconds); nothing here opens a file. The chapters of the file come first, then
 * the public bases of markers: SkipDB, imported whole, then TheIntroDB and IntroDB, asked title by title for
 * what is still missing. The start of the credits is given only when it is sure, a wrong one
 * would cut the end of the title: a named chapter, or a base that measured a file of the same length. A
 * recap and an intro are given even unchecked: a button badly placed costs nothing. A recap is an episode's.
 */

export type FileChapter = { name: string; start: number; end: number };
export type FileFacts = { duration: number; chapters: FileChapter[] };
type Span = { start: number; end: number };
/** `recap` and `intro` never overlap. `credits`: where the end credits start, nothing but them until the end of the file. */
export type Markers = { recap: Span | null; intro: Span | null; credits: number | null };

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
const RECAP_NAMES = new Set(["recap", "previously", "previously on", "precedemment", "resume"]);
const CREDITS_NAMES = new Set(["credits", "end credits", "closing credits", "ending credits", "ending", "ed", "outro", "generique de fin"]);
/** Says neither which: the half of the file it starts in decides. */
const EITHER_NAMES = new Set(["generique"]);

const INTRO_MIN_SECONDS = 2;
const INTRO_MAX_SECONDS = 10 * 60;
/** Credits shorter than this are left to the last seconds of the file, as without a marker. */
const CREDITS_MIN_SECONDS = 30;
/** Two files this close in length are the same release: what was measured on one holds on the other. */
const SAME_FILE_SECONDS = 3;
/** Two moments this close are the same: credits end with the file, a preview starts where the credits end. */
const SEAM_SECONDS = 10;
/** The player waits this long for TMDB (a movie's keywords, the IMDb id); past it, it goes without this time. */
const TMDB_WAIT_MS = 3000;
/** And this long for TheIntroDB and IntroDB, asked together, whose answers are then kept for the next time. */
const BASES_WAIT_MS = 2500;

/** A recap or an intro in the first half of the file, of a believable length; null otherwise. */
function openingIn(start: number, end: number, duration: number): Span | null {
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
  const recap = chapters.find((c) => c.start < duration / 2 && RECAP_NAMES.has(nameKey(c.name)));
  // The last chapter only: after a « Credits » chapter followed by another one, something still plays.
  const last = chapters.at(-1);
  return {
    recap: recap ? openingIn(recap.start, recap.end, duration) : null,
    intro: opening ? openingIn(opening.start, opening.end, duration) : null,
    credits: last && creditsIn(last.start, duration) && named(last, CREDITS_NAMES) ? last.start : null,
  };
}

/**
 * What the bases say of a file `duration` long. The credits: only when measured on a file of that length, with
 * nothing after them to the end of the file but the preview of the next episode; the latest start when several.
 * Credits ending earlier are followed by a scene. The recap and the intro: one measured on a file of that length,
 * else the one whose file was the closest.
 */
export function baseMarkers(segments: MarkerSegment[], duration: number): Markers {
  const gap = (s: MarkerSegment) => (s.measuredOn === null ? Number.POSITIVE_INFINITY : Math.abs(s.measuredOn - duration));
  const sameFile = segments.filter((s) => gap(s) <= SAME_FILE_SECONDS);
  const toTheEnd = (s: MarkerSegment) => s.end === null || s.end >= duration - SEAM_SECONDS;
  const previewAfter = (end: number) =>
    sameFile.some((s) => s.kind === "preview" && Math.abs(s.start - end) <= SEAM_SECONDS && toTheEnd(s));
  const opening = (kind: "recap" | "intro") => {
    const [closest] = segments
      .filter((s) => s.kind === kind && s.end !== null && openingIn(s.start, s.end, duration))
      .sort((a, b) => gap(a) - gap(b));
    return closest ? openingIn(closest.start, closest.end as number, duration) : null;
  };
  const credits = sameFile
    .filter((s) => s.kind === "credits" && creditsIn(s.start, duration) && (toTheEnd(s) || previewAfter(s.end as number)))
    .map((s) => s.start);
  return { recap: opening("recap"), intro: opening("intro"), credits: credits.length ? Math.max(...credits) : null };
}

/**
 * The recap and the intro side by side. A recap comes before the intro: when the bases make them overlap (an intro
 * timed from the start of the file, recap included), the intro starts where the recap ends, and goes when nothing
 * believable is left of it.
 */
function apart(recap: Span | null, intro: Span | null, duration: number): Pick<Markers, "recap" | "intro"> {
  const overlap = recap && intro && recap.end > intro.start && intro.end > recap.start;
  return { recap, intro: overlap ? openingIn(recap.end, intro.end, duration) : intro };
}

/** The markers of the file the player opened for `key` (a movie or an episode). */
export async function markersOf(key: string, file: FileFacts): Promise<Markers> {
  const p = parseKey(key);
  const movie = p?.kind === "vod";
  if (!p || !(movie || p.episode !== undefined)) return { recap: null, intro: null, credits: null };
  let { recap, intro, credits } = chapterMarkers(file);
  if (movie) recap = null;
  // A file that names its intro and its credits says it all: no recap is looked for elsewhere.
  const missing = intro === null || credits === null;
  // TMDB is asked only for what it is needed for: the IMDb id the bases know a title by, a movie's keywords.
  const tmdb =
    p.tmdbId !== undefined && (missing || movie)
      ? await extras({ mediaType: tmdbMediaType(p.kind), tmdbId: p.tmdbId }, TMDB_WAIT_MS)
      : null;
  if (missing && tmdb?.imdbId) {
    const base = baseMarkers(await segmentsOf({ imdbId: tmdb.imdbId, season: p.season, episode: p.episode }), file.duration);
    if (!movie) recap ??= base.recap;
    intro ??= base.intro;
    credits ??= base.credits;
  }
  const opening = intro === null || (missing && !movie && recap === null);
  // What is still missing is asked of the two bases together: the player waits once.
  // A movie's credits are of no use when a scene follows them: not worth a question.
  const fromTheIntroDB =
    p.tmdbId !== undefined && (opening || (credits === null && !(movie && tmdb?.creditsScene !== false)))
      ? theintrodbSegments(
          { mediaType: tmdbMediaType(p.kind), tmdbId: p.tmdbId, season: p.season, episode: p.episode },
          file.duration,
          BASES_WAIT_MS,
        )
      : [];
  // IntroDB names no file: the recap and the intro of an episode, nothing else.
  const fromIntroDB =
    opening && tmdb?.imdbId && p.season !== undefined && p.episode !== undefined
      ? introdbSegments({ imdbId: tmdb.imdbId, season: p.season, episode: p.episode }, BASES_WAIT_MS)
      : [];
  // TheIntroDB first: its recap and its intro win over IntroDB's, measured on no known file.
  const base = baseMarkers((await Promise.all([fromTheIntroDB, fromIntroDB])).flat(), file.duration);
  if (!movie) recap ??= base.recap;
  intro ??= base.intro;
  credits ??= base.credits;
  // A movie ends where its credits start only when TMDB's keywords are known and announce no scene during or
  // after them; an episode always, nothing announces otherwise.
  if (movie && !(tmdb && !tmdb.creditsScene)) credits = null;
  return { ...apart(recap, intro, file.duration), credits };
}
