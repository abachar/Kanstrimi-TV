import type { Category, Content, IptvorgChannel, Variant } from "@/db";
import { db, schema, tmdbMediaType } from "@/db";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getCachedDetails } from "@/providers/tmdb";
import type { TmdbDetails } from "@/providers/tmdb";
import { getSettings } from "@/config";
import {
  contentById,
  epgSourceById,
  itemById,
  iptvChannelById,
  offsetOf,
  offsetRules,
  parseSourceGuideId,
  variantsOfContent,
} from "@/catalog";
import { epgIdsOf } from "@/player";

/** One provider entry of a content: the row, its category, the TMDB sheet it matched, its iptv-org channel (live). */
export type VariantDetail = {
  item: Variant;
  category: Category | null;
  tmdb: TmdbDetails | null;
  iptv: IptvorgChannel | null;
};

/** A programme of a channel's guide. */
export type GuideLine = { title: string; startAt: Date; endAt: Date };

/** An EPG id a variant tries, in the app's order (`player`), and what the base holds under it. */
export type GuideCandidate = {
  id: string;
  /** Who gives it: the provider, iptv-org when the provider's names another channel, a fallback source. */
  origin: "provider" | "iptv" | "fallback";
  programmes: number;
  until: Date | null;
  offsetMinutes: number;
};

/** A variant's guide: the ids it tries; `used` is the first with programmes, null when it has none of its own. */
export type VariantGuide = { item: Variant; candidates: GuideCandidate[]; used: string | null };

/**
 * How a channel finds its guide, variant by variant, and every programme stored in the one the page
 * lists (the first variant's that has one). `fallback`: the source completing the provider's.
 */
export type ChannelGuide = {
  variants: VariantGuide[];
  fallback: { sourceId: number; sourceName: string; channelId: string; manual: boolean } | null;
  shown: string | null;
  programmes: GuideLine[];
};

/** A content and every provider entry under it; `content` is null for an entry not grouped yet. A channel brings its guide. */
export type ContentDetail = { content: Content | null; variants: VariantDetail[]; tmdbLang: string; guide: ChannelGuide | null };

/** What the base holds per guide id: how many programmes, until when. */
async function guideStats(ids: string[]): Promise<Map<string, { programmes: number; until: Date }>> {
  if (!ids.length) return new Map();
  const p = schema.catalogEpgProgrammes;
  const rows = await db
    .select({ id: p.channelId, programmes: sql<number>`count(*)::int`, until: sql<Date>`max(${p.endAt})` })
    .from(p)
    .where(inArray(p.channelId, ids))
    .groupBy(p.channelId);
  return new Map(rows.map((r) => [r.id, { programmes: r.programmes, until: new Date(r.until) }]));
}

async function fallbackOf(c: Content): Promise<ChannelGuide["fallback"]> {
  const ref = c.epgFallbackId ? parseSourceGuideId(c.epgFallbackId) : null;
  if (!ref) return null;
  const l = schema.curationEpgLinks;
  const [source, [link]] = await Promise.all([
    epgSourceById(ref.sourceId),
    db
      .select()
      .from(l)
      .where(and(eq(l.sourceId, ref.sourceId), eq(l.contentKey, c.key))),
  ]);
  return { ...ref, sourceName: source?.name ?? `source ${ref.sourceId}`, manual: link?.channelId === ref.channelId };
}

async function guideOf(c: Content, items: Variant[]): Promise<ChannelGuide | null> {
  if (c.kind !== "live") return null;
  // The app's order: the variant's own ids, then the channel's fallback (`player/channels.ts`).
  const ids = items.map((it): Pick<GuideCandidate, "id" | "origin">[] => [
    ...epgIdsOf(it).map((id) => ({ id, origin: id === it.raw.epg_channel_id ? ("provider" as const) : ("iptv" as const) })),
    ...(c.epgFallbackId ? [{ id: c.epgFallbackId, origin: "fallback" as const }] : []),
  ]);
  const [stats, rules, fallback] = await Promise.all([guideStats([...new Set(ids.flat().map((x) => x.id))]), offsetRules(), fallbackOf(c)]);
  const variants = items.map((item, i) => {
    const candidates = ids[i].map((x) => ({
      ...x,
      programmes: stats.get(x.id)?.programmes ?? 0,
      until: stats.get(x.id)?.until ?? null,
      offsetMinutes: offsetOf(rules, x.id),
    }));
    return { item, candidates, used: candidates.find((x) => x.programmes)?.id ?? null };
  });
  const shown = variants.find((v) => v.used)?.used ?? null;
  const p = schema.catalogEpgProgrammes;
  const programmes = shown
    ? await db.select({ title: p.title, startAt: p.startAt, endAt: p.endAt }).from(p).where(eq(p.channelId, shown)).orderBy(asc(p.startAt))
    : [];
  return { variants, fallback, shown, programmes };
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
  const items = await variantsOfContent(content.id);
  const [variants, guide] = await Promise.all([variantDetails(items, tmdbLang), guideOf(content, items)]);
  return { content, variants, tmdbLang, guide };
}

/** An entry the grouping has not placed yet: the page shows it alone. */
export async function orphanDetail(itemId: number): Promise<ContentDetail | null> {
  const item = await itemById(itemId);
  if (!item) return null;
  const tmdbLang = (await getSettings()).tmdb_language;
  return { content: null, variants: await variantDetails([item], tmdbLang), tmdbLang, guide: null };
}
