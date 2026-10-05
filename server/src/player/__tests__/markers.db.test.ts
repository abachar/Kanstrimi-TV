import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from "vitest";
import { db, schema } from "@/db";
import { sha256 } from "@/shared";
import { resetDb, closeDb } from "@/test/db";
import { setSecretsForTests } from "@/config";
import { extrasSettled, resetExtras } from "@/providers/tmdb";
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

/** TMDB's keywords by movie and IMDb ids by title, as `/movie/603/keywords` and `/tv/1396/external_ids` answer them. */
let keywords: Record<number, number[]> = {};
let imdb: Record<number, string> = {};
let calls: string[] = [];
function stubTmdb(status = 200) {
  vi.stubGlobal("fetch", async (u: URL) => {
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
  resetExtras();
  calls = [];
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
    expect(await res.json()).toEqual({ intro: { start: 71, end: 86, label: "Passer l'intro" }, credits: { at: 3257, countdown: 20 } });
    expect(calls).toEqual([]);
  });

  it("a file without named chapters has no marker", async () => {
    const res = await post("tmdb:tv:88516:s02e02", { duration: 2812, chapters: [] });
    expect(await res.json()).toEqual({ intro: null, credits: null });
  });

  it("a movie: its credits when TMDB announces no scene after them, asked once a week", async () => {
    expect(await (await post("tmdb:movie:19995", BLURAY)).json()).toEqual({ intro: null, credits: { at: 10292, countdown: 20 } });
    expect(await (await post("tmdb:movie:19995", BLURAY)).json()).toMatchObject({ credits: { at: 10292 } });
    expect(calls.sort()).toEqual(["movie:19995:external_ids", "movie:19995:keywords"]);
    await db.update(schema.tmdbExtras).set({ fetchedAt: daysAgo(8) });
    keywords[19995] = [179431];
    expect(await (await post("tmdb:movie:19995", BLURAY)).json()).toEqual({ intro: null, credits: null });
    expect(calls).toHaveLength(4);
  });

  it("a movie with a scene after its credits keeps them to the end", async () => {
    expect(await (await post("tmdb:movie:1726", BLURAY)).json()).toEqual({ intro: null, credits: null });
  });

  it("a movie whose keywords are unknown keeps its credits to the end: TMDB down, or no TMDB sheet", async () => {
    stubTmdb(503);
    expect(await (await post("tmdb:movie:19995", BLURAY)).json()).toEqual({ intro: null, credits: null });
    await extrasSettled();
    expect(await (await post("fallback:movie:silver-book-2026", BLURAY)).json()).toEqual({ intro: null, credits: null });
  });

  it("chapters that say nothing: SkipDB by the IMDb id TMDB gives, the credits only when measured on a file of the same length", async () => {
    const plain = { duration: 3547.4, chapters: [] };
    await segment("tt11905462", "intro", 0, 15, 3547, 2, 2);
    await segment("tt11905462", "credits", 3426, 3547, 3547, 2, 2);
    await segment("tt11905462", "credits", 100, 200, 3547, 2, 3); // another episode
    expect(await (await post("tmdb:tv:88516:s02e02", plain)).json()).toEqual({
      intro: { start: 0, end: 15, label: "Passer l'intro" },
      credits: { at: 3426, countdown: 20 },
    });
    expect(calls).toEqual(["tv:88516:external_ids"]);
    // Another release of the same episode, two minutes longer: its intro is offered, its credits are left to the end.
    expect(await (await post("tmdb:tv:88516:s02e02", { duration: 3667, chapters: [] })).json()).toEqual({
      intro: { start: 0, end: 15, label: "Passer l'intro" },
      credits: null,
    });
    expect(calls).toHaveLength(1);
  });

  it("the chapters of the file win over SkipDB, which fills what they do not say", async () => {
    await segment("tt11905462", "intro", 5, 30, 3483, 2, 2);
    await segment("tt11905462", "credits", 3300, 3483, 3483, 2, 2);
    const creditsOnly = { duration: 3483.68, chapters: [{ name: "Credits", start: 3257, end: 3483.68 }] };
    expect(await (await post("tmdb:tv:88516:s02e02", creditsOnly)).json()).toEqual({
      intro: { start: 5, end: 30, label: "Passer l'intro" },
      credits: { at: 3257, countdown: 20 },
    });
  });

  it("a movie: SkipDB's credits too wait for TMDB's keywords; a title TMDB gives no IMDb id has none", async () => {
    const plain = { duration: 10690, chapters: [] };
    await segment("tt0499549", "credits", 10292, 10690, 10690);
    await segment("tt0371746", "credits", 7000, 7560, 7560);
    expect(await (await post("tmdb:movie:19995", plain)).json()).toEqual({ intro: null, credits: { at: 10292, countdown: 20 } });
    expect(await (await post("tmdb:movie:1726", { duration: 7560, chapters: [] })).json()).toEqual({ intro: null, credits: null });
    delete imdb[19995];
    await db.delete(schema.tmdbExtras);
    expect(await (await post("tmdb:movie:19995", plain)).json()).toEqual({ intro: null, credits: null });
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
