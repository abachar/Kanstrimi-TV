import type { FilterRule } from "@/db/schema";

export type Kind = "live" | "vod" | "series";
export type CompiledRule = { rule: FilterRule; re: RegExp };

export function compileRules(rules: FilterRule[]): CompiledRule[] {
  return rules
    .filter((r) => r.enabled)
    .sort((a, b) => a.position - b.position || a.id - b.id)
    .flatMap((rule) => {
      try { return [{ rule, re: new RegExp(rule.pattern, sanitizeFlags(rule.flags)) }]; }
      catch { return []; }
    });
}

export function sanitizeFlags(flags: string) {
  return [...new Set(flags.replace(/[^gimsuy]/g, ""))].join("");
}

export function validatePattern(pattern: string, flags: string): string | null {
  try { new RegExp(pattern, sanitizeFlags(flags)); return null; }
  catch (e) { return (e as Error).message; }
}

/**
 * Decide whether an entry is hidden.
 * Semantics: rules are evaluated in order; "hide" rules hide on match, "keep" rules
 * whitelist: if at least one keep rule exists for the kind/target, entries that match
 * no keep rule are hidden. A later "keep" match un-hides a previous "hide" match (order matters).
 */
export function isHidden(
  compiled: CompiledRule[],
  kind: Kind,
  target: "name" | "category",
  value: string,
): boolean {
  const applicable = compiled.filter((c) => c.rule.target === target && (c.rule.kind === null || c.rule.kind === kind));
  const hasKeep = applicable.some((c) => c.rule.action === "keep");
  let hidden = hasKeep; // whitelist mode: hidden unless kept
  for (const c of applicable) {
    c.re.lastIndex = 0;
    if (!c.re.test(value)) continue;
    hidden = c.rule.action === "hide";
  }
  return hidden;
}
