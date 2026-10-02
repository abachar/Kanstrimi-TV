import { sql, type Column, type SQL } from "drizzle-orm";
import { schema, sqlTmdbMediaType, visibleItem, type Kind } from "@/db";
import { stripAccents } from "@/shared";
import type { CodeList } from "./codes";

/**
 * The fields of the filter language. Every condition is about one variant (`catalog_variants`, never
 * aliased): the admin's Xtream view lists variants, its Catalogue view the contents with at least one
 * matching variant, a rule hides variants. TMDB values come from the variant's own cached sheet, not
 * from its content: rules run before the grouping, when a new variant has no content yet.
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

const v = schema.catalogVariants;
const VOD_SERIES: Kind[] = ["vod", "series"];

/** The variant's TMDB sheet in the cache, in the admin's language; `body` reads `t.data`. */
const tmdbScalar = (ctx: FieldContext, body: SQL) =>
  sql`(select ${body} from tmdb_cache t where t.tmdb_id = ${v.tmdbId} and t.lang = ${ctx.lang}
    and t.media_type = ${sqlTmdbMediaType(v.kind)})`;
/** Any element of a JSON array of the sheet matching: `elements` yields rows `e(value text)`. */
const tmdbAny = (ctx: FieldContext, elements: SQL, pred: Pred) =>
  sql`exists (select 1 from tmdb_cache t, ${elements} where t.tmdb_id = ${v.tmdbId} and t.lang = ${ctx.lang}
    and t.media_type = ${sqlTmdbMediaType(v.kind)} and ${pred(sql`e.value`)})`;
const contentScalar = (col: SQL) => sql`(select ${col} from catalog_contents cc where cc.id = ${v.contentId})`;
const yesNo = (cond: SQL) => ({ oui: cond, non: sql`not coalesce(${cond}, false)` });
const any = (...conds: SQL[]) =>
  sql`(${sql.join(
    conds.map((c) => sql`coalesce(${c}, false)`),
    sql` or `,
  )})`;

export const FIELDS: Field[] = [
  {
    names: ["titre", "title"],
    type: "text",
    doc: "Titre TMDB, titres originaux et nom chez le fournisseur ; c'est aussi le texte libre",
    example: { vod: "titre:matrix", series: "titre:friends", live: "titre:tf1" },
    text: (_, p) =>
      any(p(v.name), p(v.cleanTitle), contentScalar(sql`${p(sql`cc.title`)} or ${p(sql`cc.original_title`)} or ${p(sql`cc.title_en`)}`)),
  },
  { names: ["nom", "name"], type: "text", doc: "Nom chez le fournisseur", example: "nom:/\\|FR\\|/", text: (_, p) => p(v.name) },
  {
    names: ["catégorie", "cat"],
    type: "text",
    doc: "Catégorie du fournisseur",
    example: 'catégorie:"france fhd"',
    text: (_, p) =>
      sql`exists (select 1 from catalog_categories k where k.kind = ${v.kind} and k.xtream_id = ${v.categoryXtreamId} and ${p(sql`k.name`)})`,
  },
  {
    names: ["section"],
    type: "text",
    doc: "Section du fournisseur (ligne séparatrice)",
    example: "section:sport",
    text: (_, p) => p(v.section),
  },
  {
    names: ["langue", "lang"],
    type: "text",
    doc: "Langue lue dans le nom : VF, VOSTFR, VO…",
    example: '-langue:"vostfr"',
    text: (_, p) => p(v.lang),
  },
  {
    names: ["qualité", "quality"],
    type: "quality",
    doc: "Qualité lue dans le nom : SD < HD < FHD < 4K",
    example: "qualité:>=fhd",
    value: () => sql`${v.qualityRank}`,
  },
  {
    names: ["dynamique", "hdr"],
    type: "enum",
    doc: "Dynamique lue dans le nom : hdr, dv (Dolby Vision) ou sdr (ni l'un ni l'autre)",
    example: "dynamique:hdr,dv",
    choices: () => ({
      hdr: sql`${v.dynamicRange} = 'HDR'`,
      dv: sql`${v.dynamicRange} = 'DV'`,
      sdr: sql`${v.dynamicRange} is null`,
    }),
  },
  { names: ["marché", "market"], type: "text", doc: "Marché du préfixe |FR| du nom", example: 'marché:"fr"', text: (_, p) => p(v.market) },
  {
    names: ["édition"],
    type: "text",
    doc: "Montage : version longue, director's cut…",
    example: "édition:longue",
    kinds: VOD_SERIES,
    text: (_, p) => p(v.edition),
  },
  {
    names: ["genre"],
    type: "text",
    doc: "Genres TMDB",
    example: 'genre:"animation"',
    kinds: VOD_SERIES,
    text: (ctx, p) => tmdbAny(ctx, sql`jsonb_array_elements(t.data->'genres') g, lateral (select g->>'name') e(value)`, p),
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
    text: (ctx, p) => tmdbAny(ctx, sql`lateral (select t.data->'belongs_to_collection'->>'name') e(value)`, p),
  },
  {
    names: ["année", "year"],
    type: "number",
    doc: "Année de sortie TMDB, sinon celle du nom",
    example: "année:1980..1989",
    value: (ctx) =>
      sql`coalesce(${tmdbScalar(ctx, sql`nullif(left(coalesce(t.data->>'release_date', t.data->>'first_air_date'), 4), '')::int`)}, ${v.year})`,
  },
  {
    names: ["note", "rating"],
    type: "number",
    doc: "Note moyenne TMDB, sur 10",
    example: "note:>=7",
    kinds: VOD_SERIES,
    value: (ctx) => tmdbScalar(ctx, sql`(t.data->>'vote_average')::real`),
  },
  {
    names: ["votes"],
    type: "number",
    doc: "Nombre de votes TMDB",
    example: "votes:<10",
    kinds: VOD_SERIES,
    value: (ctx) => tmdbScalar(ctx, sql`(t.data->>'vote_count')::int`),
  },
  {
    names: ["durée", "runtime"],
    type: "number",
    doc: "Durée TMDB en minutes (d'un épisode pour une série)",
    example: "durée:>150",
    kinds: VOD_SERIES,
    value: (ctx) => tmdbScalar(ctx, sql`coalesce((t.data->>'runtime')::int, (t.data->'episode_run_time'->>0)::int)`),
  },
  {
    names: ["tmdb"],
    type: "enum",
    doc: "Rapprochement TMDB : oui (associé), non (introuvable), attente (pas encore cherché)",
    example: "tmdb:non,attente",
    kinds: VOD_SERIES,
    choices: () => ({
      oui: sql`(${v.tmdbId} is not null and ${v.matchStatus} in ('matched', 'manual'))`,
      non: sql`${v.matchStatus} = 'unmatched'`,
      attente: sql`${v.matchStatus} = 'pending'`,
    }),
  },
  {
    names: ["adulte", "adult"],
    type: "enum",
    doc: "Marqué adulte (nom, catégorie ou iptv-org) : oui ou non",
    example: "adulte:oui",
    choices: () => yesNo(sql`${v.adult}`),
  },
  {
    names: ["pays", "country"],
    type: "code",
    codes: "region",
    doc: "Pays d'une chaîne d'une région (Monde arabe), par code ou par nom",
    example: "pays:maroc",
    kinds: ["live"],
    text: (_, p) => p(v.country),
  },
  {
    names: ["thème", "theme"],
    type: "text",
    doc: "Thème d'une chaîne : Sport, Infos, Cinéma…",
    example: "thème:sport",
    kinds: ["live"],
    text: (_, p) => p(v.theme),
  },
  {
    names: ["iptv"],
    type: "text",
    doc: "Chaîne iptv-org rattachée (identifiant) et ses catégories",
    example: "iptv:tf1.fr",
    kinds: ["live"],
    text: (_, p) =>
      any(
        p(v.iptvId),
        sql`exists (select 1 from iptvorg_channels ic, unnest(ic.categories) e(value) where ic.id = ${v.iptvId} and ${p(sql`e.value`)})`,
      ),
  },
  {
    names: ["visible"],
    type: "enum",
    doc: "Visible pour l'app, ni masquée ni dans une catégorie masquée : oui ou non",
    example: "visible:non",
    searchOnly: true,
    choices: () => yesNo(sql`(${visibleItem})`),
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
