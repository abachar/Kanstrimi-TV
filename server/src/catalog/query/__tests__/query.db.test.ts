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
/** The provider's names of the versions a filter keeps. */
async function kept(q: string): Promise<string[]> {
  const where = compileQuery(q, { kind: "vod", lang: "fr-FR", filter: true })!;
  const rows = await db
    .select({ name: schema.catalogVariants.name })
    .from(schema.catalogVariants)
    .where(sql`${schema.catalogVariants.kind} = 'vod' and ${where}`)
    .orderBy(schema.catalogVariants.name);
  return rows.map((r) => r.name);
}
const fails = (q: string, o: { kind?: Kind; filter?: boolean } = {}) => {
  try {
    compileQuery(q, { kind: o.kind ?? "vod", lang: "fr-FR", filter: o.filter });
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
  it("searches the titles without case nor accents; the provider's names are a version's", async () => {
    expect(await find("matrix")).toEqual([MATRIX]);
    expect(await find("inconnu 100")).toEqual([UNKNOWN]); // words in a row: one text
    expect(await find("100 inconnu")).toEqual([]);
    expect(await find('titre:"matrix"')).toEqual([MATRIX]); // the title, exactly
    expect(await find("dulhania")).toEqual([]); // only in the provider's name
    expect(await find("xtream.nom:dulhania")).toEqual([DILWALE]);
    expect(await find("xtream.catégorie:comedies")).toEqual([DILWALE, UNKNOWN, MATRIX]); // one of its versions is there
    expect(await find("xtream.categorie:COMÉDIES")).toEqual([DILWALE, UNKNOWN, MATRIX]);
  });

  it("reads its TMDB sheet", async () => {
    expect(await find("genre:science")).toEqual([MATRIX]);
    expect(await find('genre:"science-fiction"')).toEqual([MATRIX]);
    expect(await find('genre:"science"')).toEqual([]);
    expect(await find("genre:comedie")).toEqual([DILWALE]);
    expect(await find('langue:"hi","ta"')).toEqual([DILWALE]);
    expect(await find("pays:us")).toEqual([MATRIX]);
    expect(await find("studio:warner && saga:matrix")).toEqual([MATRIX]);
    expect(await find("année:<1997")).toEqual([DILWALE]);
    expect(await find("année:1990..1999")).toEqual([DILWALE, MATRIX]);
    expect(await find("année:2010")).toEqual([UNKNOWN]); // no sheet: the year of the name
    expect(await find("note:>=8.5")).toEqual([DILWALE]);
    expect(await find("votes:>10000")).toEqual([MATRIX]);
  });

  it("takes ISO codes by code or by French name, exactly", async () => {
    expect(await find("langue:hindi")).toEqual([DILWALE]);
    expect(await find("langue:HI,tamoul")).toEqual([DILWALE]);
    expect(await find("langue:anglais")).toEqual([MATRIX]);
    expect(await find("pays:inde")).toEqual([DILWALE]);
    expect(await find('pays:"états-unis"')).toEqual([MATRIX]);
    expect(await find("pays:usa")).toEqual([MATRIX]);
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
    expect(await find("qualité:>=fhd")).toEqual([MATRIX]); // its best version
    expect(await find("qualité:4k")).toEqual([MATRIX]);
    expect(await find("xtream.nom:/\\(4K\\)$/")).toEqual([MATRIX]);
    expect(await find("xtream.nom:/\\bmatrix\\b/")).toEqual([MATRIX]); // JavaScript's \b
    expect(await find("titre:/MATRIX/")).toEqual([MATRIX]); // case-insensitive
  });

  it("the version terms of a search describe one of its versions, the same one", async () => {
    expect(await find('variant.langue:"vostfr"')).toEqual([MATRIX]);
    expect(await find('variant.langue:"vf" && variant.qualité:4k')).toEqual([MATRIX]); // its VF is the 4K one
    expect(await find('variant.langue:"vostfr" && variant.qualité:4k')).toEqual([]); // no version is both
    expect(await find('-variant.langue:"vf"')).toEqual([MATRIX]); // a version that is not VF
  });

  it("takes « % » and « _ » literally, and values as parameters only", async () => {
    expect(await find("xtream.nom:100%")).toEqual([UNKNOWN]);
    expect(await find("xtream.nom:10_%")).toEqual([]);
    expect(await find('titre:"\'; drop table catalog_contents; --"')).toEqual([]);
    expect(await find('genre:"\' or 1=1 --"')).toEqual([]);
    expect(await find("titre:/x'; delete from catalog_contents; --/")).toEqual([]);
    expect(fails("titre:/'); delete from catalog_contents; --/")).toContain("invalide"); // never reaches Postgres
    expect(await find("")).toEqual([DILWALE, UNKNOWN, MATRIX]); // the table is intact
  });

  it("knows the live fields", async () => {
    expect(await find("xtream.section:generalistes", "live")).toEqual(["TF1"]);
    expect(await find("tf1 && -adulte:oui", "live")).toEqual(["TF1"]);
  });

  it("reads || and groups, a version field anywhere judging version by version", async () => {
    expect(await find("genre:comedie || saga:matrix")).toEqual([DILWALE, MATRIX]);
    expect(await find("(genre:comedie || genre:science) && note:>8.5")).toEqual([DILWALE]);
    expect(await find("-(genre:comedie || tmdb:non)")).toEqual([MATRIX]);
    expect(await find('dilwale || variant.langue:"vostfr"')).toEqual([DILWALE, MATRIX]);
    expect(await find('matrix && (variant.langue:"vostfr" || variant.qualité:4k)')).toEqual([MATRIX]);

    const [MATRIX_4K, MATRIX_VOST, DILWALE_V, UNKNOWN_V] = [
      "|FR| Matrix (4K)",
      "|FR| Matrix (VOSTFR)",
      "|FR| Dilwale Dulhania",
      "|FR| Inconnu 100% (2010)",
    ];
    // A filter judges each version, its content fields read on the version's content.
    expect(await kept("matrix")).toEqual([MATRIX_4K, MATRIX_VOST]);
    expect(await kept("matrix || xtream.nom:dilwale")).toEqual([DILWALE_V, MATRIX_4K, MATRIX_VOST]);
    expect(await kept('genre:comedie || variant.langue:"vostfr"')).toEqual([DILWALE_V, MATRIX_VOST]);
    expect(await kept('-(matrix && variant.langue:"vostfr")')).toEqual([DILWALE_V, UNKNOWN_V, MATRIX_4K]);
    expect(await kept('matrix && variant.langue:"vostfr"')).toEqual([MATRIX_VOST]);
  });

  it("aucun, bare: a field without a value", async () => {
    expect(await find("saga:aucun")).toEqual([DILWALE, UNKNOWN]);
    expect(await find("genre:aucun")).toEqual([UNKNOWN]);
    expect(await find("note:aucun")).toEqual([UNKNOWN]);
    expect(await find("-saga:aucun")).toEqual([MATRIX]);
    expect(await find("saga:matrix,aucun")).toEqual([DILWALE, UNKNOWN, MATRIX]);
    expect(await find('saga:"aucun"')).toEqual([]); // quoted, the word
    expect(await kept("pays:aucun")).toEqual(["|FR| Inconnu 100% (2010)"]);
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

    expect(fails("langue:japonai")).toContain("voulais-tu japonais");
    expect(fails("langue:xx")).toContain("n'est pas une langue connue");
    expect(fails("pays:/in/")).toContain("ni comparaison ni expression régulière");
    expect(fails("dynamique:hdr10")).toContain("dynamique vaut hdr, dv ou sdr");
    expect(fails("thème:sport")).toContain("qu'au direct");
    expect(fails("genre:anim", { kind: "live" })).toContain("qu'aux films et aux séries");
    expect(fails("saga:marvel", { kind: "series" })).toContain("qu'aux films");
    expect(fails("visible:oui", { filter: true })).toContain("recherches");
    expect(fails("nom:matrix")).toContain("Champ inconnu"); // now xtream.nom
    expect(fails("langue-vo:hindi")).toContain("Champ inconnu"); // now langue
    expect(fails("matrix || genr:anim")).toContain("voulais-tu genre");
    expect(fails("(matrix || visible:oui)", { filter: true })).toContain("recherches");
    expect(fails("tmdb:aucun")).toContain("tmdb vaut oui, non ou attente");
  });
});
