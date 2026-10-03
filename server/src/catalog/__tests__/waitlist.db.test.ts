import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { setItemHiddenManual } from "@/catalog";
import { resetDb, closeDb, seedCategories, seedItems, seedTmdb } from "@/test/db";
import { setSecretsForTests } from "@/config";
import { runGrouping, runNaming } from "../grouping/group";
import {
  addToWaitlist,
  availableWaitlistKeys,
  listWaitlist,
  markWaitlistStarted,
  removeFromWaitlist,
  searchWaitlistCandidates,
} from "../waitlist";

let duneId = 0;
const entry = async (key: string) =>
  (await db.select().from(schema.curationWaitlist).where(eq(schema.curationWaitlist.contentKey, key)))[0];

beforeAll(async () => {
  await resetDb();
  setSecretsForTests({ tmdb_api_key: "k" });
  await seedCategories([{ kind: "vod", xtreamId: "10", name: "|FR| FILMS" }]);
  await seedTmdb("movie", 603, { title: "Matrix", release_date: "1999-03-31" });
  await seedTmdb("movie", 1100, { title: "Dune : Troisième partie", release_date: "2026-12-16" });
  const items = await seedItems([
    { kind: "vod", xtreamId: "1", name: "|FR| Matrix", cat: "10", tmdbId: 603, matchStatus: "matched" },
    // Listed by the provider but hidden: not available yet.
    { kind: "vod", xtreamId: "2", name: "|FR| Dune Troisieme Partie", cat: "10", tmdbId: 1100, matchStatus: "matched", hiddenManual: true },
  ]);
  duneId = items[1].id;
  await runNaming();
  await runGrouping();
});
afterEach(() => vi.unstubAllGlobals());
afterAll(closeDb);

describe("« Liste d'attente »", () => {
  it("adds a movie from TMDB and keeps its document; refuses a duplicate and a movie already visible", async () => {
    const fetch = vi.fn(async (u: URL) => {
      const id = Number(/\/movie\/(\d+)/.exec(String(u))![1]);
      return Response.json(
        id === 1200
          ? {
              id,
              title: "Mission : Impossible 9",
              original_title: "Mission: Impossible 9",
              release_date: "2027-05-21",
              poster_path: "/mi.jpg",
              overview: "Ethan Hunt, encore.",
              runtime: 166,
              vote_average: 7.4,
              vote_count: 120,
              genres: [{ id: 28, name: "Action" }],
              credits: {
                cast: [{ id: 500, name: "Tom Cruise", character: "Ethan Hunt", order: 0 }],
                crew: [{ id: 9, name: "Christopher McQuarrie", job: "Director" }],
              },
            }
          : { id, title: "Dune : Troisième partie", release_date: "2026-12-16" },
      );
    });
    vi.stubGlobal("fetch", fetch);
    expect(await addToWaitlist(1200)).toBe("added");
    expect(await entry("tmdb:movie:1200")).toMatchObject({
      tmdbId: 1200,
      title: "Mission : Impossible 9",
      year: 2027,
      releaseDate: "2027-05-21",
      posterPath: "/mi.jpg",
      availableAt: null,
      startedAt: null,
    });
    const [cached] = await db.select().from(schema.tmdbCache).where(eq(schema.tmdbCache.tmdbId, 1200));
    expect(cached.mediaType).toBe("movie");
    // The admin reads it back as a sheet, from the cache alone.
    expect((await listWaitlist()).find((e) => e.tmdbId === 1200)!.sheet).toEqual({
      originalTitle: "Mission: Impossible 9",
      overview: "Ethan Hunt, encore.",
      rating: 7.4,
      voteCount: 120,
      genres: ["Action"],
      runtime: 166,
      certification: null,
      director: "Christopher McQuarrie",
      cast: ["Tom Cruise"],
    });
    expect(await addToWaitlist(1200)).toBe("already");
    expect(await addToWaitlist(603)).toBe("in_catalog");
    // In the catalogue but hidden: worth waiting for, and its document is cached already.
    expect(await addToWaitlist(1100)).toBe("added");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("searches TMDB, flagging what the catalogue or the list already has", async () => {
    vi.stubGlobal("fetch", async () =>
      Response.json({
        results: [
          { id: 603, title: "Matrix", original_title: "The Matrix", release_date: "1999-03-31", overview: "Neo.", vote_average: 8.2 },
          { id: 1200, title: "Mission : Impossible 9", original_title: "Mission : Impossible 9", release_date: "2027-05-21" },
          { id: 1300, title: "Sans date" },
        ],
      }),
    );
    expect(await searchWaitlistCandidates("m")).toEqual([
      {
        tmdbId: 603,
        title: "Matrix",
        originalTitle: "The Matrix",
        year: 1999,
        posterPath: null,
        overview: "Neo.",
        rating: 8.2,
        inCatalog: true,
        waiting: false,
      },
      {
        tmdbId: 1200,
        title: "Mission : Impossible 9",
        originalTitle: null,
        year: 2027,
        posterPath: null,
        overview: null,
        rating: null,
        inCatalog: false,
        waiting: true,
      },
      {
        tmdbId: 1300,
        title: "Sans date",
        originalTitle: null,
        year: null,
        posterPath: null,
        overview: null,
        rating: null,
        inCatalog: false,
        waiting: false,
      },
    ]);
  });

  it("flags an arrival once its content turns visible, once", async () => {
    expect((await runGrouping()).waitlist_available).toBe(0);
    await setItemHiddenManual(duneId, false);
    expect((await runGrouping()).waitlist_available).toBe(1);
    const { availableAt } = await entry("tmdb:movie:1100");
    expect(availableAt).not.toBeNull();
    expect(await availableWaitlistKeys()).toEqual(["tmdb:movie:1100"]);
    expect((await listWaitlist()).map((e) => [e.contentKey, e.status])).toEqual([
      ["tmdb:movie:1100", "available"],
      ["tmdb:movie:1200", "waiting"],
    ]);
    // Hidden again then back: still the first arrival.
    await setItemHiddenManual(duneId, true);
    await runGrouping();
    await setItemHiddenManual(duneId, false);
    expect((await runGrouping()).waitlist_available).toBe(0);
    expect((await entry("tmdb:movie:1100")).availableAt).toEqual(availableAt);
  });

  it("a started movie is no longer announced, and stays listed as started", async () => {
    await markWaitlistStarted("tmdb:movie:1100");
    expect(await availableWaitlistKeys()).toEqual([]);
    expect((await listWaitlist()).map((e) => [e.contentKey, e.status])).toEqual([
      ["tmdb:movie:1200", "waiting"],
      ["tmdb:movie:1100", "started"],
    ]);
    await removeFromWaitlist(1200);
    expect(await entry("tmdb:movie:1200")).toBeUndefined();
  });
});
