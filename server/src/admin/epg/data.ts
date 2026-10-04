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

const providerGuided = sql`exists (select 1 from ${schema.catalogEpgProgrammes} p where p.channel_id = ${schema.catalogContents.epgChannelId})`;
const guideId = sql<
  string | null
>`case when ${providerGuided} then ${schema.catalogContents.epgChannelId} else ${schema.catalogContents.epgFallbackId} end`;
const withGuide = sql`exists (select 1 from ${schema.catalogEpgProgrammes} p where p.channel_id = ${guideId})`;

/** One page of the grid: the channels with a guide whose variants meet `match` (the compiled `q`), with their programmes. */
export async function epgGrid(ex: Exec, g: GridQuery, match: SQL | null): Promise<{ channels: GridChannel[]; total: number }> {
  const where: SQL[] = [eq(schema.catalogContents.kind, "live"), eq(schema.catalogContents.visible, true), withGuide];
  if (match)
    where.push(
      sql`exists (select 1 from ${schema.catalogVariants} where ${schema.catalogVariants.contentId} = ${schema.catalogContents.id} and ${match})`,
    );
  const cond = and(...where);
  const [rows, [{ n }]] = await Promise.all([
    ex
      .select({
        contentId: schema.catalogContents.id,
        title: schema.catalogContents.title,
        logo: schema.catalogContents.logoUrl,
        market: schema.catalogContents.market,
        themes: schema.catalogContents.themes,
        epgId: guideId,
      })
      .from(schema.catalogContents)
      .where(cond)
      .orderBy(asc(schema.catalogContents.market), asc(schema.catalogContents.title))
      .limit(CHANNELS_PER_PAGE)
      .offset((g.page - 1) * CHANNELS_PER_PAGE),
    ex.select({ n: sql<number>`count(*)::int` }).from(schema.catalogContents).where(cond),
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
    .selectDistinctOn([schema.catalogEpgProgrammes.channelId, schema.catalogEpgProgrammes.startAt], {
      id: schema.catalogEpgProgrammes.id,
      channelId: schema.catalogEpgProgrammes.channelId,
      startAt: schema.catalogEpgProgrammes.startAt,
      endAt: schema.catalogEpgProgrammes.endAt,
      title: schema.catalogEpgProgrammes.title,
      overview: schema.catalogEpgProgrammes.overview,
    })
    .from(schema.catalogEpgProgrammes)
    .where(
      and(
        inArray(schema.catalogEpgProgrammes.channelId, channelIds),
        lt(schema.catalogEpgProgrammes.startAt, to),
        gt(schema.catalogEpgProgrammes.endAt, from),
      ),
    )
    .orderBy(asc(schema.catalogEpgProgrammes.channelId), asc(schema.catalogEpgProgrammes.startAt));
}

/** One guide id: the channels showing it (name, logo), for the correction panel. */
export async function channelsOfGuide(epgId: string) {
  return db
    .select({ title: schema.catalogContents.title, logo: schema.catalogContents.logoUrl, market: schema.catalogContents.market })
    .from(schema.catalogContents)
    .where(
      and(
        eq(schema.catalogContents.kind, "live"),
        eq(schema.catalogContents.visible, true),
        or(eq(schema.catalogContents.epgChannelId, epgId), eq(schema.catalogContents.epgFallbackId, epgId)),
      ),
    )
    .orderBy(asc(schema.catalogContents.title));
}
