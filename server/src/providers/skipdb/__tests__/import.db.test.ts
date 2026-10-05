import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from "vitest";
import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { resetDb, closeDb } from "@/test/db";
import { runSkipdbImport, segmentsOf } from "..";

const DUMP = "https://github.com/SkipDB-TV/skipdb/releases/download/data-2026-10-05/skipdb-dump.json";
/** GitHub's releases, the stale `data-latest` first as it comes. */
const RELEASES = [
  { tag_name: "data-latest", assets: [{ name: "skipdb-dump.json", browser_download_url: "https://old.test/dump.json" }] },
  { tag_name: "v1.4.0", assets: [] },
  { tag_name: "data-2026-10-05", assets: [{ name: "skipdb-dump.json", browser_download_url: DUMP }] },
  { tag_name: "data-2026-10-04", assets: [{ name: "skipdb-dump.json", browser_download_url: "https://older.test/dump.json" }] },
];
let id = 0;
const seg = (over: Record<string, unknown>) => ({
  id: ++id,
  imdb_id: "tt1190634",
  media_type: "series",
  season: 1,
  episode: 2,
  segment_type: "outro",
  status: "approved",
  start_ms: 3426000,
  end_ms: 3547000,
  duration_ms: 3547000,
  ...over,
});
let releases: unknown = RELEASES;
let segments: unknown[] = [];
let fetched: string[] = [];
function stub(status = 200) {
  vi.stubGlobal("fetch", async (u: unknown) => {
    fetched.push(String(u));
    if (status !== 200) return new Response("", { status });
    return Response.json(String(u).includes("api.github.com") ? releases : { license: "ODbL 1.0", segments });
  });
}

beforeAll(resetDb);
beforeEach(async () => {
  await db.delete(schema.skipdbSegments);
  id = 0;
  releases = RELEASES;
  fetched = [];
  segments = [
    seg({}),
    seg({ segment_type: "intro", start_ms: 0, end_ms: 15000 }),
    seg({
      imdb_id: "tt0499549",
      media_type: "movie",
      season: null,
      episode: null,
      start_ms: 10292000,
      end_ms: 10690000,
      duration_ms: null,
    }),
  ];
  stub();
});
afterEach(() => vi.unstubAllGlobals());
afterAll(closeDb);

describe("SkipDB import", () => {
  it("takes the export of the latest dated release and keeps its intros and end credits", async () => {
    expect(await runSkipdbImport()).toEqual({ segments: 3, titles: 2 });
    expect(fetched).toEqual([expect.stringContaining("api.github.com/repos/SkipDB-TV/skipdb/releases"), DUMP]);
    expect(await segmentsOf({ imdbId: "tt1190634", season: 1, episode: 2 })).toEqual([
      { kind: "credits", start: 3426, end: 3547, measuredOn: 3547 },
      { kind: "intro", start: 0, end: 15, measuredOn: 3547 },
    ]);
    // A movie, by its id alone; the length of its file unknown.
    expect(await segmentsOf({ imdbId: "tt0499549" })).toEqual([{ kind: "credits", start: 10292, end: 10690, measuredOn: null }]);
    expect(await segmentsOf({ imdbId: "tt1190634", season: 1, episode: 3 })).toEqual([]);
  });

  it("leaves out what is not an approved intro or outro, « no intro » rows and broken ones", async () => {
    const kept = seg({});
    segments = [
      kept,
      seg({ segment_type: "recap", start_ms: 0, end_ms: 60000 }),
      seg({ segment_type: "preview" }),
      seg({ status: "pending" }),
      seg({ segment_type: "intro", start_ms: 0, end_ms: 0 }),
      seg({ imdb_id: "1190634" }),
      seg({ season: null }),
      seg({ start_ms: "12" }),
      seg({ end_ms: 99_999_999 }),
      seg({ imdb_id: "tt0000001", media_type: "movie", season: 1, episode: 1 }),
      { ...kept, start_ms: 1 }, // the same id twice
      null,
    ];
    expect(await runSkipdbImport()).toEqual({ segments: 1, titles: 1 });
    expect((await db.select().from(schema.skipdbSegments)).map((r) => [r.id, r.startMs])).toEqual([[kept.id, 3426000]]);
  });

  it("replaces the previous import as a whole", async () => {
    await runSkipdbImport();
    segments = [seg({ imdb_id: "tt9999999" }), seg({ imdb_id: "tt9999999", episode: 3 })];
    expect(await runSkipdbImport()).toEqual({ segments: 2, titles: 1 });
    const rows = await db.select().from(schema.skipdbSegments).orderBy(asc(schema.skipdbSegments.id));
    expect(rows.map((r) => [r.imdbId, r.episode])).toEqual([
      ["tt9999999", 2],
      ["tt9999999", 3],
    ]);
  });

  it("an empty, half-gone or unreachable export keeps the previous import", async () => {
    await runSkipdbImport();
    segments = [];
    await expect(runSkipdbImport()).rejects.toThrow(/export vide/);
    segments = [seg({})];
    await expect(runSkipdbImport()).rejects.toThrow(/fond de 3 à 1/);
    stub(503);
    await expect(runSkipdbImport()).rejects.toThrow(/HTTP 503/);
    stub();
    releases = [{ tag_name: "data-latest", assets: [{ name: "skipdb-dump.json", browser_download_url: "https://old.test/dump.json" }] }];
    await expect(runSkipdbImport()).rejects.toThrow(/aucun export daté/);
    expect(await db.$count(schema.skipdbSegments)).toBe(3);
  });
});
