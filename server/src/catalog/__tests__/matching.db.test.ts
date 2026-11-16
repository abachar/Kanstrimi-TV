import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema, variants as vr } from "@/db";
import { resetDb, closeDb, seedItems, contentOfKey } from "@/test/db";
import { setSecretsForTests } from "@/config";
import { setTmdbPace } from "@/providers/tmdb";
import { TmdbClient } from "@/providers/tmdb";
import { assignManual, attachTitles, explainMatch, type PendingItem, resetMatches, retryUnmatched } from "../matching";

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
  900: { id: 900, title: "The Ember", original_title: "الجمرة", release_date: "2017-05-01", alternative_titles: {}, translations: {} },
  901: { id: 901, title: "The Ember", release_date: "2009-01-01", alternative_titles: {}, translations: {} },
  902: { id: 902, title: "Sekket El Salama", release_date: "1986-01-01", alternative_titles: {}, translations: {} },
};
const SEARCH: { query: string; year?: string; adult?: boolean; ids: number[] }[] = [
  { query: "Le Patriarche", ids: [500] },
  { query: "Dune", year: "2021", ids: [438631, 841] },
  { query: "Dune", ids: [841, 438631] },
  { query: "General Mayhem: The Killing of Brigadier J", ids: [77] },
  { query: "Film Adulte Rare", adult: true, ids: [31] },
  { query: "The Ember", year: "2017", ids: [900, 901] },
  { query: "The Ember", year: "2009", ids: [901] },
  { query: "Sekket El Salama", ids: [902] },
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

/** TMDB out of reach: the name does not resolve. */
const outage = () =>
  vi.fn(async () => {
    throw Object.assign(new TypeError("fetch failed"), {
      cause: Object.assign(new Error("getaddrinfo ENOTFOUND api.themoviedb.org"), { code: "ENOTFOUND" }),
    });
  });
const named = async () => (await import("@/catalog")).runNaming();
const byName = async (name: string) => (await db.select().from(vr).where(eq(vr.name, name)))[0];

describe("identification", () => {
  it("attachTitles gives each stream the title explainMatch finds, for every path of the matching", async () => {
    await seedItems(CASES.map((c, i) => ({ kind: "vod" as const, xtreamId: String(i), name: c.name, raw: c.raw })));
    await named();
    vi.stubGlobal("fetch", fakeTmdb);
    const client = new TmdbClient("k", "fr-FR");
    const variants = await db.select().from(vr).orderBy(vr.id);
    expect(new Set(variants.map((v) => v.matchStatus))).toEqual(new Set(["pending"]));
    const explained = [];
    for (const v of variants) explained.push(await explainMatch(client, v));
    expect(explained.map((e) => [e.verdict.via, e.verdict.tmdbId])).toEqual(CASES.map((c) => [c.via, c.tmdbId]));

    const stats = await attachTitles();
    expect(stats).toEqual({ to_attach: 6, by_id: 1, by_title: 0, by_search: 4, without_card: 1, ids_rejected: 1, errors: 0, waiting: 0 });
    const after = await db.select().from(vr).orderBy(vr.id);
    expect(after.map((v) => ({ status: v.matchStatus, tmdbId: v.tmdbId, score: v.matchScore }))).toEqual(
      explained.map((e) => ({ status: e.verdict.status, tmdbId: e.verdict.tmdbId, score: expect.closeTo(e.verdict.score, 5) })),
    );
    expect(after.map((v) => v.how)).toEqual(["provided", "search", "search", "search", "search", "none"]);
    expect(after.map((v) => v.contentKey)).toEqual([
      "tmdb:movie:603",
      "tmdb:movie:500",
      "tmdb:movie:438631",
      "tmdb:movie:77",
      "tmdb:movie:31",
      "fallback:movie:zzz-introuvable:-",
    ]);
    // What was searched stays on the title, with the day TMDB was asked.
    const [dune] = await db.select().from(schema.catalogTitles).where(eq(schema.catalogTitles.key, "tmdb:movie:438631"));
    expect(dune).toMatchObject({ searchTitle: "Dune", searchYear: 2021, matchStatus: "matched", tmdbId: 438631 });
    expect(dune.matchedAt).not.toBeNull();
    // A match found by search leaves its document in the cache, as the card needs it.
    const cached = await db.select({ id: schema.cacheTmdb.tmdbId }).from(schema.cacheTmdb).where(eq(schema.cacheTmdb.tmdbId, 438631));
    expect(cached).toHaveLength(1);
  });

  it("attaches a new stream of a title the catalogue has without asking TMDB: its id, or the same title and year", async () => {
    await seedItems([
      { kind: "vod", xtreamId: "10", name: "|FR| Dune (2021) (4K)" },
      { kind: "vod", xtreamId: "11", name: "|FR| Matrix (1999) (VOSTFR)", raw: { tmdb: "603" } },
      { kind: "vod", xtreamId: "12", name: "|FR| Zzz Introuvable (HD)" },
    ]);
    await named();
    const fetch = outage();
    vi.stubGlobal("fetch", fetch);
    expect(await attachTitles()).toMatchObject({ to_attach: 3, by_id: 1, by_title: 2, by_search: 0, without_card: 0, waiting: 0 });
    expect(fetch).not.toHaveBeenCalled();
    expect(await byName("|FR| Dune (2021) (4K)")).toMatchObject({ how: "title", contentKey: "tmdb:movie:438631", matchStatus: "matched" });
    expect(await byName("|FR| Matrix (1999) (VOSTFR)")).toMatchObject({ how: "provided", contentKey: "tmdb:movie:603" });
    expect(await byName("|FR| Zzz Introuvable (HD)")).toMatchObject({ how: "title", contentKey: "fallback:movie:zzz-introuvable:-" });
  });

  it("leaves a stream without a title while TMDB cannot be reached, and stops asking after a streak of outages", async () => {
    await seedItems(Array.from({ length: 60 }, (_, i) => ({ kind: "vod" as const, xtreamId: `n${i}`, name: `|FR| Nouveau ${i}` })));
    await named();
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetch = outage();
    vi.stubGlobal("fetch", fetch);
    expect(await attachTitles()).toMatchObject({ to_attach: 60, waiting: 60, without_card: 0 });
    expect(fetch.mock.calls.length).toBeLessThan(60);
    expect(await byName("|FR| Nouveau 0")).toMatchObject({ matchStatus: "pending", titleId: null, contentKey: null });
    // A question of rate (429), a server down (503), a key refused (401): the way is down, not the title.
    for (const status of [429, 503, 401]) {
      vi.stubGlobal("fetch", async () => new Response("", { status, headers: { "retry-after": "0" } }));
      expect(await attachTitles(), String(status)).toMatchObject({ waiting: 60, without_card: 0 });
    }
    logged.mockRestore();
    // TMDB back, and it knows none of them: each gets its title without a card, asked.
    vi.stubGlobal("fetch", fakeTmdb);
    expect(await attachTitles()).toMatchObject({ to_attach: 60, without_card: 60, waiting: 0 });
    const title = await contentOfKey("fallback:movie:nouveau-0:-");
    expect(title).toBeDefined();
  });

  it("gives its title without a card at once to a stream TMDB rejects the search of, and to every stream without a TMDB key", async () => {
    await seedItems([{ kind: "vod", xtreamId: "r1", name: "|FR| Requête Refusée" }]);
    await named();
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 400 })); // TMDB rejects the query itself
    expect(await attachTitles()).toMatchObject({ to_attach: 1, without_card: 1, errors: 1, waiting: 0 });
    logged.mockRestore();
    await seedItems([{ kind: "vod", xtreamId: "r2", name: "|FR| Sans Clé" }]);
    await named();
    setSecretsForTests({ tmdb_api_key: "" });
    const fetch = outage();
    vi.stubGlobal("fetch", fetch);
    expect(await attachTitles()).toMatchObject({ to_attach: 1, without_card: 1, errors: 0 });
    expect(fetch).not.toHaveBeenCalled();
    setSecretsForTests({ tmdb_api_key: "k" });
    // Never asked: the next `enrich` will, as soon as there is a key.
    const [never] = await db.select().from(schema.catalogTitles).where(eq(schema.catalogTitles.key, "fallback:movie:sans-cle:-"));
    expect(never.matchedAt).toBeNull();
  });

  it("searches the titles Claude suggested after its own, with the year it knows, and ignores what Claude saw outside TMDB", async () => {
    vi.stubGlobal("fetch", fakeTmdb);
    const client = new TmdbClient("k", "fr-FR");
    const entry = (name: string, ai: Partial<PendingItem>, year: number | null = null): PendingItem => ({
      id: 0,
      kind: "vod",
      name,
      cleanTitle: name.replace(/^\|AR\| /, ""),
      year,
      raw: {},
      aiKind: "movie",
      aiTitle: null,
      aiOriginalTitle: null,
      aiYear: null,
      ...ai,
    });
    // The provider's year decides between the two films of that title.
    const hit = await explainMatch(client, entry("|AR| Al Jamra", { aiTitle: "The Ember", aiYear: 2017 }, 2017));
    expect(hit.verdict).toMatchObject({ status: "matched", tmdbId: 900, via: "suggestion" });
    expect(hit.searches.map((s) => [s.title, s.withYear])).toEqual([
      [undefined, 2017],
      [undefined, undefined],
      [undefined, undefined],
      ["The Ember", 2017],
    ]);
    // Without a year from the provider, Claude's year serves, and the film of another year is refused.
    expect((await explainMatch(client, entry("|AR| Al Jamra", { aiTitle: "The Ember", aiYear: 2009 }))).verdict.tmdbId).toBe(901);
    // No year at all: the title has to be almost exact; the original title is tried too.
    expect((await explainMatch(client, entry("|AR| Sekat Al Salama", { aiTitle: "Sekket El Salama" }))).verdict).toMatchObject({
      tmdbId: 902,
      via: "suggestion",
    });
    expect(
      (await explainMatch(client, entry("|AR| Sekat Al Salama", { aiTitle: "Nothing", aiOriginalTitle: "Sekket El Salama" }))).verdict
        .tmdbId,
    ).toBe(902);
    // What Claude saw outside TMDB (a concert) is not searched.
    const other = await explainMatch(client, entry("|AR| Al Jamra", { aiKind: "other", aiTitle: "The Ember", aiYear: 2017 }, 2017));
    expect(other.verdict.status).toBe("unmatched");
    expect(other.searches.some((s) => s.title)).toBe(false);
  });

  it("asks TMDB again about every title without a card on demand, and takes every stream off its title on a reset", async () => {
    const t = schema.catalogTitles;
    const cardless = (await db.select().from(t)).filter((r) => r.tmdbId === null);
    expect(cardless.length).toBeGreaterThan(60);
    expect(await retryUnmatched()).toBe(cardless.length);
    expect(new Set((await db.select().from(t)).filter((r) => r.tmdbId === null).map((r) => r.matchedAt))).toEqual(new Set([null]));
    await resetMatches("vod");
    expect(new Set((await db.select().from(vr)).map((v) => v.matchStatus))).toEqual(new Set(["pending"]));
  });

  it("a stream attached by hand stays where it was put, with or without a TMDB title", async () => {
    vi.stubGlobal("fetch", fakeTmdb);
    const [v] = await db.select().from(vr).orderBy(vr.id);
    const row = async () => (await db.select().from(vr).where(eq(vr.id, v.id)))[0];
    await assignManual(v.id, 500);
    expect(await row()).toMatchObject({ matchStatus: "manual", tmdbId: 500, manual: true, how: "manual", contentKey: "tmdb:movie:500" });
    // The identification finds its real title (its id says 603) and leaves it where the admin put it.
    expect(await attachTitles([v.id])).toMatchObject({ to_attach: 0 });
    await assignManual(v.id, null);
    expect(await row()).toMatchObject({ matchStatus: "manual", tmdbId: null, manual: true, contentKey: "fallback:movie:matrix:1999" });
    const [left] = await db.select().from(schema.catalogTitles).where(eq(schema.catalogTitles.key, "fallback:movie:matrix:1999"));
    expect(left.matchStatus).toBe("manual"); // not asked again
  });
});
