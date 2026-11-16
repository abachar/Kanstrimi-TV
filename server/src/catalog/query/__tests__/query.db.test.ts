import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db, schema, variants as vr, type Kind } from "@/db";
import { contentSource } from "../../queries";
import { resetDb, closeDb, seedCategories, seedItems, seedTmdb, groupAndFilter, ofStreams } from "@/test/db";
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
    release_dates: { results: [{ iso_3166_1: "FR", release_dates: [{ certification: "12" }] }] },
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
    { kind: "vod", upstreamId: "1", name: "|FR| Matrix (4K)", cat: "10", tmdbId: 603, matchStatus: "matched" },
    { kind: "vod", upstreamId: "2", name: "|FR| Matrix (VOSTFR)", cat: "11", tmdbId: 603, matchStatus: "matched" },
    { kind: "vod", upstreamId: "3", name: "|FR| Dilwale Dulhania", cat: "11", tmdbId: 900, matchStatus: "matched" },
    { kind: "vod", upstreamId: "4", name: "|FR| Inconnu 100% (2010)", cat: "11", matchStatus: "unmatched" },
    { kind: "live", upstreamId: "100", name: "|FR| TF1 HD", section: "|FR| GÉNÉRALISTES |FR|" },
  ]);
  await runNaming();
  await groupAndFilter();
});
afterAll(closeDb);

/** The titles of the contents a query finds. */
async function find(q: string, kind: Kind = "vod"): Promise<string[]> {
  const where = compileQuery(q, { kind, lang: "fr-FR" });
  const src = contentSource(kind);
  const rows = await db
    .select(src.fields)
    .from(src.table)
    .where(and(src.ofKind, where ?? undefined))
    .orderBy(src.title);
  return rows.map((r) => r.title);
}
/** The provider's names of the versions a filter keeps. */
async function kept(q: string): Promise<string[]> {
  const where = compileQuery(q, { kind: "vod", lang: "fr-FR", filter: true })!;
  const rows = await db.select({ name: vr.name }).from(vr).where(sql`${vr.kind} = 'vod' and ${where}`).orderBy(vr.name);
  return rows.map((r) => r.name);
}
/** The provider's names of the streams a search of the streams finds. */
async function streams(q: string, kind: Kind = "vod"): Promise<string[]> {
  const where = compileQuery(q, { kind, lang: "fr-FR", streams: true })!;
  const rows = await db.select({ name: vr.name }).from(vr).where(sql`${vr.kind} = ${kind} and ${where}`).orderBy(vr.name);
  return rows.map((r) => r.name);
}
const fails = (q: string, o: { kind?: Kind; filter?: boolean; streams?: boolean } = {}) => {
  try {
    compileQuery(q, { kind: o.kind ?? "vod", lang: "fr-FR", filter: o.filter, streams: o.streams });
  } catch (e) {
    if (e instanceof QueryError) return e.message;
    throw e;
  }
  throw new Error(`« ${q} » should fail`);
};

const [S_4K, S_VOST, S_DILWALE, S_UNKNOWN] = [
  "|FR| Matrix (4K)",
  "|FR| Matrix (VOSTFR)",
  "|FR| Dilwale Dulhania",
  "|FR| Inconnu 100% (2010)",
];
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
    expect(await streams("nom:dulhania")).toEqual([S_DILWALE]);
    expect(await streams("catégorie:comedies")).toEqual([S_DILWALE, S_UNKNOWN, S_VOST]);
    expect(await streams("categorie:COMÉDIES")).toEqual([S_DILWALE, S_UNKNOWN, S_VOST]);
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
    expect(await streams("dynamique:sdr")).toEqual([S_DILWALE, S_UNKNOWN, S_4K, S_VOST]);
    expect(await streams("dynamique:hdr,dv")).toEqual([]);
  });

  it("negates, with a missing value counting as no match", async () => {
    expect(await find("-tmdb:oui")).toEqual([UNKNOWN]);
    expect(await find("tmdb:non")).toEqual([UNKNOWN]);
    expect(await find("-genre:comedie")).toEqual([UNKNOWN, MATRIX]); // the unknown one has no genre: kept
    expect(await find("-matrix")).toEqual([DILWALE, UNKNOWN]);
  });

  it("compares qualities by rank and reads regexes", async () => {
    expect(await streams("qualité:>=fhd")).toEqual([S_4K]);
    expect(await streams("qualité:4k")).toEqual([S_4K]);
    expect(await streams("nom:/\\(4K\\)$/")).toEqual([S_4K]);
    expect(await streams("nom:/\\bmatrix\\b/")).toEqual([S_4K, S_VOST]); // JavaScript's \b
    expect(await find("titre:/MATRIX/")).toEqual([MATRIX]); // case-insensitive
  });

  it("the version terms of a search describe one of its versions, the same one", async () => {
    expect(await streams('langue:"vostfr"')).toEqual([S_VOST]);
    expect(await streams('langue:"vf" && qualité:4k')).toEqual([S_4K]); // its VF is the 4K one
    expect(await streams('langue:"vostfr" && qualité:4k')).toEqual([]); // no stream is both
    expect(await streams('-langue:"vf"')).toEqual([S_VOST]); // the one that is not VF
  });

  it("takes « % » and « _ » literally, and values as parameters only", async () => {
    expect(await streams("nom:100%")).toEqual([S_UNKNOWN]);
    expect(await streams("nom:10_%")).toEqual([]);
    expect(await find('titre:"\'; drop table catalog_contents; --"')).toEqual([]);
    expect(await find('genre:"\' or 1=1 --"')).toEqual([]);
    expect(await find("titre:/x'; delete from catalog_contents; --/")).toEqual([]);
    expect(fails("titre:/'); delete from catalog_contents; --/")).toContain("invalide"); // never reaches Postgres
    expect(await find("")).toEqual([DILWALE, UNKNOWN, MATRIX]); // the table is intact
  });

  it("knows the live fields", async () => {
    expect(await streams("section:generalistes", "live")).toEqual(["|FR| TF1 HD"]);
    expect(await find("tf1 && -adulte:oui", "live")).toEqual(["TF1"]);
  });

  it("finds what Claude read: a title he was asked about, a channel a stream is on through the name he read in it", async () => {
    expect(await streams("ia:oui")).toEqual([]);
    expect(await streams("ia:oui", "live")).toEqual([]);
    const unknown = eq(schema.catalogTitles.title, UNKNOWN);
    const tf1 = ofStreams(eq(schema.xtreamStreams.upstreamId, "100"));
    const [{ how }] = await db.select({ how: schema.catalogStreams.how }).from(schema.catalogStreams).where(tf1);
    await db.update(schema.catalogTitles).set({ aiKind: "other", aiAskedAt: new Date() }).where(unknown); // asked, nothing found
    await db.update(schema.catalogStreams).set({ how: "ai" }).where(tf1);
    try {
      expect(await streams("ia:oui")).toEqual([S_UNKNOWN]);
      expect(await streams("claude:non")).toEqual([S_DILWALE, S_4K, S_VOST]);
      expect(await streams("ia:oui", "live")).toEqual(["|FR| TF1 HD"]);
      expect(await streams("ia:non", "live")).toEqual([]);
      expect(fails("xtream.ia:oui")).toContain("mot de flux"); // not on a screen of the catalogue
    } finally {
      await db.update(schema.catalogTitles).set({ aiKind: null, aiAskedAt: null }).where(unknown);
      await db.update(schema.catalogStreams).set({ how }).where(tf1);
    }
    expect(fails("xtream.ia:oui", { filter: true })).toContain("recherches");
  });

  it("reads || and groups, a version field anywhere judging version by version", async () => {
    expect(await find("genre:comedie || saga:matrix")).toEqual([DILWALE, MATRIX]);
    expect(await find("(genre:comedie || genre:science) && note:>8.5")).toEqual([DILWALE]);
    expect(await find("-(genre:comedie || tmdb:non)")).toEqual([MATRIX]);
    expect(await streams('dilwale || langue:"vostfr"')).toEqual([S_DILWALE, S_VOST]);
    expect(await streams('matrix && (langue:"vostfr" || qualité:4k)')).toEqual([S_4K, S_VOST]);

    const [MATRIX_4K, MATRIX_VOST, DILWALE_V, UNKNOWN_V] = [
      "|FR| Matrix (4K)",
      "|FR| Matrix (VOSTFR)",
      "|FR| Dilwale Dulhania",
      "|FR| Inconnu 100% (2010)",
    ];
    // A filter judges each version, its content fields read on the version's content.
    expect(await kept("matrix")).toEqual([MATRIX_4K, MATRIX_VOST]);
    expect(await kept("matrix || xtream.nom:dilwale")).toEqual([DILWALE_V, MATRIX_4K, MATRIX_VOST]);
    expect(await kept('catalogue.genre:comedie || xtream.langue:"vostfr"')).toEqual([DILWALE_V, MATRIX_VOST]);
    expect(await kept('-(matrix && xtream.langue:"vostfr")')).toEqual([DILWALE_V, UNKNOWN_V, MATRIX_4K]);
    expect(await kept('matrix && xtream.langue:"vostfr"')).toEqual([MATRIX_VOST]);
  });

  it("reads the classification exactly, « aucun » for the many without one", async () => {
    expect(await find('classification:"12"')).toEqual([MATRIX]);
    expect(await find('classification:"TP","U","12"')).toEqual([MATRIX]);
    expect(await find("classification:aucun")).toEqual([DILWALE, UNKNOWN]);
    expect(await find('classification:"12" || classification:aucun')).toEqual([DILWALE, UNKNOWN, MATRIX]);
  });

  it("aucun, bare: a field without a value", async () => {
    expect(await find("saga:aucun")).toEqual([DILWALE, UNKNOWN]);
    expect(await find("genre:aucun")).toEqual([UNKNOWN]);
    expect(await find("note:aucun")).toEqual([UNKNOWN]);
    expect(await find("-saga:aucun")).toEqual([MATRIX]);
    expect(await find("saga:matrix,aucun")).toEqual([DILWALE, UNKNOWN, MATRIX]);
    expect(await find('saga:"aucun"')).toEqual([]); // quoted, the word
    expect(await kept("catalogue.pays:aucun")).toEqual(["|FR| Inconnu 100% (2010)"]);
  });

  it("reads a word under its prefix; the catalogue's goes without on a search, a filter wants both written", async () => {
    expect(await find("catalogue.genre:comedie")).toEqual([DILWALE]);
    expect(await find("catalog.genre:comedie && Catalogue.Annee:<1997")).toEqual([DILWALE]);
    expect(await streams('langue:"vostfr" && catalogue.langue:anglais')).toEqual([S_VOST]); // the stream's language, then the film's
    expect(fails('xtream.langue:"vostfr" && langue:anglais')).toContain("xtream.langue est un mot de flux"); // a screen of the catalogue searches our entries
    expect(await kept('catalogue.langue:anglais && xtream.langue:"vostfr"')).toEqual(["|FR| Matrix (VOSTFR)"]);
    expect(fails("genre:comedie", { filter: true })).toContain("écrire catalogue.genre");
    expect(fails("langue:hindi", { filter: true })).toContain("écrire catalogue.langue ou xtream.langue");
    expect(fails("nom:matrix", { filter: true })).toContain("écrire xtream.nom");
    expect(fails("catalogue.année:abc", { filter: true })).toContain("(catalogue.année)");
    expect(fails("catalogue.nom:matrix")).toContain("mot de flux");
    expect(fails("xtream.genre:anim")).toContain("voulais-tu genre");
    expect(fails("catalogue.thème:sport", { filter: true })).toContain("qu'au direct");
  });

  it("searches the streams themselves: their words without prefix, free text in the provider's name, the entry's under catalogue.", async () => {
    expect(await streams("matrix")).toEqual(["|FR| Matrix (4K)", "|FR| Matrix (VOSTFR)"]);
    expect(await streams("dulhania")).toEqual(["|FR| Dilwale Dulhania"]); // the provider's name, not our title
    expect(await streams('langue:"vostfr"')).toEqual(["|FR| Matrix (VOSTFR)"]);
    expect(await streams("qualité:4k && nom:matrix")).toEqual(["|FR| Matrix (4K)"]);
    expect(await streams("catalogue.tmdb:non")).toEqual(["|FR| Inconnu 100% (2010)"]);
    expect(await streams('catalogue.genre:comedie || xtream.langue:"vostfr"')).toEqual(["|FR| Dilwale Dulhania", "|FR| Matrix (VOSTFR)"]);
    expect(await streams("catalogue.visible:oui && manuel:non")).toHaveLength(4); // a search may use every word
    expect(await streams("tf1", "live")).toEqual(["|FR| TF1 HD"]);
    expect(await streams("section:generalistes && catalogue.pays:aucun", "live")).toEqual(["|FR| TF1 HD"]);
    expect(fails("genre:comedie", { streams: true })).toContain("voulais-tu catalogue.genre");
    expect(fails("langue:xx && titre:matrix", { streams: true })).toContain("voulais-tu catalogue.titre");
  });

  it("refuses before any SQL what does not make sense", () => {
    expect(fails("genr:anim")).toContain("voulais-tu genre");
    expect(fails("genre:>5")).toContain("pas un nombre");
    expect(fails("année:abc")).toContain("« abc » n'est pas un nombre");
    expect(fails("année:/19/")).toContain("pas d'expression régulière");
    expect(fails("note:8..6")).toContain("à l'envers");
    expect(fails("qualité:>=uhd", { streams: true })).toContain("n'est pas une qualité");
    expect(fails("tmdb:peut-être")).toContain("tmdb vaut oui, non ou attente");
    expect(fails("tmdb:<1")).toContain("tmdb vaut oui, non ou attente");
    expect(fails("adulte:peut-être")).toContain("adulte vaut oui ou non");
    expect(fails("titre:/(/")).toContain("invalide");

    expect(fails("langue:japonai")).toContain("voulais-tu japonais");
    expect(fails("langue:xx")).toContain("n'est pas une langue connue");
    expect(fails("pays:/in/")).toContain("ni comparaison ni expression régulière");
    expect(fails("dynamique:hdr10", { streams: true })).toContain("dynamique vaut hdr, dv ou sdr");
    expect(fails("thème:sport")).toContain("qu'au direct");
    expect(fails("genre:anim", { kind: "live" })).toContain("qu'aux films et aux séries");
    expect(fails("saga:marvel", { kind: "series" })).toContain("qu'aux films");
    expect(fails("catalogue.visible:oui", { filter: true })).toContain("recherches");
    expect(fails("nom:matrix")).toContain("nom est un mot de flux : il se cherche dans l'écran Flux");
    expect(fails("qualité:4k")).toContain("mot de flux"); // the quality is a stream's
    expect(fails('variant.langue:"vf"')).toContain("Champ inconnu"); // now xtream.langue
    expect(fails("langue-vo:hindi")).toContain("Champ inconnu"); // now langue
    expect(fails("matrix || genr:anim")).toContain("voulais-tu genre");
    expect(fails("(matrix || catalogue.visible:oui)", { filter: true })).toContain("recherches");
    expect(fails("tmdb:aucun")).toContain("tmdb vaut oui, non ou attente");
  });
});
