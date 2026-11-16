import { asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { channelContent, db, schema, titleContent, variants, type Content, type Variant } from "@/db";
import type { Kind } from "@/db";

/** Single-row lookups shared by the admin pages, the grouping actions and the TMDB correction. */

export async function itemById(id: number): Promise<Variant | null> {
  const [it] = await db.select().from(variants).where(eq(variants.id, id));
  return it ?? null;
}

/** A title or a channel by its id: the two draw their ids from one sequence. */
export async function contentById(id: number): Promise<Content | null> {
  const [t] = await db.select(titleContent).from(schema.catalogTitles).where(eq(schema.catalogTitles.id, id));
  if (t) return t;
  const [c] = await db.select(channelContent).from(schema.catalogChannels).where(eq(schema.catalogChannels.id, id));
  return c ?? null;
}

export async function contentIdByKey(key: string): Promise<number | null> {
  const [t] = await db.select({ id: schema.catalogTitles.id }).from(schema.catalogTitles).where(eq(schema.catalogTitles.key, key));
  if (t) return t.id;
  const [c] = await db.select({ id: schema.catalogChannels.id }).from(schema.catalogChannels).where(eq(schema.catalogChannels.key, key));
  return c?.id ?? null;
}

/** The variants of a content, best quality first, hidden ones included: the admin shows them all. */
export async function variantsOfContent(contentId: number): Promise<Variant[]> {
  return db.select().from(variants).where(eq(variants.contentId, contentId)).orderBy(desc(variants.qualityRank), asc(variants.id));
}

/** How many variants the catalogue holds per account and kind: what each provider's lists are checked against. */
export async function variantCountsByAccount(): Promise<Map<number, Record<Kind, number>>> {
  const rows = await db
    .select({ accountId: variants.accountId, kind: variants.kind, n: sql<number>`count(*)::int` })
    .from(variants)
    .groupBy(variants.accountId, variants.kind);
  const out = new Map<number, Record<Kind, number>>();
  for (const r of rows) {
    const counts = out.get(r.accountId) ?? ({ live: 0, vod: 0, series: 0 } as Record<Kind, number>);
    counts[r.kind] = r.n;
    out.set(r.accountId, counts);
  }
  return out;
}

/** Titles and channels alike under these keys, hidden ones included: what the admin's lists show. */
export async function contentsByKey(keys: string[]): Promise<Content[]> {
  if (!keys.length) return [];
  const [titles, channels] = await Promise.all([
    db.select(titleContent).from(schema.catalogTitles).where(inArray(schema.catalogTitles.key, keys)),
    db.select(channelContent).from(schema.catalogChannels).where(inArray(schema.catalogChannels.key, keys)),
  ]);
  return [...titles, ...channels];
}

/**
 * The table a kind's contents are in, for a list that takes any kind: its rows as contents, what it
 * sorts by, and the condition that keeps the kind (a channel's table holds nothing else).
 */
export const contentSource = (kind: Kind) =>
  kind === "live"
    ? {
        table: schema.catalogChannels as unknown as typeof schema.catalogTitles,
        fields: channelContent as unknown as typeof titleContent,
        id: schema.catalogChannels.id,
        title: schema.catalogChannels.name,
        addedAt: schema.catalogChannels.addedAt,
        ofKind: undefined as SQL | undefined,
      }
    : {
        table: schema.catalogTitles,
        fields: titleContent,
        id: schema.catalogTitles.id,
        title: schema.catalogTitles.title,
        addedAt: schema.catalogTitles.addedAt,
        ofKind: eq(schema.catalogTitles.kind, kind) as SQL | undefined,
      };
