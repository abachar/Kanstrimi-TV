import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { resetDb, closeDb } from "@/test/db";
import { setProgress, getProgress, resumeKeys, isResumable } from "../progress";
import { setFavorite, favoriteKeys } from "../favorites";

beforeAll(resetDb);
afterAll(closeDb);

describe("watch progress", () => {
  it("upserts, last write wins, and derives 'vu' at 90 %", async () => {
    await setProgress("tmdb:movie:603", 100, 8280);
    const p1 = await setProgress("tmdb:movie:603", 4520, 8280);
    expect(p1.position).toBe(4520);
    expect(p1.finished).toBe(false);
    const p2 = await setProgress("tmdb:movie:603", 7500, 8280);
    expect(p2.finished).toBe(true);
    expect((await getProgress(["tmdb:movie:603"])).get("tmdb:movie:603")?.position).toBe(7500);
  });

  it("lists resumable keys only, most recent first", async () => {
    await setProgress("tmdb:tv:1396:s01e05", 1140, 3060);
    await setProgress("tmdb:movie:1", 10, 6000); // below 5 %
    await setProgress("tmdb:movie:2", 5900, 6000); // finished
    await setProgress("tmdb:movie:3", 0, 0); // no duration yet
    vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + 60_000 }); // watched a minute later
    await setProgress("tmdb:movie:4", 1000, 6000);
    vi.useRealTimers();
    const keys = (await resumeKeys()).map((r) => r.contentKey);
    expect(keys).toEqual(["tmdb:movie:4", "tmdb:tv:1396:s01e05"]);
    expect(isResumable((await getProgress(["tmdb:movie:1"])).get("tmdb:movie:1"))).toBe(false);
  });

  it("rejects nothing but clamps negatives", async () => {
    const p = await setProgress("x", -5, -1);
    expect(p).toMatchObject({ position: 0, duration: 0, finished: false });
  });
});

describe("favorites", () => {
  it("toggles idempotently and keeps insertion order", async () => {
    await setFavorite("tmdb:movie:603", true);
    await setFavorite("tmdb:movie:603", true);
    await setFavorite("live:fr-tf1", true);
    expect(await favoriteKeys()).toEqual(["tmdb:movie:603", "live:fr-tf1"]);
    await setFavorite("tmdb:movie:603", false);
    await setFavorite("nope", false);
    expect(await favoriteKeys()).toEqual(["live:fr-tf1"]);
  });
});
