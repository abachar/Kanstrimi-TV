import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { resetDb, closeDb, seedItems } from "@/test/db";
import { setSettings, verify } from "@/config";
import { setTmdbPace } from "@/providers/tmdb";
import { runEnrich } from "../matching";

beforeAll(async () => {
  await resetDb();
  expect(await verify("test")).toBe(true);
  await setSettings({ tmdb_api_key: "k" });
  setTmdbPace(100_000); // a fake TMDB: no need to spare it
  await seedItems(Array.from({ length: 60 }, (_, i) => ({ kind: "vod" as const, xtreamId: String(i), name: `|FR| Film ${i}` })));
});
afterEach(() => vi.unstubAllGlobals());
afterAll(async () => {
  setTmdbPace();
  await closeDb();
});

describe("runEnrich", () => {
  it("stops after a streak of outages, leaves the rest pending and says so", async () => {
    const fetch = vi.fn(async () => {
      throw Object.assign(new TypeError("fetch failed"), {
        cause: Object.assign(new Error("getaddrinfo ENOTFOUND api.themoviedb.org"), { code: "ENOTFOUND" }),
      });
    });
    vi.stubGlobal("fetch", fetch);
    await expect(runEnrich()).rejects.toThrow(/TMDB injoignable .*restent en attente/);
    expect(fetch.mock.calls.length).toBeLessThan(60);
    const pending = await db.select().from(schema.catalogVariants).where(eq(schema.catalogVariants.matchStatus, "pending"));
    expect(pending).toHaveLength(60);
  });

  it("gives an entry up after three failures of its own, and tries it again a week later", async () => {
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 400 })); // TMDB rejects the query itself
    const status = async () => (await db.select({ s: schema.catalogVariants.matchStatus }).from(schema.catalogVariants)).map((r) => r.s);
    await runEnrich();
    await runEnrich();
    expect(new Set(await status())).toEqual(new Set(["pending"]));
    await runEnrich();
    expect(new Set(await status())).toEqual(new Set(["unmatched"]));

    await db.execute(sql`update catalog_variants set matched_at = now() - interval '8 days' where xtream_id = '0'`);
    const stats = await runEnrich();
    expect(stats).toMatchObject({ retried: 1, processed: 0, errors: 1 });
  });

  it("fetches again the cache entries that predate the logos, asking for every useful image language", async () => {
    await db.insert(schema.tmdbCache).values({ mediaType: "movie", tmdbId: 603, lang: "fr-FR", data: { id: 603, title: "Matrix" } });
    await db
      .insert(schema.catalogContents)
      .values({ key: "tmdb:movie:603", kind: "vod", tmdbId: 603, title: "Matrix", addedAt: new Date() });
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (u: URL) => {
      urls.push(String(u));
      return Response.json({ id: 603, title: "Matrix", images: { logos: [{ file_path: "/m.png", iso_639_1: "fr", vote_average: 5 }] } });
    });
    expect(await runEnrich()).toMatchObject({ refreshed: 1 });
    expect(new URL(urls.find((u) => u.includes("/movie/603"))!).searchParams.get("include_image_language")).toBe("fr,en,null");
    const [c] = await db.select().from(schema.tmdbCache).where(eq(schema.tmdbCache.tmdbId, 603));
    expect((c.data as { images: unknown }).images).toMatchObject({ logos: [{ file_path: "/m.png", iso_639_1: "fr" }] });
    // Once caught up, nothing left to fetch before the TTL.
    expect(await runEnrich()).toMatchObject({ refreshed: 0 });
  });

  it("leaves an entry pending when TMDB only answers 429: a question of rate, not of the title", async () => {
    await db.update(schema.catalogVariants).set({ matchStatus: "pending", matchAttempts: 0, matchedAt: null });
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", async () => new Response("", { status: 429, headers: { "retry-after": "0" } }));
    await expect(runEnrich()).rejects.toThrow(/TMDB injoignable/);
    const rows = await db
      .select({ s: schema.catalogVariants.matchStatus, a: schema.catalogVariants.matchAttempts })
      .from(schema.catalogVariants);
    expect(new Set(rows.map((r) => r.s))).toEqual(new Set(["pending"]));
    expect(new Set(rows.map((r) => r.a))).toEqual(new Set([0]));
    logged.mockRestore();
  });
});
