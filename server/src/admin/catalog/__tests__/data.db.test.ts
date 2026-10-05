import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/db";
import { compileQuery, runNaming, setItemHiddenManual } from "@/catalog";
import { withCatalogLock } from "@/catalog/lock";
import { resetDb, closeDb, seedCategories, seedItems, groupAndFilter } from "@/test/db";
import { searchContents } from "../app-data";
import { counts } from "../../dashboard/data";

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
  await runNaming();
  await groupAndFilter();
});
afterAll(closeDb);

/** How many films a search of the screen finds. */
const found = async (q: string) => (await searchContents(db, "vod", compileQuery(q, { kind: "vod", lang: "fr-FR" })!, 0)).total;
/** The switches recompute their content in the background, under the catalogue lock. */
const settled = () => withCatalogLock(async () => {});

describe("admin catalogue", () => {
  it("counts per kind, a hidden category hiding its items too; TMDB counts visible entries only", async () => {
    const c = await counts();
    const v = c.items.find((r) => r.kind === "vod")!;
    expect(v).toMatchObject({ total: 5, hidden: 2, matched: 1, unmatched: 2, pending: 0 });
    expect(c.categories.find((r) => r.kind === "vod")).toMatchObject({ total: 2, hidden: 1 });
  });

  it("searches the contents: visibility and TMDB status are independent", async () => {
    expect(await found("visible:oui")).toBe(3);
    expect(await found("visible:non")).toBe(2);
    expect(await found("tmdb:oui")).toBe(1);
    expect(await found("tmdb:non")).toBe(3);
    expect(await found("visible:non tmdb:attente")).toBe(1);
    expect(await found("tmdb:non,attente")).toBe(4);
    expect(await found("mat")).toBe(1);
  });

  it("the manual switch writes hidden_manual, and the content follows", async () => {
    const heat = (await searchContents(db, "vod", compileQuery("heat", { kind: "vod", lang: "fr-FR" })!, 0)).rows[0];
    const [variant] = await db.query.catalogVariants.findMany({ where: (v, { eq }) => eq(v.contentId, heat.id) });
    await setItemHiddenManual(variant.id, true);
    await settled();
    expect(await found("visible:oui")).toBe(2);
    await setItemHiddenManual(variant.id, false);
    await settled();
    expect(await found("visible:oui")).toBe(3);
  });
});
