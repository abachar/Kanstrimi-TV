import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { resetDb, closeDb, seedCategories, seedItems, seedTmdb } from "@/test/db";
import { runGrouping, regroupItems, refreshVisibility } from "../group";

const content = async (key: string) => (await db.select().from(schema.contents).where(eq(schema.contents.key, key)))[0];
const variants = (contentId: number) =>
  db.select().from(schema.items).where(eq(schema.items.contentId, contentId)).orderBy(schema.items.id);

describe("runGrouping", () => {
  beforeAll(async () => {
    await resetDb();
    await seedCategories([
      { kind: "vod", xtreamId: "10", name: "|FR| FILMS 4K DV" },
      { kind: "vod", xtreamId: "11", name: "|FR| FILMS VOST" },
      { kind: "vod", xtreamId: "12", name: "|IT| FILM RECENTI" },
      { kind: "vod", xtreamId: "13", name: "|FR| FILMS HEVC", hiddenManual: true },
      { kind: "live", xtreamId: "20", name: "FRANCE FHD | TV" },
      { kind: "live", xtreamId: "21", name: "BELGIUM | TV" },
      { kind: "series", xtreamId: "30", name: "|FR| SERIES" },
    ]);
    await seedItems([
      // Spider-Man: four variants, one matched pair by TMDB id, two by title fallback (pending)
      {
        kind: "vod",
        xtreamId: "1",
        name: "|FR| Spider-Man (4K)",
        cat: "10",
        tmdbId: 557,
        matchStatus: "matched",
        addedAt: new Date("2026-09-01T00:00:00Z"),
      },
      {
        kind: "vod",
        xtreamId: "2",
        name: "|FR| Spider-Man (DV)",
        cat: "10",
        tmdbId: 557,
        matchStatus: "matched",
        addedAt: new Date("2026-09-10T00:00:00Z"),
      },
      { kind: "vod", xtreamId: "3", name: "|FR| Spider-Man (VOST)", cat: "11", tmdbId: 557, matchStatus: "matched" },
      { kind: "vod", xtreamId: "4", name: "|IT| Spider-Man", cat: "12", tmdbId: 557, matchStatus: "manual" },
      // Same title, not matched yet: fallback group of its own
      { kind: "vod", xtreamId: "5", name: "|FR| Spider-Man | 2002", cat: "11", matchStatus: "pending" },
      // Hidden category: the item exists but the content is not visible
      { kind: "vod", xtreamId: "6", name: "|FR| Tenet (HEVC)", cat: "13", matchStatus: "unmatched" },
      // Manually hidden
      { kind: "vod", xtreamId: "7", name: "|FR| Dune", cat: "12", matchStatus: "unmatched", hiddenManual: true },
      // Live: HD + FHD of the same channel, a Belgian namesake
      {
        kind: "live",
        xtreamId: "100",
        name: "|FR| TF1 HD",
        cat: "20",
        raw: { num: 1, stream_icon: "http://x/tf1-hd.png", epg_channel_id: "TF1.fr" },
      },
      {
        kind: "live",
        xtreamId: "101",
        name: "|FR| TF1 FHD",
        cat: "20",
        raw: { num: 2, stream_icon: "http://x/tf1-fhd.png", epg_channel_id: "TF1.fr" },
      },
      { kind: "live", xtreamId: "102", name: "|BE| TF1", cat: "21", raw: { num: 3 } },
      // Series split per season upstream
      { kind: "series", xtreamId: "200", name: "|FR| Vincenzo (MULTI) S01", cat: "30", tmdbId: 1396, matchStatus: "matched" },
      { kind: "series", xtreamId: "201", name: "|FR| Vincenzo (VOST)", cat: "30", tmdbId: 1396, matchStatus: "matched" },
    ]);
    await seedTmdb("movie", 557, {
      title: "Spider-Man",
      original_title: "Spider-Man",
      release_date: "2002-05-01",
      overview: "Peter Parker…",
      poster_path: "/sm.jpg",
      backdrop_path: "/smb.jpg",
      vote_average: 7.31,
      vote_count: 18000,
      genres: [
        { id: 28, name: "Action" },
        { id: 878, name: "Science-Fiction" },
      ],
      runtime: 121,
      credits: { cast: [{ name: "Tobey Maguire", character: "Peter Parker" }], crew: [{ name: "Sam Raimi", job: "Director" }] },
      videos: { results: [{ key: "abc", site: "YouTube", type: "Trailer", official: true }] },
      release_dates: { results: [{ iso_3166_1: "FR", release_dates: [{ certification: "TP" }] }] },
      original_language: "en",
      translations: { translations: [{ iso_639_1: "en", data: { title: "Spider-Man" } }] },
      alternative_titles: { titles: [{ iso_3166_1: "FR", title: "L'Homme-Araignée" }] },
    });
    await seedTmdb("tv", 1396, {
      name: "Vincenzo",
      original_name: "빈센조",
      first_air_date: "2021-02-20",
      last_air_date: "2021-05-02",
      status: "Ended",
      episode_run_time: [80],
      genres: [{ id: 80, name: "Crime" }],
      created_by: [{ name: "Park Jae-bum" }],
    });
  });
  afterAll(closeDb);

  it("builds one content per work, with card fields from TMDB and aggregates from the variants", async () => {
    const stats = await runGrouping();
    expect(stats.items_grouped).toBe(12);
    expect(stats.orphans_removed).toBe(0);

    const sm = await content("tmdb:movie:557");
    expect(sm).toBeDefined();
    expect(sm.kind).toBe("vod");
    expect(sm.title).toBe("Spider-Man");
    expect(sm.year).toBe(2002);
    expect(sm.rating).toBe(7.3);
    expect(sm.genreIds).toEqual([28, 878]);
    expect(sm.genres).toEqual(["Action", "Science-Fiction"]);
    expect(sm.runtime).toBe(121);
    expect(sm.certification).toBe("TP");
    expect(sm.cast).toEqual([{ name: "Tobey Maguire", role: "Peter Parker" }]);
    expect(sm.director).toBe("Sam Raimi");
    expect(sm.trailerKey).toBe("abc");
    expect(sm.variantCount).toBe(4);
    expect(sm.visible).toBe(true);
    expect(sm.maxQualityRank).toBe(4);
    expect(sm.dynamicRange).toBe("DV");
    expect([...sm.languages].sort()).toEqual(["IT", "VF", "VOSTFR"]);
    expect(sm.addedAt.toISOString()).toBe("2026-09-01T00:00:00.000Z");

    const v = await variants(sm.id);
    expect(v.map((x) => [x.xtreamId, x.lang, x.quality, x.dynamicRange])).toEqual([
      ["1", "VF", "4K", "DV"], // category "FILMS 4K DV" gives DV to the plain 4K entry
      ["2", "VF", "4K", "DV"], // the (DV) entry: quality from the category
      ["3", "VOSTFR", null, null],
      ["4", "IT", null, null],
    ]);
  });

  it("keeps unmatched variants in a fallback content, invisible when its variants are hidden", async () => {
    const fb = await content("fallback:movie:spider-man:2002");
    expect(fb).toBeDefined();
    expect(fb.variantCount).toBe(1);
    expect(fb.year).toBe(2002);
    expect(fb.tmdbId).toBeNull();
    expect(fb.visible).toBe(true);
    // Hidden category
    expect((await content("fallback:movie:tenet:-")).visible).toBe(false);
    // Hidden by hand
    expect((await content("fallback:movie:dune:-")).visible).toBe(false);
  });

  it("groups channels by market and name, keeping the best variant's logo and number", async () => {
    const fr = await content("live:fr-tf1");
    expect(fr.variantCount).toBe(2);
    expect(fr.maxQualityRank).toBe(3);
    expect(fr.logoUrl).toBe("http://x/tf1-fhd.png");
    expect(fr.channelNumber).toBe(2);
    expect(fr.epgChannelId).toBe("TF1.fr");
    expect(fr.title).toBe("TF1");
    expect((await content("live:be-tf1")).variantCount).toBe(1);
  });

  it("merges series entries split per season upstream", async () => {
    const s = await content("tmdb:tv:1396");
    expect(s.variantCount).toBe(2);
    expect(s.endYear).toBe(2021);
    expect(s.runtime).toBe(80);
    expect(s.director).toBe("Park Jae-bum");
    const v = await variants(s.id);
    expect(v.map((x) => x.seasonHint)).toEqual([1, null]);
  });

  it("indexes the title, the original title, the cast and the director without accents", async () => {
    const hit = async (q: string) =>
      (await db.select({ key: schema.contents.key }).from(schema.contents).where(sql`search @@ plainto_tsquery('simple', ${q})`)).map(
        (r) => r.key,
      );
    expect(await hit("tobey maguire")).toEqual(["tmdb:movie:557"]);
    expect(await hit("homme araignee")).toEqual(["tmdb:movie:557"]);
    expect((await content("tmdb:movie:557")).titleEn).toBe("Spider-Man");
    expect(await hit("raimi")).toEqual(["tmdb:movie:557"]);
    expect(await hit("빈센조")).toEqual(["tmdb:tv:1396"]);
    expect(await hit("tf1")).toEqual(expect.arrayContaining(["live:fr-tf1", "live:be-tf1"]));
  });

  it("is idempotent", async () => {
    const before = await db.select({ id: schema.contents.id, key: schema.contents.key }).from(schema.contents).orderBy(schema.contents.id);
    await runGrouping();
    const after = await db.select({ id: schema.contents.id, key: schema.contents.key }).from(schema.contents).orderBy(schema.contents.id);
    expect(after).toEqual(before);
  });

  it("moves a variant to its TMDB group after a manual match, and drops the emptied fallback", async () => {
    const [it] = await db.select().from(schema.items).where(eq(schema.items.xtreamId, "5"));
    await db.update(schema.items).set({ tmdbId: 557, matchStatus: "manual" }).where(eq(schema.items.id, it.id));
    await regroupItems([it.id]);
    expect(await content("fallback:movie:spider-man:2002")).toBeUndefined();
    const sm = await content("tmdb:movie:557");
    expect(sm.variantCount).toBe(5);
    expect((await variants(sm.id)).map((x) => x.xtreamId)).toContain("5");
  });

  it("honours a manual split through key_override", async () => {
    const [it] = await db.select().from(schema.items).where(eq(schema.items.xtreamId, "4"));
    await db
      .update(schema.items)
      .set({ keyOverride: `manual:${it.id}` })
      .where(eq(schema.items.id, it.id));
    await regroupItems([it.id]);
    expect((await content("tmdb:movie:557")).variantCount).toBe(4);
    const split = await content(`manual:${it.id}`);
    expect(split.variantCount).toBe(1);
    expect(split.title).toBe("Spider-Man");
  });

  it("follows the admin visibility switches", async () => {
    await db.update(schema.items).set({ hiddenManual: false }).where(eq(schema.items.xtreamId, "7"));
    await refreshVisibility();
    expect((await content("fallback:movie:dune:-")).visible).toBe(true);
  });

  it("removes a content whose last variant disappeared", async () => {
    await db.delete(schema.items).where(eq(schema.items.xtreamId, "102"));
    const stats = await runGrouping();
    expect(stats.orphans_removed).toBe(1);
    expect(await content("live:be-tf1")).toBeUndefined();
  });
});
