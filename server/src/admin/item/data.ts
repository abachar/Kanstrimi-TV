import type { Category, Content, IptvChannel, Item } from "@/db";
import { getCachedDetails } from "@/providers/tmdb";
import type { TmdbDetails } from "@/providers/tmdb";
import { getSettings } from "@/config";
import { categoryByXtreamId, itemById, contentById, variantsOfContent, iptvChannelById } from "@/catalog";
import { tmdbMediaType } from "@/db";

/** Everything the server knows about one entry: the row, its category, its content and the siblings, its TMDB sheet. */
export type ItemDetail = {
  item: Item;
  category: Category | null;
  content: Content | null;
  siblings: Item[];
  tmdb: TmdbDetails | null;
  tmdbLang: string;
  /** Live: the iptv-org channel the variant is matched to. */
  iptv: IptvChannel | null;
};

export async function itemDetail(id: number): Promise<ItemDetail | null> {
  const item = await itemById(id);
  if (!item) return null;
  const tmdbLang = (await getSettings()).tmdb_language;
  const [category, content] = await Promise.all([
    categoryByXtreamId(item.kind, item.categoryXtreamId),
    item.contentId ? contentById(item.contentId) : null,
  ]);
  const siblings = content ? await variantsOfContent(content.id) : [item];
  const tmdb = item.tmdbId && item.kind !== "live" ? await getCachedDetails(tmdbMediaType(item.kind), item.tmdbId, tmdbLang) : null;
  const iptv = item.kind === "live" ? await iptvChannelById(item.iptvId) : null;
  return { item, category, content, siblings, tmdb, tmdbLang, iptv };
}
