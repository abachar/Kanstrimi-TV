import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { api } from "../api";
import { resetDb, closeDb, seedCategories, seedItems, seedTmdb } from "@/test/db";
import { verify, lockForTests, isUnlocked } from "@/lib/auth/vault";
import { runGrouping } from "@/lib/grouping/group";
import { resetPairingState } from "@/lib/rest/devices";
import { setSettings } from "@/lib/settings";

let token = "";
let code = "";
const call = (path: string, init: RequestInit = {}, auth = true) =>
  api.request(path, { ...init, headers: { host: "kanstrimi.test", ...(auth ? { authorization: `Bearer ${token}` } : {}), ...(init.body ? { "content-type": "application/json" } : {}), ...(init.headers ?? {}) } });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const get = async (path: string, auth = true): Promise<{ status: number; body: any }> => { const r = await call(path, {}, auth); return { status: r.status, body: r.status === 204 ? null : await r.json() }; };

beforeAll(async () => {
  await resetDb(); resetPairingState();
  expect(await verify("test")).toBe(true);
  await setSettings({ xtream_url: "http://provider.test", xtream_username: "u", xtream_password: "p", last_sync_at: "2026-09-26T02:10:00.000Z" });
  await seedCategories([
    { kind: "vod", xtreamId: "10", name: "|FR| FILMS 4K DV" }, { kind: "vod", xtreamId: "11", name: "|FR| FILMS VOST" }, { kind: "vod", xtreamId: "12", name: "|FR| THRILLER" },
    { kind: "series", xtreamId: "30", name: "|FR| SERIES" },
    { kind: "live", xtreamId: "20", name: "FRANCE FHD | TV" }, { kind: "live", xtreamId: "21", name: "SPORTS HD | TV" }, { kind: "live", xtreamId: "22", name: "HIDDEN | TV", hiddenManual: true },
  ]);
  const items = await seedItems([
    { kind: "vod", xtreamId: "1", name: "|FR| Matrix (4K)", cat: "10", tmdbId: 603, matchStatus: "matched", addedAt: new Date("2026-09-20T04:10:00Z") },
    { kind: "vod", xtreamId: "2", name: "|FR| Matrix (VOST)", cat: "11", tmdbId: 603, matchStatus: "matched", addedAt: new Date("2026-09-01T00:00:00Z") },
    { kind: "vod", xtreamId: "3", name: "|FR| Heat (VOST)", cat: "11", tmdbId: 949, matchStatus: "matched", addedAt: new Date("2026-09-10T00:00:00Z") },
    { kind: "vod", xtreamId: "4", name: "AZ - Silver.Book.of.Dreams.2013", cat: "12", matchStatus: "unmatched", addedAt: new Date("2026-09-15T00:00:00Z") },
    { kind: "vod", xtreamId: "5", name: "|FR| Caché", cat: "12", matchStatus: "unmatched", hiddenManual: true },
    { kind: "series", xtreamId: "200", name: "|FR| Vincenzo (MULTI)", cat: "30", tmdbId: 1396, matchStatus: "matched", addedAt: new Date("2026-09-18T00:00:00Z") },
    { kind: "series", xtreamId: "201", name: "|FR| Vincenzo (VOST)", cat: "30", tmdbId: 1396, matchStatus: "matched" },
    { kind: "live", xtreamId: "100", name: "|FR| TF1 HD", cat: "20", raw: { num: 1, stream_icon: "http://x/tf1.png", epg_channel_id: "TF1.fr" } },
    { kind: "live", xtreamId: "101", name: "|FR| TF1 FHD", cat: "20", raw: { num: 2, stream_icon: "http://x/tf1-fhd.png", epg_channel_id: "TF1.fr" } },
    { kind: "live", xtreamId: "102", name: "|FR| BEIN SPORTS 1 HD", cat: "21", raw: { num: 30 } },
    { kind: "live", xtreamId: "103", name: "|FR| SECRET TV", cat: "22", raw: { num: 99 } },
  ]);
  await seedTmdb("movie", 603, {
    title: "Matrix", original_title: "The Matrix", release_date: "1999-03-30", overview: "Thomas Anderson…", poster_path: "/abc.jpg", backdrop_path: "/bd.jpg",
    vote_average: 8.2, vote_count: 25000, genres: [{ id: 28, name: "Action" }, { id: 878, name: "Science-Fiction" }], runtime: 136,
    credits: { cast: [{ name: "Keanu Reeves", character: "Neo" }], crew: [{ name: "Lana Wachowski", job: "Director" }] },
    videos: { results: [{ key: "vKQi3bBA1y8", site: "YouTube", type: "Trailer", official: true }] },
    release_dates: { results: [{ iso_3166_1: "FR", release_dates: [{ certification: "12" }] }] },
  });
  await seedTmdb("movie", 949, { title: "Heat", original_title: "Heat", release_date: "1995-12-15", poster_path: "/heat.jpg", backdrop_path: "/heatb.jpg", vote_average: 7.9, vote_count: 7000, genres: [{ id: 28, name: "Action" }, { id: 80, name: "Crime" }], runtime: 170, credits: { cast: [{ name: "Al Pacino", character: "Vincent Hanna" }], crew: [] } });
  await seedTmdb("tv", 1396, {
    name: "Vincenzo", original_name: "빈센조", first_air_date: "2021-02-20", last_air_date: "2021-05-02", status: "Ended", episode_run_time: [80], poster_path: "/v.jpg", backdrop_path: "/vb.jpg",
    genres: [{ id: 80, name: "Crime" }], created_by: [{ name: "Park Jae-bum" }], vote_average: 8.4, vote_count: 900,
    seasons: [{ season_number: 1, name: "Saison 1", air_date: "2021-02-20" }, { season_number: 2, name: "Saison 2", air_date: "2025-03-01" }],
  });
  // TMDB season 1 in cache: episode names come from there.
  await db.insert(schema.tmdbCache).values({ mediaType: "tv_season", tmdbId: 1396, lang: "fr-FR#s1", data: { episodes: [
    { episode_number: 1, name: "Épisode 1", overview: "Vincenzo arrive.", still_path: "/s1e1.jpg", runtime: 80, air_date: "2021-02-20" },
    { episode_number: 2, name: "Épisode 2", still_path: "/s1e2.jpg", runtime: 78, air_date: "2021-02-21" },
  ] } });
  // Provider get_series_info per variant, cached: MULTI has S1 (2 ep) and S2 (1 ep); VOST has S1 only.
  const providerInfo = (ids: Record<string, string[]>, names: Record<string, string>) => ({
    seasons: [], info: {},
    episodes: Object.fromEntries(Object.entries(ids).map(([season, list]) => [season, list.map((id, i) => ({ id, episode_num: i + 1, season: Number(season), title: `|FR| Vincenzo ${season}x0${i + 1} - ${names[`${season}:${i + 1}`] ?? "?"} (MULTI)`, container_extension: "mkv", info: { duration_secs: 4800, plot: "Intrigue." } }))])),
  });
  const multi = items.find((i) => i.xtreamId === "200")!, vost = items.find((i) => i.xtreamId === "201")!;
  await db.insert(schema.infoCache).values([
    { kind: "series", xtreamId: multi.xtreamId, data: providerInfo({ "1": ["e11", "e12"], "2": ["e21"] }, { "2:1": "Marée haute" }) },
    { kind: "series", xtreamId: vost.xtreamId, data: providerInfo({ "1": ["e11v", "e12v"] }, {}) },
  ]);
  await runGrouping();
});
afterAll(closeDb);

describe("pairing", () => {
  it("POST /devices → code, GET /devices/{code} → pending then approved once", async () => {
    const r = await call("/devices", { method: "POST" }, false);
    expect(r.status).toBe(201);
    const body = await r.json() as { code: string; url: string; expires_at: string };
    expect(body.code).toMatch(/^[A-Z2-9]{6}$/);
    expect(body.url).toBe(`http://kanstrimi.test/admin/pair/${body.code}`);
    expect(Date.parse(body.expires_at)).toBeGreaterThan(Date.now());
    code = body.code;
    expect((await get(`/devices/${code}`, false)).body).toEqual({ status: "pending" });
    expect((await get("/devices/nope", false)).status).toBe(400);
    expect((await get("/devices/ZZZZZZ", false)).body).toEqual({ status: "expired" });
    const { approvePairing } = await import("@/lib/rest/devices");
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
    expect(body.map((r: { id: string; name: string; total: number }) => [r.id, r.name, r.total])).toEqual([["recent", "Nouveautés", 3], ["action", "Action", 2], ["crime", "Crime", 1], ["science-fiction", "Science-Fiction", 1]]);
    const recent = body[0].movies;
    // added_at of a content is the oldest of its variants: Matrix (2026-09-01) comes last.
    expect(recent.map((c: { id: string }) => c.id)).toEqual(["fallback:movie:silver-book-of-dreams:2013", "tmdb:movie:949", "tmdb:movie:603"]);
    expect(recent[2]).toMatchObject({ kind: "movie", title: "Matrix", poster: "http://kanstrimi.test/img/w500/abc.jpg", max_quality: "4K", dynamic_range: "DV", languages: ["VF", "VOSTFR"], year: 1999, rating: 8.2, genres: ["Action", "Science-Fiction"], hint: null, added_at: "2026-09-01T00:00:00.000Z" });
    expect(recent[1].hint).toBe("VOSTFR seul");
    expect(recent[0]).toMatchObject({ title: "Silver Book of Dreams", year: 2013, poster: null, genres: [] });
    const s = (await get("/series")).body;
    expect(s[0]).toMatchObject({ id: "recent", name: "Derniers épisodes", total: 1 });
    expect(s[0].series[0].id).toBe("tmdb:tv:20000".replace("20000", "1396"));
  });

  it("list: cursor pagination, sort and filters", async () => {
    const p1 = (await get("/movies?genre=recent&limit=2")).body;
    expect(p1.items.map((c: { id: string }) => c.id)).toEqual(["fallback:movie:silver-book-of-dreams:2013", "tmdb:movie:949"]);
    expect(p1.next_cursor).toBeTruthy();
    const p2 = (await get(`/movies?genre=recent&limit=2&cursor=${encodeURIComponent(p1.next_cursor)}`)).body;
    expect(p2.items.map((c: { id: string }) => c.id)).toEqual(["tmdb:movie:603"]);
    expect(p2.next_cursor).toBeNull();
    expect((await get("/movies?genre=action&sort=title")).body.items.map((c: { title: string }) => c.title)).toEqual(["Heat", "Matrix"]);
    expect((await get("/movies?genre=action&sort=rating")).body.items.map((c: { title: string }) => c.title)).toEqual(["Matrix", "Heat"]);
    expect((await get("/movies?genre=action&sort=year")).body.items.map((c: { year: number }) => c.year)).toEqual([1999, 1995]);
    expect((await get("/movies?genre=recent&vf_available=1")).body.items.map((c: { id: string }) => c.id)).toEqual(["fallback:movie:silver-book-of-dreams:2013", "tmdb:movie:603"]);
    expect((await get("/movies?genre=recent&min_quality=4K")).body.items.map((c: { id: string }) => c.id)).toEqual(["tmdb:movie:603"]);
    expect((await get("/movies?genre=recent&dynamic_range=HDR")).body.items.map((c: { id: string }) => c.id)).toEqual(["tmdb:movie:603"]);
    expect((await get("/movies?genre=recent&language=vostfr")).body.items.map((c: { id: string }) => c.id)).toEqual(["tmdb:movie:949", "tmdb:movie:603"]);
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
      id: "tmdb:movie:603", kind: "movie", title: "Matrix", original_title: "The Matrix", year: 1999, end_year: null, overview: "Thomas Anderson…", runtime: 136, certification: "12",
      cast: [{ name: "Keanu Reeves", role: "Neo" }], director: "Lana Wachowski", trailer: "https://www.youtube.com/watch?v=vKQi3bBA1y8",
      backdrop: "http://kanstrimi.test/img/w1280/bd.jpg", has_tmdb: true, provider_category: null, raw_title: null, is_favorite: false, progress: null,
      max_quality: "4K", dynamic_range: "DV", languages: ["VF", "VOSTFR"],
    });
    expect(body.versions.map((v: { id: string }) => v.id)).toEqual(["vf-4k-dv", "vostfr-hd"]);
    const src = body.versions[0].sources[0];
    expect(src).toMatchObject({ container: "MKV", provider: { id: "xtream", name: "provider.test", kind: "xtream" }, origin: "|FR| FILMS 4K DV" });
    expect(src.id).toMatch(/^src-i[0-9a-z]+$/);
    expect(src.stream_url).toMatch(new RegExp(`^http://kanstrimi\\.test/api/v1/stream/${src.id}\\?d=${code}&e=\\d+&s=[A-Za-z0-9_-]+$`));
  });

  it("fallback movie: has_tmdb false, provider category and raw title", async () => {
    const { body } = await get("/movies/fallback:movie:silver-book-of-dreams:2013");
    expect(body).toMatchObject({ has_tmdb: false, provider_category: "|FR| THRILLER", raw_title: "AZ - Silver.Book.of.Dreams.2013", title: "Silver Book of Dreams", year: 2013, cast: [] });
  });

  it("404 for unknown, hidden or wrong-kind ids", async () => {
    for (const p of ["/movies/tmdb:movie:1", "/movies/fallback:movie:cache:-", "/movies/tmdb:tv:1396", "/movies/12345", "/series/tmdb:movie:603", "/series/tmdb:tv:1396:s01e01"]) {
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
    expect(body).toMatchObject({ id: "tmdb:tv:1396", kind: "series", title: "Vincenzo", year: 2021, end_year: 2021, runtime: 80, director: "Park Jae-bum", languages: ["VF", "VOSTFR"], current_episode: { season: 1, number: 1, title: "Épisode 1" }, hint: null });
    expect(body.seasons.map((s: { number: number; title: string; year: number; episodes: unknown[] }) => [s.number, s.title, s.year, s.episodes.length])).toEqual([[1, "Saison 1", 2021, 2], [2, "Saison 2", 2025, 1]]);
    const e1 = body.seasons[0].episodes[0];
    expect(e1).toMatchObject({ id: "tmdb:tv:1396:s01e01", season: 1, number: 1, title: "Épisode 1", overview: "Vincenzo arrive.", runtime: 80, still: "http://kanstrimi.test/img/w300/s1e1.jpg", air_date: "2021-02-20T00:00:00Z", progress: null });
    expect(e1.versions.map((v: { id: string; sources: unknown[] }) => [v.id, v.sources.length])).toEqual([["vf-hd", 1], ["vostfr-hd", 1]]);
    expect(e1.versions[0].sources[0].id).toMatch(/^src-e[0-9a-z]+$/);
    // S2E1 exists only in the MULTI variant: the provider title gives the name.
    const e21 = body.seasons[1].episodes[0];
    expect(e21).toMatchObject({ id: "tmdb:tv:1396:s02e01", title: "Marée haute", runtime: 80, overview: "Intrigue." });
    expect(e21.versions.map((v: { id: string }) => v.id)).toEqual(["vf-hd"]);
    expect(body.versions).toEqual([{ id: "vf-hd", language: "VF", quality: "HD", sources: [] }, { id: "vostfr-hd", language: "VOSTFR", quality: "HD", sources: [] }]);
    expect(body.hint).toBeNull();
  });
});

describe("channels", () => {
  it("GET /channels groups visible categories, one channel per content with its versions", async () => {
    const { body } = await get("/channels");
    expect(body.map((g: { name: string; channels: { id: string }[] }) => [g.name, g.channels.map((c) => c.id)])).toEqual([["FRANCE FHD | TV", ["live:fr-tf1"]], ["SPORTS HD | TV", ["live:fr-bein-sports-1"]]]);
    const tf1 = body[0].channels[0];
    expect(tf1).toMatchObject({ name: "TF1", number: 2, logo: "http://x/tf1-fhd.png", max_quality: "FHD", has_epg: true, is_favorite: false });
    expect(tf1.versions.map((v: { id: string }) => v.id)).toEqual(["vf-fhd", "vf-hd"]);
    expect(tf1.versions[0].sources[0].container).toBe("TS");
    expect(tf1.now).toBeUndefined();
  });
  it("GET /channels/{id} adds now/next (null until the EPG lands)", async () => {
    const { status, body } = await get("/channels/live:fr-tf1");
    expect(status).toBe(200);
    expect(body).toMatchObject({ id: "live:fr-tf1", now: null, next: null });
    expect((await get("/channels/live:fr-secret-tv")).status).toBe(404);
    expect((await get("/channels/tmdb:movie:603")).status).toBe(404);
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
    expect((await call("/playback/tmdb:movie:999/progress", { method: "PUT", body: JSON.stringify({ position: 1, duration: 2 }) })).status).toBe(404);
    expect((await call("/playback/live:fr-tf1/progress", { method: "PUT", body: JSON.stringify({ position: 1, duration: 2 }) })).status).toBe(404);
  });

  it("episode: versions of that episode and the next one, season change included", async () => {
    const p = (await get("/playback/tmdb:tv:1396:s01e02")).body;
    expect(p.versions.map((v: { id: string }) => v.id)).toEqual(["vf-hd", "vostfr-hd"]);
    expect(p.duration).toBe(78 * 60);
    expect(p.next).toMatchObject({ id: "tmdb:tv:1396:s02e01", title: "Marée haute", season: 2, number: 1, runtime: 80, languages: ["VF"], max_quality: "HD" });
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
    // The newest matched movie with poster and backdrop: Heat.
    expect(body.hero).toMatchObject({ tagline: "FILM · NOUVEAUTÉ", card: { id: "tmdb:movie:949", backdrop: "http://kanstrimi.test/img/w1280/heatb.jpg", max_quality: "HD", languages: ["VOSTFR"] }, runtime: 170, certification: null });
    expect(body.hero.versions.length).toBe(1);
    expect(body.rows.map((r: { id: string; kind: string }) => [r.id, r.kind])).toEqual([["resume", "resume"], ["recent-movies", "recent_movies"], ["recent-series", "recent_series"], ["favorites", "favorites"]]);
    const resume = body.rows[0].cards;
    expect(resume.map((c: { id: string }) => c.id)).toEqual(["tmdb:tv:1396:s01e02", "tmdb:movie:603"]);
    expect(resume[0]).toMatchObject({ kind: "episode", title: "Vincenzo", episode: { season: 1, number: 2, title: "Épisode 2" }, progress: { position: 1140, duration: 4680 }, backdrop: "http://kanstrimi.test/img/w1280/vb.jpg" });
    expect(resume[0].progress.finished).toBeUndefined();
    expect(body.rows[1].cards.map((c: { id: string }) => c.id)).toEqual(["tmdb:movie:949", "tmdb:movie:603"]);
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

describe("GET /stream/{source}", () => {
  it("302 to the provider for a signed link, 401 when tampered, expired or revoked", async () => {
    const sheet = (await get("/movies/tmdb:movie:603")).body;
    const url = new URL(sheet.versions[0].sources[0].stream_url);
    const r = await api.request(url.pathname.replace("/api/v1", "") + url.search, { redirect: "manual" });
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toBe("http://provider.test/movie/u/p/1.mkv");
    const ep = (await get("/series/tmdb:tv:1396")).body.seasons[1].episodes[0].versions[0].sources[0].stream_url;
    const eu = new URL(ep);
    const re = await api.request(eu.pathname.replace("/api/v1", "") + eu.search, { redirect: "manual" });
    expect(re.headers.get("location")).toBe("http://provider.test/series/u/p/e21.mkv");
    // Tampered signature
    const bad = await api.request(url.pathname.replace("/api/v1", "") + url.search.replace(/s=./, "s=x"), { redirect: "manual" });
    expect(bad.status).toBe(401);
    // Expired
    const exp = new URL(url); exp.searchParams.set("e", "1");
    expect((await api.request(exp.pathname.replace("/api/v1", "") + exp.search)).status).toBe(401);
    // Never logged: the signature is redacted by the request logger.
    const { redactUrl } = await import("@/lib/http-log");
    expect(redactUrl(url.pathname + url.search)).not.toContain(url.searchParams.get("s")!);
  });

  it("DELETE /devices/{code}: only its own, then every call is 401 and the stream link dies", async () => {
    const sheet = (await get("/movies/tmdb:movie:603")).body;
    const url = new URL(sheet.versions[0].sources[0].stream_url);
    expect((await call("/devices/ZZZZZZ", { method: "DELETE" })).status).toBe(404);
    expect((await call(`/devices/${code}`, { method: "DELETE" })).status).toBe(204);
    expect((await get("/info")).status).toBe(401);
    expect((await api.request(url.pathname.replace("/api/v1", "") + url.search, { redirect: "manual" })).status).toBe(401);
  });
});

describe("vault", () => {
  it("the first call of a paired device after a restart unlocks the vault", async () => {
    resetPairingState();
    const { approvePairing, createPairing } = await import("@/lib/rest/devices");
    const { code: c2 } = await createPairing("1.2.3.4");
    await approvePairing(c2, "Chambre");
    const t2 = ((await get(`/devices/${c2}`, false)).body as { token: string }).token;
    lockForTests();
    expect(isUnlocked()).toBe(false);
    const r = await api.request("/info", { headers: { authorization: `Bearer ${t2}` } });
    expect(r.status).toBe(200);
    expect(isUnlocked()).toBe(true);
    const [d] = await db.select().from(schema.devices).where(eq(schema.devices.code, c2));
    expect(d.lastIp).toBe("local");
  });
});
