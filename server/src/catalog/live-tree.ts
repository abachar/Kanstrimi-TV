import { sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { LIVE_THEMES } from "./naming";
import { type Candidate, suggestionsFor } from "./reference";

/**
 * The live catalogue as one tree, place → theme → channels: every channel a provider in use carries,
 * the reference's as well as the names left without one (« Non reconnus ») and the event feeds
 * (« Événements »), each a channel under its own name. A place is the channel's country, else the
 * region its provider files it in, its market (the pan-Arab channels under « Monde arabe »). A search in
 * the filter language (`where`, a condition on `catalog_channels`, never aliased) only prunes it.
 */

const c = schema.catalogChannels;
/** What a tree is read on: the database, or the transaction that carries a search's time limit. */
type Exec = Pick<typeof db, "execute">;

/** On a stream of a provider in use: a channel only a disabled provider carries, or none any more, is not listed. */
const carried = sql`exists (
  select 1 from catalog_streams cs join xtream_streams s on s.id = cs.xtream_id
  join xtream_accounts a on a.id = s.account_id and a.enabled
  where cs.channel_id = ${c.id})`;
const also = (where: SQL | null) => (where ? sql`and ${where}` : sql``);
/**
 * A name to sort by, the same on every database: without case nor accents, compared byte by byte. A
 * database's own collation decides otherwise where « beIN » goes (after « Z » on one that compares bytes).
 */
export const byName = (name: SQL | typeof c.name) => sql`unaccent(lower(${name})) collate "C"`;

/** A place's key: its country's code (« FR »), else « ~ » and its market (« ~ar », « ~ » without one). */
export const placeKey = (country: string | null, market: string | null) => country ?? `~${market ?? ""}`;
const place = sql`coalesce(${c.country}, '~' || coalesce(${c.market}, ''))`;
export type LiveBranch = { theme: string | null; channels: number /** Seen by a profile at least. */; visible: number };
export type LivePlace = {
  place: string;
  /** Its country's code, or the market of a region. */
  country: string | null;
  market: string | null;
  channels: number;
  visible: number;
  themes: LiveBranch[];
};

const themeRank = (t: string | null) => {
  const i = (LIVE_THEMES as readonly string[]).indexOf(t ?? "");
  return i < 0 ? LIVE_THEMES.length : i;
};

/**
 * The tree down to its themes, with what each branch counts: the places the profiles see the most of
 * first, then the largest; the themes in the app's order, « Événements » and « Non reconnus » last.
 */
export async function liveTree(where: SQL | null, ex: Exec = db): Promise<LivePlace[]> {
  const rows = await ex.execute<{
    place: string;
    country: string | null;
    market: string | null;
    theme: string | null;
    channels: number;
    visible: number;
  }>(sql`
    select ${place} as place, ${c.country} as country, (case when ${c.country} is null then ${c.market} end) as market, ${c.theme} as theme,
           count(*)::int as channels, (count(*) filter (where ${c.visible}))::int as visible
    from ${c}
    where ${carried} ${also(where)}
    group by 1, 2, 3, 4`);
  const places = new Map<string, LivePlace>();
  for (const r of rows) {
    const p = places.get(r.place) ?? { place: r.place, country: r.country, market: r.market, channels: 0, visible: 0, themes: [] };
    p.channels += r.channels;
    p.visible += r.visible;
    p.themes.push({ theme: r.theme, channels: r.channels, visible: r.visible });
    places.set(r.place, p);
  }
  for (const p of places.values())
    p.themes.sort((a, b) => themeRank(a.theme) - themeRank(b.theme) || (a.theme ?? "").localeCompare(b.theme ?? ""));
  return [...places.values()].sort((a, b) => b.visible - a.visible || b.channels - a.channels || a.place.localeCompare(b.place));
}

/** How many channels a search finds: what a shortcut of the Live screen counts. */
export async function countLiveChannels(where: SQL | null, ex: Exec = db): Promise<number> {
  const [r] = await ex.execute<{ n: number }>(sql`select count(*)::int as n from ${c} where ${carried} ${also(where)}`);
  return r.n;
}

export type LiveChannel = {
  id: number;
  name: string;
  market: string | null;
  theme: string | null;
  /** `known`: a channel of the reference; `unknown`, `event`: a name left under itself. */
  status: "known" | "unknown" | "event";
  country: string | null;
  logoUrl: string | null;
  maxQualityRank: number | null;
  /** Seen by a profile at least. */
  visible: boolean;
  /** Its streams among the providers in use. */
  streams: number;
  /** One of them as its provider names it, and a category it is filed under. */
  sample: string | null;
  category: string | null;
  /** What Claude read in its name, when asked: a name left without a channel only. */
  aiKind: string | null;
  aiName: string | null;
  /** Its streams that are on it through the name Claude read in theirs, as their providers name them. */
  byClaude: string[];
  /** A name left: the closest channels of the reference, one click away. */
  suggestions: Candidate[];
};

/**
 * The channels of the tree a search keeps, of one branch (`place`, a key; `theme`, null: the channels
 * without one) or of all of them: a channel of the reference by name (`byName`), the names left by the number
 * of their streams (the most frequent first: attaching it settles the most).
 */
export async function liveChannels(
  where: SQL | null,
  opts: { place?: string; theme?: string | null; offset: number; limit: number },
  ex: Exec = db,
): Promise<LiveChannel[]> {
  const inPlace = opts.place === undefined ? sql`` : sql`and ${place} = ${opts.place}`;
  const inTheme =
    opts.theme === undefined ? sql`` : opts.theme === null ? sql`and ${c.theme} is null` : sql`and ${c.theme} = ${opts.theme}`;
  const rows = await ex.execute<Omit<LiveChannel, "suggestions">>(sql`
    select ${c.id} as id, ${c.name} as name, ${c.market} as market, ${c.theme} as theme, ${c.status} as status, ${c.country} as country,
           ${c.logoUrl} as "logoUrl", ${c.maxQualityRank} as "maxQualityRank", ${c.visible} as visible,
           ${c.aiKind} as "aiKind", ${c.aiName} as "aiName", x.streams, x.sample, x.category, x.by_claude as "byClaude"
    from ${c}
    cross join lateral (
      select count(*)::int as streams, min(s.name) as sample, min(k.name) as category,
             coalesce(array_agg(distinct s.name order by s.name) filter (where cs.how = 'ai'), '{}') as by_claude
      from catalog_streams cs join xtream_streams s on s.id = cs.xtream_id
      join xtream_accounts a on a.id = s.account_id and a.enabled
      left join xtream_categories k on k.account_id = s.account_id and k.kind = s.kind and k.xtream_id = s.category_xtream_id
      where cs.channel_id = ${c.id}) x
    where x.streams > 0 ${inPlace} ${inTheme} ${also(where)}
    order by (case when ${c.status} = 'known' then 0 else x.streams end) desc, ${byName(c.name)}, ${c.id}
    limit ${opts.limit} offset ${opts.offset}`);
  const loose = rows.filter((r) => r.status !== "known" && r.market);
  const suggested = await suggestionsFor(loose.map((r) => ({ market: r.market!, title: r.name })));
  const byId = new Map(loose.map((r, i) => [r.id, suggested[i]]));
  return rows.map((r) => ({ ...r, suggestions: byId.get(r.id) ?? [] }));
}
