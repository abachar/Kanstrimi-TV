import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { compileQuery } from "@/catalog";
import { resetDb, closeDb, seedCategories, seedItems } from "@/test/db";
import { listRules, saveRule, deleteRule, setRuleEnabled, previewRule, checkRuleQuery } from "../manage";
import { applyRules, rulesPending } from "../apply";
import { countItems } from "@/admin/catalog/data";

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
    { kind: "live", xtreamId: "100", name: "RAI 1", cat: "20" },
    { kind: "live", xtreamId: "101", name: "|FR| TF1" },
  ]);
});
afterAll(closeDb);

const hidden = async (kind: "vod" | "live") => {
  const rows = await db
    .select({ id: schema.catalogVariants.xtreamId, h: schema.catalogVariants.hiddenByRule })
    .from(schema.catalogVariants);
  return rows
    .filter((r) => r.h && (kind === "live" ? Number(r.id) >= 100 : Number(r.id) < 100))
    .map((r) => r.id)
    .sort();
};
const rule = (over: Partial<Parameters<typeof saveRule>[0]> = {}) => ({
  name: "r",
  kind: "all" as const,
  query: "nom:/\\|IT\\|/",
  action: "hide" as const,
  enabled: true,
  position: 0,
  ...over,
});

describe("filter rules", () => {
  it("previews a query on the variants of its kind, and says what is wrong", async () => {
    expect(await previewRule({ query: "catégorie:xxx", kind: "all" })).toEqual({ matches: ["[vod] |FR| Clan of Violence"], total: 1 });
    expect(await previewRule({ query: "nom:matrix", kind: "live" })).toEqual({ matches: [], total: 0 });
    expect(await previewRule({ query: "genr:x", kind: "vod" })).toMatchObject({ error: expect.stringContaining("voulais-tu genre") });
    expect(await checkRuleQuery("visible:non", "vod")).toContain("recherches");
    expect(await checkRuleQuery("genre:anim", "all")).toBeNull(); // a rule for every kind takes every field
  });

  it("saving only marks the rules pending; the filters step applies them", async () => {
    await saveRule(rule());
    expect(await rulesPending()).toBe(true);
    expect(await hidden("vod")).toEqual([]); // not applied yet
    expect(await applyRules()).toMatchObject({ items: 1 });
    expect(await rulesPending()).toBe(false);
    expect(await hidden("vod")).toEqual(["2"]);
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
    expect(await hidden("vod")).toEqual(["1", "3"]);
    expect(await hidden("live")).toEqual([]); // the keep rule is for films only
    for (const r of await listRules()) await deleteRule(r.id);
    await applyRules();
    expect(await hidden("vod")).toEqual([]);
  });

  it("marks a category hidden when a rule hides every variant in it", async () => {
    await saveRule(rule({ name: "Italie", kind: "live", query: "catégorie:/^\\s*ITALY/" }));
    await applyRules();
    expect(await hidden("live")).toEqual(["100"]);
    const [italy] = await db.select().from(schema.catalogCategories).where(eq(schema.catalogCategories.xtreamId, "20"));
    expect(italy.hiddenByRule).toBe(true);
    const visible = compileQuery("visible:oui", { kind: "live", lang: "fr-FR" });
    expect(await countItems({ kind: "live", q: "visible:oui", cat: "", match: visible })).toBe(1);
    for (const r of await listRules()) await deleteRule(r.id);
    await applyRules();
    const [again] = await db.select().from(schema.catalogCategories).where(eq(schema.catalogCategories.xtreamId, "20"));
    expect(again.hiddenByRule).toBe(false);
  });
});
