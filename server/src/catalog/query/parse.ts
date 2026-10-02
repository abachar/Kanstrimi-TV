/**
 * The filter language of the admin's searches and of the rules, read into terms. Flat on purpose:
 * terms separated by spaces (and), no parentheses, no « or » across fields.
 *
 *   matrix                 free text: the title contains « matrix »
 *   genre:anim             contains          genre:"animation"   equals
 *   langue-vo:hi,ta        one of them (each contains; quoted, each equals)
 *   année:<1980  >=  =  .. (année:1980..1990)   numbers
 *   nom:/\|IT\|/           regex
 *   -tmdb:oui              any term negated
 *
 * Case and accents never matter; this module only reads the text, `fields.ts` says what each field
 * accepts and `sql.ts` writes the condition.
 */

export type Cmp = "<" | "<=" | ">" | ">=" | "=";
/** A value as typed: `exact` when quoted. `at`: its column, for the error messages. */
export type QueryValue = { text: string; exact: boolean; at: number };
export type QueryOp =
  | { kind: "match"; values: QueryValue[] }
  | { kind: "cmp"; cmp: Cmp; value: QueryValue }
  | { kind: "range"; from: QueryValue; to: QueryValue }
  | { kind: "regex"; pattern: string; at: number };
/** `field` null: free text, searched in the title. */
export type QueryTerm = { neg: boolean; field: string | null; fieldAt: number; op: QueryOp; at: number };

export class QueryError extends Error {
  /** `at`: the column the problem starts at (0-based). */
  constructor(
    message: string,
    readonly at: number,
  ) {
    super(message);
  }
}

const SPACE = /\s/;
/** Characters that end a bare word or a field name. */
const BREAK = /[\s,]/;

export function parseQuery(text: string): QueryTerm[] {
  const terms: QueryTerm[] = [];
  let i = 0;
  const at = () => i;
  const peek = (s: string) => text.startsWith(s, i);

  /** `"…"`, `\"` and `\\` escaped; `i` on the opening quote. */
  function quoted(): QueryValue {
    const start = i++;
    let out = "";
    while (i < text.length && text[i] !== '"') {
      if (text[i] === "\\" && (text[i + 1] === '"' || text[i + 1] === "\\")) i++;
      out += text[i++];
    }
    if (i >= text.length) throw new QueryError("Guillemet non fermé", start);
    i++;
    return { text: out, exact: true, at: start };
  }

  /** A run of characters up to a space or a comma. */
  function word(): QueryValue {
    const start = i;
    while (i < text.length && !BREAK.test(text[i])) i++;
    return { text: text.slice(start, i), exact: false, at: start };
  }

  /** `/…/`, `\/` escaped; `i` on the opening slash. */
  function regex(): { pattern: string; at: number } {
    const start = i++;
    let out = "";
    while (i < text.length && text[i] !== "/") {
      if (text[i] === "\\" && text[i + 1] === "/") {
        out += "/";
        i += 2;
        continue;
      }
      out += text[i++];
    }
    if (i >= text.length) throw new QueryError("Expression régulière non fermée : il manque le / final", start);
    i++;
    if (!out) throw new QueryError("Expression régulière vide", start);
    return { pattern: out, at: start };
  }

  function value(): QueryValue {
    if (peek('"')) return quoted();
    const v = word();
    if (!v.text) throw new QueryError("Valeur attendue", v.at);
    return v;
  }

  function op(fieldAt: number): QueryOp {
    if (i >= text.length || SPACE.test(text[i])) throw new QueryError("Valeur attendue après les deux-points", fieldAt);
    if (peek("/")) return { kind: "regex", ...regex() };
    for (const cmp of ["<=", ">=", "<", ">", "="] as const)
      if (peek(cmp)) {
        i += cmp.length;
        if (i >= text.length || SPACE.test(text[i])) throw new QueryError(`Valeur attendue après ${cmp}`, i);
        return { kind: "cmp", cmp, value: value() };
      }
    const first = value();
    if (!first.exact && first.text.includes("..")) {
      const [from, to, ...rest] = first.text.split("..");
      if (rest.length || !from || !to) throw new QueryError("Intervalle attendu sous la forme 1980..1990", first.at);
      return {
        kind: "range",
        from: { text: from, exact: false, at: first.at },
        to: { text: to, exact: false, at: first.at + from.length + 2 },
      };
    }
    const values = [first];
    while (peek(",")) {
      i++;
      values.push(value());
    }
    return { kind: "match", values };
  }

  while (i < text.length) {
    if (SPACE.test(text[i])) {
      i++;
      continue;
    }
    const start = at();
    let neg = false;
    if (peek("-") && i + 1 < text.length && !SPACE.test(text[i + 1])) {
      neg = true;
      i++;
    }
    if (peek('"')) {
      terms.push({ neg, field: null, fieldAt: i, op: { kind: "match", values: [quoted()] }, at: start });
    } else {
      const fieldAt = i;
      while (i < text.length && !SPACE.test(text[i]) && text[i] !== ":" && text[i] !== '"') i++;
      const name = text.slice(fieldAt, i);
      if (peek(":")) {
        if (!name) throw new QueryError("Nom de champ attendu avant les deux-points", fieldAt);
        i++;
        terms.push({ neg, field: name, fieldAt, op: op(fieldAt), at: start });
      } else {
        if (peek('"')) throw new QueryError("Un guillemet ne s'ouvre qu'en début de valeur", i);
        terms.push({ neg, field: null, fieldAt, op: { kind: "match", values: [{ text: name, exact: false, at: fieldAt }] }, at: start });
      }
    }
    if (i < text.length && !SPACE.test(text[i])) throw new QueryError("Espace attendu entre deux termes", i);
  }
  return terms;
}
