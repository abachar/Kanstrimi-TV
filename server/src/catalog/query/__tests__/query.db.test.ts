import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql } from "drizzle-orm";
import { db, schema, type Kind } from "@/db";
import { resetDb, closeDb, seedCategories, seedItems, seedTmdb } from "@/test/db";
import { runNaming, runGrouping } from "../../grouping/group";
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
    belongs_to_collection: { name: "Matrix - Saga" },
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
  await runGrouping();
});
afterAll(closeDb);

/** The xtream ids of the variants a query finds. */
async function find(q: string, kind: Kind = "vod"): Promise<string[]> {
  const where = compileQuery(q, { kind, lang: "fr-FR" });
  const rows = await db
    .select({ id: schema.catalogVariants.xtreamId })
    .from(schema.catalogVariants)
    .where(sql`${schema.catalogVariants.kind} = ${kind} ${where ? sql`and ${where}` : sql``}`)
    .orderBy(schema.catalogVariants.xtreamId);
  return rows.map((r) => r.id);
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

describe("filter language: conditions", () => {
  it("searches the title and the provider's name, without case nor accents", async () => {
    expect(await find("matrix")).toEqual(["1", "2"]);
    expect(await find("MATRIX vostfr")).toEqual(["2"]);
    expect(await find('titre:"matrix"')).toEqual(["1", "2"]); // the TMDB title, exactly
    expect(await find('nom:"matrix"')).toEqual([]); // the provider's name is longer
    expect(await find("catégorie:comedies")).toEqual(["2", "3", "4"]);
    expect(await find("categorie:COMÉDIES")).toEqual(["2", "3", "4"]);
  });

  it("reads the TMDB sheet of each variant", async () => {
    expect(await find("genre:science")).toEqual(["1", "2"]);
    expect(await find('genre:"science-fiction"')).toEqual(["1", "2"]);
    expect(await find('genre:"science"')).toEqual([]);
    expect(await find("genre:comedie")).toEqual(["3"]);
    expect(await find('langue-vo:"hi","ta"')).toEqual(["3"]);
    expect(await find("pays-vo:us")).toEqual(["1", "2"]);
    expect(await find("studio:warner saga:matrix")).toEqual(["1", "2"]);
    expect(await find("année:<1997")).toEqual(["3"]);
    expect(await find("année:1990..1999")).toEqual(["1", "2", "3"]);
    expect(await find("année:2010")).toEqual(["4"]); // no sheet: the year of the name
    expect(await find("note:>=8.5")).toEqual(["3"]);
    expect(await find("votes:>10000 durée:>120")).toEqual(["1", "2"]);
  });

  it("takes ISO codes by code or by French name, exactly", async () => {
    expect(await find("langue-vo:hindi")).toEqual(["3"]);
    expect(await find("langue-vo:HI,tamoul")).toEqual(["3"]);
    expect(await find("langue-vo:anglais")).toEqual(["1", "2"]);
    expect(await find("pays-vo:inde")).toEqual(["3"]);
    expect(await find('pays-vo:"états-unis"')).toEqual(["1", "2"]);
    expect(await find("pays-vo:usa")).toEqual(["1", "2"]);
  });

  it("knows the dynamic range of the name, SDR being neither", async () => {
    expect(await find("dynamique:sdr")).toEqual(["1", "2", "3", "4"]);
    expect(await find("dynamique:hdr,dv")).toEqual([]);
  });

  it("negates, with a missing value counting as no match", async () => {
    expect(await find("-tmdb:oui")).toEqual(["4"]);
    expect(await find("tmdb:non")).toEqual(["4"]);
    expect(await find("-genre:comedie")).toEqual(["1", "2", "4"]); // « 4 » has no genre: kept
    expect(await find("-matrix")).toEqual(["3", "4"]);
  });

  it("compares qualities by rank and reads regexes", async () => {
    expect(await find("qualité:>=fhd")).toEqual(["1"]);
    expect(await find("qualité:4k")).toEqual(["1"]);
    expect(await find("nom:/\\(4K\\)$/")).toEqual(["1"]);
    expect(await find("nom:/\\bmatrix\\b/")).toEqual(["1", "2"]); // JavaScript's \b
    expect(await find("nom:/MATRIX/")).toEqual(["1", "2"]); // case-insensitive
  });

  it("takes « % » and « _ » literally, and values as parameters only", async () => {
    expect(await find("nom:100%")).toEqual(["4"]);
    expect(await find("nom:10_%")).toEqual([]);
    expect(await find('nom:"\'; drop table catalog_variants; --"')).toEqual([]);
    expect(await find('genre:"\' or 1=1 --"')).toEqual([]);
    expect(await find("nom:/x'; delete from catalog_variants; --/")).toEqual([]);
    expect(fails("nom:/'); delete from catalog_variants; --/")).toContain("invalide"); // never reaches Postgres
    expect(await find("")).toEqual(["1", "2", "3", "4"]); // the table is intact
  });

  it("knows the live fields", async () => {
    expect(await find("section:generalistes", "live")).toEqual(["100"]);
    expect(await find("tf1 -adulte:oui", "live")).toEqual(["100"]);
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
    expect(fails("nom:/(/")).toContain("invalide");
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
