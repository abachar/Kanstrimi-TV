import { db, schema } from "@/db";
import { asc, eq } from "drizzle-orm";

export async function setFavorite(contentKey: string, favorite: boolean) {
  if (favorite) await db.insert(schema.favorites).values({ contentKey }).onConflictDoNothing();
  else await db.delete(schema.favorites).where(eq(schema.favorites.contentKey, contentKey));
}

/** Every favourite key, oldest first (the order "Ma liste" shows). */
export async function favoriteKeys(): Promise<string[]> {
  return (await db.select({ k: schema.favorites.contentKey }).from(schema.favorites).orderBy(asc(schema.favorites.createdAt), asc(schema.favorites.contentKey))).map((r) => r.k);
}

export async function favoriteSet(): Promise<Set<string>> { return new Set(await favoriteKeys()); }
