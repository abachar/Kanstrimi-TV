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
/**
 * `edition`: a cut other than the theatrical one (« Version longue », « Director's Cut »), absent for the usual cut.
 * Live: `has_epg`, `now`, `next` when this quality's guide is not the channel's (« M6 4K » has its own);
 * absent, the channel's apply. `chip`: the version's chip, « FHD », or « FHD/EN » when the channel mixes languages.
 */
export type Version = {
  id: string;
  language: string;
  quality: Quality;
  chip?: string;
  dynamic_range?: DynamicRange;
  edition?: string;
  sources: Source[];
  has_epg?: boolean;
  now?: Programme | null;
  next?: Programme | null;
};

export type ProgressWire = { position: number; duration: number; finished?: boolean };
export type EpisodeRef = { season: number; number: number; title: string | null };
/** `id` = `person:<TMDB id>`, null until the sheet has been copied again (no link to their titles). */
export type Person = { id: string | null; name: string; role: string | null; photo: string | null };

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
  /**
   * What its card and its row draw: the still, the progress, « vu »; the sheet's row adds `facts` (« 52 min · 12 min
   * restantes », « 52 min · Vu »), `badges` (« 4K HDR », « VF »…), `overview`, and `hint` (« VF SEUL ») with its
   * only language, shown when the series' chosen language is another.
   */
  item: ContentItem;
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
  /** Sheet: « Si vous avez aimé… », TMDB's recommendations in the catalogue, nothing already seen, ten at most. */
  related?: ContentItem[];
};

/**
 * What a content card draws, written here: the app lays it out and decides nothing. A list item; the
 * sheet stays a `Card`. `kind` says where a click goes (the sheet, the saga). Texts are final:
 * `facts` « 2019 · ★ 8.5 », « 3 films »; `badges` « 4K DV », « VF », « VOSTFR », in order;
 * `caption` « 1 h 08 restantes ». `progress` (0…1) only while resumable.
 */
export type ContentItem = {
  id: string;
  kind: Kind | "saga";
  title: string;
  logo: string | null;
  poster: string | null;
  picture: string | null;
  facts: string | null;
  badges: string[];
  hint: string | null;
  progress: number | null;
  watched: boolean;
  caption: string | null;
  /** Where the card tells it: the carousel, « À suivre », an episode row; null in the lists. */
  overview: string | null;
};

/** A TMDB collection with at least two visible movies. `id` = `saga:<TMDB collection id>`. */
export type SagaRef = { id: string; name: string; count: number };
export type SagaWire = SagaRef & { poster: string | null; backdrop: string | null };
/** `/movies/sagas`: freshest first. */
export type SagaPage = { items: ContentItem[]; next_cursor: string | null; total: number };
/**
 * `/movies/studios`, `/series/studios`: the studio hubs chosen in the admin that hold visible titles
 * of that kind, in the admin's order. `id` = `company:<TMDB id>` or `network:<TMDB id>`, the
 * `studio` filter of `/movies` and `/series`. `backdrop`: that of its latest visible title, the
 * background of the studio's screen.
 */
export type StudioWire = { id: string; name: string; logo: string | null; count: number; backdrop: string | null };
/** `/movies/sagas/{id}`: the saga, its header (« SAGA », « 3 films ») and its visible movies, latest release first. */
export type SagaSheet = SagaWire & { heading: string; facts: string; movies: ContentItem[] };
/** `/people/{id}`: an actor and their visible titles, latest release first. */
export type PersonSheet = { id: string; name: string; photo: string | null; movies: ContentItem[]; series: ContentItem[] };

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
  /** 1 = the most watched over the last 30 days (« Les plus regardées », 10 channels at most); absent otherwise. */
  watched_rank?: number;
};
/**
 * A country (« Maroc », the market name) and a theme (« Sport »); `name` = « Maroc · Sport », kept
 * for the apps that split it themselves.
 */
export type ChannelGroupWire = { id: string; name: string; section: string; theme: string; channels: ChannelWire[] };

export type HomeRow = {
  id: string;
  kind: "resume" | "most_watched_channels" | "recommended" | "recent_movies" | "recent_series" | "favorites" | "collection";
  title: string;
  cards: ContentItem[];
};
/**
 * A slide of the home carousel. `item` is what it draws and what Fiche opens (the series for a new episode):
 * its picture, logo, « S2 É5 · 2026 · Drame · 2 h 16 », `progress` when it resumes. `play_id` is what Lecture
 * plays, `versions`, `runtime`, `resume_at` and `duration` (seconds) being that title's own; `episode` names
 * the episode played. `tagline`: what the slide is, « FILM · N° 1 CETTE SEMAINE ».
 */
export type HomeHero = {
  item: ContentItem;
  tagline: string;
  overview: string | null;
  runtime: number | null;
  certification: string | null;
  versions: Version[];
  play_id: string;
  episode?: EpisodeRef;
  is_favorite: boolean;
  resume_at: number | null;
  duration: number | null;
};
/**
 * `heroes`: the Top Shelf without the title in progress (« Reprendre » is a row), at most six; the
 * newest « Nouveautés » when it has none.
 */
export type Home = { heroes: HomeHero[]; rows: HomeRow[]; generated_at: string };

/**
 * `/top-shelf`: the full-screen carousel of the Apple TV home screen, six items at most, in order: the
 * movies of the « Liste d'attente » that arrived and are not started, the last title in progress, a
 * series started that has a new episode, then the week's top movies.
 * `play_id` is what Lecture plays (an episode for a series), `open_id` the sheet Plus d'infos opens.
 */
export type TopShelfItem = {
  id: string;
  reason: "available" | "resume" | "new_episode" | "top";
  /** Above the title: « Enfin disponible », « Reprendre · 40 min restantes », « Nouvel épisode · S2 É5 », « N° 1 cette semaine ». */
  context: string;
  title: string;
  summary: string | null;
  genre: string | null;
  /** Seconds. */
  duration: number | null;
  release_date: string | null;
  /** 1920×1080 for HD screens, the original for 4K ones. */
  image: string;
  image_2x: string;
  cast: string[];
  max_quality?: Quality;
  dynamic_range?: DynamicRange;
  play_id: string;
  open_id: string;
};

export type CatalogRow = { id: string; name: string; total: number } & ({ movies: ContentItem[] } | { series: ContentItem[] });
export type Page = { items: ContentItem[]; next_cursor: string | null };

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
  /** « À suivre »: its still, « Vincenzo · S1 · É3 · 1 h 20 », its badges, its overview. */
  item: ContentItem;
  heading: string;
};
/**
 * `/playback/{id}`. On a series id, the episode to play (the one in progress, else the first not seen) is
 * resolved and named in `episode`; the app reports progress on `episode.id`.
 */
/** `cast`: the player's « Distribution » panel, the movie's or the series' (empty for a channel). */
export type Playback = {
  versions: Version[];
  resume_at: number | null;
  duration: number | null;
  next: NextEpisode | null;
  cast: Person[];
  episode?: EpisodeRef & { id: string };
};

/**
 * `/playback/{id}/suggestions`, asked once playback has started (TMDB may take a few seconds). `related`:
 * the player's « Si vous avez aimé… » panel, five at most, nothing already seen; a series plays through
 * `/playback/{series id}`. `next`: what follows a movie, or the last known episode of a series, nothing
 * seen or in progress: the saga's next movie, else TMDB's first recommendation; null when there is none.
 */
export type Suggestions = { related: ContentItem[]; next: Suggestion | null };
/** `heading`: « À SUIVRE · SUITE DE LA SAGA », « À SUIVRE · NOUVELLE SÉRIE », « À SUIVRE »; the app adds the countdown. */
export type Suggestion = { item: ContentItem; reason: "saga" | "recommended"; heading: string };

/** `/search`: movies, series and channels in one list, the most relevant first. */
export type SearchResults = { query: string; items: ContentItem[] };

export type ServerInfo = {
  server_version: string;
  counts: { movies: number; series: number; channels: number };
  last_import: string | null;
  tmdb_rate: number | null;
  catalog_languages: string[];
  default_language_order: string[];
};

export type ApiError = {
  error: { code: "unauthorized" | "not_found" | "bad_request" | "upstream" | "too_many_requests"; message: string };
};
