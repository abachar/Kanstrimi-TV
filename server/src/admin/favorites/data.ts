import { desc, eq } from "drizzle-orm";
import { db, schema, type Content } from "@/db";
import { contentsByKey } from "@/catalog";
import { gridCard, type Card, type RestContext } from "@/player";

/** One line of « Favoris »: the key as the app stored it, its content when it still exists, and why the app would not see it. */
export type FavoriteRow = {
  key: string;
  profile: { id: number; name: string };
  addedAt: Date;
  content: Content | null;
  card: Card | null;
  /** Empty when the app sees it; otherwise why the favourite is dead for it. */
  hidden: "supprimé" | "invisible" | "adulte" | null;
};

/** Every profile's favourites, newest first, whatever their visibility: a dead favourite is exactly what the admin wants to see. */
export async function favoriteRows(ctx: RestContext): Promise<FavoriteRow[]> {
  const rows = await db
    .select({
      key: schema.appFavorites.contentKey,
      addedAt: schema.appFavorites.createdAt,
      profile: { id: schema.appProfiles.id, name: schema.appProfiles.name },
    })
    .from(schema.appFavorites)
    .innerJoin(schema.appProfiles, eq(schema.appProfiles.id, schema.appFavorites.profileId))
    .orderBy(desc(schema.appFavorites.createdAt), desc(schema.appFavorites.contentKey));
  const byKey = new Map((await contentsByKey([...new Set(rows.map((r) => r.key))])).map((c) => [c.key, c]));
  return rows.map(({ key, addedAt, profile }) => {
    const content = byKey.get(key) ?? null;
    return {
      key,
      profile,
      addedAt,
      content,
      card: content ? gridCard(ctx, content) : null,
      hidden: !content ? "supprimé" : !content.visible ? "invisible" : content.adult && !ctx.serveAdult ? "adulte" : null,
    };
  });
}
