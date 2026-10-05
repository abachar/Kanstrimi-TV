import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql } from "drizzle-orm";
import { db, schema, type Kind } from "@/db";
import { resetDb, closeDb, seedCategories, seedItems, seedTmdb, groupAndFilter } from "@/test/db";
import { runNaming } from "../../grouping/group";
import { compileQuery, QueryError } from "..";

beforeAll(async () => {
  await resetDb();
  await seedCategories([
    { kind: "vod", xtreamId: "10", name: "|FR| FILMS 4K" },
    { kind: "vod", xtreamId: "11", name: "|FR| COMÉDIES" },
  ]);
  await seedTmdb("movie", 603, {
    title: "Matrix",
    release_date: "1999-03-31",
    original_language: "en",
    origin_country: ["US"],
    genres: [
      { id: 878, name: "Science-Fiction" },
      { id: 28, name: "Action" },
    ],
    vote_average: 8.2,
    vote_count: 25000,
    runtime: 136,
    production_companies: [{ name: "Warner Bros. Pictures" }],
    belongs_to_collection: { id: 2344, name: "Matrix - Saga" },
  });
  await seedTmdb("movie", 900, {
    title: "Dilwale",
    release_date: "1995-10-20",
    original_language: "hi",
    origin_country: ["IN"],
    genres: [{ id: 35, name: "Comédie" }],
    vote_average: 8.6,
    vote_count: 4000,
  });
  await seedItems([
    { kind: "vod", xtreamId: "1", name: "|FR| Matrix (4K)", cat: "10", tmdbId: 603, matchStatus: "matched" },
    { kind: "vod", xtreamId: "2", name: "|FR| Matrix (VOSTFR)", cat: "11", tmdbId: 603, matchStatus: "matched" },
    { kind: "vod", xtreamId: "3", name: "|FR| Dilwale Dulhania", cat: "11", tmdbId: 900, matchStatus: "matched" },
    { kind: "vod", xtreamId: "4", name: "|FR| Inconnu 100% (2010)", cat: "11", matchStatus: "unmatched" },
    { kind: "live", xtreamId: "100", name: "|FR| TF1 HD", section: "|FR| GÉNÉRALISTES |FR|" },
  ]);
  await runNaming();
  await groupAndFilter();
});
afterAll(closeDb);

/** The titles of the contents a query finds. */
async function find(q: string, kind: Kind = "vod"): Promise<string[]> {
  const where = compileQuery(q, { kind, lang: "fr-FR" });
  const rows = await db
    .select({ title: schema.catalogContents.title })
    .from(schema.catalogContents)
    .where(sql`${schema.catalogContents.kind} = ${kind} ${where ? sql`and ${where}` : sql``}`)
    .orderBy(schema.catalogContents.title);
  return rows.map((r) => r.title);
}
const fails = (q: string, o: { kind?: Kind | null; rule?: boolean } = {}) => {
  try {
    compileQuery(q, { kind: o.kind === undefined ? "vod" : o.kind, lang: "fr-FR", rule: o.rule });
  } catch (e) {
    if (e instanceof QueryError) return e.message;
    throw e;
  }
  throw new Error(`« ${q} » should fail`);
};

const MATRIX = "Matrix",
  DILWALE = "Dilwale",
  UNKNOWN = "Inconnu 100%";

describe("filter language: conditions on a content", () => {
  it("searches the titles and the provider's names of its variants, without case nor accents", async () => {
    expect(await find("matrix")).toEqual([MATRIX]);
    expect(await find("MATRIX vostfr")).toEqual([MATRIX]); // one variant's name says VOSTFR
    expect(await find('titre:"matrix"')).toEqual([MATRIX]); // the title, exactly
    expect(await find("catégorie:comedies")).toEqual([DILWALE, UNKNOWN, MATRIX]); // one of its variants is there
    expect(await find("categorie:COMÉDIES")).toEqual([DILWALE, UNKNOWN, MATRIX]);
  });

  it("reads its TMDB sheet", async () => {
    expect(await find("genre:science")).toEqual([MATRIX]);
    expect(await find('genre:"science-fiction"')).toEqual([MATRIX]);
    expect(await find('genre:"science"')).toEqual([]);
    expect(await find("genre:comedie")).toEqual([DILWALE]);
    expect(await find('langue-vo:"hi","ta"')).toEqual([DILWALE]);
    expect(await find("pays-vo:us")).toEqual([MATRIX]);
    expect(await find("studio:warner saga:matrix")).toEqual([MATRIX]);
    expect(await find("année:<1997")).toEqual([DILWALE]);
    expect(await find("année:1990..1999")).toEqual([DILWALE, MATRIX]);
    expect(await find("année:2010")).toEqual([UNKNOWN]); // no sheet: the year of the name
    expect(await find("note:>=8.5")).toEqual([DILWALE]);
    expect(await find("votes:>10000 durée:>120")).toEqual([MATRIX]);
  });

  it("takes ISO codes by code or by French name, exactly", async () => {
    expect(await find("langue-vo:hindi")).toEqual([DILWALE]);
    expect(await find("langue-vo:HI,tamoul")).toEqual([DILWALE]);
    expect(await find("langue-vo:anglais")).toEqual([MATRIX]);
    expect(await find("pays-vo:inde")).toEqual([DILWALE]);
    expect(await find('pays-vo:"états-unis"')).toEqual([MATRIX]);
    expect(await find("pays-vo:usa")).toEqual([MATRIX]);
  });

  it("knows the dynamic range, SDR being neither", async () => {
    expect(await find("dynamique:sdr")).toEqual([DILWALE, UNKNOWN, MATRIX]);
    expect(await find("dynamique:hdr,dv")).toEqual([]);
  });

  it("negates, with a missing value counting as no match", async () => {
    expect(await find("-tmdb:oui")).toEqual([UNKNOWN]);
    expect(await find("tmdb:non")).toEqual([UNKNOWN]);
    expect(await find("-genre:comedie")).toEqual([UNKNOWN, MATRIX]); // the unknown one has no genre: kept
    expect(await find("-matrix")).toEqual([DILWALE, UNKNOWN]);
  });

  it("compares qualities by rank and reads regexes", async () => {
    expect(await find("qualité:>=fhd")).toEqual([MATRIX]); // its best variant
    expect(await find("qualité:4k")).toEqual([MATRIX]);
    expect(await find("titre:/\\(4K\\)$/")).toEqual([MATRIX]);
    expect(await find("titre:/\\bmatrix\\b/")).toEqual([MATRIX]); // JavaScript's \b
    expect(await find("titre:/MATRIX/")).toEqual([MATRIX]); // case-insensitive
  });

  it("takes « % » and « _ » literally, and values as parameters only", async () => {
    expect(await find("titre:100%")).toEqual([UNKNOWN]);
    expect(await find("titre:10_%")).toEqual([]);
    expect(await find('titre:"\'; drop table catalog_contents; --"')).toEqual([]);
    expect(await find('genre:"\' or 1=1 --"')).toEqual([]);
    expect(await find("titre:/x'; delete from catalog_contents; --/")).toEqual([]);
    expect(fails("titre:/'); delete from catalog_contents; --/")).toContain("invalide"); // never reaches Postgres
    expect(await find("")).toEqual([DILWALE, UNKNOWN, MATRIX]); // the table is intact
  });

  it("knows the live fields", async () => {
    expect(await find("section:generalistes", "live")).toEqual(["TF1"]);
    expect(await find("tf1 -adulte:oui", "live")).toEqual(["TF1"]);
  });

  it("refuses before any SQL what does not make sense", () => {
    expect(fails("genr:anim")).toContain("voulais-tu genre");
    expect(fails("genre:>5")).toContain("pas un nombre");
    expect(fails("année:abc")).toContain("« abc » n'est pas un nombre");
    expect(fails("année:/19/")).toContain("pas d'expression régulière");
    expect(fails("note:8..6")).toContain("à l'envers");
    expect(fails("qualité:>=uhd")).toContain("n'est pas une qualité");
    expect(fails("tmdb:peut-être")).toContain("tmdb vaut oui, non ou attente");
    expect(fails("tmdb:<1")).toContain("tmdb vaut oui, non ou attente");
    expect(fails("adulte:peut-être")).toContain("adulte vaut oui ou non");
    expect(fails("titre:/(/")).toContain("invalide");
    expect(fails("nom:matrix")).toContain("Champ inconnu"); // the title reads the provider's names
    expect(fails("catégorie:x", { rule: true })).toContain("recherches"); // a rule judges the content, not a variant
    expect(fails("langue-vo:japonai")).toContain("voulais-tu japonais");
    expect(fails("langue-vo:xx")).toContain("n'est pas une langue connue");
    expect(fails("pays-vo:/in/")).toContain("ni comparaison ni expression régulière");
    expect(fails("dynamique:hdr10")).toContain("dynamique vaut hdr, dv ou sdr");
    expect(fails("pays:sa")).toContain("qu'au direct");
    expect(fails("genre:anim", { kind: "live" })).toContain("films et séries");
    expect(fails("visible:oui", { rule: true })).toContain("recherches");
    expect(compileQuery("pays:sa genre:anim", { kind: null, lang: "fr-FR", rule: true })).not.toBeNull(); // a rule for every kind
  });
});
