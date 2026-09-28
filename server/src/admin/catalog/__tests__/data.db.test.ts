import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resetDb, closeDb, seedCategories, seedItems } from "@/test/db";
import { countItems, pageItems, itemCountByCategory, NO_CATEGORY, type CatalogFilter } from "../data";
import { counts } from "../../dashboard/data";
import { categoryByXtreamId } from "@/catalog";
import { setCategoryHiddenManual, setItemHiddenManual } from "@/db";

const vod = (over: Partial<CatalogFilter> = {}): CatalogFilter => ({ kind: "vod", q: "", cat: "", vis: "all", tmdb: "", ...over });

beforeAll(async () => {
  await resetDb();
  await seedCategories([
    { kind: "vod", xtreamId: "10", name: "FILMS" },
    { kind: "vod", xtreamId: "11", name: "CACHÉE", hiddenManual: true },
  ]);
  await seedItems([
    { kind: "vod", xtreamId: "1", name: "Matrix", cat: "10", tmdbId: 603, matchStatus: "matched" },
    { kind: "vod", xtreamId: "2", name: "Heat", cat: "10", matchStatus: "unmatched" },
    { kind: "vod", xtreamId: "3", name: "Masqué à la main", cat: "10", hiddenManual: true, matchStatus: "unmatched" },
    { kind: "vod", xtreamId: "4", name: "Dans la catégorie cachée", cat: "11", matchStatus: "pending" },
    { kind: "vod", xtreamId: "5", name: "Sans catégorie amont", matchStatus: "unmatched" },
    { kind: "live", xtreamId: "100", name: "TF1", cat: "20" },
  ]);
});
afterAll(closeDb);

describe("admin catalogue browsing", () => {
  it("counts per kind, a hidden category hiding its items too", async () => {
    const c = await counts();
    const v = c.items.find((r) => r.kind === "vod")!;
    expect(v).toMatchObject({ total: 5, hidden: 2, matched: 1, unmatched: 3, pending: 1 });
    expect(c.categories.find((r) => r.kind === "vod")).toMatchObject({ total: 2, hidden: 1 });
  });

  it("filters: visibility and TMDB status are independent", async () => {
    expect(await countItems(vod())).toBe(5);
    expect(await countItems(vod({ vis: "visible" }))).toBe(3);
    expect(await countItems(vod({ vis: "hidden" }))).toBe(2);
    expect(await countItems(vod({ tmdb: "matched" }))).toBe(1);
    expect(await countItems(vod({ vis: "hidden", tmdb: "pending" }))).toBe(1);
    expect(await countItems(vod({ q: "mat" }))).toBe(1);
    expect(await countItems(vod({ cat: "11" }))).toBe(1);
    // No category upstream: reachable by the sentinel, and visible (no category can hide it).
    expect(await countItems(vod({ cat: NO_CATEGORY }))).toBe(1);
    expect(await countItems(vod({ cat: NO_CATEGORY, vis: "visible" }))).toBe(1);
  });

  it("pages in provider order and says whether more remain", async () => {
    const p1 = await pageItems(vod(), 1, 3);
    expect(p1.rows.map((r) => r.xtreamId)).toEqual(["1", "2", "3"]);
    expect(p1.hasMore).toBe(true);
    const p2 = await pageItems(vod(), 2, 3);
    expect(p2.rows.map((r) => r.xtreamId)).toEqual(["4", "5"]);
    expect(p2.hasMore).toBe(false);
  });

  it("counts entries per category for the grouped view, under the current filters", async () => {
    expect(await itemCountByCategory(vod())).toEqual(
      new Map([
        ["10", 3],
        ["11", 1],
        [NO_CATEGORY, 1],
      ]),
    );
    // The default filter: what the app sees. The hidden category and the hand-hidden entry drop out.
    expect(await itemCountByCategory(vod({ vis: "visible" }))).toEqual(
      new Map([
        ["10", 2],
        [NO_CATEGORY, 1],
      ]),
    );
    expect(await itemCountByCategory(vod({ tmdb: "unmatched", cat: "11", q: "zzz" }))).toEqual(
      new Map([
        ["10", 2],
        [NO_CATEGORY, 1],
      ]),
    );
  });

  it("the manual switches write hidden_manual and nothing else", async () => {
    const [heat] = (await pageItems(vod({ q: "heat" }), 1)).rows;
    await setItemHiddenManual(heat.id, true);
    expect(await countItems(vod({ vis: "visible" }))).toBe(2);
    await setItemHiddenManual(heat.id, false);
    const hidden = await categoryByXtreamId("vod", "11");
    await setCategoryHiddenManual(hidden!.id, false);
    expect(await countItems(vod({ vis: "visible" }))).toBe(4);
    expect(await categoryByXtreamId("vod", "missing")).toBeNull();
  });
});
