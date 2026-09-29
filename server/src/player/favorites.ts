import { db, schema } from "@/db";
import { asc, eq } from "drizzle-orm";

export async function setFavorite(contentKey: string, favorite: boolean) {
  if (favorite) await db.insert(schema.appFavorites).values({ contentKey }).onConflictDoNothing();
  else await db.delete(schema.appFavorites).where(eq(schema.appFavorites.contentKey, contentKey));
}

/** Every favourite key, oldest first (the order "Ma liste" shows). */
export async function favoriteKeys(): Promise<string[]> {
  return (
    await db
      .select({ k: schema.appFavorites.contentKey })
      .from(schema.appFavorites)
      .orderBy(asc(schema.appFavorites.createdAt), asc(schema.appFavorites.contentKey))
  ).map((r) => r.k);
}

export async function favoriteSet(): Promise<Set<string>> {
  return new Set(await favoriteKeys());
}

// ---------------------------------------------------------------- routes

import { Hono } from "hono";
import { parseKey } from "@/catalog";
import type { Env } from "./context";
import { fail, noContent } from "./http";
import { keyExists } from "./contents";

/** `PUT` / `DELETE /favorites/{id}`: movies, series and channels only, never an episode. */
export const favoriteRoutes = new Hono<Env>();
for (const method of ["put", "delete"] as const) {
  favoriteRoutes[method]("/:id", async (c) => {
    const key = c.req.param("id");
    const parsed = parseKey(key);
    if (!parsed || parsed.episode !== undefined || !(await keyExists(c.get("ctx"), key))) return fail("not_found", "Contenu introuvable");
    await setFavorite(key, method === "put");
    return noContent();
  });
}
