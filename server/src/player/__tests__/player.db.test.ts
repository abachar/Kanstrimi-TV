import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { player as api } from "..";
import { nightEnd } from "../epg";
import { resetDb, closeDb, seedCategories, seedItems, seedTmdb, seedProgrammes } from "@/test/db";
import { verify, lockForTests, isUnlocked } from "@/config";
import {
  addStudio,
  listStudios,
  moveStudio,
  parseStudioRef,
  removeStudio,
  runGrouping,
  runNaming,
  studioDetail,
  studioSuggestions,
} from "@/catalog";
import { resetPairingState } from "@/devices";
import { setSettings } from "@/config";

const daysAgo = (d: number) => new Date(Date.now() - d * 86400000);
const monthsAgo = (m: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() - m);
  return d;
};
const ymd = (d: Date) => d.toISOString().split("T")[0];
/** Fallback titles carry the current year: undated by TMDB, they are released on its January 1st. */
const THIS_YEAR = new Date().getFullYear();

let token = "";
let code = "";
const call = (path: string, init: RequestInit = {}, auth = true) =>
  api.request(path, {
    ...init,
    headers: {
      host: "kanstrimi.test",
      ...(auth ? { authorization: `Bearer ${token}` } : {}),
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const get = async (path: string, auth = true): Promise<{ status: number; body: any }> => {
  const r = await call(path, {}, auth);
  return { status: r.status, body: r.status === 204 ? null : await r.json() };
};

beforeAll(async () => {
  await resetDb();
  resetPairingState();
  expect(await verify("test")).toBe(true);
  await setSettings({
    xtream_url: "http://provider.test",
    xtream_username: "u",
    xtream_password: "p",
    last_sync_at: "2026-09-26T02:10:00.000Z",
  });
  await seedCategories([
    { kind: "vod", xtreamId: "10", name: "|FR| FILMS 4K DV" },
    { kind: "vod", xtreamId: "11", name: "|FR| FILMS VOST" },
    { kind: "vod", xtreamId: "12", name: "|FR| THRILLER" },
    { kind: "vod", xtreamId: "13", name: "|FR| ADULTES XXX" },
    { kind: "series", xtreamId: "30", name: "|FR| SERIES" },
    { kind: "live", xtreamId: "20", name: "FRANCE FHD | TV" },
    { kind: "live", xtreamId: "21", name: "SPORTS HD | TV" },
    { kind: "live", xtreamId: "22", name: "HIDDEN | TV", hiddenManual: true },
  ]);
  const items = await seedItems([
    {
      kind: "vod",
      xtreamId: "1",
      name: "|FR| Matrix (4K)",
      cat: "10",
      tmdbId: 603,
      matchStatus: "matched",
      addedAt: daysAgo(9),
    },
    {
      kind: "vod",
      xtreamId: "2",
      name: "|FR| Matrix (VOST)",
      cat: "11",
      tmdbId: 603,
      matchStatus: "matched",
      addedAt: daysAgo(28),
    },
    {
      kind: "vod",
      xtreamId: "3",
      name: "|FR| Heat (VOST)",
      cat: "11",
      tmdbId: 949,
      matchStatus: "matched",
      addedAt: daysAgo(19),
    },
    {
      kind: "vod",
      xtreamId: "4",
      name: `AZ - Silver.Book.of.Dreams.${THIS_YEAR}`,
      cat: "12",
      matchStatus: "unmatched",
      addedAt: daysAgo(14),
    },
    { kind: "vod", xtreamId: "5", name: "|FR| Caché", cat: "12", matchStatus: "unmatched", hiddenManual: true },
    {
      kind: "vod",
      xtreamId: "6",
      name: "|FR| Clan of Violence",
      cat: "13",
      matchStatus: "unmatched",
      addedAt: daysAgo(4),
    },
    {
      kind: "series",
      xtreamId: "200",
      name: "|FR| Vincenzo (MULTI)",
      cat: "30",
      tmdbId: 1396,
      matchStatus: "matched",
      addedAt: daysAgo(11),
    },
    { kind: "series", xtreamId: "201", name: "|FR| Vincenzo (VOST)", cat: "30", tmdbId: 1396, matchStatus: "matched" },
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
    { kind: "live", xtreamId: "102", name: "|FR| BEIN SPORTS 1 HD", cat: "21", raw: { num: 30 } },
    { kind: "live", xtreamId: "103", name: "|FR| SECRET TV", cat: "22", raw: { num: 99 } },
  ]);
  await seedProgrammes([
    { channelId: "TF1.fr", start: -30, end: 30, title: "Journal", overview: "Les titres" },
    { channelId: "TF1.fr", start: 30, end: 120, title: "Film du soir" },
    { channelId: "TF1.fr", start: -180, end: -30, title: "Avant" },
    // More than a day ahead: always past the next 6:00.
    { channelId: "TF1.fr", start: 1500, end: 1560, title: "Après-demain" },
  ]);
  await seedTmdb("movie", 603, {
    title: "Matrix",
    original_title: "The Matrix",
    release_date: ymd(monthsAgo(11)),
    overview: "Thomas Anderson…",
    poster_path: "/abc.jpg",
    backdrop_path: "/bd.jpg",
    images: {
      logos: [
        { file_path: "/logo-en.png", iso_639_1: "en", vote_average: 9 },
        { file_path: "/logo-fr.svg", iso_639_1: "fr", vote_average: 8 },
        { file_path: "/logo-fr.png", iso_639_1: "fr", vote_average: 5 },
      ],
    },
    vote_average: 8.2,
    vote_count: 25000,
    genres: [
      { id: 28, name: "Action" },
      { id: 878, name: "Science-Fiction" },
    ],
    runtime: 136,
    credits: { cast: [{ name: "Keanu Reeves", character: "Neo" }], crew: [{ name: "Lana Wachowski", job: "Director" }] },
    videos: { results: [{ key: "vKQi3bBA1y8", site: "YouTube", type: "Trailer", official: true }] },
    release_dates: { results: [{ iso_3166_1: "FR", release_dates: [{ certification: "12" }] }] },
  });
  await seedTmdb("movie", 949, {
    title: "Heat",
    original_title: "Heat",
    release_date: ymd(monthsAgo(1)),
    poster_path: "/heat.jpg",
    backdrop_path: "/heatb.jpg",
    vote_average: 7.9,
    vote_count: 7000,
    genres: [
      { id: 28, name: "Action" },
      { id: 80, name: "Crime" },
    ],
    runtime: 170,
    credits: { cast: [{ name: "Al Pacino", character: "Vincent Hanna" }], crew: [] },
  });
  await seedTmdb("tv", 1396, {
    name: "Vincenzo",
    original_name: "빈센조",
    first_air_date: "2021-02-20",
    last_air_date: "2021-05-02",
    status: "Ended",
    episode_run_time: [80],
    poster_path: "/v.jpg",
    backdrop_path: "/vb.jpg",
    genres: [{ id: 80, name: "Crime" }],
    created_by: [{ name: "Park Jae-bum" }],
    vote_average: 8.4,
    vote_count: 900,
    seasons: [
      { season_number: 1, name: "Saison 1", air_date: "2021-02-20" },
      { season_number: 2, name: "Saison 2", air_date: "2025-03-01" },
    ],
  });
  // TMDB season 1 in cache: episode names come from there.
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
        { episode_number: 2, name: "Épisode 2", still_path: "/s1e2.jpg", runtime: 78, air_date: "2021-02-21" },
      ],
    },
  });
  // Provider get_series_info per variant, cached: MULTI has S1 (2 ep) and S2 (1 ep); VOST has S1 only.
  const providerInfo = (ids: Record<string, string[]>, names: Record<string, string>) => ({
    seasons: [],
    info: {},
    episodes: Object.fromEntries(
      Object.entries(ids).map(([season, list]) => [
        season,
        list.map((id, i) => ({
          id,
          episode_num: i + 1,
          season: Number(season),
          title: `|FR| Vincenzo ${season}x0${i + 1} - ${names[`${season}:${i + 1}`] ?? "?"} (MULTI)`,
          container_extension: "mkv",
          info: { duration_secs: 4800, plot: "Intrigue." },
        })),
      ]),
    ),
  });
  const multi = items.find((i) => i.xtreamId === "200")!,
    vost = items.find((i) => i.xtreamId === "201")!;
  await db.insert(schema.xtreamInfoCache).values([
    { kind: "series", xtreamId: multi.xtreamId, data: providerInfo({ "1": ["e11", "e12"], "2": ["e21"] }, { "2:1": "Marée haute" }) },
    { kind: "series", xtreamId: vost.xtreamId, data: providerInfo({ "1": ["e11v", "e12v"] }, {}) },
  ]);
  await runNaming();
  await runGrouping();
});
afterAll(closeDb);

describe("pairing", () => {
  it("POST /devices → code, GET /devices/{code} → pending then approved once", async () => {
    const r = await call("/devices", { method: "POST" }, false);
    expect(r.status).toBe(201);
    const body = (await r.json()) as { code: string; url: string; expires_at: string };
    expect(body.code).toMatch(/^[A-Z2-9]{6}$/);
    expect(body.url).toBe(`http://kanstrimi.test/admin/pair/${body.code}`);
    expect(Date.parse(body.expires_at)).toBeGreaterThan(Date.now());
    code = body.code;
    expect((await get(`/devices/${code}`, false)).body).toEqual({ status: "pending" });
    expect((await get("/devices/nope", false)).status).toBe(400);
    expect((await get("/devices/ZZZZZZ", false)).body).toEqual({ status: "expired" });
    const { approvePairing } = await import("@/devices");
    await approvePairing(code, "Salon");
    const approved = (await get(`/devices/${code}`, false)).body;
    expect(approved).toMatchObject({ status: "approved", device_name: "Salon" });
    token = approved.token;
    expect((await get(`/devices/${code}`, false)).body).toEqual({ status: "expired" });
  });

  it("401 without or with a bad token, on every authenticated route", async () => {
    for (const p of ["/info", "/home", "/movies", "/series", "/channels", "/search?q=a", "/playback/tmdb:movie:603"]) {
      expect((await get(p, false)).status, p).toBe(401);
      const r = await api.request(p, { headers: { authorization: "Bearer dvc_wrong" } });
      expect(r.status, p).toBe(401);
      expect(((await r.json()) as { error: { code: string } }).error.code).toBe("unauthorized");
    }
  });
});

describe("adult contents", () => {
  it("are hidden everywhere by default and served once the setting is on", async () => {
    const key = "fallback:movie:clan-of-violence:-";
    expect((await get("/movies")).body[0].movies.map((c: { id: string }) => c.id)).not.toContain(key);
    expect((await get(`/movies/${key}`)).status).toBe(404);
    expect((await get("/search?q=clan")).body.movies).toEqual([]);
    expect((await call(`/favorites/${key}`, { method: "PUT" })).status).toBe(404);
    expect((await get("/info")).body.counts.movies).toBe(3);
    await setSettings({ serve_adult: "1" });
    expect((await get("/movies?limit=50")).body.items.map((c: { id: string }) => c.id)).toContain(key);
    expect((await get(`/movies/${key}`)).status).toBe(200);
    expect((await get("/search?q=clan")).body.movies.map((c: { id: string }) => c.id)).toEqual([key]);
    expect((await get("/info")).body.counts.movies).toBe(4);
    await setSettings({ serve_adult: "0" });
  });
});

describe("GET /info", () => {
  it("counts visible contents, tmdb rate and languages", async () => {
    const { status, body } = await get("/info");
    expect(status).toBe(200);
    expect(body.counts).toEqual({ movies: 3, series: 1, channels: 2 });
    expect(body.last_import).toBe("2026-09-26T02:10:00.000Z");
    expect(body.tmdb_rate).toBe(0.83);
    expect(body.catalog_languages).toEqual(["VF", "VOSTFR"]);
    expect(body.default_language_order).toEqual(["VF", "VOSTFR", "VO"]);
    expect(typeof body.server_version).toBe("string");
  });
});

describe("GET /movies and /series", () => {
  it("rows: Nouveautés then genres with totals, twenty cards max", async () => {
    const { body } = await get("/movies");
    expect(body.map((r: { id: string; name: string; total: number }) => [r.id, r.name, r.total])).toEqual([
      ["recent", "Nouveautés", 3],
      ["action", "Action", 2],
      ["crime", "Crime", 1],
      ["science-fiction", "Science-Fiction", 1],
    ]);
    const recent = body[0].movies;
    // added_at of a content is the newest of its variants: Matrix comes first.
    expect(recent.map((c: { id: string }) => c.id)).toEqual([
      "tmdb:movie:603",
      `fallback:movie:silver-book-of-dreams:${THIS_YEAR}`,
      "tmdb:movie:949",
    ]);
    expect(recent[0]).toMatchObject({
      kind: "movie",
      title: "Matrix",
      poster: "http://kanstrimi.test/img/w500/abc.jpg",
      max_quality: "4K",
      dynamic_range: "DV",
      languages: ["VF", "VOSTFR"],
      year: monthsAgo(11).getFullYear(),
      rating: 8.2,
      genres: ["Action", "Science-Fiction"],
      hint: null,
      added_at: expect.any(String),
    });
    expect(recent[2].hint).toBe("VOSTFR seul");
    expect(recent[1]).toMatchObject({ title: "Silver Book of Dreams", year: THIS_YEAR, poster: null, genres: [] });
    const s = (await get("/series")).body;
    expect(s[0]).toMatchObject({ id: "recent", name: "Derniers épisodes", total: 1 });
    expect(s[0].series[0].id).toBe("tmdb:tv:20000".replace("20000", "1396"));
  });

  it("list: cursor pagination, sort and filters", async () => {
    const p1 = (await get("/movies?genre=recent&limit=2")).body;
    expect(p1.items.map((c: { id: string }) => c.id)).toEqual(["tmdb:movie:603", `fallback:movie:silver-book-of-dreams:${THIS_YEAR}`]);
    expect(p1.next_cursor).toBeTruthy();
    const p2 = (await get(`/movies?genre=recent&limit=2&cursor=${encodeURIComponent(p1.next_cursor)}`)).body;
    expect(p2.items.map((c: { id: string }) => c.id)).toEqual(["tmdb:movie:949"]);
    expect(p2.next_cursor).toBeNull();
    expect((await get("/movies?genre=action&sort=title")).body.items.map((c: { title: string }) => c.title)).toEqual(["Heat", "Matrix"]);
    expect((await get("/movies?genre=action&sort=rating")).body.items.map((c: { title: string }) => c.title)).toEqual(["Matrix", "Heat"]);
    expect((await get("/movies?genre=action&sort=year")).body.items.map((c: { year: number }) => c.year)).toEqual([
      monthsAgo(1).getFullYear(),
      monthsAgo(11).getFullYear(),
    ]);
    expect((await get("/movies?genre=recent&vf_available=1")).body.items.map((c: { id: string }) => c.id)).toEqual([
      "tmdb:movie:603",
      `fallback:movie:silver-book-of-dreams:${THIS_YEAR}`,
    ]);
    expect((await get("/movies?genre=recent&min_quality=4K")).body.items.map((c: { id: string }) => c.id)).toEqual(["tmdb:movie:603"]);
    expect((await get("/movies?genre=recent&dynamic_range=HDR")).body.items.map((c: { id: string }) => c.id)).toEqual(["tmdb:movie:603"]);
    expect((await get("/movies?genre=recent&language=vostfr")).body.items.map((c: { id: string }) => c.id)).toEqual([
      "tmdb:movie:603",
      "tmdb:movie:949",
    ]);
    expect((await get("/movies?genre=nope")).body).toEqual({ items: [], next_cursor: null });
    expect((await get("/movies?genre=recent&cursor=zzz")).status).toBe(400);
    expect((await get("/movies?genre=recent&min_quality=8K")).body.error.code).toBe("bad_request");
  });
});

describe("GET /movies/{id}", () => {
  it("returns the full sheet with versions × sources and signed stream URLs", async () => {
    const { status, body } = await get("/movies/tmdb:movie:603");
    expect(status).toBe(200);
    expect(body).toMatchObject({
      id: "tmdb:movie:603",
      kind: "movie",
      title: "Matrix",
      original_title: "The Matrix",
      year: monthsAgo(11).getFullYear(),
      end_year: null,
      overview: "Thomas Anderson…",
      runtime: 136,
      certification: "12",
      cast: [{ name: "Keanu Reeves", role: "Neo" }],
      director: "Lana Wachowski",
      trailer: "https://www.youtube.com/watch?v=vKQi3bBA1y8",
      backdrop: "http://kanstrimi.test/img/w1280/bd.jpg",
      logo: "http://kanstrimi.test/img/w500/logo-fr.png",
      has_tmdb: true,
      provider_category: null,
      raw_title: null,
      is_favorite: false,
      progress: null,
      max_quality: "4K",
      dynamic_range: "DV",
      languages: ["VF", "VOSTFR"],
    });
    expect(body.versions.map((v: { id: string }) => v.id)).toEqual(["vf-4k-dv", "vostfr-hd"]);
    const src = body.versions[0].sources[0];
    expect(src).toMatchObject({
      container: "MKV",
      provider: { id: "xtream", name: "provider.test", kind: "xtream" },
      origin: "|FR| FILMS 4K DV",
    });
    expect(src.id).toMatch(/^src-i[0-9a-z]+$/);
    expect(src.stream_url).toMatch(new RegExp(`^http://kanstrimi\\.test/player/stream/${src.id}\\?d=${code}&e=\\d+&s=[A-Za-z0-9_-]+$`));
  });

  it("fallback movie: has_tmdb false, provider category and raw title", async () => {
    const { body } = await get(`/movies/fallback:movie:silver-book-of-dreams:${THIS_YEAR}`);
    expect(body).toMatchObject({
      has_tmdb: false,
      provider_category: "|FR| THRILLER",
      raw_title: `AZ - Silver.Book.of.Dreams.${THIS_YEAR}`,
      title: "Silver Book of Dreams",
      year: THIS_YEAR,
      cast: [],
    });
  });

  it("404 for unknown, hidden or wrong-kind ids", async () => {
    for (const p of [
      "/movies/tmdb:movie:1",
      "/movies/fallback:movie:cache:-",
      "/movies/tmdb:tv:1396",
      "/movies/12345",
      "/series/tmdb:movie:603",
      "/series/tmdb:tv:1396:s01e01",
    ]) {
      const r = await get(p);
      expect(r.status, p).toBe(404);
      expect(r.body.error.code).toBe("not_found");
    }
  });
});

describe("GET /series/{id}", () => {
  it("merges episodes across variants, with TMDB names, versions per episode and the series' versions without sources", async () => {
    const { status, body } = await get("/series/tmdb:tv:1396");
    expect(status).toBe(200);
    expect(body).toMatchObject({
      id: "tmdb:tv:1396",
      kind: "series",
      title: "Vincenzo",
      year: 2021,
      end_year: 2021,
      runtime: 80,
      director: "Park Jae-bum",
      languages: ["VF", "VOSTFR"],
      current_episode: { season: 1, number: 1, title: "Épisode 1" },
      hint: null,
    });
    expect(
      body.seasons.map((s: { number: number; title: string; year: number; episodes: unknown[] }) => [
        s.number,
        s.title,
        s.year,
        s.episodes.length,
      ]),
    ).toEqual([
      [1, "Saison 1", 2021, 2],
      [2, "Saison 2", 2025, 1],
    ]);
    const e1 = body.seasons[0].episodes[0];
    expect(e1).toMatchObject({
      id: "tmdb:tv:1396:s01e01",
      season: 1,
      number: 1,
      title: "Épisode 1",
      overview: "Vincenzo arrive.",
      runtime: 80,
      still: "http://kanstrimi.test/img/w300/s1e1.jpg",
      air_date: "2021-02-20T00:00:00Z",
      progress: null,
    });
    expect(e1.versions.map((v: { id: string; sources: unknown[] }) => [v.id, v.sources.length])).toEqual([
      ["vf-hd", 1],
      ["vostfr-hd", 1],
    ]);
    expect(e1.versions[0].sources[0].id).toMatch(/^src-e[0-9a-z]+$/);
    // S2E1 exists only in the MULTI variant: the provider title gives the name.
    const e21 = body.seasons[1].episodes[0];
    expect(e21).toMatchObject({ id: "tmdb:tv:1396:s02e01", title: "Marée haute", runtime: 80, overview: "Intrigue." });
    expect(e21.versions.map((v: { id: string }) => v.id)).toEqual(["vf-hd"]);
    expect(body.versions).toEqual([
      { id: "vf-hd", language: "VF", quality: "HD", sources: [] },
      { id: "vostfr-hd", language: "VOSTFR", quality: "HD", sources: [] },
    ]);
    expect(body.hint).toBeNull();
  });
});

describe("channels", () => {
  it("GET /channels groups by market and theme (section of the category, else the category), one channel per content with its versions", async () => {
    const { body } = await get("/channels");
    expect(body.map((g: { id: string; name: string; channels: { id: string }[] }) => [g.id, g.name, g.channels.map((c) => c.id)])).toEqual([
      ["fr-generalistes", "France · Généralistes", ["live:fr-tf1"]],
      ["fr-sport", "France · Sport", ["live:fr-bein-sports-1"]],
    ]);
    const tf1 = body[0].channels[0];
    expect(tf1).toMatchObject({
      name: "TF1",
      number: 2,
      logo: "http://x/tf1-fhd.png",
      max_quality: "FHD",
      has_epg: true,
      is_favorite: false,
    });
    expect(tf1.versions.map((v: { id: string }) => v.id)).toEqual(["vf-fhd", "vf-hd"]);
    expect(tf1.versions[0].sources[0].container).toBe("TS");
    // The guide: TF1 is on air and has a following programme; beIN has no id in the guide at all.
    expect(tf1.now).toMatchObject({ title: "Journal", overview: "Les titres" });
    expect(tf1.next).toMatchObject({ title: "Film du soir" });
    expect(body[1].channels[0]).toMatchObject({ has_epg: false, now: null, next: null });
  });
  it("GET /channels/{id} carries now/next too, in ISO UTC", async () => {
    const { status, body } = await get("/channels/live:fr-tf1");
    expect(status).toBe(200);
    expect(body).toMatchObject({ id: "live:fr-tf1", has_epg: true });
    expect(body.now.title).toBe("Journal");
    expect(body.now.start).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(Date.parse(body.now.end)).toBeGreaterThan(Date.now());
    expect(Date.parse(body.next.start)).toBe(Date.parse(body.now.end));
    expect((await get("/channels/live:fr-secret-tv")).status).toBe(404);
    expect((await get("/channels/tmdb:movie:603")).status).toBe(404);
  });
  it("GET /channels/{id}/programmes: from the programme on air until 6:00, in order", async () => {
    const { status, body } = await get("/channels/live:fr-tf1/programmes");
    expect(status).toBe(200);
    expect(body.map((p: { title: string }) => p.title)).toEqual(["Journal", "Film du soir"]);
    expect(body[0]).toMatchObject({ overview: "Les titres" });
    // A channel the guide does not know answers an empty day, an unknown one a 404.
    expect((await get("/channels/live:fr-bein-sports-1/programmes")).body).toEqual([]);
    expect((await get("/channels/live:fr-secret-tv/programmes")).status).toBe(404);
  });
  it("the broadcast day ends at the next 6:00", () => {
    const at = (h: number, m = 0) => new Date(2026, 8, 30, h, m);
    expect(nightEnd(at(23))).toEqual(new Date(2026, 9, 1, 6));
    expect(nightEnd(at(3))).toEqual(at(6));
    expect(nightEnd(at(6))).toEqual(new Date(2026, 9, 1, 6));
  });
});

describe("playback and progress", () => {
  it("movie: versions, no resume, duration from runtime; then progress drives resume_at and the home row", async () => {
    let p = (await get("/playback/tmdb:movie:603")).body;
    expect(p).toMatchObject({ resume_at: null, duration: 136 * 60, next: null });
    expect(p.versions.length).toBe(2);
    let r = await call("/playback/tmdb:movie:603/progress", { method: "PUT", body: JSON.stringify({ position: 4520, duration: 8280 }) });
    expect(r.status).toBe(204);
    p = (await get("/playback/tmdb:movie:603")).body;
    expect(p).toMatchObject({ resume_at: 4520, duration: 8280 });
    expect((await get("/movies/tmdb:movie:603")).body.progress).toEqual({ position: 4520, duration: 8280, finished: false });
    r = await call("/playback/tmdb:movie:603/progress", { method: "PUT", body: JSON.stringify({ position: -1 }) });
    expect(r.status).toBe(400);
    expect(
      (await call("/playback/tmdb:movie:999/progress", { method: "PUT", body: JSON.stringify({ position: 1, duration: 2 }) })).status,
    ).toBe(404);
    expect(
      (await call("/playback/live:fr-tf1/progress", { method: "PUT", body: JSON.stringify({ position: 1, duration: 2 }) })).status,
    ).toBe(404);
  });

  it("episode: versions of that episode and the next one, season change included", async () => {
    const p = (await get("/playback/tmdb:tv:1396:s01e02")).body;
    expect(p.versions.map((v: { id: string }) => v.id)).toEqual(["vf-hd", "vostfr-hd"]);
    expect(p.duration).toBe(78 * 60);
    expect(p.next).toMatchObject({
      id: "tmdb:tv:1396:s02e01",
      title: "Marée haute",
      season: 2,
      number: 1,
      runtime: 80,
      languages: ["VF"],
      max_quality: "HD",
    });
    expect((await get("/playback/tmdb:tv:1396:s02e01")).body.next).toBeNull();
    expect((await get("/playback/tmdb:tv:1396:s09e09")).status).toBe(404);
    expect((await get("/playback/tmdb:tv:1396")).status).toBe(404);
    await call("/playback/tmdb:tv:1396:s01e01/progress", { method: "PUT", body: JSON.stringify({ position: 4700, duration: 4800 }) });
    await call("/playback/tmdb:tv:1396:s01e02/progress", { method: "PUT", body: JSON.stringify({ position: 1140, duration: 4680 }) });
    const sheet = (await get("/series/tmdb:tv:1396")).body;
    expect(sheet.current_episode).toEqual({ season: 1, number: 2, title: "Épisode 2" });
    expect(sheet.progress).toEqual({ position: 1140, duration: 4680, finished: false });
    expect(sheet.seasons[0].episodes[0].progress).toEqual({ position: 4700, duration: 4800, finished: true });
  });

  it("channel: versions only", async () => {
    expect((await get("/playback/live:fr-tf1")).body).toMatchObject({ resume_at: null, duration: null, next: null });
  });
});

describe("GET /home", () => {
  it("hero, resume row (movie + episode), recent rows, favourites row", async () => {
    await call("/favorites/tmdb:movie:949", { method: "PUT" });
    const { body } = await get("/home");
    // The newest matched movie with poster and backdrop: Matrix.
    expect(body.hero).toMatchObject({
      tagline: "FILM · NOUVEAUTÉ",
      card: { id: "tmdb:movie:603", backdrop: "http://kanstrimi.test/img/w1280/bd.jpg", max_quality: "4K", languages: ["VF", "VOSTFR"] },
      runtime: 136,
      certification: "12",
    });
    expect(body.hero.versions.length).toBe(2);
    expect(body.rows.map((r: { id: string; kind: string }) => [r.id, r.kind])).toEqual([
      ["resume", "resume"],
      ["recent-movies", "recent_movies"],
      ["recent-series", "recent_series"],
      ["favorites", "favorites"],
    ]);
    const resume = body.rows[0].cards;
    expect(resume.map((c: { id: string }) => c.id)).toEqual(["tmdb:tv:1396:s01e02", "tmdb:movie:603"]);
    expect(resume[0]).toMatchObject({
      kind: "episode",
      title: "Vincenzo",
      episode: { season: 1, number: 2, title: "Épisode 2" },
      progress: { position: 1140, duration: 4680 },
      backdrop: "http://kanstrimi.test/img/w1280/vb.jpg",
    });
    expect(resume[0].progress.finished).toBeUndefined();
    expect(body.rows[1].cards.map((c: { id: string }) => c.id)).toEqual(["tmdb:movie:603", "tmdb:movie:949"]);
    expect(body.rows[3].cards.map((c: { id: string }) => c.id)).toEqual(["tmdb:movie:949"]);
    expect(Date.parse(body.generated_at)).toBeGreaterThan(0);
  });
});

describe("search and favourites", () => {
  it("GET /search: prefix, accent-insensitive, cast, scope, best", async () => {
    let r = (await get("/search?q=matr")).body;
    expect(r.best.id).toBe("tmdb:movie:603");
    expect(r.movies.map((c: { id: string }) => c.id)).toEqual(["tmdb:movie:603"]);
    r = (await get("/search?q=pacino")).body;
    expect(r.movies.map((c: { id: string }) => c.id)).toEqual(["tmdb:movie:949"]);
    r = (await get("/search?q=tf1&scope=live")).body;
    expect(r.live).toEqual([expect.objectContaining({ id: "live:fr-tf1", kind: "live", title: "TF1", genres: ["FRANCE FHD | TV"] })]);
    expect(r.movies).toEqual([]);
    r = (await get("/search?q=vincenzo&scope=movies")).body;
    expect(r).toEqual({ query: "vincenzo", best: null, movies: [], series: [], live: [] });
    expect((await get("/search?q=")).body.best).toBeNull();
    // Nothing on the prefixes: the titles that look like the query, typos forgiven.
    r = (await get("/search?q=vincenso")).body;
    expect(r.series.map((c: { id: string }) => c.id)).toEqual(["tmdb:tv:1396"]);
    expect(r.best.id).toBe("tmdb:tv:1396");
    r = (await get("/search?q=matrixx")).body;
    expect(r.movies.map((c: { id: string }) => c.id)).toEqual(["tmdb:movie:603"]);
    // Nonsense and too short a query find nothing.
    expect((await get("/search?q=xyzqw")).body.best).toBeNull();
    expect((await get("/search?q=hx")).body.best).toBeNull();
    expect((await get("/search?q=a&scope=x")).status).toBe(400);
  });
  it("PUT/DELETE /favorites/{id}: 204, reflected in sheets and channels", async () => {
    expect((await call("/favorites/live:fr-tf1", { method: "PUT" })).status).toBe(204);
    expect((await get("/channels/live:fr-tf1")).body.is_favorite).toBe(true);
    expect((await get("/movies/tmdb:movie:949")).body.is_favorite).toBe(true);
    expect((await call("/favorites/tmdb:movie:949", { method: "DELETE" })).status).toBe(204);
    expect((await get("/movies/tmdb:movie:949")).body.is_favorite).toBe(false);
    expect((await call("/favorites/tmdb:movie:1", { method: "PUT" })).status).toBe(404);
    expect((await call("/favorites/tmdb:tv:1396:s01e01", { method: "PUT" })).status).toBe(404);
  });
});

describe("Nouveautés, release order and visible variants", () => {
  // Seeded after the catalogue tests, whose rows and counts must not see these movies.
  beforeAll(async () => {
    await seedItems([
      { kind: "vod", xtreamId: "n1", name: "|FR| Alpha (VF)", cat: "12", tmdbId: 2001, matchStatus: "matched", addedAt: daysAgo(5) },
      {
        kind: "vod",
        xtreamId: "n1-hidden",
        name: "|FR| Alpha 4K (VOST)",
        cat: "12",
        tmdbId: 2001,
        matchStatus: "matched",
        addedAt: daysAgo(1),
        hiddenManual: true,
      },
      { kind: "vod", xtreamId: "n2", name: "|FR| Beta (VF)", cat: "12", tmdbId: 2002, matchStatus: "matched", addedAt: daysAgo(6) },
      { kind: "vod", xtreamId: "n3", name: "|FR| Gamma (VF)", cat: "12", tmdbId: 2003, matchStatus: "matched", addedAt: daysAgo(1) },
      { kind: "vod", xtreamId: "n4", name: "|FR| Undated (VF)", cat: "12", matchStatus: "unmatched", addedAt: daysAgo(1) },
    ]);
    const films: [number, string, string][] = [
      [2001, "Alpha", ymd(daysAgo(20))],
      [2002, "Beta", ymd(daysAgo(20))],
      [2003, "Gamma", ymd(monthsAgo(16))],
    ];
    for (const [id, title, release_date] of films) {
      await seedTmdb("movie", id, {
        title,
        original_title: title,
        release_date,
        genres: [{ id: 28, name: "Action" }],
        credits: { cast: [], crew: [] },
      });
    }
    await runNaming();
    await runGrouping();
  });

  it("Nouveautés: released in the last twelve months, whatever the arrival", async () => {
    const ids = (await get("/movies?genre=recent&limit=50")).body.items.map((c: { id: string }) => c.id);
    expect(ids).toEqual(expect.arrayContaining(["tmdb:movie:2001", "tmdb:movie:2002"]));
    expect(ids).not.toContain("tmdb:movie:2003"); // arrived yesterday, released 16 months ago
    expect(ids).not.toContain("fallback:movie:undated:-");
  });

  it("aggregates ignore hidden variants: quality, languages and arrival", async () => {
    const alpha = (await get("/movies?genre=recent&limit=50")).body.items.find((c: { id: string }) => c.id === "tmdb:movie:2001");
    expect(alpha.max_quality).not.toBe("4K");
    expect(alpha.languages).toEqual(["VF"]);
    expect(Date.parse(alpha.added_at)).toBeLessThan(daysAgo(4).getTime());
  });

  it("sort=release: newest first, ties by id, undated last, stable across pages", async () => {
    const titles: string[] = [];
    let cursor = "";
    do {
      const page = (await get(`/movies?sort=release&limit=2${cursor && `&cursor=${encodeURIComponent(cursor)}`}`)).body;
      titles.push(...page.items.map((c: { title: string }) => c.title));
      cursor = page.next_cursor ?? "";
    } while (cursor);
    expect(new Set(titles).size).toBe(titles.length);
    expect(titles.length).toBe((await get("/info")).body.counts.movies);
    expect(titles.indexOf("Alpha")).toBe(titles.indexOf("Beta") + 1);
    expect(titles.indexOf("Gamma")).toBeGreaterThan(titles.indexOf("Alpha"));
    expect(titles.at(-1)).toBe("Undated");
  });
});

describe("sagas", () => {
  // Seeded after the catalogue tests, whose rows and counts must not see these movies.
  beforeAll(async () => {
    const movie = (xtreamId: string, name: string, tmdbId: number, hiddenManual = false) =>
      ({ kind: "vod", xtreamId, name, cat: "12", tmdbId, matchStatus: "matched", addedAt: daysAgo(3), hiddenManual }) as const;
    await seedItems([
      movie("s1", "|FR| Trilogie Un (VF)", 3001),
      movie("s2", "|FR| Trilogie Deux (VF)", 3002),
      movie("s3", "|FR| Trilogie Trois (VF)", 3003),
      movie("s4", "|FR| Duo Visible (VF)", 3004),
      movie("s5", "|FR| Duo Caché (VF)", 3005, true),
      movie("s6", "|FR| Ancien Un (VF)", 3006),
      movie("s7", "|FR| Ancien Deux (VF)", 3007),
    ]);
    const saga = (id: number, name: string) => ({ id, name, poster_path: `/saga${id}.jpg`, backdrop_path: `/sagab${id}.jpg` });
    const films: [number, string, Date, ReturnType<typeof saga>][] = [
      [3001, "Trilogie Un", monthsAgo(40), saga(900, "Trilogie - Saga")],
      [3002, "Trilogie Deux", monthsAgo(20), saga(900, "Trilogie - Saga")],
      [3003, "Trilogie Trois", daysAgo(10), saga(900, "Trilogie - Saga")],
      [3004, "Duo Visible", daysAgo(5), saga(901, "Duo - Saga")],
      [3005, "Duo Caché", daysAgo(5), saga(901, "Duo - Saga")],
      [3006, "Ancien Un", monthsAgo(60), saga(902, "Ancien - Saga")],
      [3007, "Ancien Deux", monthsAgo(30), saga(902, "Ancien - Saga")],
    ];
    for (const [id, title, released, belongs_to_collection] of films) {
      await seedTmdb("movie", id, {
        title,
        original_title: title,
        release_date: ymd(released),
        belongs_to_collection,
        credits: { cast: [], crew: [] },
      });
    }
    await runNaming();
    await runGrouping();
  });

  it("GET /movies/sagas: two visible movies or more, freshest first, by cursor", async () => {
    const items: { id: string }[] = [];
    let cursor = "";
    do {
      const page = (await get(`/movies/sagas?limit=1${cursor && `&cursor=${encodeURIComponent(cursor)}`}`)).body;
      items.push(...page.items);
      cursor = page.next_cursor ?? "";
    } while (cursor);
    expect(items).toEqual([
      {
        id: "saga:900",
        name: "Trilogie - Saga",
        count: 3,
        poster: "http://kanstrimi.test/img/w500/saga900.jpg",
        backdrop: "http://kanstrimi.test/img/w1280/sagab900.jpg",
      },
      expect.objectContaining({ id: "saga:902", count: 2 }),
    ]);
    expect((await get("/movies/sagas?cursor=zzz")).status).toBe(400);
  });

  it("GET /movies/sagas/{id}: its visible movies, oldest release first; 404 below two", async () => {
    const { status, body } = await get("/movies/sagas/saga:900");
    expect(status).toBe(200);
    expect(body).toMatchObject({ id: "saga:900", name: "Trilogie - Saga", count: 3 });
    expect(body.movies.map((c: { title: string }) => c.title)).toEqual(["Trilogie Un", "Trilogie Deux", "Trilogie Trois"]);
    expect((await get("/movies/sagas/saga:901")).status).toBe(404);
    expect((await get("/movies/sagas/nope")).status).toBe(404);
  });

  it("movie sheet: its saga when shown, nothing otherwise", async () => {
    expect((await get("/movies/tmdb:movie:3002")).body.saga).toEqual({ id: "saga:900", name: "Trilogie - Saga", count: 3 });
    expect((await get("/movies/tmdb:movie:3004")).body.saga).toBeUndefined();
    expect((await get("/movies/tmdb:movie:603")).body.saga).toBeUndefined();
  });
});

describe("studios and top 10", () => {
  // Seeded after the catalogue tests, whose rows and counts must not see these titles.
  beforeAll(async () => {
    await seedItems([
      { kind: "vod", xtreamId: "p1", name: "|FR| Pixar Un (VF)", cat: "12", tmdbId: 4001, matchStatus: "matched", addedAt: daysAgo(2) },
      { kind: "vod", xtreamId: "p2", name: "|FR| Pixar Caché (VF)", cat: "12", tmdbId: 4002, matchStatus: "matched", hiddenManual: true },
      { kind: "series", xtreamId: "h1", name: "|FR| Série HBO (VF)", cat: "30", tmdbId: 4003, matchStatus: "matched", addedAt: daysAgo(2) },
    ]);
    const pixar = { id: 3, name: "Pixar", logo_path: "/pixar.png" };
    await seedTmdb("movie", 4001, {
      title: "Pixar Un",
      release_date: ymd(daysAgo(30)),
      production_companies: [pixar],
      credits: { cast: [], crew: [] },
    });
    await seedTmdb("movie", 4002, {
      title: "Pixar Caché",
      release_date: ymd(daysAgo(30)),
      production_companies: [pixar],
      credits: { cast: [], crew: [] },
    });
    await seedTmdb("tv", 4003, {
      name: "Série HBO",
      first_air_date: ymd(daysAgo(30)),
      networks: [{ id: 49, name: "HBO", logo_path: "/hbo.png" }],
    });
    await db.insert(schema.curationStudios).values([
      { kind: "network", tmdbId: 49, name: "HBO", logoPath: "/hbo.png", position: 1 },
      { kind: "company", tmdbId: 3, name: "Pixar", logoPath: "/pixar.png", position: 2 },
      { kind: "company", tmdbId: 999, name: "Sans titre", logoPath: null, position: 3 },
    ]);
    // Trending ranks: Heat, a title missing from the catalogue, the hidden Pixar, then Matrix.
    await db.insert(schema.tmdbTrending).values([
      { mediaType: "movie", rank: 1, tmdbId: 949 },
      { mediaType: "movie", rank: 2, tmdbId: 123456 },
      { mediaType: "movie", rank: 3, tmdbId: 4002 },
      { mediaType: "movie", rank: 4, tmdbId: 603 },
      { mediaType: "tv", rank: 1, tmdbId: 4003 },
    ]);
    await runNaming();
    await runGrouping();
  });

  it("GET /movies/studios and /series/studios: the chosen studios holding visible titles of that kind, in order", async () => {
    expect((await get("/movies/studios")).body).toEqual([
      { id: "company:3", name: "Pixar", logo: "http://kanstrimi.test/img/w300/pixar.png", count: 1 },
    ]);
    expect((await get("/series/studios")).body.map((s: { id: string; count: number }) => [s.id, s.count])).toEqual([["network:49", 1]]);
  });

  it("GET /movies?studio=: the studio's visible titles; 400 when malformed", async () => {
    expect((await get("/movies?studio=company:3")).body.items.map((c: { title: string }) => c.title)).toEqual(["Pixar Un"]);
    expect((await get("/series?studio=network:49")).body.items.map((c: { title: string }) => c.title)).toEqual(["Série HBO"]);
    expect((await get("/movies?studio=pixar")).status).toBe(400);
  });

  it("Top 10 first in the catalogue rows, in TMDB's order, visible titles of the catalogue only", async () => {
    const movies = (await get("/movies")).body;
    expect(movies[0]).toMatchObject({ id: "top10", name: "Top 10 de la semaine", total: 2 });
    expect(movies[0].movies.map((c: { id: string }) => c.id)).toEqual(["tmdb:movie:949", "tmdb:movie:603"]);
    expect(movies[1].id).toBe("recent");
    expect((await get("/series")).body[0].series.map((c: { id: string }) => c.id)).toEqual(["tmdb:tv:4003"]);
  });

  it("admin: suggestions from the catalogue, add, reorder, remove", async () => {
    await db.delete(schema.curationStudios).where(eq(schema.curationStudios.tmdbId, 3));
    const suggestions = await studioSuggestions();
    expect(suggestions).toContainEqual({ kind: "company", tmdbId: 3, name: "Pixar", logoPath: "/pixar.png", country: null, count: 1 });
    expect(suggestions.some((s) => s.kind === "network" && s.tmdbId === 49)).toBe(false); // already chosen
    expect((await studioSuggestions(40, "pix")).map((s) => s.name)).toEqual(["Pixar"]); // search by name, any case
    expect(await studioSuggestions(40, "nothing like it")).toEqual([]);
    expect(parseStudioRef("company:3")).toEqual({ kind: "company", tmdbId: 3 });
    expect(parseStudioRef("3")).toBeNull(); // companies and networks are numbered apart
    const pixar = await studioDetail("company", 3);
    expect(pixar).toMatchObject({ name: "Pixar", chosenId: null });
    expect(pixar!.titles).toHaveLength(1);
    expect(pixar!.titles[0].itemId).toEqual(expect.any(Number));
    expect(await studioDetail("company", 424242)).toBeNull();
    expect(await addStudio("company", 3)).toBe(true);
    expect(await addStudio("company", 424242)).toBe(false);
    let rows = await listStudios();
    expect(rows.map((r) => [r.name, r.movies, r.series])).toEqual([
      ["HBO", 0, 1],
      ["Sans titre", 0, 0],
      ["Pixar", 1, 0],
    ]);
    await moveStudio(rows[2].id, "up");
    rows = await listStudios();
    expect(rows.map((r) => r.name)).toEqual(["HBO", "Pixar", "Sans titre"]);
    await removeStudio(rows[2].id);
    expect((await listStudios()).map((r) => r.name)).toEqual(["HBO", "Pixar"]);
  });
});

describe("« Reprendre » cleanup and watched marks", () => {
  const put = (path: string, body: unknown) => call(path, { method: "PUT", body: JSON.stringify(body) });
  const resumeIds = async () =>
    ((await get("/home")).body.rows.find((r: { id: string }) => r.id === "resume")?.cards ?? []).map((c: { id: string }) => c.id);

  it("DELETE /playback/{id}/progress takes a title out of « Reprendre »", async () => {
    await put("/playback/tmdb:movie:603/progress", { position: 4520, duration: 8280 });
    expect(await resumeIds()).toContain("tmdb:movie:603");
    expect((await call("/playback/tmdb:movie:603/progress", { method: "DELETE" })).status).toBe(204);
    expect(await resumeIds()).not.toContain("tmdb:movie:603");
    expect((await get("/playback/tmdb:movie:603")).body.resume_at).toBeNull();
    expect((await call("/playback/tmdb:movie:999/progress", { method: "DELETE" })).status).toBe(404);
    expect((await call("/playback/live:fr-tf1/progress", { method: "DELETE" })).status).toBe(404);
  });

  it("PUT /playback/{id}/watched marks a movie or an episode, and undoes it", async () => {
    await put("/playback/tmdb:movie:603/progress", { position: 4520, duration: 8280 });
    expect((await put("/playback/tmdb:movie:603/watched", { watched: true })).status).toBe(204);
    expect((await get("/movies/tmdb:movie:603")).body.progress).toEqual({ position: 8280, duration: 8280, finished: true });
    expect(await resumeIds()).not.toContain("tmdb:movie:603");
    expect((await put("/playback/tmdb:movie:603/watched", { watched: false })).status).toBe(204);
    expect((await get("/movies/tmdb:movie:603")).body.progress).toBeNull();
    expect((await put("/playback/tmdb:movie:603/watched", { watched: "yes" })).status).toBe(400);
    expect((await put("/playback/live:fr-tf1/watched", { watched: true })).status).toBe(404);
  });

  it("on a series id, a whole season at once", async () => {
    expect((await put("/playback/tmdb:tv:1396/watched", { watched: true, season: 1 })).status).toBe(204);
    let sheet = (await get("/series/tmdb:tv:1396")).body;
    const season = (n: number) => sheet.seasons.find((s: { number: number }) => s.number === n);
    expect(season(1).episodes.every((e: { progress: { finished: boolean } | null }) => e.progress?.finished)).toBe(true);
    expect(season(2).episodes.every((e: { progress: unknown }) => e.progress === null)).toBe(true);
    expect(sheet.current_episode).toMatchObject({ season: 2, number: 1 });
    expect((await put("/playback/tmdb:tv:1396/watched", { watched: false, season: 1 })).status).toBe(204);
    sheet = (await get("/series/tmdb:tv:1396")).body;
    expect(season(1).episodes.every((e: { progress: unknown }) => e.progress === null)).toBe(true);
    expect((await put("/playback/tmdb:tv:1396/watched", { watched: true, season: 9 })).status).toBe(404);
  });
});

describe("GET /stream/{source}", () => {
  it("302 to the provider for a signed link, 401 when tampered, expired or revoked", async () => {
    const sheet = (await get("/movies/tmdb:movie:603")).body;
    const url = new URL(sheet.versions[0].sources[0].stream_url);
    const r = await api.request(url.pathname.replace("/player", "") + url.search, { redirect: "manual" });
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toBe("http://provider.test/movie/u/p/1.mkv");
    const ep = (await get("/series/tmdb:tv:1396")).body.seasons[1].episodes[0].versions[0].sources[0].stream_url;
    const eu = new URL(ep);
    const re = await api.request(eu.pathname.replace("/player", "") + eu.search, { redirect: "manual" });
    expect(re.headers.get("location")).toBe("http://provider.test/series/u/p/e21.mkv");
    // Tampered signature
    const bad = await api.request(url.pathname.replace("/player", "") + url.search.replace(/s=[^&]+/, "s=forged"), { redirect: "manual" });
    expect(bad.status).toBe(401);
    // Expired
    const exp = new URL(url);
    exp.searchParams.set("e", "1");
    expect((await api.request(exp.pathname.replace("/player", "") + exp.search)).status).toBe(401);
    // Never logged: the signature is redacted by the request logger.
    const { redactUrl } = await import("@/shared");
    expect(redactUrl(url.pathname + url.search)).not.toContain(url.searchParams.get("s")!);
  });

  it("DELETE /devices/{code}: only its own, then every call is 401 and the stream link dies", async () => {
    const sheet = (await get("/movies/tmdb:movie:603")).body;
    const url = new URL(sheet.versions[0].sources[0].stream_url);
    expect((await call("/devices/ZZZZZZ", { method: "DELETE" })).status).toBe(404);
    expect((await call(`/devices/${code}`, { method: "DELETE" })).status).toBe(204);
    expect((await get("/info")).status).toBe(401);
    expect((await api.request(url.pathname.replace("/player", "") + url.search, { redirect: "manual" })).status).toBe(401);
  });
});

describe("vault", () => {
  it("the first call of a paired device after a restart unlocks the vault", async () => {
    resetPairingState();
    const { approvePairing, createPairing } = await import("@/devices");
    const { code: c2 } = await createPairing("1.2.3.4");
    await approvePairing(c2, "Chambre");
    const t2 = ((await get(`/devices/${c2}`, false)).body as { token: string }).token;
    lockForTests();
    expect(isUnlocked()).toBe(false);
    const r = await api.request("/info", { headers: { authorization: `Bearer ${t2}` } });
    expect(r.status).toBe(200);
    expect(isUnlocked()).toBe(true);
    const [d] = await db.select().from(schema.appDevices).where(eq(schema.appDevices.code, c2));
    expect(d.lastIp).toBe("local");
  });
});
