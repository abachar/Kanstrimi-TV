/**
 * Wire types of `/player`: this file is the contract, `apple/kanstrimi/Contract/` decodes
 * exactly these shapes. snake_case, ISO dates, explicit null where the
 * app expects a value, absent where it does not.
 */
/** The app's `ContentKind`, not the database's `Kind` (live, vod, series). */
export type ContentKind = "movie" | "series" | "episode" | "live";
export type Quality = "SD" | "HD" | "FHD" | "4K";
export type DynamicRange = "HDR" | "DV";

/** `rank`: the provider's place in the admin's order of preference (1 = preferred): it orders the variants of a same quality. */
export type Provider = { id: string; name: string; kind: "xtream" | "local" | (string & {}); rank: number };
/**
 * One stream of one provider, as the app lists and plays it: a title has as many as its providers list it.
 * They come in the order the app shows them and tries them: the profile's languages in its order, the usual
 * cut before an edition, descending quality then dynamic range, the providers in the order of preference.
 * `badge` « 4K DV », `label` « FR · 4K DV · Version longue »: the variant's language, quality and cut, written
 * here. `quality` is what a player measured in the stream when one played it (`POST …/measure`), else what the
 * provider's name says. `name` and `category` are the provider's own words: what tells five « FHD » apart.
 * `edition`: a cut other than the theatrical one (« Version longue », « Director's Cut »), absent for the usual cut.
 * `stream_url`: the provider's own URL, played as is; null for a series' own variants (its sheet), which
 * name its streams and play nothing: an episode's variants play.
 * Live: `chip` « FHD », or « FHD/EN » when the channel mixes languages; `has_epg`, `now`, `next` when this
 * variant's guide is not the channel's (« M6 4K » has its own): absent, the channel's apply.
 */
export type Variant = {
  id: string;
  language: string;
  quality: Quality;
  dynamic_range?: DynamicRange;
  edition?: string;
  badge: string;
  label: string;
  provider: Provider;
  name: string;
  category: string | null;
  container: string;
  stream_url: string | null;
  chip?: string;
  has_epg?: boolean;
  now?: Programme | null;
  next?: Programme | null;
};

/**
 * The variant the profile chose for a title (`PUT /playback/{id}/variant`), served back wherever the title
 * plays. `id` is that variant among the ones served beside it: a movie or a channel starts on it; a series'
 * choice (written from any episode, read on every one) names the series' variant on its sheet and, on an
 * episode, this episode's variant under the same stream. When `id` is not listed (the provider dropped the
 * stream, the episode is not in it), the app plays the closest: the same language × quality × dynamic
 * range × edition, else the same language. `label` « FR · 4K DV · Version longue ». Nothing when the
 * profile's `remember_variants` is off.
 */
export type RememberedVariant = {
  id: string;
  language: string;
  quality: Quality;
  dynamic_range?: DynamicRange;
  edition?: string;
  label: string;
};

/** `resumable`: between 5 % and « Vu », decided here: the app offers « Reprendre » on it and compares no threshold. */
export type ProgressWire = { position: number; duration: number; finished?: boolean; resumable: boolean };
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
  variants: Variant[];
  progress: ProgressWire | null;
  /**
   * What its card and its row draw: the still, the progress, « vu »; the sheet's row adds `facts` (« 52 min · 12 min
   * restantes », « 52 min · Vu »), `badges` (« 4K HDR », « FR »…), `overview`, and `hint` (« FR SEUL ») with its
   * only language, shown when the series' chosen language is another.
   */
  item: ContentItem;
};
export type SeasonWire = { number: number; title: string | null; year: number | null; episodes: EpisodeWire[] };

export type Card = {
  id: string;
  kind: ContentKind;
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
  variants?: Variant[];
  /** Sheet: the variant this profile chose for the title (a series: for every episode); null when none. */
  remembered?: RememberedVariant | null;
  is_favorite?: boolean;
  seasons?: SeasonWire[];
  current_episode?: EpisodeRef | null;
  /**
   * Sheet texts, final: `tagline` « FILM », « SÉRIE · 3 SAISONS »; `facts` « 2019 – 2022 · Drame, Crime · 52 min »;
   * `rating_label` « ★ 8.5 »; `play_label` the play button, « Lecture », « Revoir », « Reprendre · 40 min restantes »,
   * « Lire S2 É4 », « Reprendre S2 É4 » (the home slide of the same title says the same).
   */
  tagline?: string;
  facts?: string | null;
  rating_label?: string | null;
  play_label?: string;
  /** Movie sheet: its saga, present only when two of its movies are visible. */
  saga?: SagaRef;
  /** Sheet: « Si vous avez aimé… », TMDB's recommendations in the catalogue, nothing already seen, ten at most. */
  related?: ContentItem[];
};

/**
 * What a content card draws, written here: the app lays it out and decides nothing. A list item; the
 * sheet stays a `Card`. `kind` says where a click goes (the sheet, the saga). Texts are final:
 * `facts` « 2019 · ★ 8.5 », « 3 films »; `badges` « 4K DV », « FR », « VOSTF », in order;
 * `caption` « 1 h 08 restantes ». `progress` (0…1) only while resumable.
 */
export type ContentItem = {
  id: string;
  kind: ContentKind | "saga";
  title: string;
  logo: string | null;
  poster: string | null;
  picture: string | null;
  facts: string | null;
  /** The quality badge alone (« 4K DV », « HD »), the one `badges` starts with; null when unknown. */
  quality: string | null;
  badges: string[];
  hint: string | null;
  progress: number | null;
  watched: boolean;
  caption: string | null;
  /** Where the card tells it: the carousel, « À suivre », an episode row; null in the lists. */
  overview: string | null;
};

/** A TMDB collection with at least two visible movies. `id` = `saga:<TMDB collection id>`. */
/** `label`: « Trilogie - Saga · 3 films ». */
export type SagaRef = { id: string; name: string; count: number; label: string };
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
/** `facts`: « 12 titres », « 1 titre ». */
export type PersonSheet = { id: string; name: string; photo: string | null; facts: string; movies: ContentItem[]; series: ContentItem[] };

export type Programme = { title: string; start: string; end: string; overview?: string | null };
export type ChannelWire = {
  id: string;
  name: string;
  number: number | null;
  logo: string | null;
  max_quality?: Quality;
  has_epg: boolean;
  is_favorite: boolean;
  variants: Variant[];
  /** The qualities the channel comes in, the best first, one chip each (« 4K », « FHD »): what its row shows, a variant's `chip` saying which one it is. */
  chips: string[];
  now?: Programme | null;
  next?: Programme | null;
  /** 1 = the most watched over the last 30 days (« Les plus regardées », 10 channels at most); absent otherwise. */
  watched_rank?: number;
  /** 1 = the channel watched last by this profile (« Récentes », 20 at most); absent otherwise. */
  recent_rank?: number;
  /** The variant this profile chose for the channel; absent when none. */
  remembered?: RememberedVariant;
};
/**
 * A country (« Maroc », the market name) and a theme (« Sport »); `name` = « Maroc · Sport », kept
 * for the apps that split it themselves.
 */
export type ChannelGroupWire = { id: string; name: string; section: string; theme: string; channels: ChannelWire[] };

export type HomeRow = {
  id: string;
  kind:
    | "resume"
    | "most_watched_channels"
    | "most_watched"
    | "recommended"
    | "recent_movies"
    | "recent_series"
    | "favorites"
    | "collection";
  title: string;
  cards: ContentItem[];
};
/**
 * A slide of the home carousel. `item` is what it draws and what Fiche opens (the series for a new episode):
 * its picture, logo, « S2 É5 · 2026 · Drame · 2 h 16 », `progress` when it resumes. `play_id` is what Lecture
 * plays, `variants`, `runtime`, `resume_at` and `duration` (seconds) being that title's own; `episode` names
 * the episode played. `tagline`: what the slide is, « FILM · N° 1 CETTE SEMAINE ».
 */
export type HomeHero = {
  item: ContentItem;
  tagline: string;
  overview: string | null;
  runtime: number | null;
  certification: string | null;
  variants: Variant[];
  play_id: string;
  episode?: EpisodeRef;
  is_favorite: boolean;
  /** The play button: « Lecture », or « Reprendre · 40 min restantes » for a movie in progress. */
  play_label: string;
  resume_at: number | null;
  duration: number | null;
  /** The variant this profile chose for the title (the series' for an episode); null when none. */
  remembered: RememberedVariant | null;
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
/** `remembered`: the variant this profile chose for the title (the series' for an episode); null when none. */
export type Playback = {
  variants: Variant[];
  resume_at: number | null;
  duration: number | null;
  next: NextEpisode | null;
  cast: Person[];
  remembered: RememberedVariant | null;
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

/**
 * `POST /playback/{id}/markers` (a movie or an episode), asked once its file is open: the app sends what it read
 * there (`FileFacts`: the length and the chapters, in seconds) and gets what can be skipped and where the end
 * credits are. `skips`: the recap of an episode (« Passer le récap ») and the intro (« Passer l'intro ») when known,
 * in the order of the file and never overlapping; for each, a button named `label` shows from `start` to `end` and
 * jumps to `end`. `credits`: « À suivre » shows from `at`, counts `countdown` seconds down, then what follows starts
 * and the title is seen; null when unknown, the card then comes in the last seconds of the file.
 */
export type FileFacts = { duration: number; chapters: { name: string; start: number; end: number }[] };
export type PlaybackMarkers = {
  skips: { start: number; end: number; label: string }[];
  credits: { at: number; countdown: number } | null;
};

/**
 * `POST /playback/{id}/measure`, once the picture shows: the variant playing and the size of its picture as the
 * player read it in the stream, in pixels. The server makes it the variant's quality (« 4K » announced, 1920 × 1080
 * read: FHD from now on, for everyone); an episode's measure is its series' stream's. Nothing comes back.
 */
export type PictureMeasure = { variant: string; width: number; height: number };

/** `/search`: movies, series and channels in one list, the most relevant first. */
export type SearchResults = { query: string; items: ContentItem[] };

/** `PUT /devices/me/push`: what the phone registers; `environment` tells which APNs gateway its token belongs to. */
export type PushRegistration = { platform: "ios"; token: string; environment: "sandbox" | "production" };

export type ServerInfo = {
  server_version: string;
  counts: { movies: number; series: number; channels: number };
  last_import: string | null;
  tmdb_rate: number | null;
  catalog_languages: string[];
  /** The profile this answer (and every other) is for: the `X-Profile` header, else the default profile. */
  profile: ProfileWire;
};

/**
 * The playback settings of a profile, the same on every device it watches on: the quality played by
 * default (a device still caps it: a phone stops at FHD), the next episode starting by itself, the variant
 * chosen in the picker kept for the title, another variant of the same language and quality tried when one fails. `PUT /profiles/me/settings`
 * changes any of them (each optional) and answers the profile.
 */
export type ProfileSettings = {
  max_quality: Quality;
  auto_play_next: boolean;
  remember_variants: boolean;
  switch_variant_on_failure: boolean;
};
/**
 * A person of the household (`GET /profiles`). Every request names the one it is for with `X-Profile: <id>`
 * (none: `is_default`); a profile deleted since answers `unknown_profile`, the app then picks again. `avatar`
 * is a square image whose URL changes with the picture.
 */
export type ProfileWire = { id: number; name: string; is_default: boolean; avatar: string; settings: ProfileSettings };
export type Profiles = { profiles: ProfileWire[] };

export type ApiError = {
  error: { code: "unauthorized" | "not_found" | "unknown_profile" | "bad_request" | "upstream" | "too_many_requests"; message: string };
};
