/**
 * Wire types of `/player`: this file is the contract, `apple/kanstrimi/Contract/` decodes
 * exactly these shapes. snake_case, ISO dates, explicit null where the
 * app expects a value, absent where it does not.
 */
export type Kind = "movie" | "series" | "episode" | "live";
export type Quality = "SD" | "HD" | "FHD" | "4K";
export type DynamicRange = "HDR" | "DV";

export type Provider = { id: string; name: string; kind: "xtream" | "local" | (string & {}) };
export type Source = { id: string; container: string; stream_url: string; provider: Provider; origin: string | null };
export type Version = { id: string; language: string; quality: Quality; dynamic_range?: DynamicRange; sources: Source[] };

export type ProgressWire = { position: number; duration: number; finished?: boolean };
export type EpisodeRef = { season: number; number: number; title: string | null };
export type Person = { name: string; role: string | null };

export type EpisodeWire = {
  id: string;
  season: number;
  number: number;
  title: string;
  overview: string | null;
  runtime: number | null;
  still: string | null;
  air_date: string | null;
  versions: Version[];
  progress: ProgressWire | null;
};
export type SeasonWire = { number: number; title: string | null; year: number | null; episodes: EpisodeWire[] };

export type Card = {
  id: string;
  kind: Kind;
  title: string;
  poster?: string | null;
  max_quality?: Quality;
  dynamic_range?: DynamicRange;
  languages?: string[];
  backdrop?: string | null;
  /** Sheet: the title's logo (transparent PNG), drawn in place of the title; null = the title as text. */
  logo?: string | null;
  progress?: ProgressWire | null;
  episode?: EpisodeRef;
  year?: number | null;
  rating?: number | null;
  genres?: string[];
  hint?: string | null;
  added_at?: string;
  original_title?: string | null;
  end_year?: number | null;
  overview?: string | null;
  runtime?: number | null;
  certification?: string | null;
  cast?: Person[];
  director?: string | null;
  trailer?: string | null;
  has_tmdb?: boolean;
  provider_category?: string | null;
  raw_title?: string | null;
  versions?: Version[];
  is_favorite?: boolean;
  seasons?: SeasonWire[];
  current_episode?: EpisodeRef | null;
  /** Movie sheet: its saga, present only when two of its movies are visible. */
  saga?: SagaRef;
};

/** A TMDB collection with at least two visible movies. `id` = `saga:<TMDB collection id>`. */
export type SagaRef = { id: string; name: string; count: number };
export type SagaWire = SagaRef & { poster: string | null; backdrop: string | null };
/** `/movies/sagas`: freshest first. */
export type SagaPage = { items: SagaWire[]; next_cursor: string | null; total: number };
/**
 * `/movies/studios`, `/series/studios`: the studio hubs chosen in the admin that hold visible titles
 * of that kind, in the admin's order. `id` = `company:<TMDB id>` or `network:<TMDB id>`, the
 * `studio` filter of `/movies` and `/series`.
 */
export type StudioWire = { id: string; name: string; logo: string | null; count: number };
/** `/movies/sagas/{id}`: the saga and its visible movies, oldest release first. */
export type SagaSheet = SagaWire & { movies: Card[] };

export type Programme = { title: string; start: string; end: string; overview?: string | null };
export type ChannelWire = {
  id: string;
  name: string;
  number: number | null;
  logo: string | null;
  max_quality?: Quality;
  has_epg: boolean;
  is_favorite: boolean;
  versions: Version[];
  now?: Programme | null;
  next?: Programme | null;
};
export type ChannelGroupWire = { id: string; name: string; channels: ChannelWire[] };

export type HomeRow = {
  id: string;
  kind: "resume" | "recent_movies" | "recent_series" | "favorites" | "collection";
  title: string;
  cards: Card[];
};
export type HomeHero = {
  card: Card;
  tagline: string;
  overview: string | null;
  runtime: number | null;
  certification: string | null;
  versions: Version[];
};
export type Home = { hero: HomeHero | null; rows: HomeRow[]; generated_at: string };

export type CatalogRow = { id: string; name: string; total: number } & ({ movies: Card[] } | { series: Card[] });
export type Page = { items: Card[]; next_cursor: string | null };

export type NextEpisode = {
  id: string;
  title: string | null;
  season: number;
  number: number;
  runtime: number | null;
  languages: string[];
  max_quality?: Quality;
  dynamic_range?: DynamicRange;
  still: string | null;
};
export type Playback = { versions: Version[]; resume_at: number | null; duration: number | null; next: NextEpisode | null };

export type SearchResults = { query: string; best: Card | null; movies: Card[]; series: Card[]; live: Card[] };

export type ServerInfo = {
  server_version: string;
  counts: { movies: number; series: number; channels: number };
  last_import: string | null;
  tmdb_rate: number | null;
  catalog_languages: string[];
  default_language_order: string[];
};

export type ApiError = {
  error: { code: "unauthorized" | "not_found" | "bad_request" | "upstream" | "locked" | "too_many_requests"; message: string };
};
