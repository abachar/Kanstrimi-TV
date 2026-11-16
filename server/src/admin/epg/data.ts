import { and, asc, eq, gt, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { listEpgSources, offsetOf, offsetRules, parseSourceGuideId } from "@/catalog";
import type { Exec } from "../catalog/search";

/**
 * What the EPG page reads: the visible channels that have a guide, and their programmes in a window.
 * A channel's guide is the provider's when it files programmes, else its fallback source's.
 */

export type GridProgramme = { id: number; startAt: Date; endAt: Date; title: string; overview: string | null };
export type GridChannel = {
  contentId: number;
  title: string;
  logo: string | null;
  market: string | null;
  themes: string[];
  epgId: string;
  /** The fallback source the guide comes from; null for the provider's. */
  source: string | null;
  offset: number;
  programmes: GridProgramme[];
};
/** `q` is in the filter language (`thème:sport pays:maroc`), on the channels' variants. */
export type GridQuery = { from: Date; to: Date; q: string; page: number };
export const CHANNELS_PER_PAGE = 40;

const providerGuided = sql`exists (select 1 from ${schema.cacheEpgProgrammes} p where p.channel_id = ${schema.catalogChannels.epgId})`;
const guideId = sql<
  string | null
>`case when ${providerGuided} then ${schema.catalogChannels.epgId} else ${schema.catalogChannels.epgFallbackId} end`;
const withGuide = sql`exists (select 1 from ${schema.cacheEpgProgrammes} p where p.channel_id = ${guideId})`;

/** One page of the grid: the channels with a guide that meet `match` (the compiled `q`), with their programmes. */
export async function epgGrid(ex: Exec, g: GridQuery, match: SQL | null): Promise<{ channels: GridChannel[]; total: number }> {
  const where: SQL[] = [eq(schema.catalogChannels.visible, true), withGuide];
  if (match) where.push(match);
  const cond = and(...where);
  const [rows, [{ n }]] = await Promise.all([
    ex
      .select({
        contentId: schema.catalogChannels.id,
        title: schema.catalogChannels.name,
        logo: schema.catalogChannels.logoUrl,
        market: schema.catalogChannels.market,
        themes: sql<
          string[]
        >`case when ${schema.catalogChannels.theme} is null then '{}'::text[] else array[${schema.catalogChannels.theme}] end`,
        epgId: guideId,
      })
      .from(schema.catalogChannels)
      .where(cond)
      .orderBy(asc(schema.catalogChannels.market), asc(schema.catalogChannels.name))
      .limit(CHANNELS_PER_PAGE)
      .offset((g.page - 1) * CHANNELS_PER_PAGE),
    ex.select({ n: sql<number>`count(*)::int` }).from(schema.catalogChannels).where(cond),
  ]);
  const ids = [...new Set(rows.map((r) => r.epgId!))];
  const progs = ids.length ? await programmesOf(ids, g.from, g.to) : [];
  const [rules, sources] = await Promise.all([offsetRules(), listEpgSources()]);
  const sourceName = new Map(sources.map((s) => [s.id, s.name]));
  return {
    total: n,
    channels: rows.map((r) => ({
      ...r,
      epgId: r.epgId!,
      source: sourceNameOf(sourceName, r.epgId!),
      offset: offsetOf(rules, r.epgId!),
      programmes: progs.filter((p) => p.channelId === r.epgId),
    })),
  };
}

const sourceNameOf = (names: Map<number, string>, epgId: string) => {
  const ref = parseSourceGuideId(epgId);
  return ref ? (names.get(ref.sourceId) ?? `source ${ref.sourceId}`) : null;
};

/** Programmes overlapping [from, to), each once, in order. */
export async function programmesOf(channelIds: string[], from: Date, to: Date) {
  return db
    .selectDistinctOn([schema.cacheEpgProgrammes.channelId, schema.cacheEpgProgrammes.startAt], {
      id: schema.cacheEpgProgrammes.id,
      channelId: schema.cacheEpgProgrammes.channelId,
      startAt: schema.cacheEpgProgrammes.startAt,
      endAt: schema.cacheEpgProgrammes.endAt,
      title: schema.cacheEpgProgrammes.title,
      overview: schema.cacheEpgProgrammes.overview,
    })
    .from(schema.cacheEpgProgrammes)
    .where(
      and(
        inArray(schema.cacheEpgProgrammes.channelId, channelIds),
        lt(schema.cacheEpgProgrammes.startAt, to),
        gt(schema.cacheEpgProgrammes.endAt, from),
      ),
    )
    .orderBy(asc(schema.cacheEpgProgrammes.channelId), asc(schema.cacheEpgProgrammes.startAt));
}

/** One guide id: the channels showing it (name, logo), for the correction panel. */
export async function channelsOfGuide(epgId: string) {
  return db
    .select({ title: schema.catalogChannels.name, logo: schema.catalogChannels.logoUrl, market: schema.catalogChannels.market })
    .from(schema.catalogChannels)
    .where(
      and(
        eq(schema.catalogChannels.visible, true),
        or(eq(schema.catalogChannels.epgId, epgId), eq(schema.catalogChannels.epgFallbackId, epgId)),
      ),
    )
    .orderBy(asc(schema.catalogChannels.name));
}
