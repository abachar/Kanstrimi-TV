import { asc, desc, eq, sql } from "drizzle-orm";
import { db, schema, variants, type Content, type Variant } from "@/db";
import type { Kind } from "@/db";

/** Single-row lookups shared by the admin pages, the grouping actions and the TMDB correction. */

export async function itemById(id: number): Promise<Variant | null> {
  const [it] = await db.select().from(variants).where(eq(variants.id, id));
  return it ?? null;
}

export async function contentById(id: number): Promise<Content | null> {
  const [c] = await db.select().from(schema.catalogContents).where(eq(schema.catalogContents.id, id));
  return c ?? null;
}

export async function contentIdByKey(key: string): Promise<number | null> {
  const [c] = await db.select({ id: schema.catalogContents.id }).from(schema.catalogContents).where(eq(schema.catalogContents.key, key));
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
