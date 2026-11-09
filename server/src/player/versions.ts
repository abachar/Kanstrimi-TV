import { QUALITY_RANK, DYNAMIC_RANGE_RANK, DEFAULT_LANGUAGE_ORDER, qualityOfRank as knownQualityOfRank } from "@/catalog";
import type { Variant } from "@/db";
import type { DynamicRange, Quality, Source, Version } from "./types";
import { slug, stripOrnaments } from "@/shared";
import { accountRank, providerOf, type RestContext, streamUrlOf } from "./context";

/** `src-i…` = an item (movie or channel), `src-e…` = an episode source; base36 of our own ids. */
export const sourceId = (kind: "item" | "episode", id: number) => `src-${kind === "item" ? "i" : "e"}${id.toString(36)}`;

/** A version = language × quality × dynamic range × edition; its sources are the playable variants behind it. */

/** The rank of a language in `order` (the profile's, else the default); unknown languages after, together. */
const langRank = (order: readonly string[], l: string) => {
  const i = order.indexOf(l);
  return i === -1 ? order.length : i;
};
/** How a language reads on screen, the way French cinemas write it: « FR », « VOSTF », « VO ». The codes stay the contract's. */
export const languageLabel = (code: string): string => (code === "VF" ? "FR" : code === "VOSTFR" ? "VOSTF" : code);

/** Languages in `order` (a profile's for its kind, else the default), the rest alphabetically. */
export function sortLanguages(langs: Iterable<string>, order: readonly string[] = DEFAULT_LANGUAGE_ORDER): string[] {
  return [...new Set(langs)].sort((a, b) => langRank(order, a) - langRank(order, b) || a.localeCompare(b));
}
/** Unknown quality is served as HD: the app needs a value, and providers rarely ship worse. */
export const qualityOf = (q: string | null | undefined): Quality => (q && q in QUALITY_RANK ? (q as Quality) : "HD");
export const qualityOfRank = (r: number): Quality => knownQualityOfRank(r) ?? "HD";
export const drOf = (d: string | null | undefined): DynamicRange | undefined => (d === "HDR" || d === "DV" ? d : undefined);

/** What a version needs from a playable row, whether it is an item or an episode source. */
export type Playable = {
  sourceId: string;
  container: string;
  /** Where its provider serves it: the account, and `/{kind}/{user}/{password}/{id}.{ext}` on it. */
  upstream: { accountId: number; kind: "live" | "movie" | "series"; id: string; ext: string };
  lang: string | null;
  quality: string | null;
  dynamicRange: string | null;
  edition: string | null;
  /** Live: the EPG ids to try, in order (the provider's, then iptv-org's when they disagree). */
  epgIds: string[];
  categoryName: string | null;
  /** The provider's own name of the entry, what tells two copies apart when their categories do not. */
  name: string;
  qualityRank: number;
  position: number;
  id: number;
};

/** The provider's EPG id, then iptv-org's when they name different channels: the first with programmes wins. */
export function epgIdsOf(it: Variant): string[] {
  if (it.kind !== "live") return [];
  const own = String(it.raw.epg_channel_id ?? "") || null;
  return [own, it.epgMismatch ? it.iptvId : null].filter((x): x is string => Boolean(x));
}

export function playableOfItem(it: Variant, categoryName: string | null): Playable {
  const ext = String(it.raw.container_extension ?? (it.kind === "live" ? "ts" : "mp4"));
  return {
    sourceId: sourceId("item", it.id),
    container: ext.toUpperCase(),
    upstream: { accountId: it.accountId, kind: it.kind === "live" ? "live" : "movie", id: it.xtreamId, ext },
    lang: it.lang,
    quality: it.quality,
    dynamicRange: it.dynamicRange,
    edition: it.edition,
    epgIds: epgIdsOf(it),
    categoryName,
    name: it.name,
    qualityRank: it.qualityRank,
    position: it.position,
    id: it.id,
  };
}

/** « |FR| », « [FR] », « FR - » and ornaments off a provider's text, upper-cased: what its words are. */
const words = (s: string | null) =>
  stripOrnaments(s ?? "")
    .replace(/^\s*(?:[[|(][^\]|)]*[\]|)]|[A-Za-z]{2,3}\s*[-:|])\s*/, "")
    .toUpperCase()
    .split(/[^\p{L}\p{N}+]+/u)
    .filter(Boolean);

/**
 * What tells apart the copies one provider has of the same version, one text per copy: the words of
 * its category the other copies lack (« UHD » / « LIGHT »), else its raw title when they differ, else a
 * letter. Pure, exported for its tests.
 */
export function distinguish(copies: Pick<Playable, "categoryName" | "name">[]): string[] {
  const unique = (xs: string[]) => xs.every(Boolean) && new Set(xs).size === xs.length;
  const cats = copies.map((c) => words(c.categoryName));
  const common = new Set(cats.length ? cats[0].filter((w) => cats.every((t) => t.includes(w))) : []);
  const byCategory = cats.map((t) => [...new Set(t.filter((w) => !common.has(w)))].join(" "));
  if (unique(byCategory)) return byCategory;
  const byName = copies.map((c) => words(c.name).join(" "));
  if (unique(byName)) return byName;
  return copies.map((_, i) => String.fromCharCode(65 + i));
}

/**
 * The sources of a version: by provider in the order of preference (the first plays by default), and
 * within a provider by what tells its copies apart, then server order. Each carries its ready label.
 */
function sourcesOf(ctx: RestContext, rows: Playable[]): Source[] {
  const byAccount = new Map<number, Playable[]>();
  for (const r of rows) byAccount.set(r.upstream.accountId, [...(byAccount.get(r.upstream.accountId) ?? []), r]);
  const out: Source[] = [];
  for (const [accountId, copies] of [...byAccount].sort((a, b) => accountRank(ctx, a[0]) - accountRank(ctx, b[0]))) {
    const provider = providerOf(ctx, accountId);
    const distinctions = copies.length > 1 ? distinguish(copies) : [null];
    const lines = copies
      .map((r, i) => ({ r, d: distinctions[i] ?? null }))
      .sort((a, b) => (a.d ?? "").localeCompare(b.d ?? "") || a.r.position - b.r.position || a.r.id - b.r.id);
    for (const { r, d } of lines)
      out.push({
        id: r.sourceId,
        container: r.container,
        stream_url: streamUrlOf(ctx, r.upstream.accountId, r.upstream.kind, r.upstream.id, r.upstream.ext),
        provider,
        origin: r.categoryName,
        distinction: d,
        label: d ? `${provider.name} · ${d}` : provider.name,
      });
  }
  return out;
}

/**
 * Group playable rows by language × quality × dynamic range × edition; the sources of a version by
 * provider in the order of preference (`sourcesOf`).
 */
export function versionsOf(ctx: RestContext, rows: Playable[], withSources = true): Version[] {
  const order = ctx.languageOrder[rows[0]?.upstream.kind === "series" ? "series" : "vod"];
  const map = new Map<string, Version & { _q: number; _d: number; _e: string; _rows: Playable[] }>();
  const sorted = [...rows].sort((a, b) => b.qualityRank - a.qualityRank || a.position - b.position || a.id - b.id);
  for (const r of sorted) {
    const language = r.lang ?? "VO",
      quality = qualityOf(r.quality),
      dr = drOf(r.dynamicRange),
      edition = r.edition ?? undefined;
    const id = `${language.toLowerCase()}-${quality.toLowerCase()}${dr ? `-${dr.toLowerCase()}` : ""}${edition ? `-${slug(edition)}` : ""}`;
    let v = map.get(id);
    if (!v) {
      v = {
        id,
        language,
        quality,
        ...(dr ? { dynamic_range: dr } : {}),
        ...(edition ? { edition } : {}),
        sources: [],
        _q: QUALITY_RANK[quality],
        _d: dr ? DYNAMIC_RANGE_RANK[dr] : 0,
        _e: edition ?? "",
        _rows: [],
      };
      map.set(id, v);
    }
    v._rows.push(r);
  }
  if (withSources) for (const v of map.values()) v.sources = sourcesOf(ctx, v._rows);
  // The profile's languages in its order, then the usual cut first: an edition is a choice, never what plays by default.
  return [...map.values()]
    .sort(
      (a, b) =>
        langRank(order, a.language) - langRank(order, b.language) ||
        a.language.localeCompare(b.language) ||
        Number(Boolean(a._e)) - Number(Boolean(b._e)) ||
        b._q - a._q ||
        b._d - a._d ||
        a._e.localeCompare(b._e),
    )
    .map(({ _q, _d, _e, _rows, ...v }) => v);
}

/** « 4K DV », « HD »: a quality and its dynamic range; null without a known quality. */
export function qualityBadgeOf(s: { max_quality?: Quality; dynamic_range?: DynamicRange }): string | null {
  if (!s.max_quality) return null;
  return s.dynamic_range ? `${s.max_quality} ${s.dynamic_range}` : s.max_quality;
}

export function versionsSummary(versions: Version[]): { max_quality?: Quality; dynamic_range?: DynamicRange; languages: string[] } {
  let q = 0,
    d = 0;
  for (const v of versions) {
    q = Math.max(q, QUALITY_RANK[v.quality]);
    if (v.dynamic_range) d = Math.max(d, DYNAMIC_RANGE_RANK[v.dynamic_range]);
  }
  return {
    ...(q ? { max_quality: qualityOfRank(q) } : {}),
    ...(d ? { dynamic_range: d === 2 ? "DV" : "HDR" } : {}),
    languages: [...new Set(versions.map((v) => v.language))], // `versionsOf` already put the profile's first
  };
}
