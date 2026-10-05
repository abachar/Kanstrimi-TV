import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parseQuery, QueryError, termsOf, type QueryNode } from "../parse";

const terms = (q: string) => termsOf(parseQuery(q));
/** The tree as a short string: `a`, `!(…)`, `and(…)`, `or(…)`. */
const shape = (q: string) => {
  const show = (n: QueryNode): string => {
    if (n.kind === "term")
      return `${n.term.neg ? "-" : ""}${n.term.field ? `${n.term.field}:` : ""}${n.term.op.kind === "match" ? n.term.op.values.map((v) => v.text).join(",") : n.term.op.kind}`;
    const inner = `${n.kind}(${n.nodes.map(show).join(" ")})`;
    return n.neg ? `!${inner}` : inner;
  };
  const root = parseQuery(q);
  return root && show(root);
};
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
    expect(terms("  ")).toEqual([]);
    expect(terms("matrix")).toEqual([
      { neg: false, field: null, fieldAt: 0, op: { kind: "match", values: [{ text: "matrix", exact: false, at: 0 }] }, at: 0 },
    ]);
    const [t] = terms('-genre:"science fiction"');
    expect(t).toMatchObject({
      neg: true,
      field: "genre",
      fieldAt: 1,
      op: { kind: "match", values: [{ text: "science fiction", exact: true }] },
    });
    expect(terms('"mission: impossible"')[0]).toMatchObject({
      field: null,
      op: { values: [{ text: "mission: impossible", exact: true }] },
    });
    expect(terms("spider-man")[0]).toMatchObject({ neg: false, field: null, op: { values: [{ text: "spider-man" }] } });
    expect(terms('nom:"a \\"b\\" c"')[0].op).toMatchObject({ values: [{ text: 'a "b" c', exact: true }] });
  });

  it("reads lists, comparisons, ranges and regexes", () => {
    expect(terms('langue-vo:hi,"ta",te')[0].op).toMatchObject({
      kind: "match",
      values: [
        { text: "hi", exact: false },
        { text: "ta", exact: true },
        { text: "te", exact: false },
      ],
    });
    for (const cmp of ["<", "<=", ">", ">=", "="])
      expect(terms(`année:${cmp}1980`)[0].op).toMatchObject({ kind: "cmp", cmp, value: { text: "1980" } });
    expect(terms("note:6..8")[0].op).toMatchObject({ kind: "range", from: { text: "6" }, to: { text: "8" } });
    expect(terms("nom:/\\|(PT|IT)\\|/")[0].op).toEqual({ kind: "regex", pattern: "\\|(PT|IT)\\|", at: 4 });
    expect(terms("nom:/a\\/b/")[0].op).toMatchObject({ pattern: "a/b" });
    expect(terms("genre:anim  &&  langue-vo:ja").map((t) => t.field)).toEqual(["genre", "langue-vo"]);
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

describe("filter language: && and ||", () => {
  it("joins terms by && and ||, || weaker; never by a bare space", () => {
    expect(shape("a")).toBe("a");
    expect(shape("a && b")).toBe("and(a b)");
    expect(shape("a&&b")).toBe("and(a b)");
    expect(shape("a || b")).toBe("or(a b)");
    expect(shape("genre:a||genre:b")).toBe("or(genre:a genre:b)");
    expect(shape("a || b && c")).toBe("or(a and(b c))");
    expect(shape("a && b || c && d || e")).toBe("or(and(a b) and(c d) e)");
  });

  it("reads bare words in a row as one free text", () => {
    expect(shape("casa de  papel")).toBe("casa de papel");
    expect(shape("-casa de papel")).toBe("-casa de papel");
    expect(shape("casa de papel && note:>8")).toBe("and(casa de papel note:cmp)");
    expect(shape("la casa || el chapo")).toBe("or(la casa el chapo)");
    expect(shape("spider-man far from home")).toBe("spider-man far from home");
    expect(fails("casa de papel note:>8")).toEqual(["Opérateur attendu entre deux termes : && ou ||", 14]);
    expect(fails('matrix "reloaded"')[0]).toBe("Opérateur attendu entre deux termes : && ou ||");
    expect(fails("matrix -reloaded")[0]).toBe("Opérateur attendu entre deux termes : && ou ||");
    expect(fails("genre:anim langue:ja")).toEqual(["Opérateur attendu entre deux termes : && ou ||", 11]);
  });

  it("groups with parentheses, a « - » negating the group", () => {
    expect(shape("(a || b) && c")).toBe("and(or(a b) c)");
    expect(shape("( a )")).toBe("a");
    expect(shape("-(a && b)")).toBe("!and(a b)");
    expect(shape("-(a || b)")).toBe("!or(a b)");
    expect(shape("-(a)")).toBe("!and(a)");
    expect(shape("-(-(a && b))")).toBe("!and(!and(a b))");
    expect(fails("(a || b) c")[0]).toBe("Opérateur attendu entre deux termes : && ou ||");
  });

  it("keeps parentheses, & and | inside quotes and regexes, a lone | or & inside a word", () => {
    expect(shape('xtream.nom:"(4K)" || "a && b"')).toBe("or(xtream.nom:(4K) a && b)");
    expect(terms("xtream.nom:/\\((4K|UHD)\\)$/")[0].op).toMatchObject({ kind: "regex", pattern: "\\((4K|UHD)\\)$" });
    expect(shape("xtream.nom:|FR| && a&b")).toBe("and(xtream.nom:|FR| a&b)");
  });

  it("says where an expression is wrong", () => {
    expect(fails("(a && b")).toEqual(["Parenthèse non fermée", 0]);
    expect(fails("a && b)")).toEqual(["Parenthèse fermante sans ouvrante", 6]);
    expect(fails("()")).toEqual(["Parenthèses vides", 0]);
    expect(fails("a ||")).toEqual(["Terme attendu après ||", 4]);
    expect(fails("a && || b")).toEqual(["Terme attendu avant ||", 5]);
    expect(fails("|| a")).toEqual(["Terme attendu avant ||", 0]);
    expect(fails("(a ||)")).toEqual(["Terme attendu après ||", 5]);
    expect(fails("(a)b")).toEqual(["Espace attendu entre deux termes", 3]);
    expect(fails("xtream.nom:(4K)")[0]).toContain("une parenthèse s'écrit entre guillemets");
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
