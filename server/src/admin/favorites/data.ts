import { desc, eq } from "drizzle-orm";
import { db, schema, type Content } from "@/db";
import { gridCard, type Card, type RestContext } from "@/player";

/** One line of « Favoris »: the key as the app stored it, its content when it still exists, and why the app would not see it. */
export type FavoriteRow = {
  key: string;
  addedAt: Date;
  content: Content | null;
  card: Card | null;
  /** Empty when the app sees it; otherwise why the favourite is dead for it. */
  hidden: "supprimé" | "invisible" | "adulte" | null;
};

/** Every favourite, newest first, whatever its visibility: a dead favourite is exactly what the admin wants to see. */
export async function favoriteRows(ctx: RestContext): Promise<FavoriteRow[]> {
  const rows = await db
    .select({ key: schema.favorites.contentKey, addedAt: schema.favorites.createdAt, content: schema.contents })
    .from(schema.favorites)
    .leftJoin(schema.contents, eq(schema.contents.key, schema.favorites.contentKey))
    .orderBy(desc(schema.favorites.createdAt), desc(schema.favorites.contentKey));
  return rows.map(({ key, addedAt, content }) => ({
    key,
    addedAt,
    content,
    card: content ? gridCard(ctx, content) : null,
    hidden: !content ? "supprimé" : !content.visible ? "invisible" : content.adult && !ctx.serveAdult ? "adulte" : null,
  }));
}
