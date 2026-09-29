import type { TmdbDetails } from "./client";
import { englishTitleOf, namesOf } from "./match";

/** What `contents` keeps of a TMDB details document. Pure. */
export type CardFields = {
  title: string;
  originalTitle: string | null;
  titleEn: string | null;
  year: number | null;
  endYear: number | null;
  posterPath: string | null;
  backdropPath: string | null;
  overview: string | null;
  rating: number | null;
  voteCount: number | null;
  genreIds: number[];
  genres: string[];
  runtime: number | null;
  certification: string | null;
  cast: { name: string; role: string | null }[];
  director: string | null;
  trailerKey: string | null;
  status: string | null;
  /** Every name the work is known by, for the search index: titles in all languages, capped. */
  names: string[];
  adult: boolean;
  releaseDate: string | null;
  /** Movies: the TMDB collection it belongs to. */
  saga: { id: number; name: string; posterPath: string | null; backdropPath: string | null } | null;
  /** Studio hubs: production companies, and the networks of a series. */
  companyIds: number[];
  networkIds: number[];
};

const yearOf = (d?: string) => {
  const y = Number((d ?? "").slice(0, 4));
  return y > 1800 ? y : null;
};

export function certificationOf(d: TmdbDetails, lang: string): string | null {
  const cc = lang.split("-")[1] ?? "US";
  const pick = <T extends { iso_3166_1: string }>(list?: T[]) =>
    list?.find((x) => x.iso_3166_1 === cc) ?? list?.find((x) => x.iso_3166_1 === "US");
  const r = pick(d.release_dates?.results);
  const cert = r?.release_dates?.find((x) => x.certification)?.certification;
  if (cert) return cert;
  return pick(d.content_ratings?.results)?.rating || null;
}

export function trailerKeyOf(d: TmdbDetails): string | null {
  const vids = d.videos?.results ?? [];
  const v =
    vids.find((x) => x.site === "YouTube" && x.type === "Trailer" && x.official) ??
    vids.find((x) => x.site === "YouTube" && x.type === "Trailer") ??
    vids.find((x) => x.site === "YouTube");
  return v?.key ?? null;
}

export function cardFields(mediaType: "movie" | "tv", d: TmdbDetails, lang: string, fallbackTitle: string): CardFields {
  const movie = mediaType === "movie";
  const ended = /^(Ended|Canceled)$/i.test(d.status ?? "");
  const createdBy = (d as { created_by?: { name: string }[] }).created_by ?? [];
  const director = movie
    ? (d.credits?.crew ?? [])
        .filter((c) => c.job === "Director")
        .map((c) => c.name)
        .join(", ")
    : createdBy.map((c) => c.name).join(", ");
  const runtime = movie ? (d.runtime ?? null) : (d.episode_run_time?.[0] ?? null);
  const rawDate = movie ? d.release_date : d.first_air_date;
  return {
    title: (movie ? d.title : d.name) || fallbackTitle,
    originalTitle: (movie ? d.original_title : d.original_name) || null,
    titleEn: englishTitleOf(d),
    year: yearOf(rawDate),
    endYear: !movie && ended ? yearOf(d.last_air_date) : null,
    posterPath: d.poster_path ?? null,
    backdropPath: d.backdrop_path ?? null,
    overview: d.overview || null,
    rating: d.vote_average ? Math.round(d.vote_average * 10) / 10 : null,
    voteCount: d.vote_count ?? null,
    genreIds: (d.genres ?? []).map((g) => g.id),
    genres: (d.genres ?? []).map((g) => g.name),
    runtime: runtime || null,
    certification: certificationOf(d, lang),
    cast: (d.credits?.cast ?? []).slice(0, 10).map((c) => ({ name: c.name, role: c.character || null })),
    director: director || null,
    trailerKey: trailerKeyOf(d),
    status: d.status ?? null,
    names: namesOf(d).slice(0, 24),
    adult: d.adult === true,
    releaseDate: rawDate && rawDate.length >= 10 ? rawDate.slice(0, 10) : null,
    saga: sagaOf(d),
    companyIds: idsOf(d.production_companies),
    networkIds: movie ? [] : idsOf(d.networks),
  };
}

function sagaOf(d: TmdbDetails): CardFields["saga"] {
  const c = d.belongs_to_collection;
  if (!c || !Number.isInteger(c.id) || !c.name) return null;
  return { id: c.id, name: c.name, posterPath: c.poster_path ?? null, backdropPath: c.backdrop_path ?? null };
}

const idsOf = (list?: { id: number }[]) => [...new Set((list ?? []).map((x) => x.id).filter(Number.isInteger))];
