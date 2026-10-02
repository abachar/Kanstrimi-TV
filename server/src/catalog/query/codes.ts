import { stripAccents } from "@/shared";

/**
 * ISO codes the filter language accepts by code or by French name: `langue-vo:japonais` is `ja`,
 * `pays-vo:inde` is `IN`. The lists come from the runtime's own CLDR data (`Intl.DisplayNames`), every
 * two-letter code it can name.
 */

export type CodeList = "language" | "region";
type Table = { names: Map<string, string>; codes: Set<string> };

const key = (s: string) => stripAccents(s).toLowerCase().trim();
/** Names everybody uses that CLDR spells otherwise. */
const ALIASES: Record<CodeList, Record<string, string>> = {
  language: {},
  region: { palestine: "ps", angleterre: "gb", usa: "us", uk: "gb" },
};
/** Not a place: CLDR's « unknown region » and the like. */
const NOT_REGIONS = new Set(["zz", "eu", "ez", "un", "qo"]);

const tables = new Map<CodeList, Table>();
function table(list: CodeList): Table {
  const known = tables.get(list);
  if (known) return known;
  const names = new Intl.DisplayNames("fr", { type: list, fallback: "none" });
  const t: Table = { names: new Map(), codes: new Set() };
  const letters = "abcdefghijklmnopqrstuvwxyz";
  for (const a of letters)
    for (const b of letters) {
      const code = a + b;
      if (list === "region" && NOT_REGIONS.has(code)) continue;
      let name: string | undefined;
      try {
        name = names.of(list === "region" ? code.toUpperCase() : code);
      } catch {
        name = undefined;
      }
      if (!name) continue;
      // « UK » is how many providers write GB: the same country, under its ISO code.
      const iso = ALIASES[list][code] ?? code;
      t.codes.add(iso);
      if (!t.names.has(key(name))) t.names.set(key(name), iso);
    }
  for (const [name, code] of Object.entries(ALIASES[list])) t.names.set(key(name), code);
  tables.set(list, t);
  return t;
}

/** The lower-case code a value stands for, by code or by name; null when unknown. */
export function resolveCode(list: CodeList, value: string): string | null {
  const t = table(list);
  const k = key(value);
  if (k.length === 2 && (t.codes.has(k) || ALIASES[list][k])) return ALIASES[list][k] ?? k;
  return t.names.get(k) ?? null;
}

/** The known name closest to a value, for « did you mean ». */
export function closestName(list: CodeList, value: string, near: (a: string, b: string) => number): string | null {
  const k = key(value);
  let best: [string, number] | null = null;
  for (const name of table(list).names.keys()) {
    const d = near(k, name);
    if (d <= 2 && (!best || d < best[1])) best = [name, d];
  }
  return best?.[0] ?? null;
}
