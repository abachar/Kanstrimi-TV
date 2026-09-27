import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Category, Content, Item } from "@/db";
import { getCachedDetails } from "@/sync";
import type { TmdbDetails } from "@/sync";
import { getSettings } from "@/db";
import { variantsOfContent } from "../groups/data";
import { categoryByXtreamId, itemById } from "../catalog/data";

/** Everything the server knows about one entry: the row, its category, its content and the siblings, its TMDB sheet. */
export type ItemDetail = { item: Item; category: Category | null; content: Content | null; siblings: Item[]; tmdb: TmdbDetails | null; tmdbLang: string };

export async function itemDetail(id: number): Promise<ItemDetail | null> {
  const item = await itemById(id);
  if (!item) return null;
  const tmdbLang = (await getSettings()).tmdb_language || "fr-FR";
  const [category, content] = await Promise.all([categoryByXtreamId(item.kind, item.categoryXtreamId), contentOf(item)]);
  const siblings = content ? await variantsOfContent(content.id) : [item];
  const tmdb = item.tmdbId && item.kind !== "live" ? await getCachedDetails(item.kind === "vod" ? "movie" : "tv", item.tmdbId, tmdbLang) : null;
  return { item, category, content, siblings, tmdb, tmdbLang };
}

async function contentOf(item: Item): Promise<Content | null> {
  if (!item.contentId) return null;
  const [c] = await db.select().from(schema.contents).where(eq(schema.contents.id, item.contentId));
  return c ?? null;
}
