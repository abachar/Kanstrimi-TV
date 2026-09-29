import type { TmdbSearchResult } from "./client";
import { similarity } from "@/shared";

export { similarity };

export type Scored = { result: TmdbSearchResult; score: number };

type Named = {
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  original_language?: string;
  alternative_titles?: { titles?: { iso_3166_1?: string; title: string }[]; results?: { iso_3166_1?: string; title: string }[] };
  translations?: { translations?: { iso_639_1?: string; data?: { title?: string; name?: string } }[] };
};
/** Every name a TMDB document answers to: localised title, original title, alternative and translated titles. */
export function namesOf(d: Named): string[] {
  const alt = [...(d.alternative_titles?.titles ?? []), ...(d.alternative_titles?.results ?? [])].map((t) => t.title);
  const tr = (d.translations?.translations ?? []).map((t) => t.data?.title || t.data?.name);
  return [...new Set([d.title, d.name, d.original_title, d.original_name, ...alt, ...tr].filter(Boolean) as string[])];
}
/** The English title: the `en` translation, else a US/GB alternative title, else the original when it is English. */
export function englishTitleOf(d: Named): string | null {
  const tr = (d.translations?.translations ?? []).find((t) => t.iso_639_1 === "en");
  const t = tr?.data?.title || tr?.data?.name;
  if (t) return t;
  const alt = [...(d.alternative_titles?.titles ?? []), ...(d.alternative_titles?.results ?? [])].find(
    (a) => a.iso_3166_1 === "US" || a.iso_3166_1 === "GB",
  );
  if (alt?.title) return alt.title;
  return d.original_language === "en" ? (d.original_title ?? d.original_name ?? null) : null;
}
/** Does the cached document carry every kind of name we compare against? Older ones need one refresh. */
export function hasAllNames(d: Named): boolean {
  return Boolean(d.alternative_titles && d.translations);
}
export function bestSimilarity(d: Named, title: string): number {
  return Math.max(0, ...namesOf(d).map((n) => similarity(n, title)));
}

export type ScoredDetail = Scored & { similarity: number; year?: number };

/** Every search result with its score: similarity, ± year, + a pinch of popularity. */
export function scoreAll(results: TmdbSearchResult[], title: string, year?: number): ScoredDetail[] {
  return results
    .map((r) => {
      const names = [r.title, r.name, r.original_title, r.original_name].filter(Boolean) as string[];
      const sim = Math.max(0, ...names.map((n) => similarity(n, title)));
      const ry = Number((r.release_date ?? r.first_air_date ?? "").slice(0, 4)) || undefined;
      let score = sim;
      if (year && ry) score += Math.abs(ry - year) <= 1 ? 0.15 : -0.2;
      score += Math.min((r.vote_count ?? 0) / 5000, 0.05);
      return { result: r, score, similarity: sim, year: ry };
    })
    .sort((a, b) => b.score - a.score);
}

/** Pick the best TMDB search result for a cleaned title (+ optional year). */
export function pickBest(results: TmdbSearchResult[], title: string, year?: number): Scored | null {
  const [best] = scoreAll(results, title, year);
  return best ? { result: best.result, score: best.score } : null;
}

export const MATCH_THRESHOLD = 0.72;
