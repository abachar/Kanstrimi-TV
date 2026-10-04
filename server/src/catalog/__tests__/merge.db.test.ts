import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { resetDb, closeDb } from "@/test/db";
import { setSecretsForTests } from "@/config";
import { runSync as syncSource, type XStream } from "@/providers/xtream";
import { runMerge, RADIO_CATEGORY_ID } from "../merge";
import { variantCountsByKind } from "../queries";

// What the provider lists; each test rewrites it before an import.
let vod: unknown = [];
let series: XStream[] = [];
let live: XStream[] = [];

vi.mock("@/providers/xtream/client", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/providers/xtream/client")>();
  return {
    ...mod,
    xtreamFromSettings: () => ({
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
  setSecretsForTests({ xtream_url: "http://provider.test", xtream_username: "u", xtream_password: "p" });
});
afterAll(closeDb);

/** The `source` step as the pipeline runs it: the provider is handed the catalogue's current counts. */
const runSync = async (opts: { acceptShrink?: boolean } = {}) => syncSource({ ...opts, currentCounts: await variantCountsByKind() });
const importAll = async (opts: { acceptShrink?: boolean } = {}) => {
  await runSync(opts);
  return runMerge(opts);
};
const variants = async (kind: "live" | "vod" | "series") => {
  const rows = await db.select().from(schema.catalogVariants).where(eq(schema.catalogVariants.kind, kind));
  return new Map(rows.map((r) => [r.xtreamId, r]));
};
const films = (n: number, name = (i: number) => `Film ${i}`) =>
  Array.from({ length: n }, (_, i) => ({ stream_id: i + 1, name: name(i + 1), category_id: "20", added: "1720000000" }));

describe("source → merge", () => {
  it("builds the catalogue from the copy: sections, our radio category, arrival dates, names", async () => {
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
    expect([...l.keys()].sort()).toEqual(["1", "2"]); // the separator is no entry
    expect(l.get("1")?.section).toBe("|FR| SPORT |FR|");
    expect(l.get("2")?.categoryXtreamId).toBe(RADIO_CATEGORY_ID);
    const cats = await db.select({ id: schema.catalogCategories.xtreamId }).from(schema.catalogCategories);
    expect(cats.map((c) => c.id).sort()).toEqual(["10", "20", "30", RADIO_CATEGORY_ID]);
    expect((await variants("series")).get("1")?.addedAt).toEqual(new Date(1720000000 * 1000));
    expect((await variants("vod")).get("1")?.cleanTitle).toBe("Film 1"); // named in the same step
  });

  it("writes nothing when nothing changed", async () => {
    const before = await variants("vod");
    const stats = await importAll();
    expect(stats).toMatchObject({ items_added: 0, items_updated: 0, items_removed: 0, categories_updated: 0, items_named: 0 });
    expect((await variants("vod")).get("1")?.changedAt).toEqual(before.get("1")?.changedAt);
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

  it("sends a renamed entry back to TMDB matching, a manual match excepted, and removes the vanished", async () => {
    const v = await variants("vod");
    await db
      .update(schema.catalogVariants)
      .set({ matchStatus: "matched", tmdbId: 1 })
      .where(eq(schema.catalogVariants.id, v.get("1")!.id));
    await db
      .update(schema.catalogVariants)
      .set({ matchStatus: "manual", tmdbId: 2 })
      .where(eq(schema.catalogVariants.id, v.get("2")!.id));
    vod = films(59, (i) => (i <= 2 ? `Film ${i} (2020)` : `Film ${i}`));
    const stats = await importAll();
    expect(stats).toMatchObject({ items_updated: 2, items_removed: 1 });
    const after = await variants("vod");
    expect(after.get("1")).toMatchObject({ matchStatus: "pending", name: "Film 1 (2020)", year: 2020 });
    expect(after.get("2")).toMatchObject({ matchStatus: "manual", tmdbId: 2 });
    expect(after.has("60")).toBe(false);
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

  it("refuses to empty the catalogue from an empty copy (after a deploy)", async () => {
    vod = films(80);
    await importAll();
    await db.execute(sql`truncate table xtream_streams`);
    await expect(runMerge()).rejects.toThrow(/fusion refusée/);
    expect((await variants("vod")).size).toBe(80);
  });
});
