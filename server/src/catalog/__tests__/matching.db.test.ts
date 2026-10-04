import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { resetDb, closeDb, seedItems } from "@/test/db";
import { setSecretsForTests } from "@/config";
import { setTmdbPace } from "@/providers/tmdb";
import { TmdbClient } from "@/providers/tmdb";
import { assignManual, explainMatch, resetMatches, retryUnmatched, runEnrich } from "../matching";

/**
 * A fake TMDB: searches answer by title (and by year, adult flag), details by id. Every case of
 * the matching is here once: the provider's id accepted, rejected then found by search, found
 * with or without the year, through an alternative title, among adult titles only, or not at all.
 */
type Doc = Record<string, unknown> & { id: number };
const DOCS: Record<number, Doc> = {
  603: { id: 603, title: "Matrix", original_title: "The Matrix", release_date: "1999-03-31", alternative_titles: {}, translations: {} },
  999: { id: 999, title: "Titanic", original_title: "Titanic", release_date: "1997-12-19", alternative_titles: {}, translations: {} },
  500: { id: 500, title: "Le Patriarche", release_date: "2025-01-01", alternative_titles: {}, translations: {} },
  438631: { id: 438631, title: "Dune", release_date: "2021-09-15", alternative_titles: {}, translations: {} },
  841: { id: 841, title: "Dune", release_date: "1984-12-14", alternative_titles: {}, translations: {} },
  77: {
    id: 77,
    title: "Conspiration générale",
    original_title: "Skenario Sang Jenderal",
    release_date: "2024-01-01",
    alternative_titles: { titles: [{ iso_3166_1: "GB", title: "General Mayhem: The Killing of Brigadier J" }] },
    translations: {},
  },
  31: { id: 31, title: "Film Adulte Rare", release_date: "2010-01-01", alternative_titles: {}, translations: {} },
};
const SEARCH: { query: string; year?: string; adult?: boolean; ids: number[] }[] = [
  { query: "Le Patriarche", ids: [500] },
  { query: "Dune", year: "2021", ids: [438631, 841] },
  { query: "Dune", ids: [841, 438631] },
  { query: "General Mayhem: The Killing of Brigadier J", ids: [77] },
  { query: "Film Adulte Rare", adult: true, ids: [31] },
];
const ok = (body: unknown) => Response.json(body);
async function fakeTmdb(u: URL | string) {
  const url = new URL(String(u));
  const path = url.pathname.replace(/^\/3/, "");
  const details = /^\/(movie|tv)\/(\d+)$/.exec(path);
  if (details) {
    const d = DOCS[Number(details[2])];
    return d ? ok(d) : new Response("{}", { status: 404 });
  }
  if (path === "/search/movie" || path === "/search/tv") {
    const q = url.searchParams.get("query");
    const year = url.searchParams.get("year") ?? url.searchParams.get("first_air_date_year") ?? undefined;
    const adult = url.searchParams.get("include_adult") === "true";
    const hit = SEARCH.find((s) => s.query === q && s.year === year && Boolean(s.adult) === adult);
    return ok({ results: (hit?.ids ?? []).map((id) => DOCS[id]) });
  }
  return new Response("{}", { status: 404 });
}

const CASES = [
  { name: "|FR| Matrix (1999)", raw: { tmdb: "603" }, via: "id", tmdbId: 603 },
  { name: "|FR| Le Patriarche (2025)", raw: { tmdb: "999" }, via: "search", tmdbId: 500 },
  { name: "|FR| Dune (2021)", raw: {}, via: "search", tmdbId: 438631 },
  { name: "|EN| General Mayhem: The Killing of Brigadier J", raw: {}, via: "alternative", tmdbId: 77 },
  { name: "|FR| Film Adulte Rare", raw: {}, via: "search", tmdbId: 31 },
  { name: "|FR| Zzz Introuvable", raw: {}, via: "none", tmdbId: null },
] as const;

beforeAll(async () => {
  await resetDb();
  setSecretsForTests({ tmdb_api_key: "k" });
  setTmdbPace(100_000); // a fake TMDB: no need to spare it
});
afterEach(() => vi.unstubAllGlobals());
afterAll(async () => {
  setTmdbPace();
  await closeDb();
});

describe("matching", () => {
  it("runEnrich writes exactly the verdict explainMatch gives, for every path of the matching", async () => {
    await seedItems(CASES.map((c, i) => ({ kind: "vod" as const, xtreamId: String(i), name: c.name, raw: c.raw })));
    const { runNaming } = await import("@/catalog");
    await runNaming();
    vi.stubGlobal("fetch", fakeTmdb);
    const client = new TmdbClient("k", "fr-FR");
    const variants = await db.select().from(schema.catalogVariants).orderBy(schema.catalogVariants.id);
    const explained = [];
    for (const v of variants) explained.push(await explainMatch(client, v));
    expect(explained.map((e) => [e.verdict.via, e.verdict.tmdbId])).toEqual(CASES.map((c) => [c.via, c.tmdbId]));

    const stats = await runEnrich();
    expect(stats).toMatchObject({ processed: 6, matched: 5, unmatched: 1, errors: 0, ids_rejected: 1 });
    const after = await db.select().from(schema.catalogVariants).orderBy(schema.catalogVariants.id);
    expect(after.map((v) => ({ status: v.matchStatus, tmdbId: v.tmdbId, score: v.matchScore }))).toEqual(
      explained.map((e) => ({ status: e.verdict.status, tmdbId: e.verdict.tmdbId, score: expect.closeTo(e.verdict.score, 5) })),
    );
    // A match found by search leaves its document in the cache, as the card needs it.
    const cached = await db.select({ id: schema.tmdbCache.tmdbId }).from(schema.tmdbCache).where(eq(schema.tmdbCache.tmdbId, 438631));
    expect(cached).toHaveLength(1);
  });

  it("gives a fresh start to what goes back to pending by hand: the attempts start again from zero", async () => {
    const attempts = async () =>
      (
        await db.select({ a: schema.catalogVariants.matchAttempts, s: schema.catalogVariants.matchStatus }).from(schema.catalogVariants)
      ).filter((r) => r.s === "pending");
    await db.update(schema.catalogVariants).set({ matchStatus: "unmatched", matchAttempts: 3 });
    expect(await retryUnmatched()).toBe(CASES.length);
    expect((await attempts()).map((r) => r.a)).toEqual(CASES.map(() => 0));
    await db.update(schema.catalogVariants).set({ matchStatus: "matched", matchAttempts: 2 });
    await resetMatches("vod");
    expect((await attempts()).map((r) => r.a)).toEqual(CASES.map(() => 0));
  });

  it("an association by hand carries no score: it is not a measured match", async () => {
    vi.stubGlobal("fetch", fakeTmdb);
    const [v] = await db.select().from(schema.catalogVariants).orderBy(schema.catalogVariants.id);
    const row = async () => (await db.select().from(schema.catalogVariants).where(eq(schema.catalogVariants.id, v.id)))[0];
    await assignManual(v.id, 603);
    expect(await row()).toMatchObject({ matchStatus: "manual", tmdbId: 603, matchScore: null });
    await assignManual(v.id, null);
    expect(await row()).toMatchObject({ matchStatus: "unmatched", tmdbId: null, matchScore: null });
  });
});
