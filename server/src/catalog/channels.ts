import { and, eq } from "drizzle-orm";
import { db, schema, client as pg } from "@/db";
import { stripAccents } from "@/shared";
import { syncIptv } from "@/providers/iptv";
import { regroupItems } from "./grouping/group";
import type { LiveTheme } from "./naming";

/**
 * The `channels` step: the iptv-org database refreshed (providers/iptv), then every live
 * variant matched to its iptv-org channel, which then gives it a theme and, through the
 * grouping, a logo. Runs after the naming (it reads `clean_title` and `market`) and before the
 * grouping (which aggregates `theme` and the logo). A manual match (`iptv_match = manual`) is kept.
 */

/** Words that tell nothing about which channel it is. */
const NOISE = /\b(tv|hd|fhd|uhd|4k|sd|channel|chaine|television)\b/g;
export const channelKey = (name: string) =>
  stripAccents(name)
    .toLowerCase()
    .replace(NOISE, " ")
    .replace(/[^a-z0-9]+/g, "");

/** Our markets are mostly countries; « ar » is the Arabic-speaking world, « uk » is GB. */
const ARAB = ["SA", "EG", "AE", "QA", "LB", "KW", "BH", "OM", "JO", "IQ", "SY", "MA", "DZ", "TN", "LY", "YE", "PS", "SD", "MR"];
export function countriesOf(market: string | null): string[] {
  if (!market) return [];
  if (market === "ar") return ARAB;
  if (market === "uk") return ["GB", "UK"];
  return [market.toUpperCase()];
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
 * is « general » there and « Régionales » here), so a specific provider theme survives it.
 */
export function mergedTheme(iptv: LiveTheme | null, provider: string | null): string | null {
  if (!iptv) return provider;
  if (iptv === "Généralistes" && provider && provider !== "Généralistes") return provider;
  return iptv;
}

type Index = {
  byId: Map<string, { id: string; categories: string[]; isNsfw: boolean }>;
  byNameCountry: Map<string, Set<string>>;
  byName: Map<string, Set<string>>;
};

async function loadIndex(): Promise<Index> {
  const rows = await db
    .select({
      id: schema.iptvChannels.id,
      name: schema.iptvChannels.name,
      altNames: schema.iptvChannels.altNames,
      country: schema.iptvChannels.country,
      categories: schema.iptvChannels.categories,
      isNsfw: schema.iptvChannels.isNsfw,
    })
    .from(schema.iptvChannels);
  const idx: Index = { byId: new Map(), byNameCountry: new Map(), byName: new Map() };
  const add = (m: Map<string, Set<string>>, k: string, id: string) => m.set(k, (m.get(k) ?? new Set()).add(id));
  for (const r of rows) {
    idx.byId.set(r.id.toLowerCase(), r);
    for (const n of [r.name, ...r.altNames]) {
      const k = channelKey(n);
      if (!k) continue;
      add(idx.byNameCountry, `${k}|${r.country}`, r.id);
      add(idx.byName, k, r.id);
    }
  }
  return idx;
}

export type IptvMatch = { id: string; how: "epg" | "name" | "name-global" } | null;

/**
 * Which iptv-org channel a variant is: the provider's EPG id when iptv-org knows it (`TF1.fr`,
 * feed suffix `@HD` dropped), else its cleaned name in its market's countries, else its name
 * anywhere in the world; a name counts only when it designates a single channel.
 */
export function matchChannel(idx: Index, v: { epgId: string | null; title: string; market: string | null }): IptvMatch {
  const epg = v.epgId?.split("@")[0].toLowerCase();
  const byEpg = epg ? idx.byId.get(epg) : undefined;
  if (byEpg) return { id: byEpg.id, how: "epg" };
  const k = channelKey(v.title);
  if (!k) return null;
  const local = new Set(countriesOf(v.market).flatMap((c) => [...(idx.byNameCountry.get(`${k}|${c}`) ?? [])]));
  if (local.size === 1) return { id: [...local][0], how: "name" };
  if (local.size > 1) return null;
  const world = idx.byName.get(k);
  return world?.size === 1 ? { id: [...world][0], how: "name-global" } : null;
}

const CHUNK = 5000;

type LiveRow = {
  id: number;
  raw: unknown;
  name: string;
  title: string | null;
  market: string | null;
  theme: string | null;
  adult: boolean;
  iptvId: string | null;
  iptvMatch: string | null;
};
type Resolved = { id: number; iptv: string | null; how: string | null; theme: string | null; adult: boolean };

/** What a live variant becomes: its channel (kept when pinned by hand), theme and adult flag. */
function resolve(idx: Index, it: LiveRow): Resolved {
  const manual = it.iptvMatch === "manual";
  const m: IptvMatch = manual
    ? it.iptvId
      ? { id: it.iptvId, how: "epg" }
      : null
    : matchChannel(idx, {
        epgId: (it.raw as { epg_channel_id?: string }).epg_channel_id ?? null,
        title: it.title || it.name,
        market: it.market,
      });
  const ch = m ? idx.byId.get(m.id.toLowerCase()) : undefined;
  return {
    id: it.id,
    iptv: ch?.id ?? (manual ? it.iptvId : null),
    how: manual ? "manual" : ch ? m!.how : null,
    theme: ch ? mergedTheme(iptvTheme(ch.categories), it.theme) : it.theme,
    adult: it.adult || Boolean(ch?.isNsfw || ch?.categories.includes("xxx")),
  };
}

const liveRows = (where = eq(schema.items.kind, "live")) =>
  db
    .select({
      id: schema.items.id,
      raw: schema.items.raw,
      name: schema.items.name,
      title: schema.items.cleanTitle,
      market: schema.items.market,
      theme: schema.items.theme,
      adult: schema.items.adult,
      iptvId: schema.items.iptvId,
      iptvMatch: schema.items.iptvMatch,
    })
    .from(schema.items)
    .where(where);

async function write(rows: Resolved[]) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const part = rows.slice(i, i + CHUNK);
    await pg`
      update items i set iptv_id = u.iptv, iptv_match = u.how, theme = u.theme, adult = u.adult::boolean
      from unnest(${part.map((r) => r.id)}::int[], ${part.map((r) => r.iptv)}::text[], ${part.map((r) => r.how)}::text[],
                  ${part.map((r) => r.theme)}::text[], ${part.map((r) => String(r.adult))}::text[])
        as u(id, iptv, how, theme, adult)
      where i.id = u.id`;
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
  };
  console.log(
    `[channels] ${stats.iptv_matched} / ${stats.live_items} variantes du direct rattachées (${stats.iptv_by_epg} par l'identifiant EPG, ${stats.iptv_by_name} par le nom, ${stats.iptv_manual} à la main)`,
  );
  return { ...sync, ...stats };
}

/**
 * Admin: pins a live variant to an iptv-org channel (null = to none), or gives it back to the
 * matching (`auto`); applied at once, its content regrouped for the logo.
 */
export async function setIptvMatch(itemId: number, iptvId: string | null | "auto") {
  if (iptvId && iptvId !== "auto") {
    const [known] = await db.select({ id: schema.iptvChannels.id }).from(schema.iptvChannels).where(eq(schema.iptvChannels.id, iptvId));
    if (!known) throw new Error(`Chaîne iptv-org inconnue : ${iptvId}`);
  }
  const [it] = await liveRows(and(eq(schema.items.kind, "live"), eq(schema.items.id, itemId)));
  if (!it) throw new Error("Chaîne introuvable");
  const pinned = iptvId === "auto" ? { ...it, iptvMatch: null } : { ...it, iptvId, iptvMatch: "manual" };
  await write([resolve(await loadIndex(), pinned)]);
  await regroupItems([itemId]);
}

/** The iptv-org channel of a variant, for the admin. */
export async function iptvChannelById(id: string | null) {
  if (!id) return null;
  const [ch] = await db.select().from(schema.iptvChannels).where(eq(schema.iptvChannels.id, id));
  return ch ?? null;
}
