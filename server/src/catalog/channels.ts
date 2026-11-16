import { and, asc, eq, sql, type SQL } from "drizzle-orm";
import { db, schema, variants as vr, client as pg, inDisabledAccount, visibleItem, type Channel, type ReferenceChannel } from "@/db";
import { checkCancelled, similarity, similarityKey, stripAccents } from "@/shared";
import { syncIptv } from "@/providers/iptv";
import { type ChannelSuggestion, suggestChannels } from "@/providers/claude";
import { followLiveKeys, regroupItems } from "./grouping/group";
import { contentKey } from "./keys";
import { applyFilters } from "./filters/apply";
import { EVENTS_THEME, LIVE_THEMES, REGIONS, themeOf, UNKNOWN_THEME, type LiveTheme } from "./naming";

/**
 * The `channels` step: what a live entry is. Films have TMDB; channels have a reference of their
 * own: the iptv-org database (refreshed here, providers/iptv) and the channels of ours (the admin's
 * Live screen: a channel iptv-org does not know, the names the providers use for one). Every live
 * variant is matched to a reference channel, which gives it its identity (the grouping keys the
 * content by the reference name, whatever each provider calls it), its theme, its country in a
 * region and, through the grouping, its logo. A variant without one keeps to itself under
 * « Événements » or « Non reconnus »; Claude reads those names once and says the channel's usual
 * name, looked up in the reference like any other. Runs after the naming (it reads the title
 * and `market`) and before the grouping. A manual match (`iptv_match = manual`) is kept.
 */

/**
 * Words that tell nothing about which channel it is; a quality stuck to a number too, the way
 * iptv-org writes some feeds: « Arryadia HD1 » is the provider's « ARRYADIA 1 HD ».
 */
const NOISE = /\b(tv|hd|fhd|uhd|4k|sd|channel|chaine|television)\b|\b(hd|fhd|uhd|sd)(?=\d)/g;
export const channelKey = (name: string) =>
  stripAccents(name)
    .toLowerCase()
    .replace(NOISE, " ")
    .replace(/[^a-z0-9]+/g, "");

/** Our markets are mostly countries; a region is several (`REGIONS`); « uk » is GB. */
export function countriesOf(market: string | null): string[] {
  if (!market) return [];
  if (REGIONS[market]) return REGIONS[market];
  if (market === "uk") return ["GB", "UK"];
  return [market.toUpperCase()];
}

/**
 * The provider's sections of a region that name a country (« |AR| EGYPTE |AR| », « | LIBAN | »,
 * « |AR| SAUDI ARABIA |AR| »); « INDEFINI » tells nothing. Any other section gathers a theme or a
 * bouquet (« SPORTS AR. », « OSN MOVIES »).
 */
const SECTION_COUNTRIES: Record<string, string> = {
  EGYPTE: "EG",
  EGYPT: "EG",
  MAROC: "MA",
  MOROCCO: "MA",
  ALGERIE: "DZ",
  ALGERIA: "DZ",
  TUNISIE: "TN",
  TUNISIA: "TN",
  LIBYE: "LY",
  LIBYA: "LY",
  IRAK: "IQ",
  IRAQ: "IQ",
  LIBAN: "LB",
  LEBANON: "LB",
  "AR. SAOUDI": "SA",
  "ARABIE SAOUDITE": "SA",
  "SAUDI ARABIA": "SA",
  SAOUDI: "SA",
  "E.A.U.": "AE",
  "EMIRATS ARABES UNIS": "AE",
  "EMIRATES ARABES UNIS": "AE",
  "UNITED ARAB EMIRATES": "AE",
  UAE: "AE",
  DUBAI: "AE",
  JORDANIE: "JO",
  JORDAN: "JO",
  PALESTINE: "PS",
  SYRIE: "SY",
  SYRIA: "SY",
  KOWEIT: "KW",
  KUWAIT: "KW",
  YEMEN: "YE",
  BAHRAIN: "BH",
  BAHREIN: "BH",
  QATAR: "QA",
  OMAN: "OM",
  SOUDAN: "SD",
  SUDAN: "SD",
  MAURITANIE: "MR",
  MAURITANIA: "MR",
  "ROYAUME-UNI": "GB",
  INDEFINI: "",
  ARABIC: "",
  "ALL ARABIC": "",
};
/** « |AR| AR. SAOUDI |AR| », « | LIBAN | », « |AR| MOROCCO » → the words between the market codes and the pipes. */
function regionLabel(text: string): string {
  const bare = text.replace(/\|\s*[A-Za-z]{2,3}\s*\|/g, " ");
  return stripAccents(/[\p{L}\p{N}]/u.test(bare) ? bare : text)
    .replace(/\|/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}
/** A country code, "" when the section tells nothing, null when it gathers a theme or a bouquet. */
function sectionCountry(section: string | null): string | null {
  if (!section) return "";
  return SECTION_COUNTRIES[regionLabel(section)] ?? null;
}
/**
 * The same for a category, read when the provider draws no section in it: « |AR| MOROCCO » is a
 * country, « |AR| BEIN SPORTS 4K » a theme (pan-Arab), « |AR| ARABIC FULL SD » tells nothing.
 */
function categoryCountry(category: string | null): string | null {
  if (!category) return "";
  const label = regionLabel(category);
  return SECTION_COUNTRIES[label] ?? (themeOf(label) ? null : "");
}

/**
 * The country a channel of a region is shown under: the one its own prefix names (« MA - 2M »), else
 * iptv-org's when it lies in the region (the provider files Dubai channels under « JORDANIE »), else
 * the section's (the category's, without sections). None for a channel the provider files under a theme
 * or a bouquet only: beIN is pan-Arab, not Qatari. Null outside a region.
 */
export function regionCountry(
  market: string | null,
  iptvId: string | null,
  sections: (string | null)[],
  more: { nameCountry?: string | null; category?: string | null } = {},
): string | null {
  const region = market ? REGIONS[market] : undefined;
  if (!region) return null;
  if (more.nameCountry && region.includes(more.nameCountry)) return more.nameCountry;
  const named = sections.some(Boolean) || !more.category ? sections.map(sectionCountry) : [categoryCountry(more.category)];
  const countries = named.filter((c): c is string => !!c && region.includes(c));
  if (!countries.length && named.includes(null)) return null;
  const iptv = iptvId?.split(".")[1]?.split("@")[0]?.toUpperCase();
  if (iptv && region.includes(iptv)) return iptv;
  return countries[0] ?? null;
}

/**
 * iptv-org categories → our themes, the most telling first: a channel « general, news » is Infos.
 * `xxx` is no theme: it marks the channel adult.
 */
const THEME_OF: [string[], LiveTheme][] = [
  [["sports"], "Sport"],
  [["news", "weather", "business", "legislative"], "Infos"],
  [["kids", "animation", "family"], "Jeunesse"],
  [["movies", "classic"], "Cinéma"],
  [["series", "comedy"], "Séries"],
  [["music"], "Musique"],
  [["religious"], "Religion"],
  [["documentary", "science", "travel", "outdoor", "culture", "education", "auto", "cooking", "lifestyle"], "Découverte"],
  [["general", "entertainment", "public", "relax", "shop", "interactive"], "Généralistes"],
];
export function iptvTheme(categories: string[]): LiveTheme | null {
  return THEME_OF.find(([cats]) => cats.some((c) => categories.includes(c)))?.[1] ?? null;
}

/**
 * iptv-org first; but « general » says less than a provider's specific theme (France 3 Bretagne
 * is « general » there and « Régionales » here), so one of our themes survives it. A label of the
 * provider's own (« Tf1+ », « Tele-realite ») does not.
 */
export function mergedTheme(iptv: LiveTheme | null, provider: string | null): string | null {
  if (!iptv) return provider;
  if (iptv === "Généralistes" && provider && provider !== iptv && (LIVE_THEMES as readonly string[]).includes(provider)) return provider;
  return iptv;
}

/** The theme of a recognised channel: one of ours, never a label of the provider's own. */
function referenceTheme(categories: string[], provider: string | null): LiveTheme {
  const t = mergedTheme(iptvTheme(categories), provider);
  return t && (LIVE_THEMES as readonly string[]).includes(t) && t !== EVENTS_THEME && t !== UNKNOWN_THEME
    ? (t as LiveTheme)
    : LIVE_THEMES[0];
}

const upper = (s: string | null) => (s ? stripAccents(s).toUpperCase() : "");
/** A category or a section that gathers event feeds: « DAZN PPV », « SPORT EVENT », « CANAL+ LIVE ». */
const EVENT_LABEL = /(?<![\p{L}])(?:PPV|EVENTS?|EVENEMENTS?|LIVE)(?![\p{L}])/u;
/**
 * A name that says one event or a slot that carries them: a date, a kick-off time, two sides, « NO
 * EVENT », a numbered « live » feed of a platform (« CANAL+ LIVE 7 », « L'EQUIPE LIVE FOOT », « DAZN SERIE A 2 », « LIGUE1+ 4 »).
 */
const EVENT_NAME =
  /\d{4}-\d{2}-\d{2}|\d{1,2}[/.]\d{1,2}[/.]\d{2,4}|(?<!\d)\d{1,2}[:H]\d{2}(?!\d)|\s(?:VS\.?|V)\s|(?<![\p{L}])(?:PPV|EVENTS?|EVENEMENTS?|MATCHS?|MATCHES|DAZN|LIGUE ?1 ?\+|LIVE (?:\d+|FOOT))(?![\p{L}\d])/u;
/** A radio: the provider says so, or files it in a category of radios. The reference lists TV channels: « 2M » the radio is not « 2M ». */
const RADIO_LABEL = /(?<![\p{L}])RADIOS?(?![\p{L}])/u;
const isRadio = (it: { raw: unknown; category: string | null }) =>
  (it.raw as { stream_type?: string }).stream_type === "radio_streams" || RADIO_LABEL.test(upper(it.category));

/** Not a channel but the feed of an event: Claude said so, or its category, its section or its own name does. */
export function isEventFeed(it: { name: string; category: string | null; section: string | null; aiKind?: string | null }): boolean {
  return (
    it.aiKind === "event" || EVENT_LABEL.test(upper(it.category)) || EVENT_LABEL.test(upper(it.section)) || EVENT_NAME.test(upper(it.name))
  );
}

/** Country tags the provider appends to a name: « AL OULA EGY », « MBC KSA », « 2M MAROC », « TLC FRANCE ». */
const COUNTRY_TAG =
  /\s+(EGY|KSA|UAE|QAT|KWT|IRQ|SYR|JOR|LBN|MAR|ALG|TUN|LBY|OMN|BHR|YEM|SDN|PAL|FRANCE|MAROC|MOROCCO|ALGERIE|ALGERIA|TUNISIE|TUNISIA|EGYPTE?)\s*$/i;

/**
 * The names a channel may go by, as keys: the whole cleaned name, without what is in brackets,
 * what is in brackets (« AL OULA (ERTU 1) EGY » is also « ERTU 1 »), without a country tag.
 */
export function nameKeys(title: string): string[] {
  const bare = title
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const inside = [...title.matchAll(/\(([^)]*)\)/g)].map((m) => m[1]);
  const names = [title, bare, stripAccents(bare).replace(COUNTRY_TAG, ""), ...inside];
  return [...new Set(names.map(channelKey).filter((k) => k.length > 1))];
}

type IndexedChannel = { id: string; name: string; country: string; categories: string[]; isNsfw: boolean; keys: string[]; names: string[] };
/** A channel of ours, with the keys of its name and of the names the providers use for it. */
type OwnChannel = ReferenceChannel & { keys: string[] };
export type Index = {
  byId: Map<string, IndexedChannel>;
  byNameCountry: Map<string, Set<string>>;
  byName: Map<string, Set<string>>;
  /** Ours: by id, by `market|name key`, and by `market|iptv-org id` for those that complete an iptv-org channel. */
  own: Map<number, OwnChannel>;
  ownByKey: Map<string, Set<number>>;
  ownByIptv: Map<string, OwnChannel>;
  /** What Claude read in the names the reference does not know, by the key of the channel each makes (`ai_*`). */
  read: Map<string, { kind: string | null; name: string | null }>;
};

export async function loadIndex(): Promise<Index> {
  const rows = await db
    .select({
      id: schema.cacheIptvorgChannels.id,
      name: schema.cacheIptvorgChannels.name,
      altNames: schema.cacheIptvorgChannels.altNames,
      country: schema.cacheIptvorgChannels.country,
      categories: schema.cacheIptvorgChannels.categories,
      isNsfw: schema.cacheIptvorgChannels.isNsfw,
    })
    .from(schema.cacheIptvorgChannels);
  const idx: Index = {
    byId: new Map(),
    byNameCountry: new Map(),
    byName: new Map(),
    own: new Map(),
    ownByKey: new Map(),
    ownByIptv: new Map(),
    read: new Map(),
  };
  const add = <T>(m: Map<string, Set<T>>, k: string, id: T) => m.set(k, (m.get(k) ?? new Set<T>()).add(id));
  for (const r of rows) {
    const keys = [...new Set([r.name, ...r.altNames].map(channelKey).filter(Boolean))];
    idx.byId.set(r.id.toLowerCase(), { ...r, keys, names: [r.name, ...r.altNames] });
    for (const k of keys) {
      add(idx.byNameCountry, `${k}|${r.country}`, r.id);
      add(idx.byName, k, r.id);
    }
  }
  for (const row of await db.select().from(schema.catalogChannels).where(isOurs)) {
    const r = referenceOf(row);
    const own = { ...r, keys: [...new Set([r.name, ...r.aliases].flatMap(nameKeys))] };
    idx.own.set(r.id, own);
    for (const k of own.keys) add(idx.ownByKey, `${r.market}|${k}`, r.id);
    if (r.iptvId) idx.ownByIptv.set(`${r.market}|${r.iptvId.toLowerCase()}`, own);
  }
  const c = schema.catalogChannels;
  for (const r of await db.select({ key: c.key, kind: c.aiKind, name: c.aiName }).from(c).where(sql`${c.aiAskedAt} is not null`))
    idx.read.set(r.key, { kind: r.kind, name: r.name });
  return idx;
}

/** A channel is ours once the admin gave it a name of the providers' or set one of its fields by hand. */
export const isOurs = sql`(cardinality(${schema.catalogChannels.aliases}) > 0 or cardinality(${schema.catalogChannels.edited}) > 0)`;

/**
 * A channel of ours as the matching and the admin read it: what was said of it by hand, null where
 * iptv-org or the usual rule decides.
 */
export function referenceOf(r: Channel): ReferenceChannel {
  return {
    id: r.id,
    name: r.name,
    market: r.market ?? "",
    country: r.edited.includes("country") ? (r.country ?? "") : null,
    theme: r.edited.includes("theme") ? r.theme : null,
    aliases: r.aliases,
    iptvId: r.iptvId,
  };
}

/** The channel of ours a name designates in its market: one of its names or aliases, and no other channel's. */
function ownByKeys(idx: Index, market: string | null, keys: string[]): OwnChannel | undefined {
  if (!market) return undefined;
  for (const k of keys) {
    const ids = idx.ownByKey.get(`${market}|${k}`);
    if (ids?.size === 1) return idx.own.get([...ids][0]);
  }
  return undefined;
}

export type IptvMatch = { id: string; how: "epg" | "name" | "name-global" } | null;
/** How a variant found its reference channel: by iptv-org (`IptvMatch`), by a name of ours, through Claude's reading, by hand. */
export type ChannelMatch = NonNullable<IptvMatch>["how"] | "alias" | "ai" | "manual";

/** A name that differs only by spelling (« AL RESALA » / « Al Resalah », « VIRGIN MEDIA 1 » / « One »). */
export const FIT_THRESHOLD = 0.7;
/** `similarityKey` without its spaces: « Al-Resala » and « AL RESALA » meet. */
const compact = (s: string) => similarityKey(s).replace(/ /g, "");

/**
 * Does the variant's name fit this channel? Its own name inside the variant's (« AL AOULA INTER »
 * is Al Aoula's feed), or close enough to one of its names: « CNBC » is not BBC Parliament.
 */
export function nameFits(ch: Pick<IndexedChannel, "keys" | "names">, title: string, keys: string[]): boolean {
  if (keys.some((k) => ch.keys.some((n) => n.length > 2 && k.includes(n)))) return true;
  const variants = [...new Set([compact(title), ...keys])];
  return ch.names.some((n) => variants.some((v) => similarity(v, compact(n)) >= FIT_THRESHOLD));
}

/**
 * Which iptv-org channel a variant is, and whether the provider's EPG id is to be ignored.
 * The EPG id (`TF1.fr`, feed suffix `@HD` dropped) wins when iptv-org knows it and the name fits;
 * else the name keys in the market's countries, else anywhere in the world; a name counts only
 * when it designates a single channel. The provider's EPG id gives way only to a channel found by
 * name, and only when it surely names another channel (`epgContradicts`). A guide is never lost for nothing.
 */
export function matchChannel(
  idx: Index,
  v: { epgId: string | null; title: string; market: string | null; country?: string | null },
): { match: IptvMatch; epgMismatch: boolean } {
  const epg = v.epgId?.split("@")[0].toLowerCase() || null;
  const keys = nameKeys(v.title);
  const byEpg = epg ? idx.byId.get(epg) : undefined;
  if (byEpg && nameFits(byEpg, v.title, keys)) return { match: { id: byEpg.id, how: "epg" }, epgMismatch: false };
  const byName = matchByName(idx, keys, v.market, v.country);
  if (!byName) return { match: null, epgMismatch: false };
  const contradicts = Boolean(epg) && epg !== byName.id.toLowerCase() && epgContradicts(v.epgId!, v.title, keys, byEpg, byName);
  return { match: { id: byName.id, how: byName.how }, epgMismatch: contradicts };
}

/** An id shaped like iptv-org's (`TF1.fr`), not one of the provider's own (`samsungtv_reuters`, a hash, Hebrew). */
const IPTV_STYLE = /^[a-z0-9+]+\.([a-z]{2})$/i;

/**
 * The provider's EPG id names another channel than the one found by name: iptv-org knows it and
 * its name did not fit; or, unknown there, it is shaped like an iptv-org id of another country than
 * the channel found in the market, and does not read like the name (`DubaiAlOula.ae` for « AL OULA
 * (ERTU 1) EGY », Egyptian). The provider's own ids and renamed channels (`BBC4.uk` for « BBC FOUR »)
 * keep their guide: the provider files it under them.
 */
function epgContradicts(
  epgId: string,
  title: string,
  keys: string[],
  known: IndexedChannel | undefined,
  found: IndexedChannel & { how: string },
): boolean {
  if (known) return true;
  const id = epgId.split("@")[0];
  const m = IPTV_STYLE.exec(id);
  if (!m || found.how !== "name" || m[1].toLowerCase() === found.country.toLowerCase()) return false;
  const stem = id.slice(0, id.lastIndexOf("."));
  return !nameFits({ keys: [channelKey(stem)].filter(Boolean), names: [stem] }, title, keys);
}

/**
 * The one channel these keys designate: in the country the name's own prefix says (« MA - TAMAZIGHT »
 * is Morocco's, not Algeria's), else in the market's countries, else anywhere in the world.
 */
function matchByName(
  idx: Index,
  keys: string[],
  market: string | null,
  country?: string | null,
): (IndexedChannel & { how: "name" | "name-global" }) | null {
  for (const countries of [country ? [country] : [], countriesOf(market)])
    for (const k of keys) {
      const local = new Set(countries.flatMap((c) => [...(idx.byNameCountry.get(`${k}|${c}`) ?? [])]));
      if (local.size === 1) return { ...idx.byId.get([...local][0].toLowerCase())!, how: "name" };
    }
  for (const k of keys) {
    const world = idx.byName.get(k);
    if (world?.size === 1) return { ...idx.byId.get([...world][0].toLowerCase())!, how: "name-global" };
  }
  return null;
}

const CHUNK = 5000;

/** A live stream as the reference reads it, with the channel it is on for now. */
type LiveRow = {
  id: number;
  raw: unknown;
  name: string;
  title: string | null;
  market: string | null;
  nameTheme: string | null;
  nameCountry: string | null;
  nameAdult: boolean;
  section: string | null;
  category: string | null;
  channelId: number | null;
  channelKey: string | null;
  how: string | null;
  manual: boolean;
  epgMismatch: boolean;
};
/** The channel a live stream is, and what it says of that channel. */
type Resolved = {
  id: number;
  /** The channel's key and name: the reference's (ours, else iptv-org's), or the stream's own when it knows none. */
  key: string;
  name: string;
  market: string | null;
  known: boolean;
  event: boolean;
  how: string | null;
  iptv: string | null;
  own: OwnChannel | undefined;
  /** What this stream alone would make the channel: a theme, a country in a region, adult by iptv-org. */
  theme: string;
  country: string | null;
  adult: boolean;
  epgMismatch: boolean;
};

/** A pinned channel: the provider's EPG id is wrong when it names another channel. */
function pinnedMismatch(idx: Index, epgId: string | null, pinned: IndexedChannel | undefined, title: string): boolean {
  const epg = epgId?.split("@")[0].toLowerCase();
  if (!epg || !pinned || epg === pinned.id.toLowerCase()) return false;
  return epgContradicts(epgId!, title, nameKeys(title), idx.byId.get(epg), { ...pinned, how: "name" });
}

const epgIdOf = (it: Pick<LiveRow, "raw">) => (it.raw as { epg_channel_id?: string }).epg_channel_id ?? null;
/** The key a live name has while the reference knows no channel for it: what Claude's reading of it is kept under. */
const unknownKey = (it: Pick<LiveRow, "title" | "name" | "market">) =>
  contentKey({ kind: "live", title: it.title || it.name, market: it.market });

/**
 * The reference channel of a live stream, in this order: a channel of ours one of whose names it bears in
 * its market (what the admin attached wins over any guess); iptv-org's (`matchChannel`); then the usual
 * name Claude read in it, looked up the same two ways. An iptv-org channel completed by a row of ours in
 * that market takes it along (name, theme, country). A radio has none.
 */
function findChannel(idx: Index, it: LiveRow, epgId: string | null) {
  const title = it.title || it.name;
  const iptvOf = (id: string | null | undefined) => (id ? idx.byId.get(id.toLowerCase()) : undefined);
  const completed = (ch: IndexedChannel | undefined) =>
    ch && it.market ? idx.ownByIptv.get(`${it.market}|${ch.id.toLowerCase()}`) : undefined;
  if (isRadio(it)) return { ch: undefined, own: undefined, how: null, epgMismatch: false };
  const named = ownByKeys(idx, it.market, nameKeys(title));
  if (named) {
    const ch = iptvOf(named.iptvId);
    return { ch, own: named, how: "alias" as ChannelMatch, epgMismatch: pinnedMismatch(idx, epgId, ch, title) };
  }
  const r = matchChannel(idx, { epgId, title, market: it.market, country: it.nameCountry });
  const found = iptvOf(r.match?.id);
  if (found) return { ch: found, own: completed(found), how: r.match!.how as ChannelMatch, epgMismatch: r.epgMismatch };
  const ai = idx.read.get(unknownKey(it));
  if (ai?.kind === "channel" && ai.name) {
    const keys = nameKeys(ai.name);
    const own = ownByKeys(idx, it.market, keys);
    const ch = own ? iptvOf(own.iptvId) : (matchByName(idx, keys, it.market, it.nameCountry) ?? undefined);
    if (own || ch) return { ch, own: own ?? completed(ch), how: "ai" as ChannelMatch, epgMismatch: pinnedMismatch(idx, epgId, ch, title) };
  }
  return { ch: undefined, own: undefined, how: null, epgMismatch: false };
}

/**
 * What a live stream becomes: the channel it is (the reference's, under its name in the reference; else
 * one of its own name, « Événements » for an event feed, « Non reconnus » otherwise), how it was found,
 * whether its EPG id is to be ignored, and what it alone says of that channel (`channelFacts` weighs
 * all its streams).
 */
function resolve(idx: Index, it: LiveRow, pin?: { iptvId: string | null }): Resolved {
  const epgId = epgIdOf(it);
  const title = it.title || it.name;
  let found = findChannel(idx, it, epgId);
  if (pin) {
    // Put there by hand: that iptv-org channel (with the row of ours that completes it in this market), or none.
    const ch = pin.iptvId ? idx.byId.get(pin.iptvId.toLowerCase()) : undefined;
    const own = ch && it.market ? idx.ownByIptv.get(`${it.market}|${ch.id.toLowerCase()}`) : undefined;
    found = { ch, own, how: "manual", epgMismatch: pinnedMismatch(idx, epgId, ch, title) };
  }
  const { ch, own, how, epgMismatch } = found;
  const known = Boolean(ch || own);
  const event = !known && isEventFeed({ ...it, aiKind: idx.read.get(unknownKey(it))?.kind });
  const channelName = own?.name ?? ch?.name ?? null;
  return {
    id: it.id,
    key: contentKey({ kind: "live", title, market: it.market, channelName }),
    name: channelName ?? title,
    market: it.market,
    known,
    event,
    how,
    iptv: ch?.id ?? null,
    own,
    theme: known ? (own?.theme ?? referenceTheme(ch?.categories ?? [], it.nameTheme)) : event ? EVENTS_THEME : UNKNOWN_THEME,
    country:
      own && own.country !== null
        ? own.country || null
        : regionCountry(it.market, ch?.id ?? null, [it.section], { nameCountry: it.nameCountry, category: it.category }),
    adult: Boolean(ch?.isNsfw || ch?.categories.includes("xxx")),
    epgMismatch,
  };
}

const live = eq(vr.kind, "live");
const liveRows = (where: SQL = live): Promise<LiveRow[]> =>
  db
    .select({
      id: vr.id,
      raw: vr.raw,
      name: vr.name,
      title: vr.cleanTitle,
      market: vr.market,
      nameTheme: vr.nameTheme,
      nameCountry: vr.nameCountry,
      nameAdult: vr.nameAdult,
      section: vr.section,
      category: schema.xtreamCategories.name,
      channelId: vr.channelId,
      channelKey: vr.contentKey,
      how: vr.how,
      manual: vr.manual,
      epgMismatch: vr.epgMismatch,
    })
    .from(vr)
    .leftJoin(
      schema.xtreamCategories,
      and(
        eq(schema.xtreamCategories.accountId, vr.accountId),
        eq(schema.xtreamCategories.kind, vr.kind),
        eq(schema.xtreamCategories.xtreamId, vr.categoryXtreamId),
      ),
    )
    .where(where)
    .orderBy(asc(vr.id));

/** The most frequent of some values, the first met among equals; null without any. */
function most<T>(values: (T | null)[]): T | null {
  const n = new Map<T, number>();
  for (const v of values) if (v !== null) n.set(v, (n.get(v) ?? 0) + 1);
  let best: T | null = null;
  for (const [v, c] of n) if (best === null || c > n.get(best)!) best = v;
  return best;
}

/**
 * Attaches each live stream to its channel, found by its key or created; one attached by hand stays
 * where it is. Then every channel met says what its streams make it: recognised or not, its iptv-org
 * channel, its theme and its country (unless set by hand), adult when iptv-org or every name says so.
 * What the profiles recorded under a key no stream bears any more follows its streams (`followLiveKeys`).
 * Only what moved is written; returns the streams that changed channel and the channels they left.
 */
async function attach(rows: LiveRow[], resolved: Resolved[]): Promise<{ moved: number[]; left: number[] }> {
  const c = schema.catalogChannels;
  // 1. The channels: those the streams name, and those the streams put there by hand already sit on.
  const wanted = new Map<string, Resolved>();
  rows.forEach((it, i) => {
    if (!it.manual && !wanted.has(resolved[i].key)) wanted.set(resolved[i].key, resolved[i]);
  });
  const fresh = [...wanted.values()];
  for (let i = 0; i < fresh.length; i += CHUNK) {
    checkCancelled();
    const part = fresh.slice(i, i + CHUNK);
    await pg`
      insert into catalog_channels (key, name, market, status, added_at)
      select key, name, market, status, now()
      from unnest(${part.map((r) => r.key)}::text[], ${part.map((r) => r.name)}::text[], ${part.map((r) => r.market)}::text[],
                  ${part.map((r) => (r.known ? "known" : r.event ? "event" : "unknown"))}::text[]) as u(key, name, market, status)
      on conflict (key) do nothing`;
  }
  const keys = [...new Set([...wanted.keys(), ...rows.map((it) => it.channelKey).filter((k): k is string => k !== null)])];
  const channels = new Map<string, Channel>();
  for (let i = 0; i < keys.length; i += CHUNK)
    for (const ch of await db
      .select()
      .from(c)
      .where(
        sql`${c.key} = any(${`{${keys
          .slice(i, i + CHUNK)
          .map((k) => JSON.stringify(k))
          .join(",")}}`}::text[])`,
      ))
      channels.set(ch.key, ch);

  // 2. The streams that change channel, way of finding it or EPG verdict.
  const moved: { id: number; channelId: number; how: string | null; mismatch: boolean }[] = [];
  const left = new Set<number>();
  const moves = new Map<string, Map<string, number>>();
  const onChannel = new Map<string, number[]>(); // key → the rows on it once written, by their index
  rows.forEach((it, i) => {
    const r = resolved[i];
    const key = it.manual ? it.channelKey : r.key;
    if (key === null) return;
    onChannel.set(key, [...(onChannel.get(key) ?? []), i]);
    if (it.manual) return;
    const to = channels.get(r.key)!;
    if (it.channelId === to.id && it.how === r.how && it.epgMismatch === r.epgMismatch) return;
    moved.push({ id: it.id, channelId: to.id, how: r.how, mismatch: r.epgMismatch });
    if (it.channelId !== null && it.channelId !== to.id) {
      left.add(it.channelId);
      const went = moves.get(it.channelKey!) ?? new Map<string, number>();
      moves.set(it.channelKey!, went.set(r.key, (went.get(r.key) ?? 0) + 1));
    }
  });
  for (let i = 0; i < moved.length; i += CHUNK) {
    checkCancelled();
    const part = moved.slice(i, i + CHUNK);
    await pg`
      update catalog_variants v set channel_id = u.channel_id, how = u.how, epg_mismatch = u.mismatch::boolean
      from unnest(${part.map((m) => m.id)}::int[], ${part.map((m) => m.channelId)}::int[], ${part.map((m) => m.how)}::text[],
                  ${part.map((m) => String(m.mismatch))}::text[]) as u(id, channel_id, how, mismatch)
      where v.id = u.id and (v.channel_id, v.how, v.epg_mismatch) is distinct from (u.channel_id, u.how, u.mismatch::boolean)`;
  }
  await followLiveKeys(moves);

  // 3. What each channel is, from all the streams on it.
  for (const [key, members] of onChannel) {
    const ch = channels.get(key);
    if (!ch) continue;
    const facts = channelFacts(
      ch,
      members.map((i) => rows[i]),
      members.map((i) => resolved[i]),
    );
    const changed = (Object.keys(facts) as (keyof typeof facts)[]).some((k) => facts[k] !== ch[k]);
    if (changed)
      await db
        .update(c)
        .set({ ...facts, updatedAt: new Date() })
        .where(eq(c.id, ch.id));
  }
  return { moved: moved.map((m) => m.id), left: [...left] };
}

/**
 * What its streams make a channel. Those found by the reference decide; streams put there by hand
 * alone (a pin, a merge) leave it what it was, but for what their names say. A field set by hand
 * (`edited`) is not touched.
 */
function channelFacts(ch: Channel, rows: LiveRow[], resolved: Resolved[]) {
  const auto = resolved.filter((_, i) => !rows[i].manual);
  const known = auto.length ? auto.some((r) => r.known) : ch.status === "known";
  const event = auto.length ? auto.every((r) => r.event) : ch.status === "event";
  const iptv = auto.length ? most(auto.map((r) => r.iptv)) : ch.iptvId;
  const named = auto.find((r) => r.known);
  return {
    status: (known ? "known" : event ? "event" : "unknown") as Channel["status"],
    name: ch.edited.includes("name") || !named ? ch.name : named.name,
    iptvId: iptv,
    theme: ch.edited.includes("theme") ? ch.theme : auto.length ? most(auto.map((r) => r.theme)) : ch.theme,
    country: ch.edited.includes("country") ? ch.country : auto.length ? most(auto.map((r) => r.country)) : ch.country,
    adult: (auto.length ? auto.some((r) => r.adult) : false) || rows.every((it) => it.nameAdult),
  };
}

/** Names Claude reads per run; a run or two covers what a new provider brings. */
const AI_PER_RUN = 1500;
/** Reference names sent along with a market's questions: every channel of France, the most of a whole region. */
const REFERENCE_NAMES_MAX = 2500;

/** The names of the reference in a market: ours, then iptv-org's in its countries. */
function referenceNames(idx: Index, market: string): string[] {
  const countries = new Set(countriesOf(market));
  const own = [...idx.own.values()].filter((o) => o.market === market).map((o) => o.name);
  const iptv = [...idx.byId.values()].filter((ch) => countries.has(ch.country)).map((ch) => ch.name);
  return [...new Set([...own, ...iptv.sort((a, b) => a.localeCompare(b))])].slice(0, REFERENCE_NAMES_MAX);
}

/**
 * A market is watched when the profiles see this share of its recognised versions at least: a filter
 * that keeps one theme everywhere (« jeunesse ») does not make every market one of the household's.
 */
export const WATCHED_SHARE = 0.2;

/**
 * Claude reads the names left without a reference channel, each once, in the markets the profiles
 * watch (`WATCHED_SHARE`) and for the providers in use: one question per channel the reference does not
 * know, its answer kept on that channel (`ai_*`), where the next reading finds it (`idx.read`). Without
 * a key, nothing happens.
 */
async function askClaude(
  idx: Index,
  rows: LiveRow[],
  resolved: Resolved[],
): Promise<{ ai_asked: number; ai_channels: number; ai_events: number }> {
  const stats = { ai_asked: 0, ai_channels: 0, ai_events: 0 };
  const idsWhere = async (where: SQL) => new Set((await db.select({ id: vr.id }).from(vr).where(and(live, where))).map((r) => r.id));
  const [visible, unused] = await Promise.all([idsWhere(visibleItem), idsWhere(inDisabledAccount)]);
  const seen = new Map<string, { recognised: number; visible: number }>();
  rows.forEach((it, i) => {
    if (!it.market || !resolved[i].known) return;
    const m = seen.get(it.market) ?? { recognised: 0, visible: 0 };
    m.recognised++;
    if (visible.has(it.id)) m.visible++;
    seen.set(it.market, m);
  });
  const watched = new Set(
    [...seen].filter(([, m]) => m.visible > 0 && m.visible >= WATCHED_SHARE * m.recognised).map(([market]) => market),
  );
  // One question per name: the first stream that bears it speaks for the others.
  const names = new Map<string, LiveRow>();
  rows.forEach((it, i) => {
    if (resolved[i].known || resolved[i].event || it.manual || isRadio(it) || idx.read.has(unknownKey(it))) return;
    if (!it.market || !watched.has(it.market) || unused.has(it.id)) return;
    if (!names.has(resolved[i].key)) names.set(resolved[i].key, it);
  });
  const asked = [...names].slice(0, AI_PER_RUN);
  if (!asked.length) return stats;
  // One market at a time, with the names its reference holds: the model picks among them when it can.
  const byId = new Map<number, ChannelSuggestion>();
  for (const market of new Set(asked.map(([, it]) => it.market!))) {
    checkCancelled();
    const queries = asked
      .filter(([, it]) => it.market === market)
      .map(([, it]) => ({ id: it.id, name: it.name, category: it.category, market }));
    const answers = await suggestChannels(queries, referenceNames(idx, market));
    if (!answers) return stats;
    for (const a of answers) byId.set(a.id, a);
  }
  const now = new Date();
  for (const [key, it] of asked) {
    // Asked and not answered: not asked again, there is nothing more to learn from the same name.
    const a = byId.get(it.id);
    stats.ai_asked++;
    if (a?.kind === "channel" && a.name) stats.ai_channels++;
    if (a?.kind === "event") stats.ai_events++;
    idx.read.set(key, { kind: a?.kind ?? null, name: a?.name ?? null });
    await db
      .update(schema.catalogChannels)
      .set({ aiKind: a?.kind ?? null, aiName: a?.name ?? null, aiAskedAt: now })
      .where(eq(schema.catalogChannels.key, key));
  }
  console.log(
    `[channels] ${stats.ai_asked} noms non reconnus lus par Claude : ${stats.ai_channels} chaînes nommées, ${stats.ai_events} événements`,
  );
  return stats;
}

export async function runChannels() {
  // iptv-org out of reach, Claude down or refusing: the reference as it stands still applies (a new stream
  // gets its channel all the same), and the step says what failed afterwards.
  let failure: unknown = null;
  const sync = await syncIptv().catch((e) => {
    failure = e;
    return {};
  });
  const idx = await loadIndex();
  let rows = await liveRows();
  let resolved = rows.map((it) => resolve(idx, it));
  await attach(rows, resolved);
  const ai = await askClaude(idx, rows, resolved).catch((e) => {
    failure ??= e;
    return { ai_asked: 0, ai_channels: 0, ai_events: 0 };
  });
  if (ai.ai_asked) {
    rows = await liveRows();
    resolved = rows.map((it) => resolve(idx, it));
    await attach(rows, resolved);
  }
  const auto = resolved.filter((_, i) => !rows[i].manual);
  const count = (how: ChannelMatch[]) => auto.filter((r) => r.known && how.includes(r.how as ChannelMatch)).length;
  const stats = {
    live_items: rows.length,
    live_recognised: auto.filter((r) => r.known).length,
    live_events: auto.filter((r) => r.event).length,
    iptv_matched: auto.filter((r) => r.iptv).length,
    iptv_by_epg: count(["epg"]),
    iptv_by_name: count(["name", "name-global"]),
    iptv_by_alias: count(["alias"]),
    iptv_by_ai: count(["ai"]),
    iptv_manual: rows.filter((it) => it.manual).length,
    epg_mismatch: auto.filter((r) => r.epgMismatch).length,
    ...ai,
  };
  console.log(
    `[channels] ${stats.live_recognised} / ${stats.live_items} variantes du direct reconnues (${stats.iptv_by_epg} par l'identifiant EPG, ${stats.iptv_by_name} par le nom, ${stats.iptv_by_alias} par un nom de la référence, ${stats.iptv_by_ai} par Claude), ${stats.iptv_manual} posées à la main, ${stats.live_events} événements, ${stats.epg_mismatch} identifiants EPG du fournisseur écartés`,
  );
  if (failure) throw failure;
  return { ...sync, ...stats };
}

/** The streams of a market (all of them without one) on the channels the reference now gives them: what moved is regrouped and judged by the filters at once. */
async function reattach(market: string | null | undefined, change?: (rows: LiveRow[], idx: Index) => Promise<Resolved[]> | Resolved[]) {
  const idx = await loadIndex();
  const rows = await liveRows(market ? and(live, eq(vr.market, market))! : live);
  const resolved = change ? await change(rows, idx) : rows.map((it) => resolve(idx, it));
  const { moved, left } = await attach(rows, resolved);
  if (moved.length) await applyFilters({ contentIds: await regroupItems(moved, left) });
  return moved.length;
}

/**
 * The live variants of a market (all of them without one) read again against the reference, after it
 * changed in the admin: what moved is regrouped and judged by the filters at once. Returns how many moved.
 */
export const rematchChannels = (market?: string): Promise<number> => reattach(market);

/** Puts a live stream on a channel by hand (it stays there), or gives it back to the reference (`null`). */
async function putByHand(
  itemId: number,
  to: ((it: LiveRow, idx: Index) => Promise<Channel> | Channel) | null,
  epg?: (it: LiveRow, idx: Index) => boolean,
) {
  const [it] = await liveRows(and(live, eq(vr.id, itemId))!);
  if (!it) throw new Error("Chaîne introuvable");
  const v = schema.catalogVariants;
  if (to === null) await db.update(v).set({ manual: false }).where(eq(v.id, itemId));
  else {
    const idx = await loadIndex();
    const ch = await to(it, idx);
    await db
      .update(v)
      .set({ channelId: ch.id, how: "manual", manual: true, epgMismatch: epg ? epg(it, idx) : false })
      .where(eq(v.id, itemId));
    if (it.channelKey && it.channelKey !== ch.key) await followLiveKeys(new Map([[it.channelKey, new Map([[ch.key, 1]])]]));
  }
  // Its market read again: the channel it left and the one it joined say what their streams now make them.
  await reattach(it.market);
  await applyFilters({ contentIds: await regroupItems([itemId], it.channelId ? [it.channelId] : []) });
}

/** The channel under a key, created when the catalogue has none. */
async function channelFor(values: { key: string; name: string; market: string | null; status: Channel["status"]; iptvId?: string | null }) {
  const c = schema.catalogChannels;
  await db
    .insert(c)
    .values({ ...values, addedAt: new Date() })
    .onConflictDoNothing({ target: c.key });
  const [ch] = await db.select().from(c).where(eq(c.key, values.key));
  return ch;
}

/**
 * Admin: pins a live variant to an iptv-org channel (null = to none: a channel of its own name the
 * reference does not know), or gives it back to the matching (`auto`); applied at once.
 */
export async function setIptvMatch(itemId: number, iptvId: string | null | "auto") {
  if (iptvId === "auto") return putByHand(itemId, null);
  if (iptvId) {
    const [known] = await db
      .select({ id: schema.cacheIptvorgChannels.id })
      .from(schema.cacheIptvorgChannels)
      .where(eq(schema.cacheIptvorgChannels.id, iptvId));
    if (!known) throw new Error(`Chaîne iptv-org inconnue : ${iptvId}`);
  }
  await putByHand(
    itemId,
    (it, idx) => {
      const r = resolve(idx, it, { iptvId });
      return channelFor({ key: r.key, name: r.name, market: r.market, status: r.known ? "known" : "unknown", iptvId: r.iptv });
    },
    (it, idx) => resolve(idx, it, { iptvId }).epgMismatch,
  );
}

/** Admin: a live variant alone on a channel of its own (`manual:<id>`), on another channel (its key), or back to the reference (null). */
export async function setLiveChannel(
  item: { id: number; name: string; cleanTitle: string | null; market: string | null },
  key: string | null,
) {
  if (key === null) return putByHand(item.id, null);
  await putByHand(item.id, async () => {
    if (key === `manual:${item.id}`) return channelFor({ key, name: item.cleanTitle || item.name, market: item.market, status: "unknown" });
    const [ch] = await db.select().from(schema.catalogChannels).where(eq(schema.catalogChannels.key, key));
    if (!ch) throw new Error("Chaîne introuvable");
    return ch;
  });
}

/** The iptv-org channel of a variant, for the admin. */
export async function iptvChannelById(id: string | null) {
  if (!id) return null;
  const [ch] = await db.select().from(schema.cacheIptvorgChannels).where(eq(schema.cacheIptvorgChannels.id, id));
  return ch ?? null;
}
