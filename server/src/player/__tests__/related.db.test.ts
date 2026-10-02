import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from "vitest";
import { db, schema } from "@/db";
import { resetDb, closeDb } from "@/test/db";
import { setSettings, verify } from "@/config";
import { recommendedKeys } from "@/catalog";
import { recommendationsSettled, resetRecommendations } from "@/providers/tmdb";
import { contentByKey } from "../contents";
import { recommendedRow, sheetRelated, suggestions } from "../related";
import { setProgress } from "../progress";
import { setFavorite } from "../favorites";
import type { RestContext } from "../context";

const ctx: RestContext = { baseUrl: "http://k.test", device: null, tmdbLang: "fr-FR", providerName: "p", serveAdult: false };
const daysAgo = (d: number) => new Date(Date.now() - d * 86400000);

/** TMDB's recommendations by title, as `/movie/603/recommendations` answers them. */
let tmdb: Record<string, number[]> = {};
let calls: string[] = [];
/** `gate`: TMDB answers once it resolves (a slow TMDB, without a clock). */
function stubTmdb(gate?: Promise<void>, status = 200) {
  vi.stubGlobal("fetch", async (u: URL) => {
    const m = /\/3\/(movie|tv)\/(\d+)\/recommendations/.exec(String(u));
    calls.push(m ? `${m[1]}:${m[2]}` : String(u));
    if (gate) await gate;
    if (status !== 200) return new Response("", { status });
    return Response.json({ results: (tmdb[m ? `${m[1]}:${m[2]}` : ""] ?? []).map((id) => ({ id })) });
  });
}

async function content(key: string, title: string, extra: Partial<typeof schema.catalogContents.$inferInsert> = {}) {
  const [kind, id] = key.startsWith("tmdb:tv:") ? (["series", key.slice(8)] as const) : (["vod", key.slice(11)] as const);
  const [row] = await db
    .insert(schema.catalogContents)
    .values({ key, kind, tmdbId: Number(id), title, visible: true, addedAt: daysAgo(5), ...extra })
    .returning();
  return row;
}

beforeAll(async () => {
  await resetDb();
  expect(await verify("test")).toBe(true);
  await setSettings({ tmdb_api_key: "k" });
  await content("tmdb:movie:603", "Matrix", { sagaId: 2344, releaseDate: "1999-03-31" });
  await content("tmdb:movie:604", "Matrix Reloaded", { sagaId: 2344, releaseDate: "2003-05-15", overview: "La suite." });
  await content("tmdb:movie:605", "Matrix Revolutions", { sagaId: 2344, releaseDate: "2003-11-05" });
  await content("tmdb:movie:1", "Inception");
  await content("tmdb:movie:2", "Interstellar");
  await content("tmdb:movie:3", "Tenet");
  await content("tmdb:movie:4", "Masqué", { visible: false });
  await content("tmdb:movie:5", "Dunkerque");
  const lost = await content("tmdb:tv:4607", "Lost");
  await content("tmdb:tv:1399", "Game of Thrones");
  await content("tmdb:tv:66732", "Stranger Things");
  await db.insert(schema.catalogEpisodes).values([
    { contentId: lost.id, key: "tmdb:tv:4607:s01e01", season: 1, number: 1 },
    { contentId: lost.id, key: "tmdb:tv:4607:s06e18", season: 6, number: 18 },
  ]);
});
beforeEach(async () => {
  await db.delete(schema.tmdbRecommendations);
  await db.delete(schema.appWatchProgress);
  await db.delete(schema.appFavorites);
  resetRecommendations();
  calls = [];
  tmdb = {
    "movie:603": [1, 999, 4, 2, 3, 604],
    "movie:1": [2, 3, 5],
    "tv:1399": [4607, 66732],
    "tv:66732": [1399],
  };
});
afterEach(() => vi.unstubAllGlobals());
afterAll(closeDb);

const ids = (cards: { id: string }[]) => cards.map((c) => c.id);

describe("sheet", () => {
  it("TMDB's order, the catalogue's visible titles only, fetched once a week", async () => {
    stubTmdb();
    const matrix = (await contentByKey(ctx, "tmdb:movie:603"))!;
    expect(ids(await sheetRelated(ctx, matrix))).toEqual(["tmdb:movie:1", "tmdb:movie:2", "tmdb:movie:3", "tmdb:movie:604"]);
    expect(ids(await sheetRelated(ctx, matrix))).toHaveLength(4);
    expect(calls).toEqual(["movie:603"]);
  });

  it("drops what was seen, keeps what is in progress with its progress", async () => {
    stubTmdb();
    await setProgress("tmdb:movie:1", 5900, 6000);
    await setProgress("tmdb:movie:2", 1000, 6000);
    const cards = await sheetRelated(ctx, (await contentByKey(ctx, "tmdb:movie:603"))!);
    expect(ids(cards)).toEqual(["tmdb:movie:2", "tmdb:movie:3", "tmdb:movie:604"]);
    expect(cards[0].progress).toEqual({ position: 1000, duration: 6000 });
  });

  it("a series is seen once its last episode is", async () => {
    stubTmdb();
    const got = await contentByKey(ctx, "tmdb:tv:1399");
    await setProgress("tmdb:tv:4607:s01e01", 2500, 2600);
    expect(ids(await sheetRelated(ctx, got!))).toEqual(["tmdb:tv:4607", "tmdb:tv:66732"]);
    await setProgress("tmdb:tv:4607:s06e18", 2500, 2600);
    expect(ids(await sheetRelated(ctx, got!))).toEqual(["tmdb:tv:66732"]);
  });
});

describe("fetch on demand", () => {
  it("a slow TMDB answers nothing now, the list lands for the next call", async () => {
    let answer!: () => void;
    stubTmdb(new Promise((r) => (answer = r)));
    expect(await recommendedKeys("tmdb:movie:1", 5)).toEqual([]);
    answer();
    await recommendationsSettled();
    expect(await recommendedKeys("tmdb:movie:1", 5)).toEqual(["tmdb:movie:2", "tmdb:movie:3", "tmdb:movie:5"]);
    expect(calls).toEqual(["movie:1"]);
  });

  it("past a week the list is fetched again; a failure keeps the old one and leaves TMDB alone", async () => {
    await db.insert(schema.tmdbRecommendations).values({ mediaType: "movie", tmdbId: 1, ids: [5], fetchedAt: daysAgo(8) });
    stubTmdb(undefined, 500);
    expect(await recommendedKeys("tmdb:movie:1", 1000)).toEqual(["tmdb:movie:5"]);
    expect(await recommendedKeys("tmdb:movie:1", 1000)).toEqual(["tmdb:movie:5"]);
    expect(calls).toEqual(["movie:1"]);
    resetRecommendations();
    stubTmdb();
    expect(await recommendedKeys("tmdb:movie:1", 1000)).toEqual(["tmdb:movie:2", "tmdb:movie:3", "tmdb:movie:5"]);
  });

  it("nothing for a title unknown to TMDB, an episode or a channel", async () => {
    stubTmdb();
    for (const key of ["fallback:movie:x:2020", "tmdb:tv:1399:s01e01", "live:fr-tf1"]) expect(await recommendedKeys(key, 1000)).toEqual([]);
    expect(calls).toEqual([]);
  });
});

describe("player", () => {
  it("a movie: five related titles with their overview, the saga's next movie to follow", async () => {
    stubTmdb();
    const s = (await suggestions(ctx, "tmdb:movie:603"))!;
    expect(ids(s.related)).toEqual(["tmdb:movie:1", "tmdb:movie:2", "tmdb:movie:3", "tmdb:movie:604"]);
    expect(s.next).toMatchObject({ reason: "saga", card: { id: "tmdb:movie:604", title: "Matrix Reloaded", overview: "La suite." } });
  });

  it("the saga's next movie seen: the one after it; none left: TMDB's first, nothing seen or in progress", async () => {
    stubTmdb();
    await setProgress("tmdb:movie:604", 5900, 6000);
    expect((await suggestions(ctx, "tmdb:movie:603"))!.next).toMatchObject({ reason: "saga", card: { id: "tmdb:movie:605" } });
    await setProgress("tmdb:movie:605", 1000, 6000);
    await setProgress("tmdb:movie:1", 1000, 6000);
    expect((await suggestions(ctx, "tmdb:movie:603"))!.next).toMatchObject({ reason: "recommended", card: { id: "tmdb:movie:2" } });
  });

  it("the last episode of a series: another series, never started", async () => {
    stubTmdb();
    await setProgress("tmdb:tv:4607:s01e01", 1000, 2600);
    const s = (await suggestions(ctx, "tmdb:tv:1399:s08e06"))!;
    expect(ids(s.related)).toEqual(["tmdb:tv:4607", "tmdb:tv:66732"]);
    expect(s.next).toMatchObject({ reason: "recommended", card: { id: "tmdb:tv:66732", kind: "series" } });
  });

  it("not a movie or an episode: nothing", async () => {
    expect(await suggestions(ctx, "tmdb:tv:1399")).toBeNull();
    expect(await suggestions(ctx, "tmdb:movie:4")).toBeNull();
    expect(await suggestions(ctx, "live:fr-tf1")).toBeNull();
  });
});

describe("home", () => {
  it("nothing watched: no row", async () => {
    stubTmdb();
    expect(await recommendedRow(ctx)).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("filled in the background, weighed by rank and recency, without what was seen, started or listed", async () => {
    stubTmdb();
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-02T20:00:00Z") });
    await setProgress("tmdb:movie:603", 5900, 6000);
    vi.setSystemTime(new Date("2026-10-02T20:01:00Z")); // watched later: the more recent seed
    await setProgress("tmdb:movie:1", 3000, 6000);
    vi.useRealTimers();
    await setProgress("tmdb:tv:1399:s01e01", 10, 3000); // below 5 %: not a seed
    await setFavorite("tmdb:tv:66732", true);
    expect(await recommendedRow(ctx)).toEqual([]);
    await recommendationsSettled();
    expect(calls.sort()).toEqual(["movie:1", "movie:603", "tv:66732"]);
    await setProgress("tmdb:movie:3", 1000, 6000);
    // Interstellar is recommended by both seeds; Matrix (seen) and Inception (started) are seeds themselves.
    const row = ids(await recommendedRow(ctx));
    expect(row).toEqual(["tmdb:movie:2", "tmdb:movie:5", "tmdb:movie:604", "tmdb:tv:1399"]);
  });
});
