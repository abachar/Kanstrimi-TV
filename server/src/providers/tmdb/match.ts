import type { TmdbDetails, TmdbSearchResult } from "./client";
import { similarity, similarityKey } from "@/shared";

export { similarity };

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

export type ScoredDetail = { result: TmdbSearchResult; score: number; similarity: number; year?: number };

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

export const MATCH_THRESHOLD = 0.72;

/**
 * A provider-supplied TMDB id is a hint, not a fact: it is accepted when the title resembles the
 * cleaned name (this threshold), or when cast, image, trailer or director agree (`idEvidence`).
 * Looser than the search threshold because the id already narrows the field; the check only has
 * to catch a wrong film, not a wrong spelling.
 */
export const ID_THRESHOLD = 0.55;

/** What the provider says of an entry: its cleaned name and the raw fields it sent. */
export type EntryClues = { name: string; cleanTitle: string | null; year: number | null; raw: Record<string, unknown> };

export type Evidence = {
  similarity: number;
  yearOk: boolean | null;
  castOverlap: number;
  directorMatch: boolean;
  imageMatch: boolean;
  trailerMatch: boolean;
  accepted: boolean;
  reasons: string[];
};

const splitNames = (v: unknown) =>
  String(v ?? "")
    .split(/[,;/]+/)
    .map((x) => similarityKey(x))
    .filter((x) => x.length > 2);
/** "…/eDB1CCNcxnFANadgiWyFlzaqvK6..jpg" or "/eDB1CCNcxnFANadgiWyFlzaqvK6.jpg" → the TMDB file hash. */
const imageHash = (u: unknown) => {
  const m = /([A-Za-z0-9_-]{20,})\.*\.(?:jpg|jpeg|png|webp)$/i.exec(String(u ?? ""));
  return m ? m[1] : null;
};

/**
 * Is the TMDB document really this entry? Titles first; when they disagree (the provider
 * uses a platform title TMDB never recorded), the other things it sends decide: the cast,
 * the director, the year, the TMDB image hashes it copied, the trailer key.
 */
export function idEvidence(d: TmdbDetails, it: EntryClues): Evidence {
  const title = it.cleanTitle || it.name;
  const similarity = bestSimilarity(d, title);
  const raw = it.raw ?? {};
  const ry = Number((d.release_date ?? d.first_air_date ?? "").slice(0, 4)) || null;
  const py = it.year ?? (Number(String(raw.year ?? raw.releaseDate ?? raw.release_date ?? "").slice(0, 4)) || null);
  const yearOk = ry && py ? Math.abs(ry - py) <= 1 : null;
  const tmdbCast = new Set((d.credits?.cast ?? []).slice(0, 15).map((c) => similarityKey(c.name)));
  const castOverlap = splitNames(raw.cast).filter((n) => tmdbCast.has(n)).length;
  const tmdbDirectors = new Set([
    ...(d.credits?.crew ?? []).filter((c) => c.job === "Director").map((c) => similarityKey(c.name)),
    ...((d as { created_by?: { name: string }[] }).created_by ?? []).map((c) => similarityKey(c.name)),
  ]);
  const directorMatch = splitNames(raw.director).some((n) => tmdbDirectors.has(n));
  const tmdbImages = new Set(
    [
      d.backdrop_path,
      d.poster_path,
      ...(d.images?.backdrops ?? []).map((i) => i.file_path),
      ...(d.images?.posters ?? []).map((i) => i.file_path),
    ]
      .map(imageHash)
      .filter(Boolean),
  );
  const providerImages = [
    ...(Array.isArray(raw.backdrop_path) ? raw.backdrop_path : [raw.backdrop_path]),
    raw.cover,
    raw.stream_icon,
    raw.movie_image,
  ]
    .map(imageHash)
    .filter(Boolean);
  const imageMatch = providerImages.some((h) => tmdbImages.has(h));
  const trailer = String(raw.youtube_trailer ?? "").trim();
  const trailerMatch = Boolean(trailer) && (d.videos?.results ?? []).some((v) => v.site === "YouTube" && v.key === trailer);

  const reasons: string[] = [];
  if (similarity >= MATCH_THRESHOLD) reasons.push(`titre ${Math.round(similarity * 100)} %`);
  else if (similarity >= ID_THRESHOLD && yearOk !== false) reasons.push(`titre ${Math.round(similarity * 100)} % et année compatible`);
  if (imageMatch) reasons.push("image TMDB identique");
  if (trailerMatch) reasons.push("bande-annonce identique");
  if (castOverlap >= 2) reasons.push(`${castOverlap} acteurs en commun`);
  else if (castOverlap === 1 && (yearOk || directorMatch))
    reasons.push(`1 acteur en commun et ${directorMatch ? "même réalisateur" : "même année"}`);
  if (directorMatch && yearOk && !reasons.length) reasons.push("même réalisateur et même année");
  return { similarity, yearOk, castOverlap, directorMatch, imageMatch, trailerMatch, accepted: reasons.length > 0, reasons };
}
