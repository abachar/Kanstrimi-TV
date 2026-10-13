import { db, schema } from "@/db";
import { and, asc, eq } from "drizzle-orm";

const f = schema.appFavorites;

export async function setFavorite(profileId: number, contentKey: string, favorite: boolean) {
  if (favorite) await db.insert(f).values({ profileId, contentKey }).onConflictDoNothing();
  else await db.delete(f).where(and(eq(f.profileId, profileId), eq(f.contentKey, contentKey)));
}

/** The profile's favourite keys, oldest first (the order "Ma liste" shows). */
export async function favoriteKeys(profileId: number): Promise<string[]> {
  return (await db.select({ k: f.contentKey }).from(f).where(eq(f.profileId, profileId)).orderBy(asc(f.createdAt), asc(f.contentKey))).map(
    (r) => r.k,
  );
}

export async function favoriteSet(profileId: number): Promise<Set<string>> {
  return new Set(await favoriteKeys(profileId));
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
    await setFavorite(c.get("ctx").profile.id, key, method === "put");
    return noContent();
  });
}
