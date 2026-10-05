import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from "vitest";
import { db, schema } from "@/db";
import { resetDb, closeDb } from "@/test/db";
import { DAILY_BUDGET, introdbSegments, introdbSettled, resetIntrodb } from "..";

const EPISODE = { mediaType: "tv" as const, tmdbId: 1396, season: 1, episode: 2 };
const MOVIE = { mediaType: "movie" as const, tmdbId: 1726 };
const daysAgo = (d: number) => new Date(Date.now() - d * 86400000);

/** What the base answers: the segments, then the lengths of the files it knows. */
let media: unknown = null;
let versions: (number | null)[] = [];
let asked: string[] = [];
function stub(status = 200, headers: Record<string, string> = {}) {
  vi.stubGlobal("fetch", async (u: URL) => {
    asked.push(u.search);
    if (status !== 200) return new Response("", { status, headers });
    if (u.searchParams.has("list_versions"))
      return Response.json({ versions: versions.map((d) => ({ duration_ms: d === null ? null : d * 1000 })) });
    return media ? Response.json(media) : Response.json({ error: "media not found" }, { status: 404 });
  });
}

beforeAll(resetDb);
beforeEach(async () => {
  await db.delete(schema.theintrodbCache);
  resetIntrodb();
  asked = [];
  media = { intro: [{ start_ms: 314360, end_ms: 330461 }], credits: [{ start_ms: 2839000, end_ms: null }] };
  versions = [2893.176, 0];
  stub();
});
afterEach(() => vi.unstubAllGlobals());
afterAll(closeDb);

describe("TheIntroDB", () => {
  it("an episode by its TMDB id, its season, its number and the length of the file; its segments measured on the closest file it knows", async () => {
    expect(await introdbSegments(EPISODE, 2893.2, 1000)).toEqual([
      { kind: "intro", start: 314.36, end: 330.461, measuredOn: 2893.176 },
      { kind: "credits", start: 2839, end: null, measuredOn: 2893.176 },
    ]);
    expect(asked).toEqual(["?tmdb_id=1396&season=1&episode=2&duration_ms=2893000", "?tmdb_id=1396&season=1&episode=2&list_versions=true"]);
  });

  it("a movie by its id alone; several blocks of credits, an intro without a start, « no intro » left out", async () => {
    media = {
      intro: [
        { start_ms: 0, end_ms: 0 },
        { start_ms: null, end_ms: 53000 },
      ],
      credits: [
        { start_ms: 7039000, end_ms: 7512000 },
        { start_ms: 7546000, end_ms: 7561000 },
      ],
    };
    versions = [121, 7561.792];
    expect(await introdbSegments(MOVIE, 7560, 1000)).toEqual([
      { kind: "intro", start: 0, end: 53, measuredOn: 7561.792 },
      { kind: "credits", start: 7039, end: 7512, measuredOn: 7561.792 },
      { kind: "credits", start: 7546, end: 7561, measuredOn: 7561.792 },
    ]);
    expect(asked[0]).toBe("?tmdb_id=1726&duration_ms=7560000");
  });

  it("the preview of the next episode comes with the credits it follows", async () => {
    media = {
      credits: [{ start_ms: 1345005, end_ms: 1434975 }],
      preview: [{ start_ms: 1435000, end_ms: null }],
      recap: [{ start_ms: 0, end_ms: 42000 }],
    };
    versions = [1450.997];
    expect(await introdbSegments(EPISODE, 1452, 1000)).toEqual([
      { kind: "credits", start: 1345.005, end: 1434.975, measuredOn: 1450.997 },
      { kind: "preview", start: 1435, end: null, measuredOn: 1450.997 },
    ]);
  });

  it("no length known, or none at all: measured on an unknown file", async () => {
    versions = [0, null];
    expect((await introdbSegments(EPISODE, 2893, 1000)).map((s) => s.measuredOn)).toEqual([null, null]);
  });

  it("kept a month: the same file asks nothing more, another length does", async () => {
    await introdbSegments(EPISODE, 2893, 1000);
    await introdbSegments(EPISODE, 2893.4, 1000);
    expect(asked).toHaveLength(2);
    await introdbSegments(EPISODE, 2950, 1000);
    expect(asked).toHaveLength(4);
    await db.update(schema.theintrodbCache).set({ fetchedAt: daysAgo(31) });
    media = { credits: [{ start_ms: 2840000, end_ms: null }] };
    expect(await introdbSegments(EPISODE, 2893, 1000)).toEqual([{ kind: "credits", start: 2840, end: null, measuredOn: 2893.176 }]);
  });

  it("a title the base does not know: one request, kept a week", async () => {
    media = null;
    expect(await introdbSegments(EPISODE, 2893, 1000)).toEqual([]);
    expect(await introdbSegments(EPISODE, 2893, 1000)).toEqual([]);
    expect(asked).toHaveLength(1);
    await db.update(schema.theintrodbCache).set({ fetchedAt: daysAgo(8) });
    media = { intro: [{ start_ms: 1000, end_ms: 31000 }] };
    expect(await introdbSegments(EPISODE, 2893, 1000)).toHaveLength(1);
  });

  it("an outage answers what was kept, and leaves that title alone ten minutes", async () => {
    await introdbSegments(EPISODE, 2893, 1000);
    await db.update(schema.theintrodbCache).set({ fetchedAt: daysAgo(31) });
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    stub(503);
    expect(await introdbSegments(EPISODE, 2893, 1000)).toHaveLength(2);
    expect(await introdbSegments(EPISODE, 2893, 1000)).toHaveLength(2);
    expect(asked).toHaveLength(3);
    expect(await introdbSegments(MOVIE, 7560, 1000)).toEqual([]);
    expect(String(logged.mock.calls[0][0])).toContain("HTTP 503");
    logged.mockRestore();
  });

  it("refused (429): nothing more is asked until the delay it gives is over", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    stub(429, { "retry-after": "120" });
    expect(await introdbSegments(EPISODE, 2893, 1000)).toEqual([]);
    stub();
    expect(await introdbSegments(MOVIE, 7560, 1000)).toEqual([]);
    expect(asked).toHaveLength(1);
    expect(await db.$count(schema.theintrodbCache)).toBe(0);
    vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + 121_000 });
    expect(await introdbSegments(MOVIE, 7560, 1000)).toHaveLength(2);
    vi.useRealTimers();
    logged.mockRestore();
  });

  it("the day's budget spent: nothing is asked nor kept until tomorrow", async () => {
    media = null;
    for (let i = 0; i < DAILY_BUDGET; i++) await introdbSegments({ ...EPISODE, episode: i + 1 }, 2893, 1000);
    expect(asked).toHaveLength(DAILY_BUDGET);
    media = { intro: [{ start_ms: 1000, end_ms: 31000 }] };
    expect(await introdbSegments(MOVIE, 7560, 1000)).toEqual([]);
    expect(asked).toHaveLength(DAILY_BUDGET);
    expect(await db.$count(schema.theintrodbCache)).toBe(DAILY_BUDGET);
    vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + 86400000 });
    expect(await introdbSegments(MOVIE, 7560, 1000)).toHaveLength(1);
    vi.useRealTimers();
  });

  it("a slow base does not hold the player: nothing this time, the answer kept for the next", async () => {
    let release = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const answer = globalThis.fetch;
    vi.stubGlobal("fetch", async (u: URL) => {
      await gate;
      return answer(u);
    });
    expect(await introdbSegments(EPISODE, 2893, 20)).toEqual([]);
    release();
    await introdbSettled();
    expect(await introdbSegments(EPISODE, 2893, 20)).toHaveLength(2);
  });

  it("an episode without its season or its number is not asked for", async () => {
    expect(await introdbSegments({ mediaType: "tv", tmdbId: 1396 }, 2893, 1000)).toEqual([]);
    expect(asked).toEqual([]);
  });
});
