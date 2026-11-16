import { and, asc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { db, schema, inDisabledAccount, variants, visibleItem, type Channel, type ReferenceChannel } from "@/db";
import { similarity, similarityKey, slug } from "@/shared";
import {
  countriesOf,
  type Index,
  isOurs,
  loadIndex,
  nameKeys,
  referenceOf,
  rematchChannels,
  WATCHED_SHARE,
  WATCHED_STREAMS,
} from "./channels";
import { contentKey } from "./keys";
import { followLiveKeys } from "./grouping/group";
import { EVENTS_THEME, LIVE_THEMES, REGIONS, UNKNOWN_THEME, type LiveTheme } from "./naming";

/**
 * The reference channels of ours (`catalog_channels` with aliases or fields set by hand, the admin's Live screen) and what is left to attach
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
      .select({ id: schema.cacheIptvorgChannels.id })
      .from(schema.cacheIptvorgChannels)
      .where(sql`lower(${schema.cacheIptvorgChannels.id}) = ${iptvId.toLowerCase()}`);
    if (!known) throw new ChannelError(`Chaîne iptv-org inconnue : ${iptvId}`);
    iptvId = known.id;
  }
  const c = schema.catalogChannels;
  const others = await db
    .select()
    .from(c)
    .where(and(eq(c.market, market), isOurs, id ? ne(c.id, id) : undefined));
  const mine = new Set([name, ...aliases].flatMap(nameKeys));
  for (const o of others) {
    if (slug(o.name) === slug(name)) throw new ChannelError(`« ${o.name} » existe déjà dans ce marché`);
    if (iptvId && o.iptvId === iptvId) throw new ChannelError(`« ${o.name} » complète déjà ${iptvId} dans ce marché`);
    const shared = [o.name, ...o.aliases].find((n) => nameKeys(n).some((k) => mine.has(k)));
    if (shared) throw new ChannelError(`« ${shared} » est déjà un nom de « ${o.name} »`);
  }
  return { name, market, country, theme, aliases, iptvId };
}

/** The key of a channel of the reference in its market: what its variants are grouped under (`contentKey`). */
const keyOf = (v: Pick<ChannelInput, "name" | "market">) =>
  contentKey({ kind: "live", title: v.name, market: v.market, channelName: v.name });

/**
 * What the form says, as the columns of the channel: the fields it sets by hand are named in `edited`
 * (a theme, a country, a name that is not iptv-org's), the others stay what the variants give.
 */
async function columnsOf(v: ChannelInput) {
  const [iptv] = v.iptvId
    ? await db
        .select({ name: schema.cacheIptvorgChannels.name })
        .from(schema.cacheIptvorgChannels)
        .where(eq(schema.cacheIptvorgChannels.id, v.iptvId))
    : [];
  const edited = [v.name !== iptv?.name ? "name" : null, v.theme !== null ? "theme" : null, v.country !== null ? "country" : null];
  return {
    key: keyOf(v),
    name: v.name,
    market: v.market,
    status: "known" as const,
    aliases: v.aliases,
    iptvId: v.iptvId,
    edited: edited.filter((x): x is string => x !== null),
    ...(v.theme !== null ? { theme: v.theme } : {}),
    ...(v.country !== null ? { country: v.country || null } : {}),
    updatedAt: new Date(),
  };
}

/** A channel the reference did not have under this name in this market, or the one it had: it becomes ours. */
export async function createChannel(input: ChannelInput): Promise<number> {
  const values = await columnsOf(await checked(input));
  const c = schema.catalogChannels;
  const [row] = await db
    .insert(c)
    .values({ ...values, addedAt: new Date() })
    .onConflictDoUpdate({ target: c.key, set: values })
    .returning({ id: c.id });
  await rematchChannels(values.market);
  return row.id;
}

export async function updateChannel(id: number, input: ChannelInput): Promise<void> {
  const c = schema.catalogChannels;
  const [before] = await db.select().from(c).where(eq(c.id, id));
  if (!before) throw new ChannelError("Chaîne introuvable");
  const values = await columnsOf(await checked(input, id));
  await db.transaction(async (tx) => {
    // Renamed onto a channel the admin never touched (`checked` refuses one of ours): that one gives way, its variants come here.
    if (values.key !== before.key) await tx.delete(c).where(eq(c.key, values.key));
    // A new name is indexed again for the search (`fillChannelSearch`).
    await tx
      .update(c)
      .set({ ...values, ...(values.name !== before.name ? { search: null } : {}) })
      .where(eq(c.id, id));
  });
  // The same channel under a new key: what the profiles recorded under the old one follows.
  if (values.key !== before.key) await followLiveKeys(new Map([[before.key, new Map([[values.key, 1]])]]));
  await rematchChannels(values.market);
  if (before.market && before.market !== values.market) await rematchChannels(before.market);
}

/** Forgets what the admin said of a channel: it is the providers' and iptv-org's again, and goes when no variant is left on it. */
export async function deleteChannel(id: number): Promise<void> {
  const c = schema.catalogChannels;
  const [row] = await db.update(c).set({ aliases: [], edited: [], updatedAt: new Date() }).where(eq(c.id, id)).returning();
  if (!row) return;
  if (row.market) await rematchChannels(row.market);
  await db.delete(c).where(and(eq(c.id, id), sql`not exists (select 1 from catalog_streams v where v.channel_id = ${c.id})`));
}

/** A channel of ours by its id; null when the admin said nothing of it. */
export async function referenceChannelById(id: number): Promise<ReferenceChannel | null> {
  const c = schema.catalogChannels;
  const [row] = await db
    .select()
    .from(c)
    .where(and(eq(c.id, id), isOurs));
  return row ? referenceOf(row) : null;
}

/**
 * The markets the household watches, for the providers in use: those whose recognised channels the
 * profiles see a fair share of (`WATCHED_SHARE`, `WATCHED_STREAMS`), the largest first.
 */
export async function watchedMarkets(): Promise<string[]> {
  const v = variants;
  const recognised = sql`${v.channelName} is not null`;
  const rows = await db
    .select({ market: v.market })
    .from(v)
    .where(and(eq(v.kind, "live"), sql`${v.market} is not null`, sql`not ${inDisabledAccount}`))
    .groupBy(v.market)
    .having(
      sql`count(*) filter (where ${recognised} and ${visibleItem}) > 0
        and (count(*) filter (where ${recognised} and ${visibleItem}) >= ${WATCHED_STREAMS}
          or count(*) filter (where ${recognised} and ${visibleItem}) = count(*) filter (where ${recognised}))
        and count(*) filter (where ${recognised} and ${visibleItem}) >= ${WATCHED_SHARE}::float8 * count(*) filter (where ${recognised})`,
    )
    .orderBy(sql`count(distinct ${v.contentKey}) filter (where ${recognised}) desc`, asc(v.market));
  return rows.map((r) => r.market!);
}

/**
 * The same markets as the catalogue names them: a market that is a country by that country's code (the
 * one its channels bear), the others, regions, by their own.
 */
export async function watchedPlaces(): Promise<{ countries: string[]; regions: string[] }> {
  const markets = await watchedMarkets();
  if (!markets.length) return { countries: [], regions: [] };
  const c = schema.catalogChannels;
  const rows = await db
    .select({ market: c.market, country: sql<string>`mode() within group (order by ${c.country})` })
    .from(c)
    .where(and(inArray(c.market, markets), isNotNull(c.country)))
    .groupBy(c.market);
  const home = new Map(rows.filter((r) => !REGIONS[r.market!]).map((r) => [r.market!, r.country]));
  return {
    countries: [...new Set(markets.flatMap((m) => home.get(m) ?? []))],
    regions: markets.filter((m) => !home.has(m)),
  };
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
  const v = variants;
  const [channel] = await db.select().from(schema.catalogChannels).where(eq(schema.catalogChannels.id, contentId));
  if (!channel) return null;
  const [row] = await db.select().from(v).where(eq(v.channelId, contentId)).orderBy(sql`${v.channelName} is null`, asc(v.id)).limit(1);
  if (!row) return null;
  const [iptv] = row.iptvId
    ? await db
        .select({ id: schema.cacheIptvorgChannels.id, name: schema.cacheIptvorgChannels.name })
        .from(schema.cacheIptvorgChannels)
        .where(eq(schema.cacheIptvorgChannels.id, row.iptvId))
    : [];
  const ours = channel.aliases.length > 0 || channel.edited.length > 0;
  return {
    market: row.market,
    name: row.channelName,
    iptv: iptv ?? null,
    own: ours ? referenceOf(channel) : null,
    title: row.title || row.name,
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

/** For each name left without a channel, the closest channels of its market's reference: few, and close enough for one click. */
export async function suggestionsFor(names: { market: string; title: string }[]): Promise<Candidate[][]> {
  if (!names.length) return [];
  const idx = await loadIndex();
  const pools = new Map<string, Pooled[]>();
  const poolOf = (market: string) => pools.get(market) ?? pools.set(market, marketChannels(idx, market)).get(market)!;
  return names.map((n) => ranked(poolOf(n.market), n.title, SUGGEST_THRESHOLD, 2));
}

export type UnmatchedVariant = { id: number; name: string; provider: string; category: string | null; contentId: number | null };
/** The variants that bear a name left without a reference channel. */
export async function unmatchedVariants(market: string, title: string): Promise<UnmatchedVariant[]> {
  const v = variants;
  const c = schema.xtreamCategories;
  return db
    .select({ id: v.id, name: v.name, provider: schema.xtreamAccounts.name, category: c.name, contentId: v.contentId })
    .from(v)
    .innerJoin(schema.xtreamAccounts, eq(schema.xtreamAccounts.id, v.accountId))
    .leftJoin(c, and(eq(c.accountId, v.accountId), eq(c.kind, v.kind), eq(c.xtreamId, v.categoryXtreamId)))
    .where(
      and(
        eq(v.kind, "live"),
        eq(v.market, market),
        eq(schema.xtreamAccounts.enabled, true),
        sql`${v.channelName} is null`,
        sql`coalesce(nullif(${v.title}, ''), ${v.name}) = ${title}`,
      ),
    )
    .orderBy(asc(schema.xtreamAccounts.position), asc(v.position));
}

/**
 * Attaches a name to a reference channel, for every provider: an alias of a channel of ours
 * (`own:<id>`), or of the iptv-org channel (`iptv:<id>`), which then gets a row of ours in this
 * market, under its iptv-org name and its usual theme and country. Returns the channel's name.
 */
export async function attachName(market: string, title: string, ref: string): Promise<string> {
  const c = schema.catalogChannels;
  const [kind, id] = [ref.slice(0, ref.indexOf(":")), ref.slice(ref.indexOf(":") + 1)];
  let target: Channel | undefined;
  if (kind === "own" && /^\d+$/.test(id))
    [target] = await db
      .select()
      .from(c)
      .where(eq(c.id, Number(id)));
  else if (kind === "iptv")
    // The channel this market already has for it: ours first, else the one its variants made.
    [target] = await db
      .select()
      .from(c)
      .where(and(eq(c.market, market), eq(c.iptvId, id), eq(c.status, "known")))
      .orderBy(sql`${isOurs} desc`, asc(c.id))
      .limit(1);
  else throw new ChannelError("Chaîne de référence illisible");
  if (target) {
    const mine = referenceOf(target);
    await updateChannel(target.id, { ...mine, aliases: [...mine.aliases, title] });
    return target.name;
  }
  if (kind === "own") throw new ChannelError("Chaîne introuvable");
  const [iptv] = await db.select().from(schema.cacheIptvorgChannels).where(eq(schema.cacheIptvorgChannels.id, id));
  if (!iptv) throw new ChannelError(`Chaîne iptv-org inconnue : ${id}`);
  await createChannel({ name: iptv.name, market, country: null, theme: null, aliases: [title], iptvId: iptv.id });
  return iptv.name;
}
