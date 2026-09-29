import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resetDb, closeDb, seedCategories, seedItems, seedTmdb } from "@/test/db";
import { itemById, contentById } from "@/catalog";
import { pageGroups } from "@/admin/groups/data";
import { runGrouping, runNaming } from "../group";
import { splitVariant, resetVariant, mergeVariantInto, mergeCandidates, groupVariants } from "../manual";

let ids: number[] = [];
beforeAll(async () => {
  await resetDb();
  await seedCategories([{ kind: "vod", xtreamId: "10", name: "|FR| FILMS" }]);
  await seedTmdb("movie", 603, { title: "Matrix", release_date: "1999-03-31" });
  ids = (
    await seedItems([
      { kind: "vod", xtreamId: "1", name: "|FR| Matrix (4K)", cat: "10", tmdbId: 603, matchStatus: "matched" },
      { kind: "vod", xtreamId: "2", name: "|FR| Matrix (VOST)", cat: "10", tmdbId: 603, matchStatus: "matched" },
      { kind: "vod", xtreamId: "3", name: "|FR| Heat", cat: "10", matchStatus: "unmatched" },
    ])
  ).map((r) => r.id);
  await runNaming();
  await runGrouping();
});
afterAll(closeDb);

describe("manual grouping", () => {
  it("lists contents, most variants first, with the filters of the admin", async () => {
    const all = await pageGroups({ kind: "vod", q: "", only: "" }, 1);
    expect(all.total).toBe(2);
    expect(all.rows[0]).toMatchObject({ key: "tmdb:movie:603", variantCount: 2 });
    expect((await pageGroups({ kind: "vod", q: "", only: "multi" }, 1)).total).toBe(1);
    expect((await pageGroups({ kind: "vod", q: "", only: "fallback" }, 1)).rows[0].title).toBe("Heat");
  });

  it("splits a variant out, then puts it back", async () => {
    const vost = (await itemById(ids[1]))!;
    const left = await splitVariant(vost);
    expect(left).toMatchObject({ key: "tmdb:movie:603", variantCount: 1 });
    const alone = await itemById(ids[1]);
    expect(alone?.keyOverride).toBe(`manual:${ids[1]}`);
    expect((await contentById(alone!.contentId!))?.key).toBe(`manual:${ids[1]}`);
    const back = await resetVariant(alone!);
    expect(back).toMatchObject({ key: "tmdb:movie:603", variantCount: 2 });
    expect((await pageGroups({ kind: "vod", q: "", only: "" }, 1)).total).toBe(2);
  });

  it("merges a variant into another content found by title", async () => {
    const heat = (await itemById(ids[2]))!;
    const candidates = await mergeCandidates(heat, "matr");
    expect(candidates.map((c) => c.key)).toEqual(["tmdb:movie:603"]);
    expect(await mergeCandidates(heat, "")).toEqual([]);
    await mergeVariantInto(heat, "tmdb:movie:603");
    const g = await groupVariants((await contentById((await itemById(ids[2]))!.contentId!))!.id);
    expect(g?.items.map((i) => i.xtreamId).sort()).toEqual(["1", "2", "3"]);
    expect(g?.categories.get("vod:10")?.name).toBe("|FR| FILMS");
    expect(await groupVariants(999_999)).toBeNull();
  });
});
