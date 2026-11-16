import { sql, type Column, type SQL } from "drizzle-orm";
import { schema, sqlTmdbMediaType, variants, type Kind } from "@/db";
import { stripAccents } from "@/shared";
import type { CodeList } from "./codes";

/**
 * The words of the filter language, one registry for the filters and the admin's searches. Each word
 * belongs to kinds (Direct, Films, Séries: a name may mean something else per kind, `pays` is where a
 * channel is shown and where a film comes from) and to a scope, the prefix it is written with:
 * - `catalogue.`: our entry, as the app shows it (`catalog_titles` or `catalog_channels` by kind, never
 *   aliased), its TMDB sheet read in the cache;
 * - `xtream.`: one stream of a provider (`variants`, the stream with its link, never aliased), what the
 *   provider says of it and what we read in its name.
 * Where a query is written says which prefix may be left out (`Home`): the catalogue's on the screens
 * of the catalogue, the streams' on theirs, none in a profile's filter, which judges both. A filter judges streams, its
 * catalogue words read on the stream's entry; a search lists entries, a stream word there meaning « one
 * of its streams » (`sql.ts`).
 *
 * Names and expressions are fixed here; a query only picks among them, its values always travel as
 * parameters.
 */

export type FieldType = "text" | "number" | "enum" | "quality" | "code";
export type Scope = "catalogue" | "xtream";
/** The scope a name without prefix is read in; null where every name carries its prefix. */
export type Home = Scope | null;
/** A condition on one text value: a column or an expression. */
export type Pred = (value: SQL | Column) => SQL;
/** What `sql.ts` needs of the request: the kind (a title's fields are on `catalog_titles`, a channel's on `catalog_channels`) and the language of the TMDB cache. */
export type FieldContext = { kind: Kind; lang: string };

export type Field = {
  /** The name without its prefix, as the help shows it, then its other spellings (case and accents never matter). */
  names: string[];
  scope: Scope;
  type: FieldType;
  doc: string;
  /** A value to write after the name and its colon. */
  example: string;
  /** The kinds it means something for. */
  kinds: Kind[];
  /** Searches only: a filter on it would depend on its own result. */
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

const c = schema.catalogTitles;
const ch = schema.catalogChannels;
const v = variants;
const ALL: Kind[] = ["live", "vod", "series"];
const LIVE: Kind[] = ["live"];
const VOD_SERIES: Kind[] = ["vod", "series"];

/** Any element of a JSON array of the content's TMDB sheet matching: `elements` yields rows `e(value text)`. */
const tmdbAny = (ctx: FieldContext, elements: SQL, pred: Pred) =>
  sql`exists (select 1 from cache_tmdb t, ${elements} where t.tmdb_id = ${c.tmdbId} and t.lang = ${ctx.lang}
    and t.media_type = ${sqlTmdbMediaType(c.kind)} and ${pred(sql`e.value`)})`;
/** Any element of an array column matching. */
const arrayAny = (col: Column, pred: Pred) => sql`exists (select 1 from unnest(${col}) e(value) where ${pred(sql`e.value`)})`;
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
  // ------------------------------------------------------------------ our entry
  {
    names: ["titre", "title"],
    scope: "catalogue",
    type: "text",
    doc: "Titre et titres originaux ; c'est aussi le texte libre",
    example: "matrix",
    kinds: ALL,
    text: (ctx, p) => (ctx.kind === "live" ? any(p(ch.name)) : any(p(c.title), p(c.originalTitle), p(c.titleEn))),
  },
  {
    names: ["pays", "country"],
    scope: "catalogue",
    type: "code",
    codes: "region",
    doc: "Pays de la chaîne, par code ou par nom ; aucun : celle de toute une région (Monde arabe, Afrique)",
    example: "maroc",
    kinds: LIVE,
    text: (_, p) => p(ch.country),
  },
  {
    names: ["pays", "country"],
    scope: "catalogue",
    type: "code",
    codes: "region",
    doc: 'Pays d\'origine TMDB, par code ou par nom : in, inde, "états-unis"…',
    example: "inde",
    kinds: VOD_SERIES,
    text: (ctx, p) => tmdbAny(ctx, sql`jsonb_array_elements_text(coalesce(t.data->'origin_country', '[]')) e(value)`, p),
  },
  {
    names: ["thème", "theme"],
    scope: "catalogue",
    type: "text",
    doc: "Thème de la chaîne : Sport, Infos, Cinéma…",
    example: "sport",
    kinds: LIVE,
    text: (_, p) => p(ch.theme),
  },
  {
    names: ["genre"],
    scope: "catalogue",
    type: "text",
    doc: "Genres TMDB",
    example: '"animation"',
    kinds: VOD_SERIES,
    text: (_, p) => arrayAny(c.genres, p),
  },
  {
    names: ["langue", "lang"],
    scope: "catalogue",
    type: "code",
    codes: "language",
    doc: "Langue originale TMDB, par code ou par nom : ja, japonais, hindi…",
    example: "hindi,tamoul,te",
    kinds: VOD_SERIES,
    text: (ctx, p) => tmdbAny(ctx, sql`lateral (select t.data->>'original_language') e(value)`, p),
  },
  {
    names: ["studio"],
    scope: "catalogue",
    type: "text",
    doc: "Sociétés de production TMDB, et chaînes d'une série",
    example: "pixar",
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
    scope: "catalogue",
    type: "text",
    doc: "Saga TMDB",
    example: "marvel",
    kinds: ["vod"],
    text: (_, p) => p(c.sagaName),
  },
  {
    names: ["classification", "certification"],
    scope: "catalogue",
    type: "text",
    doc: "Classification TMDB du pays de la langue, sinon des États-Unis : TP, U, 10, 12, 16, 18, G, PG, PG-13, R, TV-Y, TV-Y7, TV-G, TV-14, TV-MA… ; aucun = sans",
    example: '"TP","U","G"',
    kinds: VOD_SERIES,
    text: (_, p) => p(c.certification),
  },
  {
    names: ["année", "year"],
    scope: "catalogue",
    type: "number",
    doc: "Année de sortie",
    example: "1980..1989",
    kinds: VOD_SERIES,
    value: () => sql`${c.year}`,
  },
  {
    names: ["note", "rating"],
    scope: "catalogue",
    type: "number",
    doc: "Note moyenne TMDB, sur 10",
    example: ">=7",
    kinds: VOD_SERIES,
    value: () => sql`${c.rating}`,
  },
  {
    names: ["votes"],
    scope: "catalogue",
    type: "number",
    doc: "Nombre de votes TMDB",
    example: "<10",
    kinds: VOD_SERIES,
    value: () => sql`${c.voteCount}`,
  },
  {
    names: ["tmdb"],
    scope: "catalogue",
    type: "enum",
    doc: "Rapprochement TMDB : oui (associé), non (introuvable), attente (pas encore cherché)",
    example: "non,attente",
    kinds: VOD_SERIES,
    choices: () => ({
      oui: sql`${c.tmdbId} is not null`,
      non: sql`(${c.tmdbId} is null and ${c.matchedAt} is not null)`,
      // Never asked: there was no TMDB key when its stream came.
      attente: sql`(${c.tmdbId} is null and ${c.matchedAt} is null)`,
    }),
  },
  {
    names: ["adulte", "adult"],
    scope: "catalogue",
    type: "enum",
    doc: "Marqué adulte : oui ou non",
    example: "oui",
    kinds: ALL,
    choices: (ctx) => yesNo(sql`${ctx.kind === "live" ? ch.adult : c.adult}`),
  },
  {
    names: ["visible"],
    scope: "catalogue",
    type: "enum",
    doc: "Visible pour l'app : oui ou non",
    example: "non",
    kinds: ALL,
    searchOnly: true,
    choices: (ctx) => yesNo(sql`${ctx.kind === "live" ? ch.visible : c.visible}`),
  },
  {
    names: ["profil", "profile"],
    scope: "catalogue",
    type: "text",
    doc: "Vu par ce profil dans l'app : son filtre en garde un flux (aucun : vu par personne)",
    example: "inès",
    kinds: ALL,
    searchOnly: true,
    text: (ctx, p) =>
      ctx.kind === "live"
        ? sql`exists (select 1 from app_profile_channels pc join app_profiles pr on pr.id = pc.profile_id
            where pc.channel_id = ${ch.id} and ${p(sql`pr.name`)})`
        : sql`exists (select 1 from app_profile_titles pt join app_profiles pr on pr.id = pt.profile_id
            where pt.title_id = ${c.id} and ${p(sql`pr.name`)})`,
  },
  // ------------------------------------------------------------------ one stream
  {
    names: ["nom", "name"],
    scope: "xtream",
    type: "text",
    doc: "Nom chez le fournisseur",
    example: "/\\(4K\\)$/",
    kinds: ALL,
    text: (_, p) => p(v.name),
  },
  {
    names: ["marché", "market"],
    scope: "xtream",
    type: "text",
    doc: "Marché du préfixe |FR| du nom",
    example: '"it"',
    kinds: ALL,
    text: (_, p) => p(v.market),
  },
  {
    names: ["catégorie", "cat"],
    scope: "xtream",
    type: "text",
    doc: "Catégorie du fournisseur",
    example: "radios",
    kinds: ALL,
    text: (_, p) =>
      sql`exists (select 1 from xtream_categories k where k.account_id = ${v.accountId} and k.kind = ${v.kind} and k.xtream_id = ${v.categoryXtreamId} and ${p(sql`k.name`)})`,
  },
  {
    names: ["fournisseur", "compte"],
    scope: "xtream",
    type: "text",
    doc: "Nom du fournisseur (page Fournisseurs)",
    example: "backup",
    kinds: ALL,
    text: (_, p) => sql`exists (select 1 from xtream_accounts a where a.id = ${v.accountId} and ${p(sql`a.name`)})`,
  },
  {
    names: ["section"],
    scope: "xtream",
    type: "text",
    doc: "Section du fournisseur (ligne séparatrice)",
    example: '"sport event"',
    kinds: LIVE,
    text: (_, p) => p(v.section),
  },
  {
    names: ["pays", "country"],
    scope: "xtream",
    type: "code",
    codes: "region",
    doc: "Pays que le nom du flux dit dans une région (Monde arabe)",
    example: "maroc",
    kinds: LIVE,
    text: (_, p) => p(sql`${v.nameCountry}`),
  },
  {
    names: ["thème", "theme"],
    scope: "xtream",
    type: "text",
    doc: "Thème que le fournisseur donne au flux",
    example: "sport",
    kinds: LIVE,
    text: (_, p) => p(sql`${v.nameTheme}`),
  },
  {
    names: ["langue", "lang"],
    scope: "xtream",
    type: "text",
    doc: "Langue lue dans le nom : VF, VOSTFR, VO, IT…",
    example: '"vf","vo"',
    kinds: VOD_SERIES,
    text: (_, p) => p(v.lang),
  },
  {
    names: ["qualité", "quality"],
    scope: "xtream",
    type: "quality",
    doc: "Qualité du flux : SD < HD < FHD < 4K",
    example: "sd",
    kinds: ALL,
    value: () => sql`${v.qualityRank}`,
  },
  {
    names: ["dynamique", "hdr"],
    scope: "xtream",
    type: "enum",
    doc: "Dynamique du flux : hdr, dv ou sdr",
    example: "dv",
    kinds: VOD_SERIES,
    choices: dynamic(v.dynamicRange),
  },
  {
    names: ["édition"],
    scope: "xtream",
    type: "text",
    doc: "Montage : version longue, director's cut…",
    example: "longue",
    kinds: VOD_SERIES,
    text: (_, p) => p(v.edition),
  },
  {
    names: ["adulte", "adult"],
    scope: "xtream",
    type: "enum",
    doc: "Flux marqué adulte (nom, catégorie ou iptv-org) : oui ou non",
    example: "oui",
    kinds: ALL,
    choices: () => yesNo(sql`${v.adult}`),
  },
  {
    names: ["ia", "claude"],
    scope: "xtream",
    type: "enum",
    doc: "Lu par Claude : un flux reconnu par le nom que Claude y lit, ou celui d'un titre ou d'un nom resté sans chaîne qu'il a lu",
    example: "oui",
    kinds: ALL,
    searchOnly: true,
    choices: () => yesNo(sql`(${v.how} = 'ai' or ${v.aiAskedAt} is not null)`),
  },
  {
    names: ["manuel", "manual"],
    scope: "xtream",
    type: "enum",
    doc: "Flux rattaché à la main : oui ou non",
    example: "oui",
    kinds: ALL,
    searchOnly: true,
    choices: () => yesNo(sql`${v.manual}`),
  },
];

/** Field names compare without case nor accents: `annee` is `année`. */
export const fieldKey = (name: string) => stripAccents(name).toLowerCase();
/** The fields of a kind. */
export const fieldsOf = (kind: Kind) => FIELDS.filter((f) => f.kinds.includes(kind));
/** A field under its prefix: `catalogue.pays`. */
export const fullName = (f: Field) => `${f.scope}.${f.names[0]}`;
/** A field as one writes it where `home` is the scope without prefix: `pays` on the catalogue's screens, `catalogue.pays` in a filter. */
export const nameIn = (f: Field, home: Home) => (f.scope === home ? f.names[0] : fullName(f));

const PREFIXES: Record<string, Scope> = { "catalogue.": "catalogue", "catalog.": "catalogue", "xtream.": "xtream" };
/** A name as typed: the scope its prefix says, `home` without one (null: a prefix was needed), and the name alone. */
function read(name: string, home: Home): { scope: Scope | null; bare: string } {
  const k = fieldKey(name);
  const prefix = Object.keys(PREFIXES).find((p) => k.startsWith(p));
  return prefix ? { scope: PREFIXES[prefix], bare: k.slice(prefix.length) } : { scope: home, bare: k };
}
const called = (f: Field, bare: string) => f.names.some((n) => fieldKey(n) === bare);

/** The field of `kind` a name designates: under its prefix, else in `home`. */
export function fieldByName(name: string, kind: Kind, home: Home): Field | undefined {
  const { scope, bare } = read(name, home);
  return scope ? fieldsOf(kind).find((f) => f.scope === scope && called(f, bare)) : undefined;
}
/** Free text searches here: the entry's title, or the stream's name where the streams are at home. */
export const freeText = (home: Home) =>
  FIELDS.find((f) => f.scope === (home ?? "catalogue") && f.names[0] === (home === "xtream" ? "nom" : "titre"))!;
/** Written without prefix where one is needed: the fields of `kind` it could be, under their full names. */
export function prefixedNames(name: string, kind: Kind, home: Home): string[] {
  const { scope, bare } = read(name, home);
  return scope
    ? []
    : fieldsOf(kind)
        .filter((f) => called(f, bare))
        .map(fullName);
}
/** Another kind's field of that name: what the error says when one types it. */
export function otherKindsOf(name: string, home: Home): Kind[] {
  const { scope, bare } = read(name, home);
  return FIELDS.filter((f) => (!scope || f.scope === scope) && called(f, bare)).flatMap((f) => f.kinds);
}

/**
 * The closest field name of `kind` as it is written here, for « did you mean »: the same name in the
 * other scope first (`qualité` is `xtream.qualité`), then the nearest spelling, prefix aside.
 */
export function closestField(name: string, kind: Kind, home: Home): string | null {
  const { bare } = read(name, home);
  const other = fieldsOf(kind).find((f) => called(f, bare));
  if (other) return nameIn(other, home);
  let best: [string, number] | null = null;
  for (const f of fieldsOf(kind))
    for (const n of f.names) {
      const d = distance(bare, fieldKey(n));
      if (d <= 2 && (!best || d < best[1])) best = [nameIn(f, home), d];
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
