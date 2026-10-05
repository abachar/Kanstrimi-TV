import { sql, type Column, type SQL } from "drizzle-orm";
import { schema, sqlTmdbMediaType, type Kind } from "@/db";
import { stripAccents } from "@/shared";
import type { CodeList } from "./codes";

/**
 * The fields of the filter language, one registry for the rules and the admin's searches. Each field
 * belongs to kinds (Direct, Films, Séries: a name may mean something else per kind, `pays` is where a
 * channel is shown and where a film comes from) and to a level:
 * - `content`, no prefix: the content as the app shows it (`catalog_contents`, never aliased), its TMDB
 *   sheet read in the cache;
 * - `variant`, prefixed `variant.` (what we read of a version) or `xtream.` (what the provider says of it):
 *   one version (`catalog_variants`, never aliased).
 * A search lists contents: a version field there means « one of its versions ». A rule that names a
 * version field judges versions: those that match, in the contents its other terms match (`sql.ts`).
 *
 * Names and expressions are fixed here; a query only picks among them, its values always travel as
 * parameters.
 */

export type FieldType = "text" | "number" | "enum" | "quality" | "code";
export type Level = "content" | "variant";
/** A condition on one text value: a column or an expression. */
export type Pred = (value: SQL | Column) => SQL;
/** What `sql.ts` needs of the request: the language of the TMDB cache. */
export type FieldContext = { lang: string };

export type Field = {
  /** The name shown in the help, then its other spellings (case and accents never matter). */
  names: string[];
  type: FieldType;
  doc: string;
  example: string;
  /** The kinds it means something for. */
  kinds: Kind[];
  level: Level;
  /** Searches only: a rule on it would depend on its own result. */
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
const v = schema.catalogVariants;
const ALL: Kind[] = ["live", "vod", "series"];
const LIVE: Kind[] = ["live"];
const VOD_SERIES: Kind[] = ["vod", "series"];

/** Any element of a JSON array of the content's TMDB sheet matching: `elements` yields rows `e(value text)`. */
const tmdbAny = (ctx: FieldContext, elements: SQL, pred: Pred) =>
  sql`exists (select 1 from tmdb_cache t, ${elements} where t.tmdb_id = ${c.tmdbId} and t.lang = ${ctx.lang}
    and t.media_type = ${sqlTmdbMediaType(c.kind)} and ${pred(sql`e.value`)})`;
/** Any element of an array column matching. */
const arrayAny = (col: Column, pred: Pred) => sql`exists (select 1 from unnest(${col}) e(value) where ${pred(sql`e.value`)})`;
const pending = sql`exists (select 1 from catalog_variants vv where vv.content_id = ${c.id} and vv.match_status = 'pending')`;
const yesNo = (cond: SQL) => ({ oui: cond, non: sql`not coalesce(${cond}, false)` });
const any = (...conds: SQL[]) =>
  sql`(${sql.join(
    conds.map((x) => sql`coalesce(${x}, false)`),
    sql` or `,
  )})`;
const dynamic = (col: Column) => () => ({
  hdr: sql`${col} = 'HDR'`,
  dv: sql`${col} = 'DV'`,
  sdr: sql`${col} is null`,
});

export const FIELDS: Field[] = [
  // ------------------------------------------------------------------ the content
  {
    names: ["titre", "title"],
    type: "text",
    doc: "Titre et titres originaux ; c'est aussi le texte libre",
    example: "titre:matrix",
    kinds: ALL,
    level: "content",
    text: (_, p) => any(p(c.title), p(c.originalTitle), p(c.titleEn)),
  },
  {
    names: ["marché", "market"],
    type: "text",
    doc: "Marché de la chaîne",
    example: 'marché:"fr"',
    kinds: LIVE,
    level: "content",
    text: (_, p) => p(c.market),
  },
  {
    names: ["pays", "country"],
    type: "code",
    codes: "region",
    doc: "Pays de la chaîne dans une région (Monde arabe), par code ou par nom",
    example: "pays:maroc",
    kinds: LIVE,
    level: "content",
    text: (_, p) => p(c.country),
  },
  {
    names: ["pays", "country"],
    type: "code",
    codes: "region",
    doc: 'Pays d\'origine TMDB, par code ou par nom : in, inde, "états-unis"…',
    example: "pays:inde",
    kinds: VOD_SERIES,
    level: "content",
    text: (ctx, p) => tmdbAny(ctx, sql`jsonb_array_elements_text(coalesce(t.data->'origin_country', '[]')) e(value)`, p),
  },
  {
    names: ["thème", "theme"],
    type: "text",
    doc: "Thèmes de la chaîne : Sport, Infos, Cinéma…",
    example: "thème:sport",
    kinds: LIVE,
    level: "content",
    text: (_, p) => arrayAny(c.themes, p),
  },
  {
    names: ["genre"],
    type: "text",
    doc: "Genres TMDB",
    example: 'genre:"animation"',
    kinds: VOD_SERIES,
    level: "content",
    text: (_, p) => arrayAny(c.genres, p),
  },
  {
    names: ["langue", "lang"],
    type: "code",
    codes: "language",
    doc: "Langue originale TMDB, par code ou par nom : ja, japonais, hindi…",
    example: "langue:hindi,tamoul,te",
    kinds: VOD_SERIES,
    level: "content",
    text: (ctx, p) => tmdbAny(ctx, sql`lateral (select t.data->>'original_language') e(value)`, p),
  },
  {
    names: ["studio"],
    type: "text",
    doc: "Sociétés de production TMDB, et chaînes d'une série",
    example: "studio:pixar",
    kinds: VOD_SERIES,
    level: "content",
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
    doc: "Saga TMDB",
    example: "saga:marvel",
    kinds: ["vod"],
    level: "content",
    text: (_, p) => p(c.sagaName),
  },
  {
    names: ["année", "year"],
    type: "number",
    doc: "Année de sortie",
    example: "année:1980..1989",
    kinds: VOD_SERIES,
    level: "content",
    value: () => sql`${c.year}`,
  },
  {
    names: ["note", "rating"],
    type: "number",
    doc: "Note moyenne TMDB, sur 10",
    example: "note:>=7",
    kinds: VOD_SERIES,
    level: "content",
    value: () => sql`${c.rating}`,
  },
  {
    names: ["votes"],
    type: "number",
    doc: "Nombre de votes TMDB",
    example: "votes:<10",
    kinds: VOD_SERIES,
    level: "content",
    value: () => sql`${c.voteCount}`,
  },
  {
    names: ["tmdb"],
    type: "enum",
    doc: "Rapprochement TMDB : oui (associé), non (introuvable), attente (une version pas encore cherchée)",
    example: "tmdb:non,attente",
    kinds: VOD_SERIES,
    level: "content",
    choices: () => ({
      oui: sql`${c.tmdbId} is not null`,
      non: sql`(${c.tmdbId} is null and not ${pending})`,
      attente: sql`(${c.tmdbId} is null and ${pending})`,
    }),
  },
  {
    names: ["qualité", "quality"],
    type: "quality",
    doc: "Meilleure qualité de ses versions : SD < HD < FHD < 4K",
    example: "qualité:>=fhd",
    kinds: ALL,
    level: "content",
    value: () => sql`${c.maxQualityRank}`,
  },
  {
    names: ["dynamique", "hdr"],
    type: "enum",
    doc: "Meilleure dynamique de ses versions : hdr, dv (Dolby Vision) ou sdr",
    example: "dynamique:hdr,dv",
    kinds: VOD_SERIES,
    level: "content",
    choices: dynamic(c.dynamicRange),
  },
  {
    names: ["adulte", "adult"],
    type: "enum",
    doc: "Marqué adulte : oui ou non",
    example: "adulte:oui",
    kinds: ALL,
    level: "content",
    choices: () => yesNo(sql`${c.adult}`),
  },
  {
    names: ["visible"],
    type: "enum",
    doc: "Visible pour l'app : oui ou non",
    example: "visible:non",
    kinds: ALL,
    level: "content",
    searchOnly: true,
    choices: () => yesNo(sql`${c.visible}`),
  },
  // ------------------------------------------------------------------ one version
  {
    names: ["xtream.nom", "xtream.name"],
    type: "text",
    doc: "Nom chez le fournisseur",
    example: "xtream.nom:/\\(4K\\)$/",
    kinds: ALL,
    level: "variant",
    text: (_, p) => p(v.name),
  },
  {
    names: ["xtream.marché", "xtream.market"],
    type: "text",
    doc: "Marché du préfixe |FR| du nom",
    example: 'xtream.marché:"it"',
    kinds: ALL,
    level: "variant",
    text: (_, p) => p(v.market),
  },
  {
    names: ["xtream.catégorie", "xtream.cat"],
    type: "text",
    doc: "Catégorie du fournisseur",
    example: "xtream.catégorie:radios",
    kinds: ALL,
    level: "variant",
    text: (_, p) =>
      sql`exists (select 1 from catalog_categories k where k.kind = ${v.kind} and k.xtream_id = ${v.categoryXtreamId} and ${p(sql`k.name`)})`,
  },
  {
    names: ["xtream.section"],
    type: "text",
    doc: "Section du fournisseur (ligne séparatrice)",
    example: 'xtream.section:"sport event"',
    kinds: LIVE,
    level: "variant",
    text: (_, p) => p(v.section),
  },
  {
    names: ["variant.pays", "variant.country"],
    type: "code",
    codes: "region",
    doc: "Pays de la version dans une région (Monde arabe)",
    example: "variant.pays:maroc",
    kinds: LIVE,
    level: "variant",
    text: (_, p) => p(v.country),
  },
  {
    names: ["variant.thème", "variant.theme"],
    type: "text",
    doc: "Thème de la version",
    example: "variant.thème:sport",
    kinds: LIVE,
    level: "variant",
    text: (_, p) => p(v.theme),
  },
  {
    names: ["variant.langue", "variant.lang"],
    type: "text",
    doc: "Langue lue dans le nom : VF, VOSTFR, VO, IT…",
    example: '-variant.langue:"vf","vo"',
    kinds: VOD_SERIES,
    level: "variant",
    text: (_, p) => p(v.lang),
  },
  {
    names: ["variant.qualité", "variant.quality"],
    type: "quality",
    doc: "Qualité de la version : SD < HD < FHD < 4K",
    example: "variant.qualité:sd",
    kinds: ALL,
    level: "variant",
    value: () => sql`${v.qualityRank}`,
  },
  {
    names: ["variant.dynamique", "variant.hdr"],
    type: "enum",
    doc: "Dynamique de la version : hdr, dv ou sdr",
    example: "variant.dynamique:dv",
    kinds: VOD_SERIES,
    level: "variant",
    choices: dynamic(v.dynamicRange),
  },
  {
    names: ["variant.édition"],
    type: "text",
    doc: "Montage : version longue, director's cut…",
    example: "variant.édition:longue",
    kinds: VOD_SERIES,
    level: "variant",
    text: (_, p) => p(v.edition),
  },
  {
    names: ["variant.adulte", "variant.adult"],
    type: "enum",
    doc: "Version marquée adulte (nom, catégorie ou iptv-org) : oui ou non",
    example: "variant.adulte:oui",
    kinds: ALL,
    level: "variant",
    choices: () => yesNo(sql`${v.adult}`),
  },
];

/** Field names compare without case nor accents: `annee` is `année`. */
export const fieldKey = (name: string) => stripAccents(name).toLowerCase();
/** The fields of a kind. */
export const fieldsOf = (kind: Kind) => FIELDS.filter((f) => f.kinds.includes(kind));
/** A field of `kind` by one of its names. */
export const fieldByName = (name: string, kind: Kind) => fieldsOf(kind).find((f) => f.names.some((n) => fieldKey(n) === fieldKey(name)));
/** Free text searches here. */
export const TITLE = FIELDS[0];
/** Another kind's field of that name: what the error says when one types it. */
export const otherKindsOf = (name: string): Kind[] =>
  FIELDS.filter((f) => f.names.some((n) => fieldKey(n) === fieldKey(name))).flatMap((f) => f.kinds);

/** The closest field name of `kind`, for « did you mean ». */
export function closestField(name: string, kind: Kind): string | null {
  const k = fieldKey(name);
  let best: [string, number] | null = null;
  for (const f of fieldsOf(kind))
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
