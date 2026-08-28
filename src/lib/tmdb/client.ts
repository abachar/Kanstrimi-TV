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
};

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

  searchMovie(query: string, year?: number) {
    return this.get<{ results: TmdbSearchResult[] }>("/search/movie", { query, year, include_adult: "false" });
  }
  searchTv(query: string, year?: number) {
    return this.get<{ results: TmdbSearchResult[] }>("/search/tv", { query, first_air_date_year: year, include_adult: "false" });
  }
  movie(id: number) {
    return this.get<TmdbDetails>(`/movie/${id}`, { append_to_response: "credits,videos,release_dates" });
  }
  tv(id: number) {
    return this.get<TmdbDetails>(`/tv/${id}`, { append_to_response: "credits,videos,content_ratings" });
  }
  tvSeason(id: number, season: number) {
    return this.get<{ episodes?: Record<string, unknown>[] }>(`/tv/${id}/season/${season}`);
  }
  /** Quick connectivity check. */
  async ping() { await this.get("/configuration"); }
}
