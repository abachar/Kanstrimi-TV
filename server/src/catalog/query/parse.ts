/**
 * The filter language of the admin's searches and of the rules, read into a tree of terms.
 *
 *   matrix                 free text: the title contains « matrix »
 *   genre:anim             contains          genre:"animation"   equals
 *   langue:hi,ta           one of them (each contains; quoted, each equals)
 *   année:<1980  >=  =  .. (année:1980..1990)   numbers
 *   xtream.nom:/\|IT\|/    regex
 *   -tmdb:oui              any term negated
 *   a b, a && b            and           a || b     or, weaker than and
 *   (a || b) c             a group       -(a b)     a group negated
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
/** A term, or terms joined by `&&` (or a space) or by `||`; `neg`: a group under « - ». */
export type QueryNode = { kind: "term"; term: QueryTerm } | { kind: "and" | "or"; neg: boolean; nodes: QueryNode[]; at: number };

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
/** Characters that end a bare word; `&&` and `||` end it too. */
const BREAK = /[\s,()]/;
/** Characters that end a field name or free text. */
const NAME_BREAK = /[\s:"()]/;

/** The terms of a query, in their order; none for an empty one. */
export function termsOf(node: QueryNode | null): QueryTerm[] {
  if (!node) return [];
  return node.kind === "term" ? [node.term] : node.nodes.flatMap(termsOf);
}

/** The tree of a query; null for an empty one. Throws `QueryError`. */
export function parseQuery(text: string): QueryNode | null {
  let i = 0;
  const peek = (s: string) => text.startsWith(s, i);
  const operator = () => peek("&&") || peek("||");
  const skipSpaces = () => {
    while (i < text.length && SPACE.test(text[i])) i++;
  };

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
    while (i < text.length && !BREAK.test(text[i]) && !operator()) i++;
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
    if (!v.text)
      throw new QueryError(peek("(") || peek(")") ? "Valeur attendue : une parenthèse s'écrit entre guillemets" : "Valeur attendue", v.at);
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

  /** One term; `i` on its first character, a « - » included. */
  function term(): QueryTerm {
    const start = i;
    let neg = false;
    if (peek("-") && i + 1 < text.length && !SPACE.test(text[i + 1])) {
      neg = true;
      i++;
    }
    if (peek('"')) return { neg, field: null, fieldAt: i, op: { kind: "match", values: [quoted()] }, at: start };
    const fieldAt = i;
    while (i < text.length && !NAME_BREAK.test(text[i]) && !operator()) i++;
    const name = text.slice(fieldAt, i);
    if (peek(":")) {
      if (!name) throw new QueryError("Nom de champ attendu avant les deux-points", fieldAt);
      i++;
      return { neg, field: name, fieldAt, op: op(fieldAt), at: start };
    }
    if (peek('"')) throw new QueryError("Un guillemet ne s'ouvre qu'en début de valeur", i);
    if (!name) throw new QueryError("Terme attendu", fieldAt);
    return { neg, field: null, fieldAt, op: { kind: "match", values: [{ text: name, exact: false, at: fieldAt }] }, at: start };
  }

  /** A term or a group, then a space, a parenthesis, an operator or the end. */
  function operand(): QueryNode {
    const start = i;
    const neg = peek("-(");
    if (neg) i++;
    let node: QueryNode;
    if (peek("(")) {
      const open = i++;
      skipSpaces();
      if (peek(")")) throw new QueryError("Parenthèses vides", open);
      const inner = or();
      skipSpaces();
      if (!peek(")")) throw new QueryError("Parenthèse non fermée", open);
      i++;
      node = !neg
        ? inner
        : inner.kind === "term" || inner.neg
          ? { kind: "and", neg, nodes: [inner], at: start }
          : { ...inner, neg, at: start };
    } else node = { kind: "term", term: term() };
    if (i < text.length && !SPACE.test(text[i]) && !peek(")") && !operator()) throw new QueryError("Espace attendu entre deux termes", i);
    return node;
  }

  /** Before an operand: what stands there instead, as an error. */
  function expectOperand(after?: string) {
    skipSpaces();
    if (i >= text.length) throw new QueryError(after ? `Terme attendu après ${after}` : "Terme attendu", i);
    if (operator()) throw new QueryError(`Terme attendu avant ${text.slice(i, i + 2)}`, i);
    if (peek(")")) throw new QueryError(after ? `Terme attendu après ${after}` : "Parenthèse fermante sans ouvrante", i);
  }

  /** Operands joined by `&&` or a space. */
  function and(): QueryNode {
    expectOperand();
    const start = i;
    const nodes = [operand()];
    for (;;) {
      skipSpaces();
      if (peek("&&")) {
        i += 2;
        expectOperand("&&");
      } else if (i >= text.length || peek(")") || peek("||")) break;
      nodes.push(operand());
    }
    return nodes.length === 1 ? nodes[0] : { kind: "and", neg: false, nodes, at: start };
  }

  /** `and`s joined by `||`. */
  function or(): QueryNode {
    const start = i;
    const nodes = [and()];
    for (skipSpaces(); peek("||"); skipSpaces()) {
      i += 2;
      expectOperand("||");
      nodes.push(and());
    }
    return nodes.length === 1 ? nodes[0] : { kind: "or", neg: false, nodes, at: start };
  }

  skipSpaces();
  if (i >= text.length) return null;
  const root = or();
  skipSpaces();
  if (i < text.length) throw new QueryError("Parenthèse fermante sans ouvrante", i);
  return root;
}
