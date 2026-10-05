import { sql, type Column, type SQL } from "drizzle-orm";
import { schema, sqlTmdbMediaType, type Kind } from "@/db";
import { stripAccents } from "@/shared";
import type { CodeList } from "./codes";

/**
 * The fields of the filter language. Every condition is about one content (`catalog_contents`, never
 * aliased), as the app shows it: a rule hides contents, the admin's searches list them. TMDB values
 * come from the content's sheet in the cache. The provider's own fields (category, section, edition)
 * are for searches only, true when one of its variants has them: a rule judges the content, never
 * one of its variants.
 *
 * Names and expressions are fixed here; a query only picks among them, its values always travel as
 * parameters.
 */

export type FieldType = "text" | "number" | "enum" | "quality" | "code";
/** A condition on one text value: a column or an expression. */
export type Pred = (value: SQL | Column) => SQL;
/** What `sql.ts` needs of the request: the language of the TMDB cache. */
export type FieldContext = { lang: string };

export type Field = {
  /** The name shown in the help, then its other spellings (case and accents never matter). */
  names: string[];
  type: FieldType;
  doc: string;
  /** One for all kinds, or one per kind when a film's makes no sense for a channel. */
  example: string | Record<Kind, string>;
  /** The kinds it means something for; absent = all. */
  kinds?: Kind[];
  /** Searches only: a rule on it would judge a variant, or depend on its own result. */
  searchOnly?: boolean;
  /**
   * Text: the condition on its values, `pred` applied to each (any one matching is enough).
   * Number and quality: the value. Enum: the condition of each of its values (lower case, no accent).
   */
  text?: (ctx: FieldContext, pred: Pred) => SQL;
  value?: (ctx: FieldContext) => SQL;
  choices?: (ctx: FieldContext) => Record<string, SQL>;
  /** Code: the ISO list its values come from, given by code or by French name; compared exactly. */
  codes?: CodeList;
};

const c = schema.catalogContents;
const VOD_SERIES: Kind[] = ["vod", "series"];

/** Any element of a JSON array of the sheet matching: `elements` yields rows `e(value text)`. */
const tmdbAny = (ctx: FieldContext, elements: SQL, pred: Pred) =>
  sql`exists (select 1 from tmdb_cache t, ${elements} where t.tmdb_id = ${c.tmdbId} and t.lang = ${ctx.lang}
    and t.media_type = ${sqlTmdbMediaType(c.kind)} and ${pred(sql`e.value`)})`;
/** Any element of an array column matching. */
const arrayAny = (col: Column, pred: Pred) => sql`exists (select 1 from unnest(${col}) e(value) where ${pred(sql`e.value`)})`;
/** One of the content's variants matching: `cond` reads the variant as `vv`. */
const someVariant = (cond: SQL) => sql`exists (select 1 from catalog_variants vv where vv.content_id = ${c.id} and ${cond})`;
const yesNo = (cond: SQL) => ({ oui: cond, non: sql`not coalesce(${cond}, false)` });
const any = (...conds: SQL[]) =>
  sql`(${sql.join(
    conds.map((x) => sql`coalesce(${x}, false)`),
    sql` or `,
  )})`;

export const FIELDS: Field[] = [
  {
    names: ["titre", "title"],
    type: "text",
    doc: "Titre, titres originaux, et nom chez le fournisseur ; c'est aussi le texte libre",
    example: { vod: "titre:matrix", series: "titre:friends", live: "titre:tf1" },
    text: (_, p) => any(p(c.title), p(c.originalTitle), p(c.titleEn), someVariant(sql`(${p(sql`vv.name`)} or ${p(sql`vv.clean_title`)})`)),
  },
  {
    names: ["catégorie", "cat"],
    type: "text",
    doc: "Catégorie du fournisseur d'une de ses variantes (recherche seulement)",
    example: 'catégorie:"france fhd"',
    searchOnly: true,
    text: (_, p) =>
      someVariant(
        sql`exists (select 1 from catalog_categories k where k.kind = vv.kind and k.xtream_id = vv.category_xtream_id and ${p(sql`k.name`)})`,
      ),
  },
  {
    names: ["section"],
    type: "text",
    doc: "Section du fournisseur (ligne séparatrice) d'une de ses variantes (recherche seulement)",
    example: "section:sport",
    kinds: ["live"],
    searchOnly: true,
    text: (_, p) => someVariant(p(sql`vv.section`)),
  },
  {
    names: ["édition"],
    type: "text",
    doc: "Montage d'une de ses variantes : version longue, director's cut… (recherche seulement)",
    example: "édition:longue",
    kinds: VOD_SERIES,
    searchOnly: true,
    text: (_, p) => someVariant(p(sql`vv.edition`)),
  },
  {
    names: ["langue", "lang"],
    type: "text",
    doc: "Langues de ses variantes servies : VF, VO, AR…",
    example: 'langue:"vo"',
    text: (_, p) => arrayAny(c.languages, p),
  },
  {
    names: ["qualité", "quality"],
    type: "quality",
    doc: "Meilleure qualité de ses variantes : SD < HD < FHD < 4K",
    example: "qualité:>=fhd",
    value: () => sql`${c.maxQualityRank}`,
  },
  {
    names: ["dynamique", "hdr"],
    type: "enum",
    doc: "Dynamique : hdr, dv (Dolby Vision) ou sdr (ni l'un ni l'autre)",
    example: "dynamique:hdr,dv",
    choices: () => ({
      hdr: sql`${c.dynamicRange} = 'HDR'`,
      dv: sql`${c.dynamicRange} = 'DV'`,
      sdr: sql`${c.dynamicRange} is null`,
    }),
  },
  {
    names: ["marché", "market"],
    type: "text",
    doc: "Marché du préfixe |FR| des noms",
    example: 'marché:"fr"',
    text: (_, p) => p(c.market),
  },
  {
    names: ["genre"],
    type: "text",
    doc: "Genres TMDB",
    example: 'genre:"animation"',
    kinds: VOD_SERIES,
    text: (_, p) => arrayAny(c.genres, p),
  },
  {
    names: ["langue-vo", "vo"],
    type: "code",
    codes: "language",
    doc: "Langue originale TMDB, par code ou par nom : ja, japonais, hindi…",
    example: "langue-vo:hindi,tamoul,te",
    kinds: VOD_SERIES,
    text: (ctx, p) => tmdbAny(ctx, sql`lateral (select t.data->>'original_language') e(value)`, p),
  },
  {
    names: ["pays-vo"],
    type: "code",
    codes: "region",
    doc: 'Pays d\'origine TMDB, par code ou par nom : in, inde, "états-unis"…',
    example: "pays-vo:inde",
    kinds: VOD_SERIES,
    text: (ctx, p) => tmdbAny(ctx, sql`jsonb_array_elements_text(coalesce(t.data->'origin_country', '[]')) e(value)`, p),
  },
  {
    names: ["studio"],
    type: "text",
    doc: "Sociétés de production TMDB, et chaînes d'une série",
    example: "studio:pixar",
    kinds: VOD_SERIES,
    text: (ctx, p) =>
      tmdbAny(
        ctx,
        sql`jsonb_array_elements(coalesce(t.data->'production_companies', '[]') || coalesce(t.data->'networks', '[]')) s, lateral (select s->>'name') e(value)`,
        p,
      ),
  },
  {
    names: ["saga"],
    type: "text",
    doc: "Saga TMDB d'un film",
    example: "saga:marvel",
    kinds: ["vod"],
    text: (_, p) => p(c.sagaName),
  },
  {
    names: ["année", "year"],
    type: "number",
    doc: "Année de sortie",
    example: "année:1980..1989",
    value: () => sql`${c.year}`,
  },
  {
    names: ["note", "rating"],
    type: "number",
    doc: "Note moyenne TMDB, sur 10",
    example: "note:>=7",
    kinds: VOD_SERIES,
    value: () => sql`${c.rating}`,
  },
  {
    names: ["votes"],
    type: "number",
    doc: "Nombre de votes TMDB",
    example: "votes:<10",
    kinds: VOD_SERIES,
    value: () => sql`${c.voteCount}`,
  },
  {
    names: ["durée", "runtime"],
    type: "number",
    doc: "Durée TMDB en minutes (d'un épisode pour une série)",
    example: "durée:>150",
    kinds: VOD_SERIES,
    value: () => sql`${c.runtime}`,
  },
  {
    names: ["tmdb"],
    type: "enum",
    doc: "Rapprochement TMDB : oui (associé), non (introuvable), attente (une variante pas encore cherchée)",
    example: "tmdb:non,attente",
    kinds: VOD_SERIES,
    choices: () => ({
      oui: sql`${c.tmdbId} is not null`,
      non: sql`(${c.tmdbId} is null and not ${someVariant(sql`vv.match_status = 'pending'`)})`,
      attente: sql`(${c.tmdbId} is null and ${someVariant(sql`vv.match_status = 'pending'`)})`,
    }),
  },
  {
    names: ["adulte", "adult"],
    type: "enum",
    doc: "Marqué adulte (TMDB, nom, catégorie ou iptv-org) : oui ou non",
    example: "adulte:oui",
    choices: () => yesNo(sql`${c.adult}`),
  },
  {
    names: ["pays", "country"],
    type: "code",
    codes: "region",
    doc: "Pays d'une chaîne d'une région (Monde arabe), par code ou par nom",
    example: "pays:maroc",
    kinds: ["live"],
    text: (_, p) => p(c.country),
  },
  {
    names: ["thème", "theme"],
    type: "text",
    doc: "Thèmes d'une chaîne : Sport, Infos, Cinéma…",
    example: "thème:sport",
    kinds: ["live"],
    text: (_, p) => arrayAny(c.themes, p),
  },
  {
    names: ["iptv"],
    type: "text",
    doc: "Chaîne iptv-org rattachée (identifiant) et ses catégories",
    example: "iptv:tf1.fr",
    kinds: ["live"],
    text: (_, p) =>
      any(
        p(c.iptvId),
        sql`exists (select 1 from iptvorg_channels ic, unnest(ic.categories) e(value) where ic.id = ${c.iptvId} and ${p(sql`e.value`)})`,
      ),
  },
  {
    names: ["visible"],
    type: "enum",
    doc: "Visible pour l'app : oui ou non",
    example: "visible:non",
    searchOnly: true,
    choices: () => yesNo(sql`${c.visible}`),
  },
];

/** Field names compare without case nor accents: `annee` is `année`. */
export const fieldKey = (name: string) => stripAccents(name).toLowerCase();
const BY_NAME = new Map(FIELDS.flatMap((f) => f.names.map((n) => [fieldKey(n), f] as const)));
export const fieldByName = (name: string) => BY_NAME.get(fieldKey(name));
/** Free text searches here. */
export const TITLE = FIELDS[0];

/** The closest field name, for « did you mean ». */
export function closestField(name: string): string | null {
  const k = fieldKey(name);
  let best: [string, number] | null = null;
  for (const f of FIELDS)
    for (const n of f.names) {
      const d = distance(k, fieldKey(n));
      if (d <= 2 && (!best || d < best[1])) best = [f.names[0], d];
    }
  return best?.[0] ?? null;
}

export function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return row[b.length];
}
