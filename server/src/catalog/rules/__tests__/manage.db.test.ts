import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { compileQuery } from "@/catalog";
import { resetDb, closeDb, seedCategories, seedItems, groupAndFilter } from "@/test/db";
import { runGrouping, runNaming } from "../../grouping/group";
import { listRules, saveRule, deleteRule, setRuleEnabled, previewRule, checkRuleQuery } from "../manage";
import { applyRules, hidingRule } from "../apply";
import { rulesPending } from "../compiled";
import { variantHidingRule } from "../variants";
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
  await applyRules();
});
afterAll(closeDb);

/** The titles of the contents of `kind` the rules hide. */
const hidden = async (kind: "vod" | "live") =>
  (await db.select().from(schema.catalogContents).where(eq(schema.catalogContents.kind, kind)))
    .filter((c) => c.hiddenByRule)
    .map((c) => c.title)
    .sort();
const rule = (over: Partial<Parameters<typeof saveRule>[0]> = {}) => ({
  name: "r",
  kind: "live" as const,
  query: 'marché:"it"',
  enabled: true,
  ...over,
});

/** The xtream ids of the versions of `kind` the rules on versions hide. */
const hiddenVersions = async (kind: "vod" | "live") =>
  (await db.select().from(schema.catalogVariants).where(eq(schema.catalogVariants.kind, kind)))
    .filter((v) => v.hiddenByRule)
    .map((v) => v.xtreamId)
    .sort();

describe("filter rules", () => {
  it("previews a query on the contents, or the versions, of its kind, and says what is wrong", async () => {
    expect(await previewRule({ query: "titre:clan", kind: "vod" })).toEqual({ target: "content", matches: ["Clan of Violence"], total: 1 });
    expect(await previewRule({ query: 'xtream.marché:"it"', kind: "vod" })).toEqual({
      target: "variant",
      matches: ["|IT| Heat"],
      total: 1,
    });
    expect(await previewRule({ query: "titre:matrix", kind: "live" })).toEqual({ target: "content", matches: [], total: 0 });
    expect(await previewRule({ query: "genr:x", kind: "vod" })).toMatchObject({ error: expect.stringContaining("voulais-tu genre") });
    expect(await checkRuleQuery("visible:non", "vod")).toContain("recherches");
    expect(await checkRuleQuery("genre:anim", "live")).toContain("qu'aux films et aux séries"); // each kind its own fields
  });

  it("saving only marks the rules pending; the filters step applies them to the contents", async () => {
    await saveRule(rule());
    expect(await rulesPending()).toBe(true);
    expect(await hidden("live")).toEqual([]); // not applied yet
    expect(await applyRules()).toMatchObject({ contents: 1 });
    expect(await rulesPending()).toBe(false);
    expect(await hidden("live")).toEqual(["RAI 1"]);
    const [rai] = await db.select().from(schema.catalogContents).where(eq(schema.catalogContents.title, "RAI 1"));
    expect(rai.visible).toBe(false);
    expect(await hidingRule(rai)).toBe("r");
    const [r] = await listRules();
    await setRuleEnabled(r.id, false);
    expect(await rulesPending()).toBe(true);
    await applyRules();
    expect(await hidden("live")).toEqual([]);
    await deleteRule(r.id);
    expect(await listRules()).toEqual([]);
  });

  it("a rule on versions applies at the filters step: the content keeps its other versions, or disappears", async () => {
    await saveRule(rule({ name: "Pas d'italien", kind: "vod", query: 'xtream.marché:"it"' }));
    expect(await rulesPending()).toBe(true);
    await groupAndFilter();
    expect(await rulesPending()).toBe(false);
    expect(await hiddenVersions("vod")).toEqual(["2"]);
    const [heat] = await db.select().from(schema.catalogContents).where(eq(schema.catalogContents.title, "Heat"));
    expect(heat.visible).toBe(false); // its only version
    const [variant] = await db.select().from(schema.catalogVariants).where(eq(schema.catalogVariants.xtreamId, "2"));
    expect(await variantHidingRule(variant)).toBe("Pas d'italien");
    for (const r of await listRules()) await deleteRule(r.id);
    await applyRules(); // « Masquage » alone applies every rule
    expect(await hiddenVersions("vod")).toEqual([]);
    expect((await db.select().from(schema.catalogContents).where(eq(schema.catalogContents.title, "Heat")))[0].visible).toBe(true);
  });

  it("a rule mixing content and version fields hides the matching versions of the matching contents", async () => {
    await saveRule(rule({ name: "TF1 en italien", query: 'titre:tf1 xtream.marché:"it"' })); // TF1 has no Italian version
    await saveRule(rule({ name: "RAI en italien", query: 'titre:rai xtream.marché:"it"' }));
    expect(await previewRule({ kind: "live", query: 'titre:rai xtream.marché:"it"' })).toMatchObject({ target: "variant", total: 1 });
    await applyRules();
    expect(await hiddenVersions("live")).toEqual(["100"]);
    expect(await hidden("live")).toEqual([]); // no rule on contents: RAI 1 is hidden for having no version left
    const [rai] = await db.select().from(schema.catalogContents).where(eq(schema.catalogContents.title, "RAI 1"));
    expect(rai.visible).toBe(false);
    for (const r of await listRules()) await deleteRule(r.id);
    await applyRules();
  });

  it("a rule only hides: one matching is enough, in no order; an exception is written in the query", async () => {
    await saveRule(rule({ name: "Italie" }));
    await saveRule(rule({ name: "Tout sauf la France", query: '-marché:"fr"' }));
    await applyRules();
    expect(await hidden("live")).toEqual(["RAI 1"]); // matched by both: hidden once
    await saveRule(rule({ name: "Films sauf Heat", kind: "vod", query: "-heat" }));
    await applyRules();
    expect(await hidden("vod")).toEqual(["Clan of Violence", "Matrix"]);
    for (const r of await listRules()) await deleteRule(r.id);
    await applyRules();
    expect(await hidden("vod")).toEqual([]);
  });

  it("a content the grouping makes stays hidden until the rules judge it", async () => {
    await seedItems([{ kind: "vod", xtreamId: "4", name: "|FR| Heat 2" }]);
    await runNaming();
    await runGrouping();
    const [fresh] = await db.select().from(schema.catalogContents).where(eq(schema.catalogContents.title, "Heat 2"));
    expect(fresh).toMatchObject({ hiddenByRule: null, visible: false });
    await applyRules();
    const [judged] = await db.select().from(schema.catalogContents).where(eq(schema.catalogContents.id, fresh.id));
    expect(judged).toMatchObject({ hiddenByRule: false, visible: true });
  });

  it("the admin's searches see the rules' verdict", async () => {
    await saveRule(rule({ name: "Italie" }));
    await applyRules();
    const visible = compileQuery("visible:oui", { kind: "live", lang: "fr-FR" })!.where;
    expect((await searchContents(db, "live", visible, 0)).rows.map((c) => c.title)).toEqual(["TF1"]);
    for (const r of await listRules()) await deleteRule(r.id);
    await applyRules();
  });

  it("refuses a regex that JavaScript accepts and Postgres does not, and skips such a rule on apply", async () => {
    expect(await checkRuleQuery("titre:/(?<x>FR)/", "vod")).toContain("régulière");
    expect(await checkRuleQuery("titre:/\\bFR\\b/", "vod")).toBeNull();
    // A rule saved before the check existed: skipped, the step does not fail.
    await db.insert(schema.curationFilterRules).values({ name: "Cassée", kind: "vod", query: "titre:/(?<x>FR)/", enabled: true });
    await expect(applyRules()).resolves.toMatchObject({ contents: 0 });
    expect(await hidden("vod")).toEqual([]);
    for (const r of await listRules()) await deleteRule(r.id);
  });
});
