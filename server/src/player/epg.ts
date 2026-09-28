import { client } from "@/db";
import type { Programme } from "./types";

/** What a channel shows now and next, and whether the guide knows it at all. */
export type ChannelEpg = { now: Programme | null; next: Programme | null; hasEpg: boolean };

type Row = {
  id: string;
  has_epg: boolean;
  now_title: string | null;
  now_start: string | null;
  now_end: string | null;
  now_overview: string | null;
  next_title: string | null;
  next_start: string | null;
  next_end: string | null;
  next_overview: string | null;
};
const programme = (title: string | null, start: string | null, end: string | null, overview: string | null): Programme | null =>
  title && start && end ? { title, start: new Date(start).toISOString(), end: new Date(end).toISOString(), overview } : null;

/** One query for any number of channels: the current programme, the following one, and the guide's coverage. */
export async function epgOf(channelIds: string[]): Promise<Map<string, ChannelEpg>> {
  const ids = [...new Set(channelIds.filter(Boolean))];
  if (!ids.length) return new Map();
  // postgres-js template, not drizzle's `sql`: the latter spreads an array parameter into a list.
  const rows = await client<Row[]>`
    select u.id,
           exists (select 1 from epg_programmes e where e.channel_id = u.id) as has_epg,
           n.title as now_title, n.start_at::text as now_start, n.end_at::text as now_end, n.overview as now_overview,
           x.title as next_title, x.start_at::text as next_start, x.end_at::text as next_end, x.overview as next_overview
    from unnest(${ids}::text[]) as u(id)
    left join lateral (
      select title, start_at, end_at, overview from epg_programmes e
      where e.channel_id = u.id and e.start_at <= now() and e.end_at > now()
      order by e.start_at desc limit 1) n on true
    left join lateral (
      select title, start_at, end_at, overview from epg_programmes e
      where e.channel_id = u.id and e.start_at > now()
      order by e.start_at limit 1) x on true`;
  return new Map(
    rows.map((r) => [
      r.id,
      {
        hasEpg: r.has_epg,
        now: programme(r.now_title, r.now_start, r.now_end, r.now_overview),
        next: programme(r.next_title, r.next_start, r.next_end, r.next_overview),
      },
    ]),
  );
}
