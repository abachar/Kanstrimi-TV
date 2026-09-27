import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resetDb, closeDb, seedCategories, seedItems } from "@/test/db";
import { listRules, saveRule, deleteRule, setRuleEnabled, previewRule } from "../manage";
import { countItems } from "@/admin/catalog/data";

beforeAll(async () => {
  await resetDb();
  await seedCategories([
    { kind: "vod", xtreamId: "10", name: "FILMS" },
    { kind: "vod", xtreamId: "13", name: "ADULTES XXX" },
  ]);
  await seedItems([
    { kind: "vod", xtreamId: "1", name: "Matrix", cat: "10" },
    { kind: "vod", xtreamId: "2", name: "Heat", cat: "10" },
    { kind: "vod", xtreamId: "3", name: "Clan of Violence", cat: "13" },
    { kind: "live", xtreamId: "100", name: "XXX TV", cat: "20" },
  ]);
});
afterAll(closeDb);

const hiddenVod = () => countItems({ kind: "vod", q: "", cat: "", vis: "hidden", tmdb: "" });

describe("filter rules store", () => {
  it("previews with the JavaScript engine, per kind and target", async () => {
    expect(await previewRule({ pattern: "xxx", flags: "i", kind: "all", target: "category" })).toEqual({
      matches: ["[vod] ADULTES XXX"],
      total: 1,
    });
    expect(await previewRule({ pattern: "XXX", flags: "", kind: "vod", target: "name" })).toEqual({ matches: [], total: 0 });
    expect(await previewRule({ pattern: "(", flags: "i", kind: "all", target: "name" })).toEqual({ matches: [], total: 0 });
  });

  it("saving a rule applies it at once; disabling and deleting undo it", async () => {
    await saveRule({
      name: "Adultes",
      kind: "vod",
      target: "category",
      pattern: "xxx",
      flags: "i",
      action: "hide",
      enabled: true,
      position: 0,
    });
    const [rule] = await listRules();
    expect(rule.kind).toBe("vod");
    expect(await hiddenVod()).toBe(1);
    await setRuleEnabled(rule.id, false);
    expect(await hiddenVod()).toBe(0);
    await saveRule({
      id: rule.id,
      name: "Adultes",
      kind: "all",
      target: "category",
      pattern: "xxx",
      flags: "i",
      action: "hide",
      enabled: true,
      position: 0,
    });
    expect((await listRules())[0].kind).toBeNull();
    expect(await hiddenVod()).toBe(1);
    await deleteRule(rule.id);
    expect(await listRules()).toEqual([]);
    expect(await hiddenVod()).toBe(0);
  });
});
