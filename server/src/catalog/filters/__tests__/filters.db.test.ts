import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema, type Kind } from "@/db";
import { compileQuery } from "@/catalog";
import { resetDb, closeDb, seedCategories, seedItems } from "@/test/db";
import { runGrouping, runNaming } from "../../grouping/group";
import { filtersPending, listFilters, previewFilter, saveFilter } from "../filters";
import { applyFilters } from "../apply";
import { searchContents } from "@/admin/catalog/app-data";

beforeAll(async () => {
  await resetDb();
  await seedCategories([
    { kind: "vod", xtreamId: "10", name: "FILMS" },
    { kind: "vod", xtreamId: "13", name: "ADULTES XXX" },
    { kind: "live", xtreamId: "20", name: "ITALY | TV" },
  ]);
  await seedItems([
    { kind: "vod", xtreamId: "1", name: "|FR| Matrix", cat: "10" },
    { kind: "vod", xtreamId: "2", name: "|IT| Heat", cat: "10" },
    { kind: "vod", xtreamId: "3", name: "|FR| Clan of Violence", cat: "13" },
    { kind: "live", xtreamId: "100", name: "|IT| RAI 1", cat: "20" },
    { kind: "live", xtreamId: "101", name: "|FR| TF1" },
  ]);
  await runNaming();
  await runGrouping();
  await applyFilters();
});
afterAll(closeDb);

/** The titles of the visible contents of `kind`. */
const visible = async (kind: Kind) =>
  (await db.select().from(schema.catalogContents).where(eq(schema.catalogContents.kind, kind)))
    .filter((c) => c.visible)
    .map((c) => c.title)
    .sort();
/** The xtream ids of the versions of `kind` the filter leaves out. */
const left = async (kind: Kind) =>
  (await db.select().from(schema.catalogVariants).where(eq(schema.catalogVariants.kind, kind)))
    .filter((v) => v.hiddenByRule !== false)
    .map((v) => v.xtreamId)
    .sort();
/** Saved then applied: what a pass from « Filtres » does. */
async function filter(kind: Kind, query: string) {
  expect(await saveFilter(kind, query)).toBeNull();
  await applyFilters();
}

describe("filters", () => {
  it("previews what a query would keep, contents and versions, and says what is wrong", async () => {
    expect(await previewFilter("vod", 'xtream.marché:"fr"')).toEqual({
      versions: 3,
      keptVersions: 2,
      contents: 3,
      keptContents: 2,
      kept: ["Clan of Violence", "Matrix"],
      left: ["Heat"],
    });
    expect(await previewFilter("live", "titre:matrix")).toMatchObject({ keptContents: 0, left: ["RAI 1", "TF1"] });
    expect(await previewFilter("vod", "genr:x")).toMatchObject({ error: expect.stringContaining("voulais-tu genre") });
    expect(await saveFilter("vod", "visible:non")).toContain("recherches");
    expect(await saveFilter("live", "genre:anim")).toContain("qu'aux films et aux séries"); // each kind its own fields
    expect(await saveFilter("vod", "titre:/(?<x>FR)/")).toContain("régulière"); // JavaScript takes it, Postgres does not
    expect(await listFilters()).toEqual({});
  });

  it("saving only marks the filters pending; the filters step keeps what matches", async () => {
    expect(await saveFilter("live", 'marché:"fr"')).toBeNull();
    expect(await filtersPending()).toBe(true);
    expect(await visible("live")).toEqual(["RAI 1", "TF1"]); // not applied yet
    await applyFilters();
    expect(await filtersPending()).toBe(false);
    expect(await visible("live")).toEqual(["TF1"]);
    expect(await left("live")).toEqual(["100"]); // RAI's only version
    expect(await saveFilter("live", ' marché:"fr" ')).toBeNull();
    expect(await filtersPending()).toBe(false); // the same query
    await filter("live", ""); // no filter: everything kept
    expect(await listFilters()).toEqual({});
    expect(await visible("live")).toEqual(["RAI 1", "TF1"]);
  });

  it("judges version by version: a content keeps the versions that pass, or disappears", async () => {
    await filter("vod", 'xtream.marché:"fr" || titre:heat');
    expect(await visible("vod")).toEqual(["Clan of Violence", "Heat", "Matrix"]);
    await filter("vod", 'xtream.marché:"fr"');
    expect(await left("vod")).toEqual(["2"]);
    expect(await visible("vod")).toEqual(["Clan of Violence", "Matrix"]);
    await filter("vod", "-matrix"); // a content field: all its versions together
    expect(await visible("vod")).toEqual(["Clan of Violence", "Heat"]);
    await filter("vod", "");
    expect(await visible("vod")).toEqual(["Clan of Violence", "Heat", "Matrix"]);
  });

  it("a version the filter has not seen is left out until it judges it", async () => {
    await seedItems([{ kind: "vod", xtreamId: "4", name: "|FR| Heat 2" }]);
    await runNaming();
    await runGrouping();
    const [fresh] = await db.select().from(schema.catalogVariants).where(eq(schema.catalogVariants.xtreamId, "4"));
    expect(fresh.hiddenByRule).toBeNull();
    expect(await visible("vod")).not.toContain("Heat 2");
    await applyFilters();
    expect(await visible("vod")).toContain("Heat 2");
  });

  it("the admin's searches see the filters' verdict", async () => {
    await filter("live", 'marché:"fr"');
    const where = compileQuery("visible:oui", { kind: "live", lang: "fr-FR" })!;
    expect((await searchContents(db, "live", where, 0)).rows.map((c) => c.title)).toEqual(["TF1"]);
    await filter("live", "");
  });

  it("a filter that no longer compiles leaves its kind as it was", async () => {
    await filter("live", 'marché:"fr"');
    // Saved before a check existed: skipped, the step does not fail.
    await db.update(schema.curationFilters).set({ query: "titre:/(?<x>FR)/" }).where(eq(schema.curationFilters.kind, "live"));
    await expect(applyFilters()).resolves.toBeTruthy();
    expect(await visible("live")).toEqual(["TF1"]);
    await db.delete(schema.curationFilters);
    await applyFilters();
  });
});
