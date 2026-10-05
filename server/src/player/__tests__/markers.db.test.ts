import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from "vitest";
import { db, schema } from "@/db";
import { sha256 } from "@/shared";
import { resetDb, closeDb } from "@/test/db";
import { setSecretsForTests } from "@/config";
import { extrasSettled, resetExtras } from "@/providers/tmdb";
import { introdbSettled, resetIntrodb } from "@/providers/introdb";
import { resetTheintrodb, theintrodbSettled } from "@/providers/theintrodb";
import { player as api } from "..";
import type { ApiError } from "../types";

const TOKEN = "dvc_markers";
const daysAgo = (d: number) => new Date(Date.now() - d * 86400000);
const NETFLIX = {
  duration: 3483.68,
  chapters: [
    { name: "Part 01", start: 0, end: 71 },
    { name: "Intro", start: 71, end: 86 },
    { name: "Part 02", start: 86, end: 3257 },
    { name: "Credits", start: 3257, end: 3483.68 },
  ],
};
const BLURAY = {
  duration: 10690,
  chapters: [
    { name: "Lost Soul", start: 0, end: 10292 },
    { name: "End Credits", start: 10292, end: 10690 },
  ],
};

const post = (id: string, body: unknown, token = TOKEN) =>
  api.request(`/playback/${id}/markers`, {
    method: "POST",
    headers: { host: "kanstrimi.test", authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

/** What can be skipped in the file `id` opened, as the route answers it. */
const skips = async (id: string, file: unknown) => ((await (await post(id, file)).json()) as { skips: unknown[] }).skips;

/** TMDB's keywords by movie and IMDb ids by title, as `/movie/603/keywords` and `/tv/1396/external_ids` answer them. */
let keywords: Record<number, number[]> = {};
let imdb: Record<number, string> = {};
let calls: string[] = [];
/** TheIntroDB's answers by `tmdb id` (`tmdb id:season:episode` for an episode), and what it was asked. */
let theintrodb: Record<string, { media: unknown; versions: number[] }> = {};
let asked: string[] = [];
/** IntroDB's segments by `imdb id:season:episode`, in milliseconds, and what it was asked. */
type IntrodbSpan = { start_ms: number; end_ms: number };
let introdb: Record<string, { intro?: IntrodbSpan; recap?: IntrodbSpan }> = {};
let askedIntrodb: string[] = [];
function stubTmdb(status = 200) {
  vi.stubGlobal("fetch", async (u: URL) => {
    if (u.host === "api.introdb.app") {
      const q = u.searchParams;
      const key = [q.get("imdb_id"), q.get("season"), q.get("episode")].join(":");
      askedIntrodb.push(key);
      return Response.json({ imdb_id: q.get("imdb_id"), intro: null, recap: null, outro: null, ...introdb[key] });
    }
    if (u.host === "api.theintrodb.org") {
      const q = u.searchParams;
      const key = [q.get("tmdb_id"), q.get("season"), q.get("episode")].filter(Boolean).join(":");
      asked.push(`${key}${q.has("list_versions") ? " versions" : ` ${q.get("duration_ms")}`}`);
      const known = theintrodb[key];
      if (!known) return Response.json({ error: "media not found" }, { status: 404 });
      return Response.json(q.has("list_versions") ? { versions: known.versions.map((d) => ({ duration_ms: d * 1000 })) } : known.media);
    }
    const m = /\/3\/(movie|tv)\/(\d+)\/(keywords|external_ids)/.exec(String(u));
    calls.push(m ? `${m[1]}:${m[2]}:${m[3]}` : String(u));
    if (status !== 200 || !m) return new Response("", { status: m ? status : 404 });
    const id = Number(m[2]);
    if (m[3] === "external_ids") return Response.json({ id, imdb_id: imdb[id] ?? null });
    return Response.json({ id, keywords: (keywords[id] ?? []).map((k) => ({ id: k, name: `k${k}` })) });
  });
}
/** A segment of SkipDB's import, in seconds. */
let segmentId = 0;
const segment = (
  imdbId: string,
  kind: "intro" | "credits",
  start: number,
  end: number,
  measuredOn: number | null,
  season = 0,
  episode = 0,
) =>
  db.insert(schema.skipdbSegments).values({
    id: ++segmentId,
    imdbId,
    season,
    episode,
    kind,
    startMs: start * 1000,
    endMs: end * 1000,
    durationMs: measuredOn === null ? null : measuredOn * 1000,
  });

beforeAll(async () => {
  await resetDb();
  setSecretsForTests({ tmdb_api_key: "k" });
  await db.insert(schema.appDevices).values({
    code: "SALN42",
    name: "Salon",
    status: "approved",
    tokenHash: sha256(TOKEN).toString("hex"),
    createdAt: daysAgo(30),
    approvedAt: daysAgo(30),
    expiresAt: daysAgo(30),
  });
  const content = (key: string, kind: "vod" | "series", tmdbId: number | null, visible = true) =>
    db
      .insert(schema.catalogContents)
      .values({ key, kind, tmdbId, title: key, visible, addedAt: daysAgo(5) })
      .returning();
  await content("tmdb:movie:19995", "vod", 19995);
  await content("tmdb:movie:1726", "vod", 1726);
  await content("fallback:movie:silver-book-2026", "vod", null);
  await content("tmdb:movie:4", "vod", 4, false);
  const [series] = await content("tmdb:tv:88516", "series", 88516);
  await db.insert(schema.catalogEpisodes).values({ contentId: series.id, key: "tmdb:tv:88516:s02e02", season: 2, number: 2 });
});
beforeEach(async () => {
  await db.delete(schema.tmdbExtras);
  await db.delete(schema.skipdbSegments);
  await db.delete(schema.theintrodbCache);
  await db.delete(schema.introdbCache);
  resetExtras();
  resetTheintrodb();
  resetIntrodb();
  calls = [];
  asked = [];
  theintrodb = {};
  askedIntrodb = [];
  introdb = {};
  keywords = { 1726: [9715, 179430], 19995: [9715] };
  imdb = { 19995: "tt0499549", 1726: "tt0371746", 88516: "tt11905462" };
  stubTmdb();
});
afterEach(() => vi.unstubAllGlobals());
afterAll(closeDb);

describe("POST /playback/{id}/markers", () => {
  it("an episode: the intro with its label, « À suivre » at the credits for twenty seconds, TMDB left alone", async () => {
    const res = await post("tmdb:tv:88516:s02e02", NETFLIX);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      skips: [{ start: 71, end: 86, label: "Passer l'intro" }],
      credits: { at: 3257, countdown: 20 },
    });
    expect(calls).toEqual([]);
  });

  it("a file without named chapters has no marker", async () => {
    const res = await post("tmdb:tv:88516:s02e02", { duration: 2812, chapters: [] });
    expect(await res.json()).toEqual({ skips: [], credits: null });
  });

  it("a movie: its credits when TMDB announces no scene after them, asked once a week", async () => {
    expect(await (await post("tmdb:movie:19995", BLURAY)).json()).toEqual({ skips: [], credits: { at: 10292, countdown: 20 } });
    expect(await (await post("tmdb:movie:19995", BLURAY)).json()).toMatchObject({ credits: { at: 10292 } });
    expect(calls.sort()).toEqual(["movie:19995:external_ids", "movie:19995:keywords"]);
    await db.update(schema.tmdbExtras).set({ fetchedAt: daysAgo(8) });
    keywords[19995] = [179431];
    expect(await (await post("tmdb:movie:19995", BLURAY)).json()).toEqual({ skips: [], credits: null });
    expect(calls).toHaveLength(4);
  });

  it("a movie with a scene after its credits keeps them to the end", async () => {
    expect(await (await post("tmdb:movie:1726", BLURAY)).json()).toEqual({ skips: [], credits: null });
  });

  it("a movie whose keywords are unknown keeps its credits to the end: TMDB down, or no TMDB sheet", async () => {
    stubTmdb(503);
    expect(await (await post("tmdb:movie:19995", BLURAY)).json()).toEqual({ skips: [], credits: null });
    await extrasSettled();
    expect(await (await post("fallback:movie:silver-book-2026", BLURAY)).json()).toEqual({ skips: [], credits: null });
  });

  it("chapters that say nothing: SkipDB by the IMDb id TMDB gives, the credits only when measured on a file of the same length", async () => {
    const plain = { duration: 3547.4, chapters: [] };
    await segment("tt11905462", "intro", 0, 15, 3547, 2, 2);
    await segment("tt11905462", "credits", 3426, 3547, 3547, 2, 2);
    await segment("tt11905462", "credits", 100, 200, 3547, 2, 3); // another episode
    expect(await (await post("tmdb:tv:88516:s02e02", plain)).json()).toEqual({
      skips: [{ start: 0, end: 15, label: "Passer l'intro" }],
      credits: { at: 3426, countdown: 20 },
    });
    expect(calls).toEqual(["tv:88516:external_ids"]);
    // The recap alone is still missing: the two bases are asked for it.
    expect(asked).toEqual(["88516:2:2 3547000"]);
    expect(askedIntrodb).toEqual(["tt11905462:2:2"]);
    // Another release of the same episode, two minutes longer: its intro is offered, its credits are left to the end.
    expect(await (await post("tmdb:tv:88516:s02e02", { duration: 3667, chapters: [] })).json()).toEqual({
      skips: [{ start: 0, end: 15, label: "Passer l'intro" }],
      credits: null,
    });
    expect(calls).toHaveLength(1);
  });

  it("what SkipDB does not know is asked of TheIntroDB, once: its answer is kept, the unknown title too", async () => {
    const plain = { duration: 2893.2, chapters: [] };
    theintrodb["88516:2:2"] = {
      media: { intro: [{ start_ms: 314360, end_ms: 330461 }], credits: [{ start_ms: 2839000, end_ms: null }] },
      versions: [2893.176, 0],
    };
    const known = { skips: [{ start: 314.36, end: 330.461, label: "Passer l'intro" }], credits: { at: 2839, countdown: 20 } };
    expect(await (await post("tmdb:tv:88516:s02e02", plain)).json()).toEqual(known);
    expect(asked).toEqual(["88516:2:2 2893000", "88516:2:2 versions"]);
    expect(await (await post("tmdb:tv:88516:s02e02", plain)).json()).toEqual(known);
    // A file of another length is another question: its credits were not measured on it.
    expect(await (await post("tmdb:tv:88516:s02e02", { duration: 2950, chapters: [] })).json()).toEqual({
      skips: known.skips,
      credits: null,
    });
    expect(asked).toHaveLength(4);
    // A movie the base does not know: one request, then none for a week.
    expect(await (await post("tmdb:movie:19995", BLURAY)).json()).toMatchObject({ skips: [], credits: { at: 10292 } });
    await post("tmdb:movie:19995", BLURAY);
    expect(asked.slice(4)).toEqual(["19995 10690000"]);
  });

  it("SkipDB first: TheIntroDB is asked only for what is still missing, and not when the file says it all", async () => {
    await segment("tt11905462", "intro", 0, 15, 3547, 2, 2);
    theintrodb["88516:2:2"] = {
      media: { intro: [{ start_ms: 60000, end_ms: 90000 }], credits: [{ start_ms: 3426000, end_ms: null }] },
      versions: [3547],
    };
    expect(await (await post("tmdb:tv:88516:s02e02", { duration: 3547, chapters: [] })).json()).toEqual({
      skips: [{ start: 0, end: 15, label: "Passer l'intro" }],
      credits: { at: 3426, countdown: 20 },
    });
    asked = [];
    await post("tmdb:tv:88516:s02e02", NETFLIX);
    expect(asked).toEqual([]);
  });

  it("TheIntroDB down: the markers it would have given are missing this time, nothing fails", async () => {
    vi.stubGlobal("fetch", async () => new Response("", { status: 503 }));
    const res = await post("tmdb:tv:88516:s02e02", { duration: 2893, chapters: [] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ skips: [], credits: null });
    await Promise.all([extrasSettled(), theintrodbSettled()]);
  });

  it("an intro no other source knows is asked of IntroDB, once: unchecked, of an episode only", async () => {
    const plain = { duration: 2893.2, chapters: [] };
    introdb["tt11905462:2:2"] = { intro: { start_ms: 64330, end_ms: 98620 } };
    const known = { skips: [{ start: 64.33, end: 98.62, label: "Passer l'intro" }], credits: null };
    expect(await (await post("tmdb:tv:88516:s02e02", plain)).json()).toEqual(known);
    // Kept by the episode, whatever the file: another length asks TheIntroDB again, not IntroDB.
    expect(await (await post("tmdb:tv:88516:s02e02", { duration: 2950, chapters: [] })).json()).toEqual(known);
    expect(askedIntrodb).toEqual(["tt11905462:2:2"]);
    expect(asked).toHaveLength(2);
    // A movie has no intro there, and its credits would be measured on no known file.
    await post("tmdb:movie:19995", { duration: 10690, chapters: [] });
    expect(askedIntrodb).toHaveLength(1);
  });

  it("IntroDB last: the intro of the file, of SkipDB or of TheIntroDB wins", async () => {
    introdb["tt11905462:2:2"] = { intro: { start_ms: 64330, end_ms: 98620 } };
    theintrodb["88516:2:2"] = { media: { intro: [{ start_ms: 314360, end_ms: 330461 }] }, versions: [] };
    expect(await skips("tmdb:tv:88516:s02e02", { duration: 2893, chapters: [] })).toEqual([
      { start: 314.36, end: 330.461, label: "Passer l'intro" },
    ]);
    await segment("tt11905462", "intro", 0, 15, 3547, 2, 2);
    expect(await skips("tmdb:tv:88516:s02e02", { duration: 3547, chapters: [] })).toEqual([{ start: 0, end: 15, label: "Passer l'intro" }]);
    expect(await skips("tmdb:tv:88516:s02e02", NETFLIX)).toEqual([{ start: 71, end: 86, label: "Passer l'intro" }]);
  });

  it("« Passer le récap » before « Passer l'intro »: named by the file, else by the bases, which never make them overlap", async () => {
    const chapters = [
      { name: "Recap", start: 0, end: 62 },
      { name: "Intro", start: 62, end: 92 },
      { name: "Part 01", start: 92, end: 3000 },
    ];
    expect(await skips("tmdb:tv:88516:s02e02", { duration: 3000, chapters })).toEqual([
      { start: 0, end: 62, label: "Passer le récap" },
      { start: 62, end: 92, label: "Passer l'intro" },
    ]);
    // A recap is an episode's: a movie's chapter of that name is not one.
    expect(await skips("tmdb:movie:19995", { duration: 3000, chapters })).toEqual([{ start: 62, end: 92, label: "Passer l'intro" }]);
    // The bases: an intro timed from the start of the file runs over the recap, and starts where the recap ends.
    await db.delete(schema.introdbCache);
    introdb["tt11905462:2:2"] = { recap: { start_ms: 1000, end_ms: 74000 }, intro: { start_ms: 0, end_ms: 114000 } };
    expect(await skips("tmdb:tv:88516:s02e02", { duration: 3100, chapters: [] })).toEqual([
      { start: 1, end: 74, label: "Passer le récap" },
      { start: 74, end: 114, label: "Passer l'intro" },
    ]);
    // TheIntroDB's recap wins over IntroDB's; SkipDB's over both.
    theintrodb["88516:2:2"] = { media: { recap: [{ start_ms: null, end_ms: 70000 }] }, versions: [] };
    expect(await skips("tmdb:tv:88516:s02e02", { duration: 3200, chapters: [] })).toEqual([
      { start: 0, end: 70, label: "Passer le récap" },
      { start: 70, end: 114, label: "Passer l'intro" },
    ]);
    await db
      .insert(schema.skipdbSegments)
      .values({ id: 9001, imdbId: "tt11905462", season: 2, episode: 2, kind: "recap", startMs: 0, endMs: 65000, durationMs: null });
    expect(await skips("tmdb:tv:88516:s02e02", { duration: 3200, chapters: [] })).toEqual([
      { start: 0, end: 65, label: "Passer le récap" },
      { start: 65, end: 114, label: "Passer l'intro" },
    ]);
  });

  it("IntroDB down: no intro this time, nothing fails", async () => {
    const answer = globalThis.fetch;
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", async (u: URL) => (u.host === "api.introdb.app" ? new Response("", { status: 503 }) : answer(u)));
    const res = await post("tmdb:tv:88516:s02e02", { duration: 2893, chapters: [] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ skips: [], credits: null });
    await introdbSettled();
    expect(String(logged.mock.calls[0][0])).toContain("[introdb] tt11905462:2:2 : HTTP 503");
    logged.mockRestore();
  });

  it("the chapters of the file win over SkipDB, which fills what they do not say", async () => {
    await segment("tt11905462", "intro", 5, 30, 3483, 2, 2);
    await segment("tt11905462", "credits", 3300, 3483, 3483, 2, 2);
    const creditsOnly = { duration: 3483.68, chapters: [{ name: "Credits", start: 3257, end: 3483.68 }] };
    expect(await (await post("tmdb:tv:88516:s02e02", creditsOnly)).json()).toEqual({
      skips: [{ start: 5, end: 30, label: "Passer l'intro" }],
      credits: { at: 3257, countdown: 20 },
    });
  });

  it("a movie: SkipDB's credits too wait for TMDB's keywords; a title TMDB gives no IMDb id has none", async () => {
    const plain = { duration: 10690, chapters: [] };
    await segment("tt0499549", "credits", 10292, 10690, 10690);
    await segment("tt0371746", "credits", 7000, 7560, 7560);
    expect(await (await post("tmdb:movie:19995", plain)).json()).toEqual({ skips: [], credits: { at: 10292, countdown: 20 } });
    expect(await (await post("tmdb:movie:1726", { duration: 7560, chapters: [] })).json()).toEqual({ skips: [], credits: null });
    delete imdb[19995];
    await db.delete(schema.tmdbExtras);
    expect(await (await post("tmdb:movie:19995", plain)).json()).toEqual({ skips: [], credits: null });
  });

  it("404 for what cannot be played or seen, 400 for a malformed body, 401 without a device", async () => {
    for (const id of ["tmdb:tv:88516", "live:fr-tf1", "tmdb:tv:88516:s09e09", "tmdb:movie:4", "tmdb:movie:999", "nope"])
      expect((await post(id, NETFLIX)).status, id).toBe(404);
    for (const body of [
      "{",
      {},
      { duration: 0, chapters: [] },
      { duration: 60, chapters: [{ name: "Intro", start: -1, end: 2 }] },
      { duration: 60 },
    ]) {
      const res = await post("tmdb:movie:19995", body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(((await res.json()) as ApiError).error.code).toBe("bad_request");
    }
    expect((await post("tmdb:movie:19995", NETFLIX, "nope")).status).toBe(401);
  });
});
