import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { resetDb, closeDb, seedTmdb } from "@/test/db";
import { setSettings, verify } from "@/config";
import { refreshCardOnOpen } from "../cards";

const content = async (key: string) => (await db.select().from(schema.catalogContents).where(eq(schema.catalogContents.key, key)))[0];

beforeAll(async () => {
  await resetDb();
  expect(await verify("test")).toBe(true);
  await setSettings({ tmdb_api_key: "k" });
  // Cached before the logos were kept.
  await seedTmdb("movie", 603, { title: "Matrix" });
  await seedTmdb("movie", 949, { title: "Heat" });
  await db.insert(schema.catalogContents).values([
    { key: "tmdb:movie:603", kind: "vod", tmdbId: 603, title: "Matrix", addedAt: new Date() },
    { key: "tmdb:movie:949", kind: "vod", tmdbId: 949, title: "Heat", addedAt: new Date() },
  ]);
});
afterEach(() => vi.unstubAllGlobals());
afterAll(closeDb);

describe("refreshCardOnOpen", () => {
  it("re-reads a card that predates the logos, then leaves a fresh one alone", async () => {
    const fetch = vi.fn(async () =>
      Response.json({ id: 603, title: "Matrix", vote_average: 8.7, images: { logos: [{ file_path: "/m.png", iso_639_1: "fr" }] } }),
    );
    vi.stubGlobal("fetch", fetch);
    expect(await refreshCardOnOpen(await content("tmdb:movie:603"))).toBe(true);
    expect(await content("tmdb:movie:603")).toMatchObject({ titleLogoPath: "/m.png", rating: 8.7 });

    expect(await refreshCardOnOpen(await content("tmdb:movie:603"))).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("answers without the refresh when TMDB fails, and leaves TMDB alone for a while", async () => {
    const fetch = vi.fn(async () => new Response("{}", { status: 500 }));
    vi.stubGlobal("fetch", fetch);
    const heat = await content("tmdb:movie:949");
    expect(await refreshCardOnOpen(heat)).toBe(false);
    expect(await refreshCardOnOpen(heat)).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect((await content("tmdb:movie:949")).titleLogoPath).toBeNull();
  });
});
