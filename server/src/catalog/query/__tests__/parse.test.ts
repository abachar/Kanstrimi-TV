import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parseQuery, QueryError } from "../parse";

const fails = (q: string) => {
  try {
    parseQuery(q);
  } catch (e) {
    if (e instanceof QueryError) return [e.message, e.at] as const;
    throw e;
  }
  throw new Error(`« ${q} » should fail`);
};

describe("filter language: reading", () => {
  it("reads free text, fields, negations, quotes", () => {
    expect(parseQuery("  ")).toEqual([]);
    expect(parseQuery("matrix")).toEqual([
      { neg: false, field: null, fieldAt: 0, op: { kind: "match", values: [{ text: "matrix", exact: false, at: 0 }] }, at: 0 },
    ]);
    const [t] = parseQuery('-genre:"science fiction"');
    expect(t).toMatchObject({
      neg: true,
      field: "genre",
      fieldAt: 1,
      op: { kind: "match", values: [{ text: "science fiction", exact: true }] },
    });
    expect(parseQuery('"mission: impossible"')[0]).toMatchObject({
      field: null,
      op: { values: [{ text: "mission: impossible", exact: true }] },
    });
    expect(parseQuery("spider-man")[0]).toMatchObject({ neg: false, field: null, op: { values: [{ text: "spider-man" }] } });
    expect(parseQuery('nom:"a \\"b\\" c"')[0].op).toMatchObject({ values: [{ text: 'a "b" c', exact: true }] });
  });

  it("reads lists, comparisons, ranges and regexes", () => {
    expect(parseQuery('langue-vo:hi,"ta",te')[0].op).toMatchObject({
      kind: "match",
      values: [
        { text: "hi", exact: false },
        { text: "ta", exact: true },
        { text: "te", exact: false },
      ],
    });
    for (const cmp of ["<", "<=", ">", ">=", "="])
      expect(parseQuery(`année:${cmp}1980`)[0].op).toMatchObject({ kind: "cmp", cmp, value: { text: "1980" } });
    expect(parseQuery("note:6..8")[0].op).toMatchObject({ kind: "range", from: { text: "6" }, to: { text: "8" } });
    expect(parseQuery("nom:/\\|(PT|IT)\\|/")[0].op).toEqual({ kind: "regex", pattern: "\\|(PT|IT)\\|", at: 4 });
    expect(parseQuery("nom:/a\\/b/")[0].op).toMatchObject({ pattern: "a/b" });
    expect(parseQuery("genre:anim  langue-vo:ja").map((t) => t.field)).toEqual(["genre", "langue-vo"]);
  });

  it("says where a query is wrong", () => {
    expect(fails('nom:"abc')).toEqual(["Guillemet non fermé", 4]);
    expect(fails("nom:/abc")[1]).toBe(4);
    expect(fails("nom://")[0]).toContain("vide");
    expect(fails("genre:")[0]).toContain("Valeur attendue");
    expect(fails("genre: anim")[0]).toContain("Valeur attendue");
    expect(fails(":anim")[0]).toContain("Nom de champ");
    expect(fails("année:<")[0]).toContain("après <");
    expect(fails("genre:a,")[0]).toContain("Valeur attendue");
    expect(fails("note:1..2..3")[0]).toContain("Intervalle");
    expect(fails("nom:/a/b")).toEqual(["Espace attendu entre deux termes", 7]);
    expect(fails('ab"c"')[0]).toContain("Un guillemet");
  });
});

describe("filter language: SQL safety", () => {
  it("never writes raw SQL: every value is a parameter", () => {
    const dir = path.resolve(import.meta.dirname, "..");
    const sources = fs.readdirSync(dir).filter((f) => f.endsWith(".ts"));
    expect(sources.length).toBeGreaterThan(2);
    for (const f of sources) expect(fs.readFileSync(path.join(dir, f), "utf8"), f).not.toMatch(/sql\.raw|\.unsafe\(/);
  });
});
