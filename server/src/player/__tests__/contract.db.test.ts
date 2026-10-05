import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { sha256 } from "@/shared";
import { resetDb, closeDb, seedCategories, seedItems, seedTmdb, groupAndFilter } from "@/test/db";
import { setSecretsForTests, setSettings } from "@/config";
import { addStudio, runNaming } from "@/catalog";
import { player as api } from "..";

/**
 * The contract with the app, as golden files: real answers of `/player`, written into the app's
 * fixtures (`apple/kanstrimiTests/Contract/`), which its own test decodes with the Swift
 * types. Here, every answer must keep the shape of its file: a field added, removed or retyped
 * fails until the files are written again, on purpose:
 *
 *   UPDATE_CONTRACT=1 npx vitest run src/player/__tests__/contract.db.test.ts
 *
 * The clock is fixed and every id is seeded: written twice, the files are the same.
 */
const DIR = path.resolve(import.meta.dirname, "../../../../apple/kanstrimiTests/Contract");
const UPDATE = process.env.UPDATE_CONTRACT === "1";
/** Thursday 1 October 2026, 20:30 in Paris: the broadcast day and « Nouveautés » follow from it. */
const NOW = new Date("2026-10-01T18:30:00Z");
const TOKEN = "dvc_contract";
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);
const daysAgo = (d: number) => at(-d * 24 * 60);

const call = (p: string | { path: string; body: unknown }) =>
  typeof p === "string"
    ? api.request(p, { headers: { host: "kanstrimi.test", authorization: `Bearer ${TOKEN}` } })
    : api.request(p.path, {
        method: "POST",
        headers: { host: "kanstrimi.test", authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
        body: JSON.stringify(p.body),
      });

/** What the app reads in a Netflix file: its length and its chapters. */
const FILE_FACTS = {
  duration: 4800,
  chapters: [
    { name: "Part 01", start: 0, end: 71 },
    { name: "Intro", start: 71, end: 86 },
    { name: "Part 02", start: 86, end: 4560 },
    { name: "Credits", start: 4560, end: 4800 },
  ],
};

/** Every answer of the contract, by file name: a path asked by GET, or a path and the body it is sent by POST. */
const ROUTES: Record<string, string | { path: string; body: unknown }> = {
  info: "/info",
  home: "/home",
  movies: "/movies",
  "movies-list": "/movies?genre=recent&sort=recent&limit=2",
  "movies-studio": "/movies?studio=company:420",
  "movie-detail": "/movies/tmdb:movie:603",
  series: "/series",
  "series-detail": "/series/tmdb:tv:1396",
  sagas: "/movies/sagas",
  saga: "/movies/sagas/saga:2344",
  "studios-movies": "/movies/studios",
  "studios-series": "/series/studios",
  channels: "/channels",
  channel: "/channels/live:fr-tf1",
  "channel-programmes": "/channels/live:fr-tf1/programmes",
  "playback-movie": "/playback/tmdb:movie:603",
  "playback-series": "/playback/tmdb:tv:1396",
  "playback-episode": "/playback/tmdb:tv:1396:s01e02",
  suggestions: "/playback/tmdb:movie:603/suggestions",
  "suggestions-episode": "/playback/tmdb:tv:1396:s01e01/suggestions",
  "markers-episode": { path: "/playback/tmdb:tv:1396:s01e02/markers", body: FILE_FACTS },
  "markers-none": { path: "/playback/tmdb:movie:603/markers", body: { duration: 8160, chapters: [] } },
  search: "/search?q=matrix",
  person: "/people/person:6384",
  "top-shelf": "/top-shelf",
  error: "/movies/tmdb:movie:999999",
};

/** Every path of a JSON value with the types found there: `rows[].cards[].title: string`. */
function shapeOf(v: unknown, at = "$", out = new Map<string, Set<string>>()): Map<string, Set<string>> {
  const add = (t: string) => out.set(at, (out.get(at) ?? new Set()).add(t));
  if (v === null) add("null");
  else if (Array.isArray(v)) {
    add("array");
    for (const x of v) shapeOf(x, `${at}[]`, out);
  } else if (typeof v === "object") {
    add("object");
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) shapeOf(x, `${at}.${k}`, out);
  } else add(typeof v);
  return out;
}
const flat = (v: unknown) => [...shapeOf(v)].map(([p, t]) => `${p}: ${[...t].sort().join(" | ")}`).sort();

const answers = new Map<string, unknown>();

beforeAll(async () => {
  process.env.TZ = "Europe/Paris";
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  await resetDb();
  setSecretsForTests({ xtream_url: "http://provider.test", xtream_username: "u", xtream_password: "p" });
  await setSettings({
    last_sync_at: daysAgo(1).toISOString(),
    last_epg_at: daysAgo(1).toISOString(),
  });
  await db.insert(schema.appDevices).values({
    code: "SALN42",
    name: "Salon",
    status: "approved",
    tokenHash: sha256(TOKEN).toString("hex"),
    createdAt: daysAgo(30),
    approvedAt: daysAgo(30),
    expiresAt: daysAgo(30),
  });

  await seedCategories([
    { kind: "vod", xtreamId: "10", name: "|FR| FILMS 4K DV" },
    { kind: "vod", xtreamId: "11", name: "|FR| FILMS VOST" },
    { kind: "series", xtreamId: "30", name: "|FR| SERIES" },
    { kind: "live", xtreamId: "20", name: "FRANCE FHD | TV" },
    { kind: "live", xtreamId: "21", name: "SPORTS HD | TV" },
  ]);
  await seedItems([
    { kind: "vod", xtreamId: "1", name: "|FR| Matrix (4K)", cat: "10", tmdbId: 603, matchStatus: "matched", addedAt: daysAgo(9) },
    { kind: "vod", xtreamId: "2", name: "|FR| Matrix (VOST)", cat: "11", tmdbId: 603, matchStatus: "matched", addedAt: daysAgo(28) },
    { kind: "vod", xtreamId: "3", name: "|FR| Matrix Reloaded", cat: "10", tmdbId: 604, matchStatus: "matched", addedAt: daysAgo(3) },
    { kind: "vod", xtreamId: "4", name: "|FR| Heat (VOST)", cat: "11", tmdbId: 949, matchStatus: "matched", addedAt: daysAgo(19) },
    { kind: "vod", xtreamId: "5", name: "|FR| Silver Book of Dreams 2026", cat: "11", matchStatus: "unmatched", addedAt: daysAgo(14) },
    {
      kind: "series",
      xtreamId: "200",
      name: "|FR| Vincenzo (MULTI)",
      cat: "30",
      tmdbId: 1396,
      matchStatus: "matched",
      addedAt: daysAgo(11),
    },
    {
      kind: "live",
      xtreamId: "100",
      name: "|FR| TF1 HD",
      cat: "20",
      section: "|FR| FRANCE FHD |FR|",
      raw: { num: 1, stream_icon: "http://x/tf1.png", epg_channel_id: "TF1.fr" },
    },
    {
      kind: "live",
      xtreamId: "101",
      name: "|FR| TF1 FHD",
      cat: "20",
      section: "|FR| FRANCE FHD |FR|",
      raw: { num: 2, stream_icon: "http://x/tf1-fhd.png", epg_channel_id: "TF1.fr" },
    },
    { kind: "live", xtreamId: "102", name: "|FR| BEIN SPORTS 1 HD", cat: "21", section: "|FR| SPORTS |FR|", raw: { num: 30 } },
  ]);
  await db.insert(schema.catalogEpgProgrammes).values(
    [
      { start: -150, end: -30, title: "Avant", overview: null },
      { start: -30, end: 30, title: "Journal", overview: "Les titres du jour." },
      { start: 30, end: 150, title: "Film du soir", overview: "Un film." },
      { start: 150, end: 240, title: "Magazine", overview: null },
    ].map((p) => ({
      channelId: "TF1.fr",
      startAt: at(p.start),
      endAt: at(p.end),
      title: p.title,
      overview: p.overview,
      importedAt: daysAgo(1),
    })),
  );

  const saga = { id: 2344, name: "Matrix - Saga", poster_path: "/saga.jpg", backdrop_path: "/sagab.jpg" };
  const studio = [{ id: 420, name: "Warner Bros.", logo_path: "/wb.png", origin_country: "US" }];
  const keanu = { id: 6384, name: "Keanu Reeves", character: "Neo", profile_path: "/keanu.jpg", order: 0 };
  const logos = (name: string) => ({
    logos: [{ file_path: `/${name}-logo.png`, iso_639_1: "fr", vote_average: 5 }],
    backdrops: [],
    posters: [],
  });
  await seedTmdb("movie", 603, {
    title: "Matrix",
    original_title: "The Matrix",
    release_date: "1999-03-31",
    overview: "Thomas Anderson mène une double vie.",
    tagline: "Bienvenue dans le monde réel.",
    poster_path: "/matrix.jpg",
    backdrop_path: "/matrixb.jpg",
    images: logos("matrix"),
    vote_average: 8.2,
    vote_count: 25000,
    genres: [
      { id: 28, name: "Action" },
      { id: 878, name: "Science-Fiction" },
    ],
    runtime: 136,
    credits: { cast: [keanu], crew: [{ name: "Lana Wachowski", job: "Director" }] },
    videos: { results: [{ key: "vKQi3bBA1y8", site: "YouTube", type: "Trailer", official: true }] },
    release_dates: { results: [{ iso_3166_1: "FR", release_dates: [{ certification: "12" }] }] },
    belongs_to_collection: saga,
    production_companies: studio,
    translations: { translations: [{ iso_639_1: "en", data: { title: "The Matrix" } }] },
    alternative_titles: { titles: [] },
  });
  await seedTmdb("movie", 604, {
    title: "Matrix Reloaded",
    original_title: "The Matrix Reloaded",
    release_date: "2026-05-15",
    overview: "Neo et ses alliés.",
    poster_path: "/reloaded.jpg",
    backdrop_path: "/reloadedb.jpg",
    images: logos("reloaded"),
    vote_average: 7.1,
    vote_count: 11000,
    genres: [{ id: 28, name: "Action" }],
    runtime: 138,
    credits: { cast: [{ ...keanu, order: 0 }], crew: [{ name: "Lana Wachowski", job: "Director" }] },
    belongs_to_collection: saga,
    production_companies: studio,
  });
  await seedTmdb("movie", 949, {
    title: "Heat",
    original_title: "Heat",
    release_date: "2026-08-20",
    poster_path: "/heat.jpg",
    backdrop_path: "/heatb.jpg",
    images: logos("heat"),
    vote_average: 7.9,
    vote_count: 7000,
    genres: [
      { id: 28, name: "Action" },
      { id: 80, name: "Crime" },
    ],
    runtime: 170,
    credits: { cast: [{ id: 1158, name: "Al Pacino", character: "Vincent Hanna", profile_path: null, order: 0 }], crew: [] },
  });
  await seedTmdb("tv", 1396, {
    name: "Vincenzo",
    original_name: "빈센조",
    first_air_date: "2021-02-20",
    last_air_date: "2021-05-02",
    status: "Ended",
    episode_run_time: [80],
    overview: "Un avocat de la mafia.",
    poster_path: "/v.jpg",
    backdrop_path: "/vb.jpg",
    images: logos("vincenzo"),
    genres: [{ id: 80, name: "Crime" }],
    credits: { cast: [{ ...keanu, character: "Invité" }], crew: [] },
    created_by: [{ name: "Park Jae-bum" }],
    networks: [{ id: 213, name: "Netflix", logo_path: "/netflix.png", origin_country: "US" }],
    vote_average: 8.4,
    vote_count: 900,
    content_ratings: { results: [{ iso_3166_1: "FR", rating: "16" }] },
  });
  await db.insert(schema.tmdbCache).values({
    mediaType: "tv_season",
    tmdbId: 1396,
    lang: "fr-FR#s1",
    data: {
      episodes: [
        {
          episode_number: 1,
          name: "Épisode 1",
          overview: "Vincenzo arrive.",
          still_path: "/s1e1.jpg",
          runtime: 80,
          air_date: "2021-02-20",
        },
        { episode_number: 2, name: "Épisode 2", overview: "Le trésor.", still_path: "/s1e2.jpg", runtime: 78, air_date: "2021-02-21" },
      ],
    },
  });
  await db.insert(schema.xtreamInfoCache).values({
    kind: "series",
    xtreamId: "200",
    data: {
      seasons: [],
      info: {},
      episodes: {
        "1": ["e11", "e12"].map((id, i) => ({
          id,
          episode_num: i + 1,
          season: 1,
          title: `|FR| Vincenzo 1x0${i + 1} (MULTI)`,
          container_extension: "mkv",
          info: { duration_secs: 4800, plot: "Intrigue." },
        })),
      },
    },
  });
  await runNaming();
  await groupAndFilter();
  await addStudio("company", 420);
  await addStudio("network", 213);

  // What the app recorded: a movie in progress, an episode seen, a favourite, a channel watched.
  await db.insert(schema.appWatchProgress).values([
    { contentKey: "tmdb:movie:949", position: 3000, duration: 10200, finished: false, updatedAt: at(-120) },
    { contentKey: "tmdb:tv:1396:s01e01", position: 4700, duration: 4800, finished: true, updatedAt: at(-60) },
  ]);
  await db.insert(schema.appFavorites).values({ contentKey: "tmdb:tv:1396", createdAt: daysAgo(2) });
  await db.execute(sql`insert into app_live_watch (content_key, day, seconds) values ('live:fr-tf1', current_date, 1800)`);
  await db.insert(schema.tmdbTrending).values([
    { mediaType: "movie", rank: 1, tmdbId: 604, fetchedAt: daysAgo(1) },
    { mediaType: "movie", rank: 2, tmdbId: 603, fetchedAt: daysAgo(1) },
    { mediaType: "tv", rank: 1, tmdbId: 1396, fetchedAt: daysAgo(1) },
  ]);
  await db.insert(schema.tmdbRecommendations).values([
    { mediaType: "movie", tmdbId: 603, ids: [604, 949], fetchedAt: at(-10) },
    { mediaType: "movie", tmdbId: 949, ids: [603], fetchedAt: at(-10) },
    { mediaType: "tv", tmdbId: 1396, ids: [], fetchedAt: at(-10) },
  ]);
  // Already asked of TheIntroDB, which did not know the movie: the markers of a file without chapters ask nothing.
  await db
    .insert(schema.theintrodbCache)
    .values({ mediaType: "movie", tmdbId: 603, season: 0, episode: 0, duration: 8160, segments: [], fetchedAt: at(-10) });
  await db.insert(schema.curationWaitlist).values({
    contentKey: "tmdb:movie:604",
    tmdbId: 604,
    title: "Matrix Reloaded",
    year: 2026,
    posterPath: "/reloaded.jpg",
    releaseDate: "2026-05-15",
    addedAt: daysAgo(40),
    availableAt: daysAgo(3),
  });

  // No TMDB key: nothing leaves the test. A call to the network would be a bug of the seed.
  vi.stubGlobal("fetch", async (u: unknown) => {
    throw new Error(`réseau inattendu : ${String(u)}`);
  });
  for (const [name, route] of Object.entries(ROUTES)) {
    const res = await call(route);
    answers.set(name, await res.json());
  }
});
afterAll(async () => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  await closeDb();
});

describe("contract", () => {
  it.each(Object.keys(ROUTES))("%s keeps the shape of its golden file", (name) => {
    const answer = answers.get(name);
    const file = path.join(DIR, `${name}.json`);
    if (UPDATE) {
      fs.mkdirSync(DIR, { recursive: true });
      fs.writeFileSync(file, `${JSON.stringify(answer, null, 2)}\n`);
      return;
    }
    expect(fs.existsSync(file), `${file} manquant : UPDATE_CONTRACT=1 npx vitest run src/player/__tests__/contract.db.test.ts`).toBe(true);
    expect(flat(answer)).toEqual(flat(JSON.parse(fs.readFileSync(file, "utf8"))));
  });

  it("covers every route with a real answer, not an error, but the error one", () => {
    for (const [name, body] of answers)
      if (name === "error") expect(body).toEqual({ error: { code: "not_found", message: "Contenu introuvable" } });
      else expect(body, name).not.toHaveProperty("error");
  });
});
