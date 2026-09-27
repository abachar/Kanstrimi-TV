export type TmdbSearchResult = {
  id: number; title?: string; name?: string; original_title?: string; original_name?: string;
  release_date?: string; first_air_date?: string; popularity?: number; vote_count?: number; poster_path?: string | null;
};
export type TmdbDetails = Record<string, unknown> & {
  id: number; title?: string; name?: string; original_title?: string; original_name?: string;
  overview?: string; tagline?: string; poster_path?: string | null; backdrop_path?: string | null;
  release_date?: string; first_air_date?: string; last_air_date?: string; runtime?: number;
  episode_run_time?: number[]; vote_average?: number; vote_count?: number; genres?: { id: number; name: string }[];
  status?: string; number_of_seasons?: number; number_of_episodes?: number;
  production_countries?: { iso_3166_1: string; name: string }[]; origin_country?: string[];
  credits?: { cast?: { name: string; character?: string; order?: number }[]; crew?: { name: string; job: string }[] };
  videos?: { results?: { key: string; site: string; type: string; official?: boolean }[] };
  images?: { backdrops?: { file_path: string }[]; posters?: { file_path: string }[]; logos?: { file_path: string }[] };
  release_dates?: { results?: { iso_3166_1: string; release_dates: { certification: string }[] }[] };
  content_ratings?: { results?: { iso_3166_1: string; rating: string }[] };
  /** Movies answer `titles`, series `results`: the international English title lives here when the original is not English. */
  alternative_titles?: { titles?: { iso_3166_1: string; title: string }[]; results?: { iso_3166_1: string; title: string }[] };
  /** Titles per language (the English one names the TMDB URL); overviews are dropped before caching. */
  translations?: { translations?: { iso_639_1: string; iso_3166_1?: string; data?: { title?: string; name?: string; overview?: string } }[] };
};

/**
 * Keep the translated titles and the image file names only: the full payload repeats every
 * overview in forty languages and describes every image. Both serve one purpose here,
 * recognising the provider's entry (its English title, its TMDB backdrop hashes).
 */
export function trimTranslations(d: TmdbDetails): TmdbDetails {
  const list = (d.translations?.translations ?? [])
    .map((t) => ({ iso_639_1: t.iso_639_1, iso_3166_1: t.iso_3166_1, data: { title: t.data?.title || t.data?.name || undefined } }))
    .filter((t) => t.data.title);
  const files = (l?: { file_path: string }[]) => (l ?? []).slice(0, 40).map((i) => ({ file_path: i.file_path }));
  return { ...d, translations: { translations: list }, images: { backdrops: files(d.images?.backdrops), posters: files(d.images?.posters) } };
}

export class TmdbClient {
  constructor(readonly apiKey: string, readonly language = "fr-FR") {}

  private async get<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
    const u = new URL("https://api.themoviedb.org/3" + path);
    u.searchParams.set("language", this.language);
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") u.searchParams.set(k, String(v));
    const headers: Record<string, string> = { Accept: "application/json" };
    // v4 read token (long JWT) or v3 api key
    if (this.apiKey.length > 40) headers.Authorization = `Bearer ${this.apiKey}`;
    else u.searchParams.set("api_key", this.apiKey);
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(u, { headers, signal: AbortSignal.timeout(20_000) });
      if (res.status === 429 && attempt < 3) {
        const wait = Number(res.headers.get("retry-after") ?? 2) * 1000;
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) throw new Error(`TMDB ${path}: HTTP ${res.status}`);
      return (await res.json()) as T;
    }
  }

  /** `includeAdult`: TMDB hides adult-flagged titles from searches unless asked; the website hides them altogether. */
  searchMovie(query: string, year?: number, includeAdult = false) {
    return this.get<{ results: TmdbSearchResult[] }>("/search/movie", { query, year, include_adult: includeAdult ? "true" : "false" });
  }
  searchTv(query: string, year?: number, includeAdult = false) {
    return this.get<{ results: TmdbSearchResult[] }>("/search/tv", { query, first_air_date_year: year, include_adult: includeAdult ? "true" : "false" });
  }
  movie(id: number) {
    return this.get<TmdbDetails>(`/movie/${id}`, { append_to_response: "credits,videos,release_dates,alternative_titles,translations,images" }).then(trimTranslations);
  }
  tv(id: number) {
    return this.get<TmdbDetails>(`/tv/${id}`, { append_to_response: "credits,videos,content_ratings,alternative_titles,translations,images" }).then(trimTranslations);
  }
  tvSeason(id: number, season: number) {
    return this.get<{ episodes?: Record<string, unknown>[] }>(`/tv/${id}/season/${season}`);
  }
  /** Quick connectivity check. */
  async ping() { await this.get("/configuration"); }
}
