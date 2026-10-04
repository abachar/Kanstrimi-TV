import { and, asc, eq, sql } from "drizzle-orm";
import { db, schema, type EpgSource, type EpgSourceChannel } from "@/db";
import { listEpgSources, resolveEpgLinks, sourceGuideId, type EpgLinkState } from "@/catalog";
import { searchText } from "@/shared";

/** What the fallback sources' screens read: the list on the EPG page, and one source with its channels and ours. */

export type SourceRow = EpgSource & { linked: number };

/** The sources in order, each with the number of visible channels whose guide it gives. */
export async function sourceRows(): Promise<SourceRow[]> {
  const [sources, counts] = await Promise.all([
    listEpgSources(),
    db.execute<{ s: number; n: number }>(sql`
      select substring(epg_fallback_id from '^@([0-9]+)/')::int as s, count(*)::int as n
      from ${schema.catalogContents}
      where kind = 'live' and visible and epg_fallback_id is not null
      group by 1`),
  ]);
  const linked = new Map(counts.map((r) => [r.s, r.n]));
  return sources.map((s) => ({ ...s, linked: linked.get(s.id) ?? 0 }));
}

export type OurChannel = {
  id: number;
  key: string;
  title: string;
  logo: string | null;
  market: string | null;
  country: string | null;
  /** The provider files programmes for it. */
  guided: boolean;
  link: EpgLinkState | null;
  /** The admin keeps this source away from it. */
  refused: boolean;
  /** The guide the app falls back on, whichever source gives it. */
  fallbackId: string | null;
};
export type SourceChannel = EpgSourceChannel & { linkedTo: { id: number; title: string; manual: boolean }[] };

export type OursShow = "missing" | "linked" | "all";
export type TheirsShow = "all" | "linked" | "free";
export const OURS_SHOW: readonly OursShow[] = ["missing", "linked", "all"];
export const THEIRS_SHOW: readonly TheirsShow[] = ["all", "linked", "free"];
export const OURS_PER_PAGE = 50;
export const THEIRS_PER_PAGE = 100;

export type SourcePageQuery = { tab: "ours" | "theirs"; q: string; show: string; page: number };

/** A source, its channels, and our visible channels with their link to it: the page filters and pages them. */
export async function sourcePage(source: EpgSource, query: SourcePageQuery) {
  const [channels, res, contents] = await Promise.all([
    db
      .select()
      .from(schema.catalogEpgSourceChannels)
      .where(eq(schema.catalogEpgSourceChannels.sourceId, source.id))
      .orderBy(asc(schema.catalogEpgSourceChannels.channelId)),
    resolveEpgLinks(),
    db
      .select({
        id: schema.catalogContents.id,
        key: schema.catalogContents.key,
        title: schema.catalogContents.title,
        logo: schema.catalogContents.logoUrl,
        market: schema.catalogContents.market,
        country: schema.catalogContents.country,
        fallbackId: schema.catalogContents.epgFallbackId,
      })
      .from(schema.catalogContents)
      .where(and(eq(schema.catalogContents.kind, "live"), eq(schema.catalogContents.visible, true)))
      .orderBy(asc(schema.catalogContents.title), asc(schema.catalogContents.id)),
  ]);
  const links = res.links.get(source.id) ?? new Map<string, EpgLinkState>();
  const refused = res.refused.get(source.id) ?? new Set<string>();
  const guided = new Set(res.contents.filter((c) => c.guided).map((c) => c.key));
  const ours: OurChannel[] = contents.map((c) => ({
    ...c,
    guided: guided.has(c.key),
    link: links.get(c.key) ?? null,
    refused: refused.has(c.key),
  }));
  const byChannel = new Map<string, SourceChannel["linkedTo"]>();
  for (const c of ours)
    if (c.link)
      byChannel.set(c.link.channelId, [...(byChannel.get(c.link.channelId) ?? []), { id: c.id, title: c.title, manual: c.link.manual }]);
  const theirs: SourceChannel[] = channels.map((ch) => ({ ...ch, linkedTo: byChannel.get(ch.channelId) ?? [] }));

  const q = searchText(query.q.trim());
  const ourRows = ours.filter(
    (c) => (!q || searchText(c.title).includes(q)) && (query.show === "all" || (query.show === "linked" ? c.link !== null : !c.guided)),
  );
  const theirRows = theirs.filter(
    (ch) =>
      (!q || [ch.channelId, ...ch.names].some((n) => searchText(n).includes(q))) &&
      (query.show === "linked" ? ch.linkedTo.length > 0 : query.show === "free" ? ch.linkedTo.length === 0 : true),
  );
  const size = query.tab === "ours" ? OURS_PER_PAGE : THEIRS_PER_PAGE;
  const slice = <T>(rows: T[]) => rows.slice((query.page - 1) * size, query.page * size);
  return {
    channels: theirs,
    ours: slice(ourRows),
    oursTotal: ourRows.length,
    theirs: slice(theirRows),
    theirsTotal: theirRows.length,
    counts: {
      missing: ours.filter((c) => !c.guided).length,
      linked: ours.filter((c) => c.link).length,
      used: ours.filter((c) => c.fallbackId?.startsWith(sourceGuideId(source.id, ""))).length,
    },
  };
}
