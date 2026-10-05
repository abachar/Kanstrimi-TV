import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { compileQuery } from "@/catalog";
import { resetDb, closeDb, seedCategories, seedItems } from "@/test/db";
import { runGrouping, runNaming } from "../../grouping/group";
import { listRules, saveRule, deleteRule, setRuleEnabled, previewRule, checkRuleQuery } from "../manage";
import { applyRules, hidingRule, rulesPending } from "../apply";
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
  kind: "all" as const,
  query: 'marché:"it"',
  action: "hide" as const,
  enabled: true,
  position: 0,
  ...over,
});

describe("filter rules", () => {
  it("previews a query on the contents of its kind, and says what is wrong", async () => {
    expect(await previewRule({ query: "titre:clan", kind: "all" })).toEqual({ matches: ["[vod] Clan of Violence"], total: 1 });
    expect(await previewRule({ query: "titre:matrix", kind: "live" })).toEqual({ matches: [], total: 0 });
    expect(await previewRule({ query: "genr:x", kind: "vod" })).toMatchObject({ error: expect.stringContaining("voulais-tu genre") });
    expect(await checkRuleQuery("visible:non", "vod")).toContain("recherches");
    // A rule judges the content: the provider's fields, about one of its variants, are for searches.
    expect(await checkRuleQuery("catégorie:xxx", "vod")).toContain("recherches");
    expect(await checkRuleQuery("genre:anim", "all")).toBeNull(); // a rule for every kind takes every field
  });

  it("saving only marks the rules pending; the filters step applies them to the contents", async () => {
    await saveRule(rule());
    expect(await rulesPending()).toBe(true);
    expect(await hidden("vod")).toEqual([]); // not applied yet
    expect(await applyRules()).toMatchObject({ contents: 2 });
    expect(await rulesPending()).toBe(false);
    expect(await hidden("vod")).toEqual(["Heat"]);
    expect(await hidden("live")).toEqual(["RAI 1"]);
    const [heat] = await db.select().from(schema.catalogContents).where(eq(schema.catalogContents.title, "Heat"));
    expect(heat.visible).toBe(false);
    expect(await hidingRule(heat)).toBe("r");
    const [r] = await listRules();
    await setRuleEnabled(r.id, false);
    expect(await rulesPending()).toBe(true);
    await applyRules();
    expect(await hidden("vod")).toEqual([]);
    await deleteRule(r.id);
    expect(await listRules()).toEqual([]);
  });

  it("the last matching rule wins, and a « keep » rule makes its kind a whitelist", async () => {
    await saveRule(rule({ name: "IT", position: 0 }));
    await saveRule(rule({ name: "sauf Heat", query: "heat", action: "keep", kind: "vod", position: 1 }));
    await applyRules();
    // Whitelist for films: only what a keep rule matches stays; Heat is kept again by the later rule.
    expect(await hidden("vod")).toEqual(["Clan of Violence", "Matrix"]);
    const [matrix] = await db.select().from(schema.catalogContents).where(eq(schema.catalogContents.title, "Matrix"));
    expect(await hidingRule(matrix)).toBe("aucune règle « garder » ne la retient");
    expect(await hidden("live")).toEqual(["RAI 1"]); // the keep rule is for films only
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
    await saveRule(rule({ name: "Italie", kind: "live" }));
    await applyRules();
    const visible = compileQuery("visible:oui", { kind: "live", lang: "fr-FR" })!;
    expect((await searchContents(db, "live", visible, 0)).rows.map((c) => c.title)).toEqual(["TF1"]);
    for (const r of await listRules()) await deleteRule(r.id);
    await applyRules();
  });

  it("refuses a regex that JavaScript accepts and Postgres does not, and skips such a rule on apply", async () => {
    expect(await checkRuleQuery("titre:/(?<x>FR)/", "all")).toContain("régulière");
    expect(await checkRuleQuery("titre:/\\bFR\\b/", "all")).toBeNull();
    // A rule saved before the check existed: skipped, the step does not fail.
    await db
      .insert(schema.curationFilterRules)
      .values({ name: "Cassée", kind: null, query: "titre:/(?<x>FR)/", action: "hide", enabled: true, position: 0 });
    await expect(applyRules()).resolves.toMatchObject({ contents: 0 });
    expect(await hidden("vod")).toEqual([]);
    for (const r of await listRules()) await deleteRule(r.id);
  });
});
