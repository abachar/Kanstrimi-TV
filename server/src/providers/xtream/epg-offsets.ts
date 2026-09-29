import { eq, sql } from "drizzle-orm";
import { db, schema, type EpgOffset } from "@/db";

/**
 * Corrections of the provider's guide times. Some of its feeds are off by whole hours (beIN MENA,
 * fetched in Qatar time and labelled as if UTC: +3 h); a rule shifts one guide id
 * (`beINSports3.qa`) or every id of a suffix (`*.qa`). Applied at each import, and at once to
 * what is stored: each row remembers the shift it carries (`offset_minutes`).
 */

/** `beINSports3.qa`, or `*.qa` for a whole suffix. */
const EXACT = /^[\w.+@&-]+$/;
const SUFFIX = /^\*\.[a-z0-9]{2,4}$/i;
export const isOffsetPattern = (p: string) => SUFFIX.test(p) || EXACT.test(p);
/** ± 12 h, in steps of 5 min. */
export const isOffsetMinutes = (m: number) => Number.isInteger(m) && Math.abs(m) <= 720 && m % 5 === 0;

export type OffsetRules = { exact: Map<string, number>; suffixes: [string, number][] };

export async function offsetRules(): Promise<OffsetRules> {
  return compile(await db.select().from(schema.epgOffsets));
}

export function compile(rows: Pick<EpgOffset, "pattern" | "minutes">[]): OffsetRules {
  const rules: OffsetRules = { exact: new Map(), suffixes: [] };
  for (const r of rows) {
    if (r.pattern.startsWith("*")) rules.suffixes.push([r.pattern.slice(1).toLowerCase(), r.minutes]);
    else rules.exact.set(r.pattern.toLowerCase(), r.minutes);
  }
  rules.suffixes.sort((a, b) => b[0].length - a[0].length);
  return rules;
}

/** The shift of a guide id: its own rule, else its suffix's, else none. */
export function offsetOf(rules: OffsetRules, channelId: string): number {
  const id = channelId.toLowerCase();
  return rules.exact.get(id) ?? rules.suffixes.find(([s]) => id.endsWith(s))?.[1] ?? 0;
}

export const listOffsets = () => db.select().from(schema.epgOffsets).orderBy(schema.epgOffsets.pattern);

/** Sets a rule (0 minutes removes it) and shifts the stored guide by the difference. */
export async function setOffset(pattern: string, minutes: number) {
  if (!isOffsetPattern(pattern)) throw new Error(`Règle invalide : ${pattern}`);
  if (!isOffsetMinutes(minutes)) throw new Error("Décalage invalide : ± 12 h par pas de 5 min");
  if (minutes === 0) await db.delete(schema.epgOffsets).where(eq(schema.epgOffsets.pattern, pattern));
  else
    await db
      .insert(schema.epgOffsets)
      .values({ pattern, minutes })
      .onConflictDoUpdate({ target: schema.epgOffsets.pattern, set: { minutes, updatedAt: new Date() } });
  return reapplyOffsets();
}

/** Brings every stored programme to the shift the rules now give its channel. Returns the rows moved. */
export async function reapplyOffsets(): Promise<number> {
  const rules = await offsetRules();
  const groups = await db
    .selectDistinct({ channelId: schema.epgProgrammes.channelId, offset: schema.epgProgrammes.offsetMinutes })
    .from(schema.epgProgrammes);
  let moved = 0;
  for (const g of groups) {
    const want = offsetOf(rules, g.channelId);
    if (want === g.offset) continue;
    const delta = want - g.offset;
    const rows = await db.execute(sql`
      update epg_programmes set
        start_at = start_at + make_interval(mins => ${delta}),
        end_at = end_at + make_interval(mins => ${delta}),
        offset_minutes = ${want}
      where channel_id = ${g.channelId} and offset_minutes = ${g.offset}`);
    moved += rows.count ?? 0;
  }
  return moved;
}
