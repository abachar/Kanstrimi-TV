import { sql, type Column, type SQL } from "drizzle-orm";
import { db, type Kind } from "@/db";
import { QUALITY_RANK } from "../naming";
import { parseQuery, QueryError, termsOf, type QueryNode, type QueryOp, type QueryTerm, type QueryValue } from "./parse";
import { closestName, resolveCode } from "./codes";
import {
  closestField,
  distance,
  fieldByName,
  fieldKey,
  otherKindsOf,
  TITLE,
  type Field,
  type FieldContext,
  type Level,
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
  /** A rule: the fields only searches may use are refused, and version fields make it judge versions. */
  rule?: boolean;
};

/**
 * A compiled query. `target` content: `where` is about `catalog_contents` (never aliased), versions
 * fields read as « one of its versions ». `target` variant (a rule naming version fields): `where` is
 * about `catalog_variants` (never aliased).
 */
export type CompiledQuery = { where: SQL; target: Level };

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

const number = (val: QueryValue, field: Field): number => {
  const n = Number(val.text);
  if (!val.text.trim() || !Number.isFinite(n)) throw new QueryError(`« ${val.text} » n'est pas un nombre (${field.names[0]})`, val.at);
  return n;
};
const QUALITIES = Object.keys(QUALITY_RANK).join(", ");
const qualityRank = (val: QueryValue): number => {
  const r = QUALITY_RANK[val.text.toUpperCase() as keyof typeof QUALITY_RANK];
  if (!r) throw new QueryError(`« ${val.text} » n'est pas une qualité : ${QUALITIES}`, val.at);
  return r;
};

/** Numbers and qualities: compared as numbers, a quality by its rank. */
function numeric(op: QueryOp, f: Field, value: SQL): SQL {
  const read = f.type === "quality" ? qualityRank : (val: QueryValue) => number(val, f);
  switch (op.kind) {
    case "regex":
      throw new QueryError(`${f.names[0]} est un nombre : pas d'expression régulière`, op.at);
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
function choice(op: QueryOp, f: Field, choices: Record<string, SQL>, at: number): SQL {
  const names = Object.keys(choices);
  const say = `${f.names[0]} vaut ${names.slice(0, -1).join(", ")} ou ${names[names.length - 1]}`;
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
function codesPred(op: QueryOp, f: Field, at: number): Pred {
  const what = f.codes === "language" ? "une langue" : "un pays";
  if (op.kind !== "match") throw new QueryError(`${f.names[0]} est ${what} : ni comparaison ni expression régulière`, at);
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

function fieldOf(t: QueryTerm, o: CompileOptions): Field {
  if (t.field === null) return TITLE;
  const f = fieldByName(t.field, o.kind);
  if (f) return f;
  const elsewhere = [...new Set(otherKindsOf(t.field))];
  if (elsewhere.length) throw new QueryError(`${t.field} ne s'applique qu'${elsewhere.map((k) => KIND_NAMES[k]).join(" et ")}`, t.fieldAt);
  const near = closestField(t.field, o.kind);
  throw new QueryError(
    `Champ inconnu : ${t.field}${near ? ` — voulais-tu ${near} ?` : ""} (un texte avec deux-points s'écrit entre guillemets)`,
    t.fieldAt,
  );
}

function termSql(t: QueryTerm, f: Field, o: CompileOptions): SQL {
  if (o.rule && f.searchOnly) throw new QueryError(`${f.names[0]} ne sert qu'aux recherches, pas aux règles`, t.fieldAt);
  let cond: SQL;
  if (f.type === "enum") cond = choice(t.op, f, f.choices!(o), t.fieldAt);
  else if (f.type === "number" || f.type === "quality") cond = numeric(t.op, f, f.value!(o));
  else if (f.type === "code") cond = f.text!(o, codesPred(t.op, f, t.fieldAt));
  else if (t.op.kind === "match") cond = f.text!(o, textPred(t.op.values));
  else if (t.op.kind === "regex") cond = f.text!(o, regexPred(t.op.pattern, t.op.at));
  else throw new QueryError(`${f.names[0]} n'est pas un nombre : <, >, = et .. sont réservés aux nombres`, t.fieldAt);
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
 * What a query stands for; null for an empty one. Throws `QueryError`. With a version field, the
 * expression is judged version by version, its content fields read on the version's content:
 * - a search finds the contents one of whose versions passes, so `variant.langue:"vf" variant.qualité:4k`
 *   is a film with a version in VF and 4K;
 * - a rule judges versions: `marché:"ar" xtream.nom:2m` is the « 2m » versions of the Arab channels,
 *   `genre:horreur || variant.langue:"vo"` every version of a horror film and the VO ones of the others.
 */
export function compileQuery(text: string, o: CompileOptions): CompiledQuery | null {
  const root = parseQuery(text);
  if (!root) return null;
  // Every field first: an unknown one is the error a query gets, before its values are read.
  const fields = new Map(termsOf(root).map((t) => [t, fieldOf(t, o)]));
  const ofVersion = (n: QueryNode): boolean => (n.kind === "term" ? fields.get(n.term)!.level === "variant" : n.nodes.some(ofVersion));
  /** The condition as it stands: the content fields on `catalog_contents`, the version ones on `catalog_variants`. */
  const plain = (n: QueryNode): SQL => {
    if (n.kind === "term") return termSql(n.term, fields.get(n.term)!, o);
    const cond = join(n.kind, n.nodes.map(plain));
    return n.neg ? sql`not ${cond}` : cond;
  };
  /** On `catalog_variants`: the parts without a version field read its content, each run of them once. */
  const onVersion = (n: QueryNode): SQL => {
    if (!ofVersion(n))
      return sql`exists (select 1 from catalog_contents where catalog_contents.id = catalog_variants.content_id and ${plain(n)})`;
    if (n.kind === "term") return plain(n);
    const content = n.nodes.filter((x) => !ofVersion(x));
    const parts = n.nodes.filter(ofVersion).map(onVersion);
    if (content.length) parts.push(onVersion({ kind: n.kind, neg: false, nodes: content, at: n.at }));
    const cond = join(n.kind, parts);
    return n.neg ? sql`not ${cond}` : cond;
  };

  if (!ofVersion(root)) return { where: plain(root), target: "content" };
  if (o.rule) return { where: onVersion(root), target: "variant" };
  // A search: what the query says of the content alone stays out of the version test.
  const parts = root.kind === "and" && !root.neg ? root.nodes : [root];
  const where = parts.filter((x) => !ofVersion(x)).map(plain);
  const version = parts.filter(ofVersion).map(plain);
  where.push(sql`exists (select 1 from catalog_variants where catalog_variants.content_id = catalog_contents.id and ${and(version)})`);
  return { where: and(where), target: "content" };
}
