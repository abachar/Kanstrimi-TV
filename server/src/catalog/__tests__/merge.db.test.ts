import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema, variants as vr } from "@/db";
import { resetDb, closeDb } from "@/test/db";
import { RADIO_CATEGORY_ID, runSync, type XStream } from "@/providers/xtream";
import { runMerge } from "../merge";
import { runNaming } from "../grouping/group";

// What the provider lists; each test rewrites it before an import.
let vod: unknown = [];
let series: XStream[] = [];
let live: XStream[] = [];

vi.mock("@/providers/xtream/client", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/providers/xtream/client")>();
  return {
    ...mod,
    xtreamFor: () => ({
      account: async () => ({ user_info: { auth: 1 } }),
      liveCategories: async () => [{ category_id: "10", category_name: "FRANCE" }],
      vodCategories: async () => [{ category_id: "20", category_name: "Films" }],
      seriesCategories: async () => [{ category_id: "30", category_name: "Series" }],
      liveStreams: async () => live,
      vodStreams: async () => vod,
      series: async () => series,
    }),
  };
});

beforeAll(async () => {
  await resetDb();
});
afterAll(closeDb);

/** The `source` step as the pipeline runs it: the import, then the variants and the names. */
const importAll = async (opts: { acceptShrink?: boolean } = {}) => {
  const read = await runSync(opts);
  return { ...read.stats, ...(await runMerge()) };
};
const variants = async (kind: "live" | "vod" | "series") => {
  const rows = await db.select().from(vr).where(eq(vr.kind, kind));
  return new Map(rows.map((r) => [r.xtreamId, r]));
};
/** A title as a past identification left it, and a stream hung on it. */
const title = async (key: string, tmdbId: number | null) =>
  (
    await db
      .insert(schema.catalogTitles)
      .values({
        key,
        kind: "vod",
        tmdbId,
        title: key,
        matchStatus: tmdbId ? "matched" : "unmatched",
        matchedAt: new Date(),
        addedAt: new Date(),
      })
      .returning({ id: schema.catalogTitles.id })
  )[0].id;
const attach = (id: number, titleId: number, how: string, manual = false) =>
  db.update(schema.catalogVariants).set({ titleId, how, manual }).where(eq(schema.catalogVariants.id, id));
const films = (n: number, name = (i: number) => `Film ${i}`) =>
  Array.from({ length: n }, (_, i) => ({ stream_id: i + 1, name: name(i + 1), category_id: "20", added: "1720000000" }));

describe("source → merge", () => {
  it("builds the catalogue from the lists: sections, our radio category, arrival dates, names", async () => {
    live = [
      { name: "•●★--|FR| SPORT |FR|---★●•", stream_id: 900, category_id: "10" },
      { name: "|FR| BEIN 1", stream_id: 1, category_id: "10" },
      { name: "|FR| BEL RTL", stream_id: 2, category_id: null as unknown as string, stream_type: "radio_streams" },
    ];
    vod = films(60);
    series = [
      { series_id: 1, name: "S1", category_id: "30", last_modified: "1720000000" },
      { series_id: 2, name: "S2", category_id: "30" },
    ];
    const stats = await importAll();
    expect(stats).toMatchObject({ items_added: 64, items_updated: 0, items_removed: 0 });
    const l = await variants("live");
    expect([...l.keys()].sort()).toEqual(["1", "2"]); // the separator is no version
    const [separator] = await db.select().from(schema.xtreamStreams).where(eq(schema.xtreamStreams.separator, true));
    expect(separator).toMatchObject({ upstreamId: "900", title: null }); // kept as a stream, never read
    expect(l.get("1")?.section).toBe("|FR| SPORT |FR|");
    expect(l.get("2")?.categoryXtreamId).toBe(RADIO_CATEGORY_ID);
    const cats = await db.select({ id: schema.xtreamCategories.xtreamId }).from(schema.xtreamCategories);
    expect(cats.map((c) => c.id).sort()).toEqual(["10", "20", "30", RADIO_CATEGORY_ID]);
    expect((await variants("series")).get("1")?.addedAt).toEqual(new Date(1720000000 * 1000));
    expect((await variants("vod")).get("1")?.cleanTitle).toBe("Film 1"); // named in the same step
  });

  it("writes nothing when nothing changed", async () => {
    const before = await variants("vod");
    const stats = await importAll();
    expect(stats).toMatchObject({ items_added: 0, items_updated: 0, items_removed: 0, categories_updated: 0, items_named: 0 });
    const after = await variants("vod");
    expect(after.get("1")?.changedAt).toEqual(before.get("1")?.changedAt);
    expect([...after.values()].map((v) => v.id)).toEqual([...before.values()].map((v) => v.id)); // a stream keeps its id
  });

  it("does not rewrite every movie when one is added at the top of the list", async () => {
    vod = [{ stream_id: 999, name: "Nouveau", category_id: "20", num: 1 }, ...films(60).map((f, i) => ({ ...f, num: i + 2 }))];
    const stats = await importAll();
    expect(stats).toMatchObject({ items_added: 1, items_updated: 0 });
    vod = films(60);
    expect(await importAll()).toMatchObject({ items_removed: 1, items_updated: 0 });
  });

  it("follows last_modified when it advances, keeps the stored date when the value is dirty", async () => {
    const before = await variants("series");
    series = [
      { series_id: 1, name: "S1", category_id: "30", last_modified: "1720000100" },
      { series_id: 2, name: "S2", category_id: "30", last_modified: "abc" },
    ];
    await importAll();
    const after = await variants("series");
    expect(after.get("1")?.addedAt).toEqual(new Date(1720000100 * 1000));
    expect(after.get("2")?.addedAt).toEqual(before.get("2")?.addedAt);
  });

  it("takes a renamed entry off its title to identify it again, one attached by hand excepted, and removes the vanished", async () => {
    const v = await variants("vod");
    await attach(v.get("1")!.id, await title("tmdb:movie:1", 1), "search");
    await attach(v.get("2")!.id, await title("tmdb:movie:2", 2), "manual", true);
    vod = films(59, (i) => (i <= 2 ? `Film ${i} (2020)` : `Film ${i}`));
    const stats = await importAll();
    expect(stats).toMatchObject({ items_updated: 2, items_removed: 1 });
    const after = await variants("vod");
    expect(after.get("1")).toMatchObject({ matchStatus: "pending", titleId: null, how: null, name: "Film 1 (2020)", year: 2020 });
    expect(after.get("2")).toMatchObject({ matchStatus: "manual", tmdbId: 2, manual: true });
    expect(after.has("60")).toBe(false);
  });

  it("identifies again a stream on a title without a card when the grammar reads its title otherwise, never one TMDB knows", async () => {
    const v = await variants("vod");
    const id = v.get("3")!.id;
    // As if an older grammar had read the title wrong: the new one differs, TMDB had given up.
    await attach(id, await title("fallback:movie:stfr:-", null), "none");
    await db.update(schema.xtreamStreams).set({ title: "STFR" }).where(eq(schema.xtreamStreams.id, id));
    expect(await runNaming()).toEqual({ items_named: 1 });
    expect((await variants("vod")).get("3")).toMatchObject({ matchStatus: "pending", titleId: null, cleanTitle: "Film 3" });
    // The same on a title TMDB knows: the reading follows the grammar, the stream stays where it is.
    const known = await title("tmdb:movie:3", 3);
    await attach(id, known, "search");
    await db.update(schema.xtreamStreams).set({ title: "STFR" }).where(eq(schema.xtreamStreams.id, id));
    expect(await runNaming()).toEqual({ items_named: 1 });
    expect((await variants("vod")).get("3")).toMatchObject({ matchStatus: "matched", titleId: known, cleanTitle: "Film 3" });
    expect(await runNaming()).toEqual({ items_named: 0 });
    // Renamed by the provider: it leaves even that title, to be identified under its new name.
    vod = films(59, (i) => (i <= 2 ? `Film ${i} (2020)` : i === 3 ? "Film 3 (2021)" : `Film ${i}`));
    await importAll();
    expect((await variants("vod")).get("3")).toMatchObject({ matchStatus: "pending", titleId: null, year: 2021 });
  });

  it("refuses a list that is not one, and a list that lost more than half, keeping the catalogue", async () => {
    vod = { user_info: { auth: 0 } };
    await expect(runSync()).rejects.toThrow(/pas une liste/);
    vod = films(10);
    await expect(runSync()).rejects.toThrow(/réduite à 10 entrées pour 59/);
    expect((await variants("vod")).size).toBe(59);
  });

  it("lets a real shrink through when accepted", async () => {
    const stats = await importAll({ acceptShrink: true });
    expect(stats).toMatchObject({ items_removed: 49 });
    expect((await variants("vod")).size).toBe(10);
  });

  it("takes the variant away from an entry the provider turned into a separator line", async () => {
    const before = await variants("vod");
    vod = films(10, (i) => (i === 1 ? "----- FILMS -----" : `Film ${i}`));
    await importAll();
    const after = await variants("vod");
    expect(after.has("1")).toBe(false);
    expect(after.get("2")?.id).toBe(before.get("2")?.id);
    const [row] = await db
      .select()
      .from(schema.xtreamStreams)
      .where(eq(schema.xtreamStreams.id, before.get("1")!.id));
    expect(row).toMatchObject({ separator: true, upstreamId: "1" });
  });
});
