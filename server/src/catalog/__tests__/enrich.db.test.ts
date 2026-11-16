import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db, schema, variants as vr } from "@/db";
import { resetDb, closeDb, seedItems, contentOfKey } from "@/test/db";
import { setSecretsForTests } from "@/config";
import { setTmdbPace } from "@/providers/tmdb";
import { runEnrich } from "../matching";

const t = schema.catalogTitles;
/** Titles without a card as a past identification left them: TMDB asked, nothing found. */
const cardless = (n: number, prefix: string) =>
  seedItems(
    Array.from({ length: n }, (_, i) => ({
      kind: "vod" as const,
      upstreamId: `${prefix}${i}`,
      name: `|FR| ${prefix} ${i}`,
      matchStatus: "unmatched" as const,
    })),
  );
const aWeekAgo = () => new Date(Date.now() - 8 * 86400000);
const titleOf = async (variantId: number) => (await db.select().from(vr).where(eq(vr.id, variantId)))[0].titleId!;

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

describe("runEnrich", () => {
  it("asks TMDB again about a title without a card a week later, not before; a title it now knows becomes that title", async () => {
    const [film, twin] = await seedItems([
      { kind: "vod", upstreamId: "f", name: "|FR| Film Tardif (2024)", matchStatus: "unmatched" },
      { kind: "vod", upstreamId: "g", name: "|FR| Film Tardif (2024) (4K)", matchStatus: "unmatched" },
    ]);
    const id = await titleOf(film.id);
    expect(await titleOf(twin.id)).toBe(id);
    const tmdb: string[] = [];
    vi.stubGlobal("fetch", async (u: URL | string) => {
      const url = new URL(String(u));
      tmdb.push(url.pathname);
      if (url.pathname.endsWith("/search/movie"))
        return Response.json({ results: [{ id: 4242, title: "Film Tardif", release_date: "2024-03-01" }] });
      if (url.pathname.endsWith("/movie/4242")) return Response.json({ id: 4242, title: "Film Tardif", release_date: "2024-03-01" });
      return Response.json({ results: [] });
    });
    // Asked today: left alone.
    expect(await runEnrich()).toMatchObject({ retried: 0, processed: 0 });
    expect(tmdb).toEqual([]);
    await db.update(t).set({ matchedAt: aWeekAgo() }).where(eq(t.id, id));
    expect(await runEnrich()).toMatchObject({ retried: 1, processed: 1, matched: 1, unmatched: 0 });
    // The same title under its TMDB key: its streams did not move, its card will be copied by `group`.
    const [now] = await db.select().from(t).where(eq(t.id, id));
    expect(now).toMatchObject({ key: "tmdb:movie:4242", tmdbId: 4242, matchStatus: "matched", cardsAt: null });
    expect(await contentOfKey("fallback:movie:film-tardif:2024")).toBeUndefined();
    expect((await db.select().from(vr).where(eq(vr.titleId, id))).map((v) => v.matchStatus)).toEqual(["matched", "matched"]);
  });

  it("gives the streams of a title without a card to the title the catalogue already has, when TMDB says they are the same", async () => {
    const [other] = await seedItems([{ kind: "vod", upstreamId: "o", name: "|FR| Le Film Tardif", matchStatus: "unmatched" }]);
    const id = await titleOf(other.id);
    await db.update(t).set({ matchedAt: aWeekAgo() }).where(eq(t.id, id));
    vi.stubGlobal("fetch", async (u: URL | string) => {
      const url = new URL(String(u));
      if (url.pathname.endsWith("/search/movie")) return Response.json({ results: [{ id: 4242, title: "Le Film Tardif" }] });
      return Response.json({ id: 4242, title: "Le Film Tardif" });
    });
    expect(await runEnrich()).toMatchObject({ retried: 1, matched: 1 });
    const there = await contentOfKey("tmdb:movie:4242");
    expect(await titleOf(other.id)).toBe(there.id);
    expect(await db.select().from(t).where(eq(t.id, id))).toEqual([]);
  });

  it("does not ask before a week about a title TMDB still does not know, nor about one whose search it rejects", async () => {
    const [unknown, refused] = await cardless(2, "Inconnu");
    const ids = [await titleOf(unknown.id), await titleOf(refused.id)];
    await db.update(t).set({ matchedAt: aWeekAgo() }).where(inArray(t.id, ids));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", async (u: URL | string) =>
      new URL(String(u)).searchParams.get("query") === "Inconnu 1" ? new Response("{}", { status: 400 }) : Response.json({ results: [] }),
    );
    expect(await runEnrich()).toMatchObject({ retried: 2, processed: 1, unmatched: 1, errors: 1 });
    logged.mockRestore();
    const rows = await db.select().from(t).where(inArray(t.id, ids));
    expect(rows.map((r) => r.matchAttempts)).toEqual([1, 1]);
    expect(rows.every((r) => r.matchedAt!.getTime() > Date.now() - 60_000)).toBe(true);
    expect(await runEnrich()).toMatchObject({ retried: 0 });
  });

  it("stops after a streak of outages, leaves the rest to be asked again and says so", async () => {
    const rows = await cardless(40, "Panne");
    const ids = await Promise.all(rows.map((r) => titleOf(r.id)));
    await db.update(t).set({ matchedAt: aWeekAgo() }).where(inArray(t.id, ids));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetch = vi.fn(async () => {
      throw Object.assign(new TypeError("fetch failed"), {
        cause: Object.assign(new Error("getaddrinfo ENOTFOUND api.themoviedb.org"), { code: "ENOTFOUND" }),
      });
    });
    vi.stubGlobal("fetch", fetch);
    await expect(runEnrich()).rejects.toThrow(/TMDB injoignable .*restent à redemander/);
    expect(fetch.mock.calls.length).toBeLessThan(40);
    logged.mockRestore();
    // Nothing was decided: they are due again at the next run.
    const after = await db.select().from(t).where(inArray(t.id, ids));
    expect(after.every((r) => r.matchedAt!.getTime() < Date.now() - 7 * 86400000 && r.matchAttempts === 0)).toBe(true);
    await db.update(t).set({ matchedAt: new Date() }).where(inArray(t.id, ids));
  });

  it("fetches again the cache entries that predate the logos, asking for every useful image language", async () => {
    await db.insert(schema.cacheTmdb).values({ mediaType: "movie", tmdbId: 603, lang: "fr-FR", data: { id: 603, title: "Matrix" } });
    await db.insert(schema.catalogTitles).values({ key: "tmdb:movie:603", kind: "vod", tmdbId: 603, title: "Matrix", addedAt: new Date() });
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (u: URL) => {
      urls.push(String(u));
      return Response.json({ id: 603, title: "Matrix", images: { logos: [{ file_path: "/m.png", iso_639_1: "fr", vote_average: 5 }] } });
    });
    expect(await runEnrich()).toMatchObject({ refreshed: 1 });
    expect(new URL(urls.find((u) => u.includes("/movie/603"))!).searchParams.get("include_image_language")).toBe("fr,en,null");
    const [c] = await db.select().from(schema.cacheTmdb).where(eq(schema.cacheTmdb.tmdbId, 603));
    expect((c.data as { images: unknown }).images).toMatchObject({ logos: [{ file_path: "/m.png", iso_639_1: "fr" }] });
    // Once caught up, nothing left to fetch before the TTL.
    expect(await runEnrich()).toMatchObject({ refreshed: 0 });
  });

  it("has Claude read once the visible titles TMDB gave up on, searches its titles, and leaves what it saw outside TMDB alone", async () => {
    const [a, b, c, hidden] = await seedItems([
      { kind: "vod", upstreamId: "a", name: "|AR| Al Jamra | 2017 | الجمرة", matchStatus: "unmatched" },
      { kind: "vod", upstreamId: "b", name: "|FR| Hellfest - Jour 2 (2025)", matchStatus: "unmatched" },
      { kind: "vod", upstreamId: "c", name: "|AR| Inconnu", matchStatus: "unmatched" },
      { kind: "vod", upstreamId: "h", name: "|AR| Caché", matchStatus: "unmatched" },
    ]);
    const [ta, tb, tc, th] = await Promise.all([a, b, c, hidden].map((r) => titleOf(r.id)));
    // What the filters would have written: three of them are seen by the app.
    await db
      .update(schema.catalogStreams)
      .set({ filtered: false })
      .where(inArray(schema.catalogStreams.xtreamId, [a.id, b.id, c.id]));
    await db.update(schema.catalogStreams).set({ filtered: true }).where(eq(schema.catalogStreams.xtreamId, hidden.id));
    await db
      .update(t)
      .set({ visible: true })
      .where(inArray(t.id, [ta, tb, tc]));
    const asked: string[] = [];
    const tmdb: string[] = [];
    vi.stubGlobal("fetch", async (u: URL | string, init?: RequestInit) => {
      const url = new URL(String(u));
      if (url.hostname === "api.anthropic.com") {
        asked.push(String(init?.body));
        return Response.json({
          id: "msg_1",
          type: "message",
          role: "assistant",
          model: "claude-sonnet-5-5",
          content: [
            {
              type: "text",
              text: JSON.stringify({
                entries: [
                  { id: ta, kind: "movie", title: "The Ember", original_title: "الجمرة", year: 2017 },
                  { id: tb, kind: "other", title: null, original_title: null, year: null },
                ],
              }),
            },
          ],
          stop_reason: "end_turn",
          stop_sequence: null,
          usage: { input_tokens: 1, output_tokens: 1 },
        });
      }
      tmdb.push(url.pathname + url.search);
      if (url.pathname.endsWith("/search/movie") && url.searchParams.get("query") === "The Ember")
        return Response.json({ results: [{ id: 900, title: "The Ember", release_date: "2017-05-01" }] });
      if (url.pathname.endsWith("/movie/900")) return Response.json({ id: 900, title: "The Ember", release_date: "2017-05-01" });
      return Response.json({ results: [] });
    });

    // Without a key: Claude is not asked, and TMDB was asked today.
    expect(await runEnrich()).toMatchObject({ ai_asked: 0, processed: 0 });
    expect(asked).toHaveLength(0);

    setSecretsForTests({ anthropic_api_key: "a" });
    const stats = await runEnrich();
    expect(stats).toMatchObject({ ai_asked: 3, ai_titled: 1, ai_other: 1, processed: 1, matched: 1 });
    expect(asked).toHaveLength(1);
    const sent = asked[0];
    expect(sent).toContain(`#${ta} ·`);
    expect(sent).toContain(`#${tc} ·`);
    expect(sent).not.toContain(`#${th} ·`); // hidden: not worth a question
    const row = async (id: number) => (await db.select().from(vr).where(eq(vr.id, id)))[0];
    expect(await row(a.id)).toMatchObject({
      matchStatus: "matched",
      tmdbId: 900,
      contentKey: "tmdb:movie:900",
      aiKind: "movie",
      aiTitle: "The Ember",
      aiOriginalTitle: "الجمرة",
      aiYear: 2017,
    });
    expect(await row(b.id)).toMatchObject({ matchStatus: "unmatched", aiKind: "other", aiTitle: null });
    expect((await row(c.id)).aiAskedAt).not.toBeNull(); // unanswered: asked all the same, not again
    expect((await row(hidden.id)).aiAskedAt).toBeNull();

    // Asked once: the next run asks nothing more; and the concert is not retried weekly, the unknown one is.
    await db
      .update(t)
      .set({ matchedAt: aWeekAgo() })
      .where(inArray(t.id, [tb, tc]));
    expect(await runEnrich()).toMatchObject({ ai_asked: 0, retried: 1 });
    expect(asked).toHaveLength(1);
    expect((await row(b.id)).matchStatus).toBe("unmatched");
    setSecretsForTests({ anthropic_api_key: "" });
  });

  it("fetches again an entry older than 30 days that a content still uses, and leaves an orphan one alone", async () => {
    const withLogos = (id: number) => ({
      id,
      title: `Film ${id}`,
      images: { logos: [{ file_path: "/l.png", iso_639_1: "fr", vote_average: 5 }] },
    });
    const old = new Date(Date.now() - 31 * 86400000);
    await db
      .insert(schema.cacheTmdb)
      .values([700, 701].map((id) => ({ mediaType: "movie" as const, tmdbId: id, lang: "fr-FR", data: withLogos(id), fetchedAt: old })));
    await db
      .insert(schema.catalogTitles)
      .values({ key: "tmdb:movie:700", kind: "vod", tmdbId: 700, title: "Film 700", addedAt: new Date() });
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (u: URL) => {
      urls.push(String(u));
      return Response.json(withLogos(700));
    });
    expect(await runEnrich()).toMatchObject({ refreshed: 1 });
    expect(urls.filter((u) => /\/movie\/70[01]\b/.test(u)).map((u) => new URL(u).pathname)).toEqual(["/3/movie/700"]);
    const rows = await db
      .select()
      .from(schema.cacheTmdb)
      .where(inArray(schema.cacheTmdb.tmdbId, [700, 701]));
    const fresh = (id: number) => rows.find((r) => r.tmdbId === id)!.fetchedAt.getTime() > Date.now() - 60_000;
    expect([fresh(700), fresh(701)]).toEqual([true, false]);
  });
});
