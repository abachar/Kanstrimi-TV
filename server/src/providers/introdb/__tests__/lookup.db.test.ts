import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from "vitest";
import { db, schema } from "@/db";
import { resetDb, closeDb } from "@/test/db";
import { DAILY_BUDGET, introdbSegments, introdbSettled, resetIntrodb } from "..";

const EPISODE = { imdbId: "tt0903747", season: 1, episode: 2 };
const OTHER = { imdbId: "tt0944947", season: 1, episode: 2 };
const daysAgo = (d: number) => new Date(Date.now() - d * 86400000);
const INTRO = { kind: "intro", start: 64.33, end: 98.62, measuredOn: null };

/** What the base answers for any episode: its segments, null for those it does not know. */
let answer: Record<string, unknown> = {};
let asked: string[] = [];
function stub(status = 200, headers: Record<string, string> = {}) {
  vi.stubGlobal("fetch", async (u: URL) => {
    asked.push(u.search);
    if (status !== 200) return new Response("", { status, headers });
    return Response.json({ imdb_id: u.searchParams.get("imdb_id"), intro: null, recap: null, outro: null, post_credits: null, ...answer });
  });
}

beforeAll(resetDb);
beforeEach(async () => {
  await db.delete(schema.introdbCache);
  resetIntrodb();
  asked = [];
  answer = { intro: { start_sec: 64.33, end_sec: 98.62, start_ms: 64330, end_ms: 98620, confidence: 1, submission_count: 3 } };
  stub();
});
afterEach(() => vi.unstubAllGlobals());
afterAll(closeDb);

describe("IntroDB", () => {
  it("an episode by its series' IMDb id, its season and its number: its intro, measured on no known file", async () => {
    expect(await introdbSegments(EPISODE, 1000)).toEqual([INTRO]);
    expect(asked).toEqual(["?imdb_id=tt0903747&season=1&episode=2"]);
  });

  it("the recap with the intro; the credits, measured on no known file, are left out", async () => {
    answer = {
      intro: { start_ms: 60000, end_ms: 95000 },
      recap: { start_ms: 0, end_ms: 60000 },
      outro: { start_ms: 3431000, end_ms: 3500000 },
      post_credits: { start_ms: 3500000, end_ms: 3520000 },
    };
    expect(await introdbSegments(EPISODE, 1000)).toEqual([
      { kind: "recap", start: 0, end: 60, measuredOn: null },
      { kind: "intro", start: 60, end: 95, measuredOn: null },
    ]);
  });

  it("an intro without an end, or ending where it starts, is none", async () => {
    answer = { intro: { start_ms: 0, end_ms: 0 } };
    expect(await introdbSegments(EPISODE, 1000)).toEqual([]);
    answer = { intro: { start_ms: 5000, end_ms: null } };
    expect(await introdbSegments(OTHER, 1000)).toEqual([]);
  });

  it("kept a month: the same episode asks nothing more", async () => {
    await introdbSegments(EPISODE, 1000);
    await introdbSegments(EPISODE, 1000);
    expect(asked).toHaveLength(1);
    await db.update(schema.introdbCache).set({ fetchedAt: daysAgo(31) });
    answer = { intro: { start_ms: 60000, end_ms: 95000 } };
    expect(await introdbSegments(EPISODE, 1000)).toEqual([{ ...INTRO, start: 60, end: 95 }]);
  });

  it("an episode the base does not know: one request, kept a week", async () => {
    answer = {};
    expect(await introdbSegments(EPISODE, 1000)).toEqual([]);
    expect(await introdbSegments(EPISODE, 1000)).toEqual([]);
    expect(asked).toHaveLength(1);
    await db.update(schema.introdbCache).set({ fetchedAt: daysAgo(8) });
    answer = { intro: { start_ms: 1000, end_ms: 31000 } };
    expect(await introdbSegments(EPISODE, 1000)).toHaveLength(1);
  });

  it("an outage answers what was kept, and leaves that episode alone ten minutes", async () => {
    await introdbSegments(EPISODE, 1000);
    await db.update(schema.introdbCache).set({ fetchedAt: daysAgo(31) });
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    stub(503);
    expect(await introdbSegments(EPISODE, 1000)).toEqual([INTRO]);
    expect(await introdbSegments(EPISODE, 1000)).toEqual([INTRO]);
    expect(asked).toHaveLength(2);
    expect(await introdbSegments(OTHER, 1000)).toEqual([]);
    expect(String(logged.mock.calls[0][0])).toContain("HTTP 503");
    logged.mockRestore();
  });

  it("refused (429): nothing more is asked until the delay it gives is over", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    stub(429, { "retry-after": "120" });
    expect(await introdbSegments(EPISODE, 1000)).toEqual([]);
    stub();
    expect(await introdbSegments(OTHER, 1000)).toEqual([]);
    expect(asked).toHaveLength(1);
    expect(await db.$count(schema.introdbCache)).toBe(0);
    vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + 121_000 });
    expect(await introdbSegments(OTHER, 1000)).toHaveLength(1);
    vi.useRealTimers();
    logged.mockRestore();
  });

  it("the day's budget spent: nothing is asked nor kept until tomorrow", async () => {
    answer = {};
    for (let i = 0; i < DAILY_BUDGET; i++) await introdbSegments({ ...EPISODE, episode: i + 1 }, 1000);
    expect(asked).toHaveLength(DAILY_BUDGET);
    answer = { intro: { start_ms: 1000, end_ms: 31000 } };
    expect(await introdbSegments(OTHER, 1000)).toEqual([]);
    expect(asked).toHaveLength(DAILY_BUDGET);
    expect(await db.$count(schema.introdbCache)).toBe(DAILY_BUDGET);
    vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + 86400000 });
    expect(await introdbSegments(OTHER, 1000)).toHaveLength(1);
    vi.useRealTimers();
  });

  it("a slow base does not hold the player: nothing this time, the answer kept for the next", async () => {
    let release = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const answered = globalThis.fetch;
    vi.stubGlobal("fetch", async (u: URL) => {
      await gate;
      return answered(u);
    });
    expect(await introdbSegments(EPISODE, 20)).toEqual([]);
    release();
    await introdbSettled();
    expect(await introdbSegments(EPISODE, 20)).toEqual([INTRO]);
  });
});
