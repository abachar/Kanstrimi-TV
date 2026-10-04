import type { Category, Content, IptvorgChannel, Variant } from "@/db";
import { db, schema, tmdbMediaType } from "@/db";
import { and, asc, eq, gt } from "drizzle-orm";
import { getCachedDetails } from "@/providers/tmdb";
import type { TmdbDetails } from "@/providers/tmdb";
import { getSettings } from "@/config";
import { contentById, itemById, variantsOfContent, iptvChannelById } from "@/catalog";

/** One provider entry of a content: the row, its category, the TMDB sheet it matched, its iptv-org channel (live). */
export type VariantDetail = {
  item: Variant;
  category: Category | null;
  tmdb: TmdbDetails | null;
  iptv: IptvorgChannel | null;
};

/** A programme of a channel's guide, on air or next. */
export type GuideLine = { title: string; startAt: Date; endAt: Date };

/** A content and every provider entry under it; `content` is null for an entry not grouped yet. A channel brings its guide. */
export type ContentDetail = { content: Content | null; variants: VariantDetail[]; tmdbLang: string; guide: GuideLine[] };

/** The programme on air and the next one, from the guide the grouping chose for the channel, else its fallback source's. */
async function guideOf(c: Content): Promise<GuideLine[]> {
  if (c.kind !== "live") return [];
  for (const id of [c.epgChannelId, c.epgFallbackId]) {
    if (!id) continue;
    const lines = await db
      .select({
        title: schema.catalogEpgProgrammes.title,
        startAt: schema.catalogEpgProgrammes.startAt,
        endAt: schema.catalogEpgProgrammes.endAt,
      })
      .from(schema.catalogEpgProgrammes)
      .where(and(eq(schema.catalogEpgProgrammes.channelId, id), gt(schema.catalogEpgProgrammes.endAt, new Date())))
      .orderBy(asc(schema.catalogEpgProgrammes.startAt))
      .limit(2);
    if (lines.length) return lines;
  }
  return [];
}

async function variantDetails(items: Variant[], tmdbLang: string): Promise<VariantDetail[]> {
  if (!items.length) return [];
  const cats = await db.select().from(schema.catalogCategories).where(eq(schema.catalogCategories.kind, items[0].kind));
  const catOf = new Map(cats.map((c) => [c.xtreamId, c]));
  return Promise.all(
    items.map(async (item) => ({
      item,
      category: item.categoryXtreamId ? (catOf.get(item.categoryXtreamId) ?? null) : null,
      tmdb: item.tmdbId && item.kind !== "live" ? await getCachedDetails(tmdbMediaType(item.kind), item.tmdbId, tmdbLang) : null,
      iptv: item.kind === "live" ? await iptvChannelById(item.iptvId) : null,
    })),
  );
}

export async function contentDetail(id: number): Promise<ContentDetail | null> {
  const content = await contentById(id);
  if (!content) return null;
  const tmdbLang = (await getSettings()).tmdb_language;
  const [variants, guide] = await Promise.all([variantDetails(await variantsOfContent(content.id), tmdbLang), guideOf(content)]);
  return { content, variants, tmdbLang, guide };
}

/** An entry the grouping has not placed yet: the page shows it alone. */
export async function orphanDetail(itemId: number): Promise<ContentDetail | null> {
  const item = await itemById(itemId);
  if (!item) return null;
  const tmdbLang = (await getSettings()).tmdb_language;
  return { content: null, variants: await variantDetails([item], tmdbLang), tmdbLang, guide: [] };
}
