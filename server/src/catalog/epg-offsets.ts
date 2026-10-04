import { eq, sql } from "drizzle-orm";
import { db, schema, type EpgOffset, type EpgSource } from "@/db";
import { parseSourceGuideId } from "./epg-ids";

/**
 * Corrections of the provider's guide times. Some of its feeds are off by whole hours (beIN MENA,
 * fetched in Qatar time and labelled as if UTC: +3 h); a rule shifts one guide id
 * (`beINSports3.qa`) or every id of a suffix (`*.qa`). Applied at each import, and at once to
 * what is stored: each row remembers the shift it carries (`offset_minutes`). A fallback source's
 * channel (`@3/…`) takes its own rule, else its source's shift, never a suffix of the provider's.
 */

/** `beINSports3.qa`, `@3/beIN SPORTS 1.qa` (a fallback source's channel), or `*.qa` for a whole suffix. */
const EXACT = /^[\w.+@&-]+$/;
const SUFFIX = /^\*\.[a-z0-9]{2,4}$/i;
export const isOffsetPattern = (p: string) => SUFFIX.test(p) || EXACT.test(p) || parseSourceGuideId(p) !== null;
/** ± 12 h, in steps of 5 min. */
export const isOffsetMinutes = (m: number) => Number.isInteger(m) && Math.abs(m) <= 720 && m % 5 === 0;

export type OffsetRules = { exact: Map<string, number>; suffixes: [string, number][]; sources: Map<number, number> };

export async function offsetRules(): Promise<OffsetRules> {
  const [rows, sources] = await Promise.all([
    db.select().from(schema.curationEpgOffsets),
    db.select({ id: schema.curationEpgSources.id, offsetMinutes: schema.curationEpgSources.offsetMinutes }).from(schema.curationEpgSources),
  ]);
  return compile(rows, sources);
}

export function compile(
  rows: Pick<EpgOffset, "pattern" | "minutes">[],
  sources: Pick<EpgSource, "id" | "offsetMinutes">[] = [],
): OffsetRules {
  const rules: OffsetRules = { exact: new Map(), suffixes: [], sources: new Map(sources.map((s) => [s.id, s.offsetMinutes])) };
  for (const r of rows) {
    if (r.pattern.startsWith("*")) rules.suffixes.push([r.pattern.slice(1).toLowerCase(), r.minutes]);
    else rules.exact.set(r.pattern.toLowerCase(), r.minutes);
  }
  rules.suffixes.sort((a, b) => b[0].length - a[0].length);
  return rules;
}

/** The shift of a guide id: its own rule, else its source's (a fallback source) or its suffix's, else none. */
export function offsetOf(rules: OffsetRules, channelId: string): number {
  const id = channelId.toLowerCase();
  const own = rules.exact.get(id);
  if (own !== undefined) return own;
  const source = parseSourceGuideId(channelId);
  if (source) return rules.sources.get(source.sourceId) ?? 0;
  return rules.suffixes.find(([s]) => id.endsWith(s))?.[1] ?? 0;
}

export const listOffsets = () => db.select().from(schema.curationEpgOffsets).orderBy(schema.curationEpgOffsets.pattern);

/** Sets a rule (0 minutes removes it) and shifts the stored guide by the difference. */
export async function setOffset(pattern: string, minutes: number) {
  if (!isOffsetPattern(pattern)) throw new Error(`Règle invalide : ${pattern}`);
  if (!isOffsetMinutes(minutes)) throw new Error("Décalage invalide : ± 12 h par pas de 5 min");
  if (minutes === 0) await db.delete(schema.curationEpgOffsets).where(eq(schema.curationEpgOffsets.pattern, pattern));
  else
    await db
      .insert(schema.curationEpgOffsets)
      .values({ pattern, minutes })
      .onConflictDoUpdate({ target: schema.curationEpgOffsets.pattern, set: { minutes, updatedAt: new Date() } });
  return reapplyOffsets();
}

/** Brings every stored programme to the shift the rules now give its channel. Returns the rows moved. */
export async function reapplyOffsets(): Promise<number> {
  const rules = await offsetRules();
  const groups = await db
    .selectDistinct({ channelId: schema.catalogEpgProgrammes.channelId, offset: schema.catalogEpgProgrammes.offsetMinutes })
    .from(schema.catalogEpgProgrammes);
  let moved = 0;
  for (const g of groups) {
    const want = offsetOf(rules, g.channelId);
    if (want === g.offset) continue;
    const delta = want - g.offset;
    const rows = await db.execute(sql`
      update catalog_epg_programmes set
        start_at = start_at + make_interval(mins => ${delta}),
        end_at = end_at + make_interval(mins => ${delta}),
        offset_minutes = ${want}
      where channel_id = ${g.channelId} and offset_minutes = ${g.offset}`);
    moved += rows.count ?? 0;
  }
  return moved;
}
