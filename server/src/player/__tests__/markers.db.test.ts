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

/** TMDB's keywords by movie, as `/movie/603/keywords` answers them. */
let keywords: Record<number, number[]> = {};
let calls: string[] = [];
function stubTmdb(status = 200) {
  vi.stubGlobal("fetch", async (u: URL) => {
    const m = /\/3\/movie\/(\d+)\/keywords/.exec(String(u));
    calls.push(m ? `movie:${m[1]}` : String(u));
    if (status !== 200) return new Response("", { status });
    return Response.json({ id: Number(m?.[1]), keywords: (keywords[Number(m?.[1])] ?? []).map((id) => ({ id, name: `k${id}` })) });
  });
}

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
  resetExtras();
  calls = [];
  keywords = { 1726: [9715, 179430], 19995: [9715] };
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
    expect(calls).toEqual(["movie:19995"]);
    await db.update(schema.tmdbExtras).set({ fetchedAt: daysAgo(8) });
    keywords[19995] = [179431];
    expect(await (await post("tmdb:movie:19995", BLURAY)).json()).toEqual({ intro: null, credits: null });
    expect(calls).toEqual(["movie:19995", "movie:19995"]);
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

  it("a movie without a credits chapter asks TMDB nothing", async () => {
    await post("tmdb:movie:19995", { duration: 10144, chapters: [{ name: "Chapter 1", start: 0, end: 10144 }] });
    expect(calls).toEqual([]);
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
