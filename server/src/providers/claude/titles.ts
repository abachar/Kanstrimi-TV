import { z } from "zod";
import { cleanText, readNames } from "./read";

/**
 * Claude reads the names TMDB does not recognise: a transliterated Arabic title, a documentary with
 * its subtitle glued on, a platform title TMDB never recorded. It answers with what to search, never
 * with a TMDB id (it would make one up): the title TMDB would know, the original title, the year, or
 * `other` for what TMDB does not list at all (a concert, a fight night, a karaoke track, a course).
 * The catalogue then searches TMDB with these and judges the candidates as it does any other.
 */

/** One entry as the provider names it, with the category it sits in and the year the grammar read. */
export type TitleQuery = { id: number; kind: "vod" | "series"; name: string; category: string | null; year: number | null };
export type TitleSuggestion = {
  id: number;
  /** What the name is: a movie, a series, or something TMDB does not list. */
  kind: "movie" | "series" | "other";
  /** The title TMDB would know (its English title for an Arabic film); null when the model cannot tell. */
  title: string | null;
  originalTitle: string | null;
  year: number | null;
};

const Answer = z.object({
  entries: z.array(
    z.object({
      id: z.number().int(),
      kind: z.enum(["movie", "series", "other"]),
      title: z.string().nullable(),
      original_title: z.string().nullable(),
      year: z.number().int().nullable(),
    }),
  ),
});

const SYSTEM = `You identify movies and TV series from the raw entry names of an IPTV provider, so that they can be looked up on TMDB (The Movie Database). The names come from French and Arabic-market providers: a prefix in pipes gives the language or market (|FR|, |AR|, |VO|STFR|, |EN|), the title may be a Latin transliteration of an Arabic title followed by the Arabic title, a year may appear in parentheses or between pipes, a country code may close the line.

For each entry, answer:
- kind: "movie" or "series" when TMDB lists this kind of work (films, TV series, anime, documentaries, TV films, stand-up specials and filmed plays count); "other" for what TMDB does not list: concerts and live music, karaoke tracks, sports events and fight nights, courses and lessons, TV programmes that are not series, home-made compilations.
- title: the title under which TMDB knows the work, in English when the original language is not English or French (Egyptian and Gulf films and series are usually listed under an English title), without the provider's decorations (prefixes, quality tags, years, subtitles glued to a franchise name such as "Les secrets de"). null when you cannot identify the work.
- original_title: the title in the original language and script (Arabic script for Arabic works) when you know it, else null.
- year: the release year (first air year for a series) when you know it or the name gives it, else null.

Use the category as a hint for the kind. Never invent a title you are not reasonably sure of: null is the right answer when unsure. Return one entry per id given, with the same ids.`;

const line = (q: TitleQuery) =>
  `#${q.id} · ${q.kind === "vod" ? "movie entry" : "series entry"}${q.category ? ` · category « ${q.category} »` : ""}${q.year ? ` · year read: ${q.year}` : ""}\n${q.name}`;

/**
 * The suggestions of the model for these entries; an entry it did not answer is missing from the
 * result. Null without a key (`readNames`).
 */
export async function suggestTitles(queries: TitleQuery[]): Promise<TitleSuggestion[] | null> {
  const entries = await readNames(queries, SYSTEM, Answer, line);
  return (
    entries?.map((e) => ({
      id: e.id,
      kind: e.kind,
      title: cleanText(e.title),
      originalTitle: cleanText(e.original_title),
      year: e.year ?? null,
    })) ?? null
  );
}
