import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { resetDb, closeDb, seedCategories, seedItems, seedTmdb, groupAndFilter } from "@/test/db";
import { runNaming, regroupItems, refreshVisibility, groupingCounts } from "../group";
import { inArray } from "drizzle-orm";

const content = async (key: string) => (await db.select().from(schema.catalogContents).where(eq(schema.catalogContents.key, key)))[0];
const variants = (contentId: number) =>
  db.select().from(schema.catalogVariants).where(eq(schema.catalogVariants.contentId, contentId)).orderBy(schema.catalogVariants.id);

afterAll(closeDb);

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
      credits: {
        cast: [{ id: 2, name: "Tobey Maguire", character: "Peter Parker", profile_path: "/tobey.jpg" }],
        crew: [{ name: "Sam Raimi", job: "Director" }],
      },
      videos: { results: [{ key: "abc", site: "YouTube", type: "Trailer", official: true }] },
      release_dates: { results: [{ iso_3166_1: "FR", release_dates: [{ certification: "TP" }] }] },
      original_language: "en",
      translations: { translations: [{ iso_639_1: "en", data: { title: "Spider-Man" } }] },
      alternative_titles: { titles: [{ iso_3166_1: "FR", title: "L'Homme-Araignée" }] },
      belongs_to_collection: { id: 556, name: "Spider-Man - Saga", poster_path: "/sp.jpg", backdrop_path: "/sb.jpg" },
      production_companies: [{ id: 5, name: "Columbia Pictures" }],
      images: { logos: [{ file_path: "/logo.png", iso_639_1: "fr", vote_average: 5 }] },
      adult: false,
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
      networks: [{ id: 213, name: "Netflix" }],
      content_ratings: { results: [{ iso_3166_1: "FR", rating: "12" }] },
    });
  });

  it("builds one content per work, with card fields from TMDB and aggregates from the variants", async () => {
    await runNaming();
    const stats = await groupAndFilter();
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
    expect(sm.cast).toEqual([{ id: 2, name: "Tobey Maguire", role: "Peter Parker", profile: "/tobey.jpg" }]);
    expect(sm.director).toBe("Sam Raimi");
    expect(sm.trailerKey).toBe("abc");
    expect(sm.variantCount).toBe(4);
    expect(sm.visible).toBe(true);
    expect(sm.maxQualityRank).toBe(4);
    expect(sm.dynamicRange).toBe("DV");
    expect([...sm.languages].sort()).toEqual(["IT", "VF", "VOSTFR"]);
    expect(sm.addedAt.toISOString()).toBe("2026-09-20T04:10:00.000Z");

    const v = await variants(sm.id);
    expect(v.map((x) => [x.xtreamId, x.lang, x.quality, x.dynamicRange])).toEqual([
      ["1", "VF", "4K", "DV"], // category "FILMS 4K DV" gives DV to the plain 4K entry
      ["2", "VF", "4K", "DV"], // the (DV) entry: quality from the category
      ["3", "VOSTFR", null, null],
      ["4", "IT", null, null],
    ]);
  });

  it("writes every card column, from TMDB or from the variants", async () => {
    const cards = await db.execute(sql`
      select key, title, original_title, title_en, tmdb_adult, year, end_year, poster_path, backdrop_path, title_logo_path,
        overview, rating, vote_count, genre_ids, genres, runtime, certification, "cast", director, trailer_key, status,
        search::text as search, release_date, saga_id, saga_name, saga_poster_path, saga_backdrop_path, company_ids, network_ids, cards_lang
      from catalog_contents order by key`);
    expect(cards).toMatchSnapshot();
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
      (
        await db
          .select({ key: schema.catalogContents.key })
          .from(schema.catalogContents)
          .where(sql`search @@ plainto_tsquery('simple', ${q})`)
      ).map((r) => r.key);
    expect(await hit("tobey maguire")).toEqual(["tmdb:movie:557"]);
    expect(await hit("homme araignee")).toEqual(["tmdb:movie:557"]);
    expect((await content("tmdb:movie:557")).titleEn).toBe("Spider-Man");
    expect(await hit("raimi")).toEqual(["tmdb:movie:557"]);
    expect(await hit("빈센조")).toEqual(["tmdb:tv:1396"]);
    expect(await hit("tf1")).toEqual(expect.arrayContaining(["live:fr-tf1", "live:be-tf1"]));
  });

  it("is idempotent", async () => {
    const before = await db
      .select({ id: schema.catalogContents.id, key: schema.catalogContents.key })
      .from(schema.catalogContents)
      .orderBy(schema.catalogContents.id);
    await runNaming();
    await groupAndFilter();
    const after = await db
      .select({ id: schema.catalogContents.id, key: schema.catalogContents.key })
      .from(schema.catalogContents)
      .orderBy(schema.catalogContents.id);
    expect(after).toEqual(before);
  });

  it("rewrites a card only when it changes: a cache entry read again unchanged only moves the copy's date", async () => {
    const stamp = async () =>
      (
        await db.execute<{ updated_at: string; cards_at: string }>(
          sql`select updated_at::text, cards_at::text from catalog_contents where key = 'tmdb:movie:557'`,
        )
      )[0];
    const before = await stamp();
    await db.execute(sql`update tmdb_cache set fetched_at = now() + interval '1 minute' where tmdb_id = 557 and media_type = 'movie'`);
    await groupAndFilter();
    const same = await stamp();
    expect(same.updated_at).toBe(before.updated_at);
    expect(same.cards_at).not.toBe(before.cards_at);
    await db.execute(sql`update tmdb_cache set data = jsonb_set(data, '{vote_average}', '8.1'), fetched_at = now() + interval '2 minutes'
      where tmdb_id = 557 and media_type = 'movie'`);
    await groupAndFilter();
    expect((await stamp()).updated_at).not.toBe(before.updated_at);
    expect((await content("tmdb:movie:557")).rating).toBe(8.1);
    await db.execute(sql`update tmdb_cache set data = jsonb_set(data, '{vote_average}', '7.31'), fetched_at = now() + interval '3 minutes'
      where tmdb_id = 557 and media_type = 'movie'`);
    await groupAndFilter();
  });

  it("keeps the TMDB card's title when the variants' names change, and copies the card again when TMDB's is newer", async () => {
    const rename = (xtreamId: string, name: string) =>
      db.update(schema.catalogVariants).set({ name }).where(eq(schema.catalogVariants.xtreamId, xtreamId));
    await rename("1", "|FR| Spidey (4K)");
    await rename("2", "|FR| Spidey (DV)");
    await runNaming();
    await groupAndFilter();
    expect((await content("tmdb:movie:557")).title).toBe("Spider-Man"); // the card is current and not copied again: the upsert must leave the title alone

    await db.execute(sql`update tmdb_cache set data = jsonb_set(data, '{title}', '"Spider-Man, le film"'), fetched_at = now() + interval '1 minute'
      where tmdb_id = 557 and media_type = 'movie'`);
    await groupAndFilter();
    expect((await content("tmdb:movie:557")).title).toBe("Spider-Man, le film");

    await db.execute(sql`update tmdb_cache set data = jsonb_set(data, '{title}', '"Spider-Man"'), fetched_at = now() + interval '2 minutes'
      where tmdb_id = 557 and media_type = 'movie'`);
    await rename("1", "|FR| Spider-Man (4K)");
    await rename("2", "|FR| Spider-Man (DV)");
    await runNaming();
    await groupAndFilter();
    expect((await content("tmdb:movie:557")).title).toBe("Spider-Man");
  });

  it("keeps iptv-org's adult flag and theme when the names are parsed again", async () => {
    const tf1 = eq(schema.catalogVariants.xtreamId, "100");
    await db.update(schema.catalogVariants).set({ iptvAdult: true, iptvTheme: "Sport" }).where(tf1);
    await runNaming(); // what `merge` does at every import, `channels` failing afterwards
    const [v] = await db.select().from(schema.catalogVariants).where(tf1);
    expect(v).toMatchObject({ nameAdult: false, adult: true, theme: "Sport" });
    await db.update(schema.catalogVariants).set({ iptvAdult: false, iptvTheme: null }).where(tf1);
    const [back] = await db.select().from(schema.catalogVariants).where(tf1);
    expect(back.adult).toBe(false);
    expect(back.theme).toBe(back.nameTheme);
  });

  it("counts for the dashboard what the app sees: hidden variants neither make a content nor several variants", async () => {
    const vod = async () => (await groupingCounts()).find((r) => r.kind === "vod")!;
    const before = await vod();
    const rest = inArray(schema.catalogVariants.xtreamId, ["2", "3", "4"]);
    await db.update(schema.catalogVariants).set({ hiddenManual: true }).where(rest);
    // Spider-Man keeps one visible variant: still a content, no longer « several variants ».
    expect(await vod()).toMatchObject({ visible: before.visible, multi: before.multi - 1 });
    await db.update(schema.catalogVariants).set({ hiddenManual: false }).where(rest);
    expect(await vod()).toEqual(before);
  });

  it("moves a variant to its TMDB group after a manual match, and drops the emptied fallback", async () => {
    const [it] = await db.select().from(schema.catalogVariants).where(eq(schema.catalogVariants.xtreamId, "5"));
    await db.update(schema.catalogVariants).set({ tmdbId: 557, matchStatus: "manual" }).where(eq(schema.catalogVariants.id, it.id));
    await regroupItems([it.id]);
    expect(await content("fallback:movie:spider-man:2002")).toBeUndefined();
    const sm = await content("tmdb:movie:557");
    expect(sm.variantCount).toBe(5);
    expect((await variants(sm.id)).map((x) => x.xtreamId)).toContain("5");
  });

  it("honours a manual split through key_override", async () => {
    const [it] = await db.select().from(schema.catalogVariants).where(eq(schema.catalogVariants.xtreamId, "4"));
    await db
      .update(schema.catalogVariants)
      .set({ keyOverride: `manual:${it.id}` })
      .where(eq(schema.catalogVariants.id, it.id));
    await regroupItems([it.id]);
    expect((await content("tmdb:movie:557")).variantCount).toBe(4);
    const split = await content(`manual:${it.id}`);
    expect(split.variantCount).toBe(1);
    expect(split.title).toBe("Spider-Man");
  });

  it("follows the admin visibility switches", async () => {
    await db.update(schema.catalogVariants).set({ hiddenManual: false }).where(eq(schema.catalogVariants.xtreamId, "7"));
    await refreshVisibility();
    expect((await content("fallback:movie:dune:-")).visible).toBe(true);
  });

  it("removes a content whose last variant disappeared", async () => {
    await db.delete(schema.catalogVariants).where(eq(schema.catalogVariants.xtreamId, "102"));
    await runNaming();
    const stats = await groupAndFilter();
    expect(stats.orphans_removed).toBe(1);
    expect(await content("live:be-tf1")).toBeUndefined();
  });
});

describe("rules on versions", () => {
  beforeAll(async () => {
    await resetDb();
    await seedItems([
      { kind: "vod", xtreamId: "1", name: "|FR| Dune", tmdbId: 438631, matchStatus: "matched" },
      { kind: "vod", xtreamId: "2", name: "|IT| Dune", tmdbId: 438631, matchStatus: "matched" },
      { kind: "vod", xtreamId: "3", name: "|IT| Mio figlio", tmdbId: 1001, matchStatus: "matched" },
      { kind: "vod", xtreamId: "4", name: "|FR| Sisyphus (VOST)", tmdbId: 1002, matchStatus: "matched" },
      { kind: "live", xtreamId: "5", name: "|IT| RAI 1" },
    ]);
    await seedTmdb("movie", 438631, { title: "Dune", release_date: "2021-09-15" });
    await seedTmdb("movie", 1001, { title: "Mio figlio", release_date: "2017-01-01" });
    await seedTmdb("movie", 1002, { title: "Sisyphus", release_date: "2021-01-01" });
    await runNaming();
  });

  const hiddenVersions = async () =>
    (await db.select().from(schema.catalogVariants).where(eq(schema.catalogVariants.hiddenByRule, true))).map((v) => v.xtreamId).sort();
  const languages = (query: string) =>
    db
      .insert(schema.curationFilters)
      .values({ kind: "vod", query })
      .onConflictDoUpdate({ target: schema.curationFilters.kind, set: { query } });

  it("serves every version while no filter is set", async () => {
    const stats = await groupAndFilter();
    expect(stats.variants_hidden).toBe(0);
    expect((await content("tmdb:movie:1001")).visible).toBe(true);
  });

  it("leaves versions out before the aggregates: a content keeps the others, or disappears; a kind's filter never touches another", async () => {
    await languages('variant.langue:"vf","vo","ar"');
    const stats = await groupAndFilter();
    expect(await hiddenVersions()).toEqual(["2", "3", "4"]);
    expect(stats.variants_hidden).toBe(3);
    const dune = await content("tmdb:movie:438631");
    expect(dune).toMatchObject({ visible: true, variantCount: 1, languages: ["VF"] });
    expect((await content("tmdb:movie:1001")).visible).toBe(false); // Italian only
    expect((await content("tmdb:movie:1002")).visible).toBe(false); // VOSTFR only
    const [rai] = await db.select().from(schema.catalogContents).where(eq(schema.catalogContents.kind, "live"));
    expect(rai.visible).toBe(true); // a film filter
  });

  it("serves a version again once the filter keeps it", async () => {
    await languages('variant.langue:"vf","vo","ar","it"');
    await groupAndFilter();
    expect(await hiddenVersions()).toEqual(["4"]);
    expect((await content("tmdb:movie:438631")).variantCount).toBe(2);
  });
});
