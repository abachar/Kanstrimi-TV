import { sql, type Column, type SQL } from "drizzle-orm";
import { db, schema, variants, type Kind } from "@/db";
import { QUALITY_RANK } from "../naming";
import { parseQuery, QueryError, termsOf, type QueryNode, type QueryOp, type QueryTerm, type QueryValue } from "./parse";
import { closestName, resolveCode } from "./codes";
import {
  closestField,
  distance,
  fieldByName,
  fieldKey,
  nameIn,
  otherKindsOf,
  prefixedNames,
  TITLE,
  type Field,
  type FieldContext,
  type Home,
  type Pred,
} from "./fields";

/**
 * A query checked against the fields of its kind, then written as conditions. Nothing reaches the
 * database before every term is valid: an unknown field, a regex on a number, a word where a number
 * goes all fail here with their column.
 */

export type CompileOptions = FieldContext & {
  /** The kind searched or judged: each kind has its own fields. */
  kind: Kind;
  /**
   * A filter: it judges streams, the condition is about `variants` (`db/variants.ts`, never aliased); every
   * name carries its prefix, and the fields only searches may use are refused. Otherwise a search of the
   * catalogue: about the kind's table, `catalog_titles` or `catalog_channels` (never aliased), the
   * catalogue's names written without prefix.
   */
  filter?: boolean;
};

/** A field under the name the query may write it by: what its errors say. */
type Named = Field & { label: string };
const homeOf = (o: CompileOptions): Home => (o.filter ? null : "catalogue");

/** Case and accents never matter: both sides go through `unaccent(lower(…))`. */
const norm = (e: SQL | Column) => sql`unaccent(lower(${e}))`;
/** `%`, `_` and `\\` of a value are literal in a « contains ». */
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

function textPred(values: QueryValue[]): Pred {
  return (e) =>
    sql`(${sql.join(
      values.map((val) =>
        val.exact
          ? sql`${norm(e)} = ${norm(sql`${val.text}`)}`
          : sql`${norm(e)} like '%' || ${norm(sql`${likeEscape(val.text)}`)} || '%' escape '\\'`,
      ),
      sql` or `,
    )})`;
}

/** `\b` is JavaScript's word boundary, `\y` Postgres's. */
const postgresPattern = (pattern: string) => pattern.replace(/\\b/g, "\\y");

/**
 * A Postgres regex: case-insensitive (`~*`), tried on the value as written and without its accents.
 * `\b` is JavaScript's word boundary, `\y` Postgres's.
 */
function regexPred(pattern: string, at: number): Pred {
  try {
    new RegExp(pattern);
  } catch (e) {
    throw new QueryError(`Expression régulière invalide : ${(e as Error).message}`, at);
  }
  const re = postgresPattern(pattern);
  return (e) => sql`(${e} ~* ${re} or unaccent(${e}) ~* ${re})`;
}

const number = (val: QueryValue, field: Named): number => {
  const n = Number(val.text);
  if (!val.text.trim() || !Number.isFinite(n)) throw new QueryError(`« ${val.text} » n'est pas un nombre (${field.label})`, val.at);
  return n;
};
const QUALITIES = Object.keys(QUALITY_RANK).join(", ");
const qualityRank = (val: QueryValue): number => {
  const r = QUALITY_RANK[val.text.toUpperCase() as keyof typeof QUALITY_RANK];
  if (!r) throw new QueryError(`« ${val.text} » n'est pas une qualité : ${QUALITIES}`, val.at);
  return r;
};

/** Numbers and qualities: compared as numbers, a quality by its rank. */
function numeric(op: QueryOp, f: Named, value: SQL): SQL {
  const read = f.type === "quality" ? qualityRank : (val: QueryValue) => number(val, f);
  switch (op.kind) {
    case "regex":
      throw new QueryError(`${f.label} est un nombre : pas d'expression régulière`, op.at);
    case "match":
      return sql`${value} in (${sql.join(
        op.values.map((val) => sql`${read(val)}`),
        sql`, `,
      )})`;
    case "range": {
      const [from, to] = [read(op.from), read(op.to)];
      if (from > to) throw new QueryError("Intervalle à l'envers : la première borne dépasse la seconde", op.from.at);
      return sql`${value} between ${from} and ${to}`;
    }
    case "cmp": {
      const n = read(op.value);
      // A closed set of fragments: the operator typed only picks one of them.
      const cmp = { "<": sql`<`, "<=": sql`<=`, ">": sql`>`, ">=": sql`>=`, "=": sql`=` }[op.cmp];
      return sql`${value} ${cmp} ${n}`;
    }
  }
}

/** A value among a few: each one stands for its condition, a list for « one of them ». */
function choice(op: QueryOp, f: Named, choices: Record<string, SQL>, at: number): SQL {
  const names = Object.keys(choices);
  const say = `${f.label} vaut ${names.slice(0, -1).join(", ")} ou ${names[names.length - 1]}`;
  if (op.kind !== "match") throw new QueryError(say, at);
  return sql`(${sql.join(
    op.values.map((val) => {
      const c = choices[fieldKey(val.text)];
      if (!c) throw new QueryError(`${say}, pas « ${val.text} »`, val.at);
      return sql`coalesce(${c}, false)`;
    }),
    sql` or `,
  )})`;
}

/** ISO codes, given by code or by French name, each compared exactly. */
function codesPred(op: QueryOp, f: Named, at: number): Pred {
  const what = f.codes === "language" ? "une langue" : "un pays";
  if (op.kind !== "match") throw new QueryError(`${f.label} est ${what} : ni comparaison ni expression régulière`, at);
  const codes = op.values.map((val) => {
    const code = resolveCode(f.codes!, val.text);
    if (code) return { text: code, exact: true, at: val.at };
    const near = closestName(f.codes!, val.text, distance);
    throw new QueryError(
      `« ${val.text} » n'est pas ${what} connu${f.codes === "language" ? "e" : ""}${near ? ` — voulais-tu ${near} ?` : ""}`,
      val.at,
    );
  });
  return textPred(codes);
}

const KIND_NAMES: Record<Kind, string> = { live: "au direct", vod: "aux films", series: "aux séries" };

function fieldOf(t: QueryTerm, o: CompileOptions): Named {
  const home = homeOf(o);
  const named = (f: Field) => ({ ...f, label: nameIn(f, home) });
  if (t.field === null) return named(TITLE);
  const f = fieldByName(t.field, o.kind, home);
  if (f) return named(f);
  const prefixed = prefixedNames(t.field, o.kind, home);
  if (prefixed.length) throw new QueryError(`Un filtre juge la fiche et le flux : écrire ${prefixed.join(" ou ")}`, t.fieldAt);
  const elsewhere = [...new Set(otherKindsOf(t.field, home))];
  if (elsewhere.length) throw new QueryError(`${t.field} ne s'applique qu'${elsewhere.map((k) => KIND_NAMES[k]).join(" et ")}`, t.fieldAt);
  const near = closestField(t.field, o.kind, home);
  throw new QueryError(
    `Champ inconnu : ${t.field}${near ? ` — voulais-tu ${near} ?` : ""} (un texte avec deux-points s'écrit entre guillemets)`,
    t.fieldAt,
  );
}

/** `aucun`, bare: the field has no value (`pays:aucun`). Quoted, it is the word. */
const isNone = (val: QueryValue) => !val.exact && fieldKey(val.text) === "aucun";

/** Whether the field has a value: a text not empty, a number, a known quality. */
function hasValue(f: Field, o: CompileOptions): SQL {
  if (f.type === "number") return sql`${f.value!(o)} is not null`;
  if (f.type === "quality") return sql`coalesce(${f.value!(o)}, 0) > 0`;
  return f.text!(o, (e) => sql`coalesce(${e}, '') <> ''`);
}

function opSql(op: QueryOp, f: Named, o: CompileOptions, at: number): SQL {
  if (f.type === "enum") return choice(op, f, f.choices!(o), at);
  if (op.kind === "match" && op.values.some(isNone)) {
    const none = sql`not coalesce(${hasValue(f, o)}, false)`;
    const values = op.values.filter((val) => !isNone(val));
    return values.length ? sql`(${none} or ${opSql({ kind: "match", values }, f, o, at)})` : none;
  }
  if (f.type === "number" || f.type === "quality") return numeric(op, f, f.value!(o));
  if (f.type === "code") return f.text!(o, codesPred(op, f, at));
  if (op.kind === "match") return f.text!(o, textPred(op.values));
  if (op.kind === "regex") return f.text!(o, regexPred(op.pattern, op.at));
  throw new QueryError(`${f.label} n'est pas un nombre : <, >, = et .. sont réservés aux nombres`, at);
}

function termSql(t: QueryTerm, f: Named, o: CompileOptions): SQL {
  if (o.filter && f.searchOnly) throw new QueryError(`${f.label} ne sert qu'aux recherches, pas aux filtres`, t.fieldAt);
  const cond = opSql(t.op, f, o, t.fieldAt);
  // A missing value is no match, and its negation a match: `-genre:horreur` keeps the films without genre.
  return t.neg ? sql`not coalesce(${cond}, false)` : sql`coalesce(${cond}, false)`;
}

const and = (conds: SQL[]) => sql`(${sql.join(conds, sql` and `)})`;
const join = (kind: "and" | "or", conds: SQL[]) => (kind === "and" ? and(conds) : sql`(${sql.join(conds, sql` or `)})`);

/**
 * Ask Postgres whether it accepts the regexes of a query: JavaScript takes some it refuses
 * (`(?<x>…)`), and a refused one would make every UPDATE that uses it fail. Throws `QueryError`.
 */
export async function checkRegexes(text: string): Promise<void> {
  for (const t of termsOf(parseQuery(text))) {
    if (t.op.kind !== "regex") continue;
    try {
      await db.execute(sql`select '' ~* ${postgresPattern(t.op.pattern)}`);
    } catch (e) {
      const cause = (e as { cause?: { message?: string } }).cause;
      throw new QueryError(`Expression régulière refusée : ${cause?.message ?? (e as Error).message}`, t.op.at);
    }
  }
}

/**
 * What a query stands for; null for an empty one. Throws `QueryError`. The expression is judged stream
 * by stream, its catalogue words read on the stream's entry:
 * - a filter keeps the streams that pass: `xtream.marché:"fr" || xtream.langue:"vf"` keeps every stream of
 *   the French lists and the VF ones of the others;
 * - a search finds the entries one of whose streams passes, so `xtream.langue:"vf" && xtream.qualité:4k`
 *   is a film with a stream in VF and 4K. Without a stream word, the entry alone answers.
 */
export function compileQuery(text: string, o: CompileOptions): SQL | null {
  const root = parseQuery(text);
  if (!root) return null;
  // Where the kind's contents are, and the column a version names its own by.
  const home =
    o.kind === "live"
      ? { table: schema.catalogChannels, id: schema.catalogChannels.id, ofVariant: variants.channelId }
      : { table: schema.catalogTitles, id: schema.catalogTitles.id, ofVariant: variants.titleId };
  // Every field first: an unknown one is the error a query gets, before its values are read.
  const fields = new Map(termsOf(root).map((t) => [t, fieldOf(t, o)]));
  const ofVersion = (n: QueryNode): boolean => (n.kind === "term" ? fields.get(n.term)!.scope === "xtream" : n.nodes.some(ofVersion));
  /** The condition as it stands: the content fields on the kind's table, the version ones on `variants`. */
  const plain = (n: QueryNode): SQL => {
    if (n.kind === "term") return termSql(n.term, fields.get(n.term)!, o);
    const cond = join(n.kind, n.nodes.map(plain));
    return n.neg ? sql`not ${cond}` : cond;
  };
  /** On `variants`: the parts without a version field read its content, each run of them once. */
  const onVersion = (n: QueryNode): SQL => {
    if (!ofVersion(n)) return sql`exists (select 1 from ${home.table} where ${home.id} = ${home.ofVariant} and ${plain(n)})`;
    if (n.kind === "term") return plain(n);
    const content = n.nodes.filter((x) => !ofVersion(x));
    const parts = n.nodes.filter(ofVersion).map(onVersion);
    if (content.length) parts.push(onVersion({ kind: n.kind, neg: false, nodes: content, at: n.at }));
    const cond = join(n.kind, parts);
    return n.neg ? sql`not ${cond}` : cond;
  };

  if (o.filter) return onVersion(root);
  if (!ofVersion(root)) return plain(root);
  // A search: what the query says of the content alone stays out of the version test.
  const parts = root.kind === "and" && !root.neg ? root.nodes : [root];
  const where = parts.filter((x) => !ofVersion(x)).map(plain);
  const version = parts.filter(ofVersion).map(plain);
  where.push(sql`exists (select 1 from ${variants} where ${home.ofVariant} = ${home.id} and ${and(version)})`);
  return and(where);
}
