import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { compileQuery } from "@/catalog";
import { resetDb, closeDb, seedCategories, seedItems } from "@/test/db";
import { countItems, pageItems, itemCountByCategory, NO_CATEGORY, type CatalogFilter } from "../data";
import { counts } from "../../dashboard/data";
import { categoryByXtreamId } from "@/catalog";
import { setCategoryHiddenManual, setItemHiddenManual } from "@/db";

const vod = (over: Partial<CatalogFilter> = {}): CatalogFilter => ({
  kind: "vod",
  cat: "",
  ...over,
  q: over.q ?? "",
  // `q` in the filter language, compiled as the route does.
  match: over.q ? compileQuery(over.q, { kind: "vod", lang: "fr-FR" }) : null,
});

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
  it("counts per kind, a hidden category hiding its items too; TMDB counts visible entries only", async () => {
    const c = await counts();
    const v = c.items.find((r) => r.kind === "vod")!;
    expect(v).toMatchObject({ total: 5, hidden: 2, matched: 1, unmatched: 2, pending: 0 });
    expect(c.categories.find((r) => r.kind === "vod")).toMatchObject({ total: 2, hidden: 1 });
  });

  it("filters by query: visibility and TMDB status are independent", async () => {
    expect(await countItems(vod())).toBe(5);
    expect(await countItems(vod({ q: "visible:oui" }))).toBe(3);
    expect(await countItems(vod({ q: "visible:non" }))).toBe(2);
    expect(await countItems(vod({ q: "tmdb:oui" }))).toBe(1);
    expect(await countItems(vod({ q: "tmdb:non" }))).toBe(3);
    expect(await countItems(vod({ q: "visible:non tmdb:attente" }))).toBe(1);
    expect(await countItems(vod({ q: "tmdb:non,attente" }))).toBe(4);
    expect(await countItems(vod({ q: "mat" }))).toBe(1);
    expect(await countItems(vod({ cat: "11" }))).toBe(1);
    // No category upstream: reachable by the sentinel, and visible (no category can hide it).
    expect(await countItems(vod({ cat: NO_CATEGORY }))).toBe(1);
    expect(await countItems(vod({ cat: NO_CATEGORY, q: "visible:oui" }))).toBe(1);
  });

  it("pages in provider order and says whether more remain", async () => {
    const p1 = await pageItems(vod(), 1, 3);
    expect(p1.rows.map((r) => r.xtreamId)).toEqual(["1", "2", "3"]);
    expect(p1.hasMore).toBe(true);
    const p2 = await pageItems(vod(), 2, 3);
    expect(p2.rows.map((r) => r.xtreamId)).toEqual(["4", "5"]);
    expect(p2.hasMore).toBe(false);
  });

  it("counts every entry per category for the Xtream view, hidden ones included", async () => {
    const all = new Map([
      ["10", 3],
      ["11", 1],
      [NO_CATEGORY, 1],
    ]);
    expect(await itemCountByCategory(vod())).toEqual(all);
    expect(await itemCountByCategory(vod({ cat: "11", q: "zzz" }))).toEqual(all); // neither the category nor a search narrows it
  });

  it("the manual switches write hidden_manual and nothing else", async () => {
    const [heat] = (await pageItems(vod({ q: "heat" }), 1)).rows;
    await setItemHiddenManual(heat.id, true);
    expect(await countItems(vod({ q: "visible:oui" }))).toBe(2);
    await setItemHiddenManual(heat.id, false);
    const hidden = await categoryByXtreamId("vod", "11");
    await setCategoryHiddenManual(hidden!.id, false);
    expect(await countItems(vod({ q: "visible:oui" }))).toBe(4);
    expect(await categoryByXtreamId("vod", "missing")).toBeNull();
  });
});
