import { and, eq } from "drizzle-orm";
import { db, schema, client as pg } from "@/db";
import { checkCancelled, similarity, stripAccents } from "@/shared";
import { syncIptv } from "@/providers/iptv";
import { regroupItems } from "./grouping/group";
import { LIVE_THEMES, type LiveTheme } from "./naming";

/**
 * The `channels` step: the iptv-org database refreshed (providers/iptv), then every live
 * variant matched to its iptv-org channel, which then gives it a theme and, through the
 * grouping, a logo. Runs after the naming (it reads `clean_title` and `market`) and before the
 * grouping (which aggregates `theme` and the logo). A manual match (`iptv_match = manual`) is kept.
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

/** Our markets are mostly countries; « ar » is a region, the Arabic-speaking world; « uk » is GB. */
const REGIONS: Record<string, string[]> = {
  ar: ["SA", "EG", "AE", "QA", "LB", "KW", "BH", "OM", "JO", "IQ", "SY", "MA", "DZ", "TN", "LY", "YE", "PS", "SD", "MR"],
};
export function countriesOf(market: string | null): string[] {
  if (!market) return [];
  if (REGIONS[market]) return REGIONS[market];
  if (market === "uk") return ["GB", "UK"];
  return [market.toUpperCase()];
}

/**
 * The provider's sections of a region that name a country (« |AR| EGYPTE |AR| »); « INDEFINI » tells
 * nothing. Any other section gathers a theme or a bouquet (« SPORTS AR. », « OSN MOVIES »).
 */
const SECTION_COUNTRIES: Record<string, string> = {
  EGYPTE: "EG",
  MAROC: "MA",
  ALGERIE: "DZ",
  TUNISIE: "TN",
  LIBYE: "LY",
  IRAK: "IQ",
  LIBAN: "LB",
  "AR. SAOUDI": "SA",
  "ARABIE SAOUDITE": "SA",
  "E.A.U.": "AE",
  DUBAI: "AE",
  JORDANIE: "JO",
  PALESTINE: "PS",
  SYRIE: "SY",
  KOWEIT: "KW",
  YEMEN: "YE",
  BAHRAIN: "BH",
  BAHREIN: "BH",
  QATAR: "QA",
  OMAN: "OM",
  SOUDAN: "SD",
  MAURITANIE: "MR",
  "ROYAUME-UNI": "GB",
  INDEFINI: "",
};
/** A country code, "" when the section tells nothing, null when it gathers a theme or a bouquet. */
function sectionCountry(section: string | null): string | null {
  if (!section) return "";
  const label = stripAccents(section.replace(/\|[^|]*\|/g, ""))
    .trim()
    .toUpperCase();
  return SECTION_COUNTRIES[label] ?? null;
}

/**
 * The country a channel of a region is shown under: iptv-org's when it lies in the region (the
 * provider files Dubai channels under « JORDANIE »), else the section's. None for a channel the
 * provider files under a theme or a bouquet only: beIN is pan-Arab, not Qatari. Null outside a region.
 */
export function regionCountry(market: string | null, iptvId: string | null, sections: (string | null)[]): string | null {
  const region = market ? REGIONS[market] : undefined;
  if (!region) return null;
  const named = sections.map(sectionCountry);
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

/** Country tags the provider appends to a name: « AL OULA EGY », « MBC KSA ». */
const COUNTRY_TAG = /\s+(EGY|KSA|UAE|QAT|KWT|IRQ|SYR|JOR|LBN|MAR|ALG|TUN|LBY|OMN|BHR|YEM|SDN|PAL)\s*$/i;

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
  const names = [title, bare, bare.replace(COUNTRY_TAG, ""), ...inside];
  return [...new Set(names.map(channelKey).filter((k) => k.length > 1))];
}

type IndexedChannel = { id: string; country: string; categories: string[]; isNsfw: boolean; keys: string[]; names: string[] };
type Index = {
  byId: Map<string, IndexedChannel>;
  byNameCountry: Map<string, Set<string>>;
  byName: Map<string, Set<string>>;
};

async function loadIndex(): Promise<Index> {
  const rows = await db
    .select({
      id: schema.iptvorgChannels.id,
      name: schema.iptvorgChannels.name,
      altNames: schema.iptvorgChannels.altNames,
      country: schema.iptvorgChannels.country,
      categories: schema.iptvorgChannels.categories,
      isNsfw: schema.iptvorgChannels.isNsfw,
    })
    .from(schema.iptvorgChannels);
  const idx: Index = { byId: new Map(), byNameCountry: new Map(), byName: new Map() };
  const add = (m: Map<string, Set<string>>, k: string, id: string) => m.set(k, (m.get(k) ?? new Set()).add(id));
  for (const r of rows) {
    const keys = [...new Set([r.name, ...r.altNames].map(channelKey).filter(Boolean))];
    idx.byId.set(r.id.toLowerCase(), { ...r, keys, names: [r.name, ...r.altNames] });
    for (const k of keys) {
      add(idx.byNameCountry, `${k}|${r.country}`, r.id);
      add(idx.byName, k, r.id);
    }
  }
  return idx;
}

export type IptvMatch = { id: string; how: "epg" | "name" | "name-global" } | null;

/** A name that differs only by spelling (« AL RESALA » / « Al Resalah », « VIRGIN MEDIA 1 » / « One »). */
export const FIT_THRESHOLD = 0.7;
const compact = (s: string) =>
  stripAccents(s)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "");

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
  v: { epgId: string | null; title: string; market: string | null },
): { match: IptvMatch; epgMismatch: boolean } {
  const epg = v.epgId?.split("@")[0].toLowerCase() || null;
  const keys = nameKeys(v.title);
  const byEpg = epg ? idx.byId.get(epg) : undefined;
  if (byEpg && nameFits(byEpg, v.title, keys)) return { match: { id: byEpg.id, how: "epg" }, epgMismatch: false };
  const byName = matchByName(idx, keys, v.market);
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

function matchByName(idx: Index, keys: string[], market: string | null): (IndexedChannel & { how: "name" | "name-global" }) | null {
  const countries = countriesOf(market);
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

type LiveRow = {
  id: number;
  raw: unknown;
  name: string;
  title: string | null;
  market: string | null;
  nameTheme: string | null;
  section: string | null;
  iptvId: string | null;
  iptvMatch: string | null;
};
type Resolved = {
  id: number;
  iptv: string | null;
  how: string | null;
  theme: string | null;
  adult: boolean;
  epgMismatch: boolean;
  country: string | null;
};

/** A pinned channel: the provider's EPG id is wrong when it names another channel. */
function pinnedMismatch(idx: Index, epgId: string | null, pinned: IndexedChannel | undefined, title: string): boolean {
  const epg = epgId?.split("@")[0].toLowerCase();
  if (!epg || !pinned || epg === pinned.id.toLowerCase()) return false;
  return epgContradicts(epgId!, title, nameKeys(title), idx.byId.get(epg), { ...pinned, how: "name" });
}

/**
 * What a live variant becomes: its channel (kept when pinned by hand), the theme and adult flag the
 * channel gives (`iptv_theme`, `iptv_adult`: the name's own stay in `name_*`, the final values are
 * derived), whether its EPG id is to be ignored, and its country in a regional market.
 * `theme` stays null when it would only repeat the name's.
 */
function resolve(idx: Index, it: LiveRow): Resolved {
  const epgId = (it.raw as { epg_channel_id?: string }).epg_channel_id ?? null;
  const manual = it.iptvMatch === "manual";
  let ch: IndexedChannel | undefined;
  let how: string | null = null;
  let epgMismatch: boolean;
  if (manual) {
    ch = it.iptvId ? idx.byId.get(it.iptvId.toLowerCase()) : undefined;
    how = "manual";
    epgMismatch = pinnedMismatch(idx, epgId, ch, it.title || it.name);
  } else {
    const r = matchChannel(idx, { epgId, title: it.title || it.name, market: it.market });
    ch = r.match ? idx.byId.get(r.match.id.toLowerCase()) : undefined;
    how = ch ? r.match!.how : null;
    epgMismatch = r.epgMismatch;
  }
  const iptv = ch?.id ?? (manual ? it.iptvId : null);
  return {
    id: it.id,
    iptv,
    how,
    theme: ch ? nullIfSame(mergedTheme(iptvTheme(ch.categories), it.nameTheme), it.nameTheme) : null,
    adult: Boolean(ch?.isNsfw || ch?.categories.includes("xxx")),
    epgMismatch,
    country: regionCountry(it.market, iptv, [it.section]),
  };
}

const nullIfSame = (v: string | null, same: string | null) => (v === same ? null : v);

const liveRows = (where = eq(schema.catalogVariants.kind, "live")) =>
  db
    .select({
      id: schema.catalogVariants.id,
      raw: schema.catalogVariants.raw,
      name: schema.catalogVariants.name,
      title: schema.catalogVariants.cleanTitle,
      market: schema.catalogVariants.market,
      nameTheme: schema.catalogVariants.nameTheme,
      section: schema.catalogVariants.section,
      iptvId: schema.catalogVariants.iptvId,
      iptvMatch: schema.catalogVariants.iptvMatch,
    })
    .from(schema.catalogVariants)
    .where(where);

/** Only the variants whose channel, theme, flag, EPG verdict or country moved are written. */
async function write(rows: Resolved[]) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    checkCancelled();
    const part = rows.slice(i, i + CHUNK);
    await pg`
      update catalog_variants i set iptv_id = u.iptv, iptv_match = u.how, iptv_theme = u.theme, iptv_adult = u.adult, epg_mismatch = u.mismatch,
        country = u.country
      from (
        select id, iptv, how, theme, adult::boolean as adult, mismatch::boolean as mismatch, country
        from unnest(${part.map((r) => r.id)}::int[], ${part.map((r) => r.iptv)}::text[], ${part.map((r) => r.how)}::text[],
                    ${part.map((r) => r.theme)}::text[], ${part.map((r) => String(r.adult))}::text[], ${part.map((r) => String(r.epgMismatch))}::text[],
                    ${part.map((r) => r.country)}::text[])
          as x(id, iptv, how, theme, adult, mismatch, country)
      ) u
      where i.id = u.id
        and (i.iptv_id, i.iptv_match, i.iptv_theme, i.iptv_adult, i.epg_mismatch, i.country)
            is distinct from (u.iptv, u.how, u.theme, u.adult, u.mismatch, u.country)`;
  }
}

export async function runChannels() {
  const sync = await syncIptv();
  const idx = await loadIndex();
  const rows = (await liveRows()).map((it) => resolve(idx, it));
  await write(rows);
  const count = (how: string[]) => rows.filter((r) => r.iptv && r.how && how.includes(r.how)).length;
  const stats = {
    live_items: rows.length,
    iptv_matched: rows.filter((r) => r.iptv).length,
    iptv_by_epg: count(["epg"]),
    iptv_by_name: count(["name", "name-global"]),
    iptv_manual: count(["manual"]),
    epg_mismatch: rows.filter((r) => r.epgMismatch).length,
  };
  console.log(
    `[channels] ${stats.iptv_matched} / ${stats.live_items} variantes du direct rattachées (${stats.iptv_by_epg} par l'identifiant EPG, ${stats.iptv_by_name} par le nom, ${stats.iptv_manual} à la main), ${stats.epg_mismatch} identifiants EPG du fournisseur écartés`,
  );
  return { ...sync, ...stats };
}

/**
 * Admin: pins a live variant to an iptv-org channel (null = to none), or gives it back to the
 * matching (`auto`); applied at once, its content regrouped for the logo.
 */
export async function setIptvMatch(itemId: number, iptvId: string | null | "auto") {
  if (iptvId && iptvId !== "auto") {
    const [known] = await db
      .select({ id: schema.iptvorgChannels.id })
      .from(schema.iptvorgChannels)
      .where(eq(schema.iptvorgChannels.id, iptvId));
    if (!known) throw new Error(`Chaîne iptv-org inconnue : ${iptvId}`);
  }
  const [it] = await liveRows(and(eq(schema.catalogVariants.kind, "live"), eq(schema.catalogVariants.id, itemId)));
  if (!it) throw new Error("Chaîne introuvable");
  const pinned = iptvId === "auto" ? { ...it, iptvMatch: null } : { ...it, iptvId, iptvMatch: "manual" };
  await write([resolve(await loadIndex(), pinned)]);
  await regroupItems([itemId]);
}

/** The iptv-org channel of a variant, for the admin. */
export async function iptvChannelById(id: string | null) {
  if (!id) return null;
  const [ch] = await db.select().from(schema.iptvorgChannels).where(eq(schema.iptvorgChannels.id, id));
  return ch ?? null;
}
