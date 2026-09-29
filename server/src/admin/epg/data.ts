import { and, asc, eq, gt, ilike, inArray, isNotNull, lt, ne, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { offsetOf, offsetRules } from "@/providers/xtream";

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

const withGuide = sql`exists (select 1 from ${schema.epgProgrammes} p where p.channel_id = ${schema.contents.epgChannelId})`;

export async function epgGrid(g: GridQuery): Promise<{ channels: GridChannel[]; total: number }> {
  const where: SQL[] = [
    eq(schema.contents.kind, "live"),
    eq(schema.contents.visible, true),
    isNotNull(schema.contents.epgChannelId),
    ne(schema.contents.epgChannelId, ""),
    withGuide,
  ];
  if (g.q) where.push(ilike(schema.contents.title, `%${g.q}%`));
  if (g.market) where.push(eq(schema.contents.market, g.market));
  if (g.theme) where.push(sql`${g.theme} = any(${schema.contents.themes})`);
  const cond = and(...where);
  const [rows, [{ n }]] = await Promise.all([
    db
      .select({
        contentId: schema.contents.id,
        title: schema.contents.title,
        logo: schema.contents.logoUrl,
        market: schema.contents.market,
        themes: schema.contents.themes,
        epgId: schema.contents.epgChannelId,
      })
      .from(schema.contents)
      .where(cond)
      .orderBy(asc(schema.contents.market), asc(schema.contents.title))
      .limit(CHANNELS_PER_PAGE)
      .offset((g.page - 1) * CHANNELS_PER_PAGE),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.contents).where(cond),
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
    .selectDistinctOn([schema.epgProgrammes.channelId, schema.epgProgrammes.startAt], {
      id: schema.epgProgrammes.id,
      channelId: schema.epgProgrammes.channelId,
      startAt: schema.epgProgrammes.startAt,
      endAt: schema.epgProgrammes.endAt,
      title: schema.epgProgrammes.title,
      overview: schema.epgProgrammes.overview,
    })
    .from(schema.epgProgrammes)
    .where(
      and(inArray(schema.epgProgrammes.channelId, channelIds), lt(schema.epgProgrammes.startAt, to), gt(schema.epgProgrammes.endAt, from)),
    )
    .orderBy(asc(schema.epgProgrammes.channelId), asc(schema.epgProgrammes.startAt));
}

/** The markets and themes of the channels with a guide, for the filters. */
export async function gridFilters() {
  const rows = await db
    .select({ market: schema.contents.market, themes: schema.contents.themes })
    .from(schema.contents)
    .where(and(eq(schema.contents.kind, "live"), eq(schema.contents.visible, true), isNotNull(schema.contents.epgChannelId), withGuide));
  return {
    markets: [...new Set(rows.map((r) => r.market).filter((m): m is string => Boolean(m)))].sort(),
    themes: [...new Set(rows.flatMap((r) => r.themes))].sort((a, b) => a.localeCompare(b, "fr")),
  };
}

/** One guide id: the channels showing it (name, logo), for the correction panel. */
export async function channelsOfGuide(epgId: string) {
  return db
    .select({ title: schema.contents.title, logo: schema.contents.logoUrl, market: schema.contents.market })
    .from(schema.contents)
    .where(and(eq(schema.contents.kind, "live"), eq(schema.contents.visible, true), eq(schema.contents.epgChannelId, epgId)))
    .orderBy(asc(schema.contents.title));
}
