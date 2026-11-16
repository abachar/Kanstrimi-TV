import { and, asc, eq, ne, sql } from "drizzle-orm";
import { db, schema, inDisabledAccount, visibleItem, type ReferenceChannel } from "@/db";
import { similarity, similarityKey, slug } from "@/shared";
import { countriesOf, type Index, loadIndex, nameKeys, rematchChannels, WATCHED_SHARE } from "./channels";
import { EVENTS_THEME, LIVE_THEMES, REGIONS, UNKNOWN_THEME, type LiveTheme } from "./naming";

/**
 * The reference channels of ours (`curation_channels`, the admin's Live screen) and what is left to attach
 * to the reference: the live names no channel was found for. A name is attached once, for every
 * provider: it becomes an alias of a channel of ours, created from the iptv-org channel when that one
 * had no row of ours in the market yet. Every change reads the market's variants again at once.
 */

/** What a reference channel may be filed under: our themes, without the two that say « no reference ». */
export const REFERENCE_THEMES: readonly LiveTheme[] = LIVE_THEMES.filter((t) => t !== EVENTS_THEME && t !== UNKNOWN_THEME);

/** A refusal the admin shows as is. */
export class ChannelError extends Error {}

export type ChannelInput = {
  name: string;
  market: string;
  /** In a regional market: null = the usual rule, "" = the whole region, else a country code. */
  country: string | null;
  /** Null = iptv-org's theme. */
  theme: string | null;
  aliases: string[];
  iptvId: string | null;
};

/** The input as it is stored, or why it cannot be: every name of a channel must designate it alone in its market. */
async function checked(input: ChannelInput, id?: number): Promise<ChannelInput> {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (!name || name.length > 80) throw new ChannelError("Le nom est obligatoire (80 caractères au plus)");
  const market = input.market.trim().toLowerCase();
  if (!/^[a-z][a-z-]{1,7}$/.test(market)) throw new ChannelError("Le marché est un code court : fr, ar, uk…");
  const country = input.country === null ? null : input.country.trim().toUpperCase();
  if (country && !REGIONS[market]?.includes(country))
    throw new ChannelError(
      REGIONS[market] ? `« ${country} » n'est pas un pays de ce marché` : "Seul un marché régional se découpe par pays",
    );
  const theme = input.theme?.trim() || null;
  if (theme && !(REFERENCE_THEMES as readonly string[]).includes(theme)) throw new ChannelError(`Thème inconnu : ${theme}`);
  const aliases = [...new Set(input.aliases.map((a) => a.trim().replace(/\s+/g, " ")).filter(Boolean))];
  let iptvId = input.iptvId?.trim() || null;
  if (iptvId) {
    const [known] = await db
      .select({ id: schema.iptvorgChannels.id })
      .from(schema.iptvorgChannels)
      .where(sql`lower(${schema.iptvorgChannels.id}) = ${iptvId.toLowerCase()}`);
    if (!known) throw new ChannelError(`Chaîne iptv-org inconnue : ${iptvId}`);
    iptvId = known.id;
  }
  const c = schema.curationChannels;
  const others = await db
    .select()
    .from(c)
    .where(and(eq(c.market, market), id ? ne(c.id, id) : undefined));
  const mine = new Set([name, ...aliases].flatMap(nameKeys));
  for (const o of others) {
    if (slug(o.name) === slug(name)) throw new ChannelError(`« ${o.name} » existe déjà dans ce marché`);
    if (iptvId && o.iptvId === iptvId) throw new ChannelError(`« ${o.name} » complète déjà ${iptvId} dans ce marché`);
    const shared = [o.name, ...o.aliases].find((n) => nameKeys(n).some((k) => mine.has(k)));
    if (shared) throw new ChannelError(`« ${shared} » est déjà un nom de « ${o.name} »`);
  }
  return { name, market, country, theme, aliases, iptvId };
}

export async function createChannel(input: ChannelInput): Promise<number> {
  const values = await checked(input);
  const [row] = await db.insert(schema.curationChannels).values(values).returning({ id: schema.curationChannels.id });
  await rematchChannels(values.market);
  return row.id;
}

export async function updateChannel(id: number, input: ChannelInput): Promise<void> {
  const [before] = await db.select().from(schema.curationChannels).where(eq(schema.curationChannels.id, id));
  if (!before) throw new ChannelError("Chaîne introuvable");
  const values = await checked(input, id);
  await db
    .update(schema.curationChannels)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(schema.curationChannels.id, id));
  await rematchChannels(values.market);
  if (before.market !== values.market) await rematchChannels(before.market);
}

export async function deleteChannel(id: number): Promise<void> {
  const [row] = await db.delete(schema.curationChannels).where(eq(schema.curationChannels.id, id)).returning();
  if (row) await rematchChannels(row.market);
}

export const referenceChannelById = async (id: number): Promise<ReferenceChannel | null> =>
  (await db.select().from(schema.curationChannels).where(eq(schema.curationChannels.id, id)))[0] ?? null;

export type LiveMarketStat = {
  market: string;
  /** Recognised channels: one per reference channel a provider in use carries. */
  channels: number;
  /** Names left without a reference channel, and names of event feeds. */
  unknown: number;
  events: number;
  watched: boolean;
};
export type LiveSummary = { markets: LiveMarketStat[] /** The channels the profile gets in the app. */; shown: number };

/**
 * The live catalogue at a glance, for the providers in use: per market, the channels of the reference,
 * the names left to attach and the event feeds; `watched` when the profiles see a fair share of its
 * channels (`WATCHED_SHARE`). And how many channels this profile is shown.
 */
export async function liveSummary(profileId: number): Promise<LiveSummary> {
  const v = schema.catalogVariants;
  const title = sql`coalesce(nullif(${v.cleanTitle}, ''), ${v.name})`;
  const rows = await db
    .select({
      market: v.market,
      channels: sql<number>`count(distinct ${v.contentKey}) filter (where ${v.channelName} is not null)::int`,
      unknown: sql<number>`count(distinct ${title}) filter (where ${v.channelName} is null and ${v.theme} is distinct from ${EVENTS_THEME})::int`,
      events: sql<number>`count(distinct ${title}) filter (where ${v.channelName} is null and ${v.theme} = ${EVENTS_THEME})::int`,
      watched: sql<boolean>`count(*) filter (where ${v.channelName} is not null and ${visibleItem}) > 0
        and count(*) filter (where ${v.channelName} is not null and ${visibleItem}) >= ${WATCHED_SHARE}::float8 * count(*) filter (where ${v.channelName} is not null)`,
    })
    .from(v)
    .where(and(eq(v.kind, "live"), sql`${v.market} is not null`, sql`not ${inDisabledAccount}`))
    .groupBy(v.market);
  const [seen] = await db.execute<{ n: number }>(sql`
    select count(*)::int as n from catalog_content_profiles p join catalog_contents c on c.id = p.content_id
    where p.profile_id = ${profileId} and c.kind = 'live'`);
  return {
    markets: rows
      .map((r) => ({ ...r, market: r.market! }))
      .sort((a, b) => Number(b.watched) - Number(a.watched) || b.channels + b.unknown - (a.channels + a.unknown)),
    shown: seen.n,
  };
}

export type ChannelRow = {
  id: number;
  title: string;
  country: string | null;
  themes: string[];
  logoUrl: string | null;
  versions: number;
  /** A profile at least gets it in the app. */
  visible: boolean;
};
/** The channels of the reference a market holds among the providers in use, by name. */
export async function listChannels(opts: { market: string; page: number; size: number }): Promise<{ rows: ChannelRow[]; total: number }> {
  const rows = await db.execute<ChannelRow & { total: number }>(sql`
    select c.id, c.title, c.country, c.themes, c.logo_url as "logoUrl", c.visible,
           (select count(*)::int from catalog_variants v where v.content_id = c.id) as versions, (count(*) over ())::int as total
    from catalog_contents c
    where c.kind = 'live' and c.market = ${opts.market} and c.key not like 'live:x:%'
      and exists (select 1 from catalog_variants v join provider_accounts a on a.id = v.account_id and a.enabled where v.content_id = c.id)
    order by c.title, c.id
    limit ${opts.size} offset ${(opts.page - 1) * opts.size}`);
  return { total: rows[0]?.total ?? 0, rows: rows.map(({ total: _, ...r }) => r) };
}

/**
 * What a live content is in the reference, for its page: the name it goes by there, the iptv-org
 * channel and the row of ours behind it (none of ours: iptv-org alone knows it; neither: its name is
 * left to attach, `title`), and one of its variants to come back to once the reference changed.
 */
export type ContentChannel = {
  market: string | null;
  name: string | null;
  iptv: { id: string; name: string } | null;
  own: ReferenceChannel | null;
  title: string;
  variantId: number;
};
export async function contentChannel(contentId: number): Promise<ContentChannel | null> {
  const v = schema.catalogVariants;
  const [row] = await db
    .select()
    .from(v)
    .where(and(eq(v.kind, "live"), eq(v.contentId, contentId)))
    .orderBy(sql`${v.channelId} is null`, sql`${v.channelName} is null`, asc(v.id))
    .limit(1);
  if (!row) return null;
  const [iptv] = row.iptvId
    ? await db
        .select({ id: schema.iptvorgChannels.id, name: schema.iptvorgChannels.name })
        .from(schema.iptvorgChannels)
        .where(eq(schema.iptvorgChannels.id, row.iptvId))
    : [];
  return {
    market: row.market,
    name: row.channelName,
    iptv: iptv ?? null,
    own: row.channelId ? await referenceChannelById(row.channelId) : null,
    title: row.cleanTitle || row.name,
    variantId: row.id,
  };
}

/** A reference channel a name could be: `ref` is `own:<id>` or `iptv:<id>`. */
export type Candidate = { ref: string; name: string; country: string | null; own: boolean; score: number };
type Pooled = Omit<Candidate, "score"> & { names: string[]; local: boolean };

/** `similarityKey` without its spaces: « Al-Resala » and « AL RESALA » meet. */
const compact = (s: string) => similarityKey(s).replace(/ /g, "");
const numbers = (s: string) => (s.match(/\d+/g) ?? []).join(" ");
/** One name opening the other counts as close (« AUTOMOTO » and « Automoto la chaine »), when it is long enough to mean something. */
const PREFIX_MIN = 5;
const PREFIX_SCORE = 0.85;

/**
 * How close a name is to one of a channel's: their similarity, or `PREFIX_SCORE` when one opens the
 * other. Never across numbers: « RMC SPORT 1 » is not « RMC Sport 2 ».
 */
function closeness(title: string, names: string[]): number {
  const t = compact(title);
  return Math.max(
    0,
    ...names.map((name) => {
      const n = compact(name);
      if (numbers(t) !== numbers(n)) return 0;
      const opens = Math.min(t.length, n.length) >= PREFIX_MIN && (n.startsWith(t) || t.startsWith(n));
      return Math.max(similarity(t, n), opens ? PREFIX_SCORE : 0);
    }),
  );
}

/** Close enough to be offered next to a name, one click away: a wrong one would merge two channels. */
const SUGGEST_THRESHOLD = 0.75;
/** On a name's own page, where the channel is chosen with its variants in view. */
const CANDIDATE_THRESHOLD = 0.45;

/**
 * The reference channels of a market by name: ours, then iptv-org's in its countries, or in every
 * country (without those ours complete).
 */
function marketChannels(idx: Index, market: string, everywhere = false): Pooled[] {
  const own = [...idx.own.values()].filter((o) => o.market === market);
  const completed = new Set(own.map((o) => o.iptvId?.toLowerCase()).filter(Boolean));
  const countries = new Set(countriesOf(market));
  return [
    ...own.map((o) => ({
      ref: `own:${o.id}`,
      name: o.name,
      country: o.country || null,
      own: true,
      local: true,
      names: [o.name, ...o.aliases],
    })),
    ...[...idx.byId.values()]
      .filter((ch) => (everywhere || countries.has(ch.country)) && !completed.has(ch.id.toLowerCase()))
      .map((ch) => ({
        ref: `iptv:${ch.id}`,
        name: ch.name,
        country: ch.country,
        own: false,
        local: countries.has(ch.country),
        names: ch.names,
      })),
  ];
}

/** The closest first; at the same distance ours, then the others by name. */
const ranked = (pool: Pooled[], title: string, floor: number, limit: number): Candidate[] =>
  pool
    .map(({ names, local: _, ...c }) => ({ ...c, score: closeness(title, names) }))
    .filter((c) => c.score >= floor)
    .sort((a, b) => b.score - a.score || Number(b.own) - Number(a.own) || a.name.localeCompare(b.name))
    .slice(0, limit);

/**
 * The reference channels a name could be attached to: the closest of its market; with `q`, every
 * channel of the reference one of whose names holds these words, the market's own first, then the
 * shortest names (the closest to the words).
 */
export async function nameCandidates(market: string, title: string, q = ""): Promise<Candidate[]> {
  const idx = await loadIndex();
  if (!q.trim()) return ranked(marketChannels(idx, market), title, CANDIDATE_THRESHOLD, 12);
  const words = compact(q);
  return marketChannels(idx, market, true)
    .filter((c) => c.names.some((n) => compact(n).includes(words)))
    .sort((a, b) => Number(b.local) - Number(a.local) || a.name.length - b.name.length || a.name.localeCompare(b.name))
    .slice(0, 40)
    .map(({ names: _, local: __, ...c }) => ({ ...c, score: 0 }));
}

export type UnmatchedName = {
  market: string;
  title: string;
  variants: number;
  providers: number;
  category: string | null;
  /** One of the names as the provider writes it. */
  sample: string;
  /** What Claude read in it, when asked. */
  aiKind: string | null;
  aiTitle: string | null;
  suggestions: Candidate[];
};

/**
 * The names of a market left without a reference channel, the most frequent first: the unknown ones or
 * the event feeds, each with the closest channels of the reference.
 */
export async function unmatchedNames(opts: {
  market: string;
  events: boolean;
  q?: string;
  page: number;
  size: number;
}): Promise<{ rows: UnmatchedName[]; total: number }> {
  const like = opts.q?.trim() ? `%${opts.q.trim().replace(/[\\%_]/g, "\\$&")}%` : null;
  const rows = await db.execute<Omit<UnmatchedName, "suggestions"> & { total: number }>(sql`
    select v.market, coalesce(nullif(v.clean_title, ''), v.name) as title, count(*)::int as variants,
           count(distinct v.account_id)::int as providers, min(c.name) as category, min(v.name) as sample,
           max(v.ai_kind) as "aiKind", max(v.ai_title) as "aiTitle", (count(*) over ())::int as total
    from ${schema.catalogVariants} v
    left join ${schema.catalogCategories} c on c.account_id = v.account_id and c.kind = v.kind and c.xtream_id = v.category_xtream_id
    where v.kind = 'live' and v.channel_name is null and v.market = ${opts.market}
      and exists (select 1 from provider_accounts a where a.id = v.account_id and a.enabled)
      and ${opts.events ? sql`v.theme = ${EVENTS_THEME}` : sql`v.theme is distinct from ${EVENTS_THEME}`}
      ${like ? sql`and (v.clean_title ilike ${like} or v.name ilike ${like})` : sql``}
    group by v.market, coalesce(nullif(v.clean_title, ''), v.name)
    order by count(*) desc, 2
    limit ${opts.size} offset ${(opts.page - 1) * opts.size}`);
  const pool = rows.length ? marketChannels(await loadIndex(), opts.market) : [];
  return {
    total: rows[0]?.total ?? 0,
    rows: rows.map(({ total: _, ...r }) => ({ ...r, suggestions: ranked(pool, r.title, SUGGEST_THRESHOLD, 2) })),
  };
}

export type UnmatchedVariant = { id: number; name: string; provider: string; category: string | null; contentId: number | null };
/** The variants that bear a name left without a reference channel. */
export async function unmatchedVariants(market: string, title: string): Promise<UnmatchedVariant[]> {
  const v = schema.catalogVariants;
  const c = schema.catalogCategories;
  return db
    .select({ id: v.id, name: v.name, provider: schema.providerAccounts.name, category: c.name, contentId: v.contentId })
    .from(v)
    .innerJoin(schema.providerAccounts, eq(schema.providerAccounts.id, v.accountId))
    .leftJoin(c, and(eq(c.accountId, v.accountId), eq(c.kind, v.kind), eq(c.xtreamId, v.categoryXtreamId)))
    .where(
      and(
        eq(v.kind, "live"),
        eq(v.market, market),
        eq(schema.providerAccounts.enabled, true),
        sql`${v.channelName} is null`,
        sql`coalesce(nullif(${v.cleanTitle}, ''), ${v.name}) = ${title}`,
      ),
    )
    .orderBy(asc(schema.providerAccounts.position), asc(v.position));
}

/**
 * Attaches a name to a reference channel, for every provider: an alias of a channel of ours
 * (`own:<id>`), or of the iptv-org channel (`iptv:<id>`), which then gets a row of ours in this
 * market, under its iptv-org name and its usual theme and country. Returns the channel's name.
 */
export async function attachName(market: string, title: string, ref: string): Promise<string> {
  const c = schema.curationChannels;
  const [kind, id] = [ref.slice(0, ref.indexOf(":")), ref.slice(ref.indexOf(":") + 1)];
  let target: ReferenceChannel | undefined;
  if (kind === "own" && /^\d+$/.test(id))
    [target] = await db
      .select()
      .from(c)
      .where(eq(c.id, Number(id)));
  else if (kind === "iptv")
    [target] = await db
      .select()
      .from(c)
      .where(and(eq(c.market, market), eq(c.iptvId, id)));
  else throw new ChannelError("Chaîne de référence illisible");
  if (target) {
    await updateChannel(target.id, { ...target, aliases: [...target.aliases, title] });
    return target.name;
  }
  if (kind === "own") throw new ChannelError("Chaîne introuvable");
  const [iptv] = await db.select().from(schema.iptvorgChannels).where(eq(schema.iptvorgChannels.id, id));
  if (!iptv) throw new ChannelError(`Chaîne iptv-org inconnue : ${id}`);
  await createChannel({ name: iptv.name, market, country: null, theme: null, aliases: [title], iptvId: iptv.id });
  return iptv.name;
}
