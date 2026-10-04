import { and, asc, eq, gt, ilike, inArray, isNotNull, lt, ne, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { offsetOf, offsetRules } from "@/catalog";

/** What the EPG page reads: the visible channels that have a guide, and their programmes in a window. */

export type GridProgramme = { id: number; startAt: Date; endAt: Date; title: string; overview: string | null };
export type GridChannel = {
  contentId: number;
  title: string;
  logo: string | null;
  market: string | null;
  themes: string[];
  epgId: string;
  offset: number;
  programmes: GridProgramme[];
};
export type GridQuery = { from: Date; to: Date; q: string; market: string; theme: string; page: number };
export const CHANNELS_PER_PAGE = 40;

const withGuide = sql`exists (select 1 from ${schema.catalogEpgProgrammes} p where p.channel_id = ${schema.catalogContents.epgChannelId})`;

export async function epgGrid(g: GridQuery): Promise<{ channels: GridChannel[]; total: number }> {
  const where: SQL[] = [
    eq(schema.catalogContents.kind, "live"),
    eq(schema.catalogContents.visible, true),
    isNotNull(schema.catalogContents.epgChannelId),
    ne(schema.catalogContents.epgChannelId, ""),
    withGuide,
  ];
  if (g.q) where.push(ilike(schema.catalogContents.title, `%${g.q}%`));
  if (g.market) where.push(eq(schema.catalogContents.market, g.market));
  if (g.theme) where.push(sql`${g.theme} = any(${schema.catalogContents.themes})`);
  const cond = and(...where);
  const [rows, [{ n }]] = await Promise.all([
    db
      .select({
        contentId: schema.catalogContents.id,
        title: schema.catalogContents.title,
        logo: schema.catalogContents.logoUrl,
        market: schema.catalogContents.market,
        themes: schema.catalogContents.themes,
        epgId: schema.catalogContents.epgChannelId,
      })
      .from(schema.catalogContents)
      .where(cond)
      .orderBy(asc(schema.catalogContents.market), asc(schema.catalogContents.title))
      .limit(CHANNELS_PER_PAGE)
      .offset((g.page - 1) * CHANNELS_PER_PAGE),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.catalogContents).where(cond),
  ]);
  const ids = [...new Set(rows.map((r) => r.epgId!))];
  const progs = ids.length ? await programmesOf(ids, g.from, g.to) : [];
  const rules = await offsetRules();
  return {
    total: n,
    channels: rows.map((r) => ({
      ...r,
      epgId: r.epgId!,
      offset: offsetOf(rules, r.epgId!),
      programmes: progs.filter((p) => p.channelId === r.epgId),
    })),
  };
}

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

/** The markets and themes of the channels with a guide, for the filters. */
export async function gridFilters() {
  const rows = await db
    .select({ market: schema.catalogContents.market, themes: schema.catalogContents.themes })
    .from(schema.catalogContents)
    .where(
      and(
        eq(schema.catalogContents.kind, "live"),
        eq(schema.catalogContents.visible, true),
        isNotNull(schema.catalogContents.epgChannelId),
        withGuide,
      ),
    );
  return {
    markets: [...new Set(rows.map((r) => r.market).filter((m): m is string => Boolean(m)))].sort(),
    themes: [...new Set(rows.flatMap((r) => r.themes))].sort((a, b) => a.localeCompare(b, "fr")),
  };
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
        eq(schema.catalogContents.epgChannelId, epgId),
      ),
    )
    .orderBy(asc(schema.catalogContents.title));
}
