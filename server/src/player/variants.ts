import { QUALITY_RANK, DYNAMIC_RANGE_RANK, DEFAULT_LANGUAGE_ORDER, UNKNOWN_QUALITY, qualityOfRank as knownQualityOfRank } from "@/catalog";
import type { Variant } from "@/db";
import type { DynamicRange, Quality, Variant as VariantWire } from "./types";
import { accountRank, providerOf, type RestContext, streamUrlOf } from "./context";

/**
 * A variant = one stream of one provider, as the app lists and plays it. `src-i…` = a stream (a movie, a
 * channel, a series), `src-e…` = an episode under a series' stream; base36 of our own ids.
 */
export const variantId = (kind: "item" | "episode", id: number) => `src-${kind === "item" ? "i" : "e"}${id.toString(36)}`;
/** What a variant id names, the other way round; null for anything else. */
export function parseVariantId(id: string): { kind: "item" | "episode"; id: number } | null {
  const m = /^src-([ie])([0-9a-z]{1,8})$/.exec(id);
  return m ? { kind: m[1] === "i" ? "item" : "episode", id: Number.parseInt(m[2], 36) } : null;
}

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
/** Unknown quality is served as `UNKNOWN_QUALITY`. */
export const qualityOf = (q: string | null | undefined): Quality => (q && q in QUALITY_RANK ? (q as Quality) : UNKNOWN_QUALITY);
export const qualityOfRank = (r: number): Quality => knownQualityOfRank(r) ?? UNKNOWN_QUALITY;
export const drOf = (d: string | null | undefined): DynamicRange | undefined => (d === "HDR" || d === "DV" ? d : undefined);

/** What a variant needs from a playable row, whether it is an item or an episode source. */
export type Playable = {
  variantId: string;
  /** The provider's stream it is, or an episode of: `xtream_streams.id`. */
  streamId: number;
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
  /** The provider's own name of the entry: with its category, what tells two variants of the same quality apart. */
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
    variantId: variantId("item", it.id),
    streamId: it.id,
    container: ext.toUpperCase(),
    upstream: { accountId: it.accountId, kind: it.kind === "live" ? "live" : "movie", id: it.upstreamId, ext },
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

const badgeOf = (quality: Quality, dr?: DynamicRange) => (dr ? `${quality} ${dr}` : quality);
/** « FR · 4K DV · Version longue »: the language, the quality and the cut of a variant in one text. */
export const variantLabel = (v: { language: string; quality: Quality; dynamic_range?: DynamicRange; edition?: string }): string =>
  [`${languageLabel(v.language)} · ${badgeOf(v.quality, v.dynamic_range)}`, v.edition].filter((t) => t).join(" · ");

/**
 * The variants of a title, one per playable row, in the order the app lists them and tries them: the
 * profile's languages in its order, the usual cut before an edition (a choice, never what plays by
 * default), descending quality then dynamic range, the providers in the order of preference. `playable`
 * false: a series' own variants, which name its streams and play nothing.
 */
export function wireVariants(ctx: RestContext, rows: Playable[], playable = true): VariantWire[] {
  const order = ctx.languageOrder[rows[0]?.upstream.kind === "series" ? "series" : "vod"];
  return rows
    .map((r) => {
      const language = r.lang ?? "VO",
        quality = qualityOf(r.quality),
        dr = drOf(r.dynamicRange),
        edition = r.edition ?? undefined;
      const what = { language, quality, ...(dr ? { dynamic_range: dr } : {}), ...(edition ? { edition } : {}) };
      const wire: VariantWire = {
        id: r.variantId,
        ...what,
        badge: badgeOf(quality, dr),
        label: variantLabel(what),
        provider: providerOf(ctx, r.upstream.accountId),
        name: r.name,
        category: r.categoryName,
        container: r.container,
        stream_url: playable ? streamUrlOf(ctx, r.upstream.accountId, r.upstream.kind, r.upstream.id, r.upstream.ext) : null,
      };
      return { r, wire, q: QUALITY_RANK[quality], d: dr ? DYNAMIC_RANGE_RANK[dr] : 0, e: edition ?? "" };
    })
    .sort(
      (a, b) =>
        langRank(order, a.wire.language) - langRank(order, b.wire.language) ||
        a.wire.language.localeCompare(b.wire.language) ||
        Number(Boolean(a.e)) - Number(Boolean(b.e)) ||
        b.q - a.q ||
        b.d - a.d ||
        a.e.localeCompare(b.e) ||
        accountRank(ctx, a.r.upstream.accountId) - accountRank(ctx, b.r.upstream.accountId) ||
        a.r.position - b.r.position ||
        a.r.id - b.r.id,
    )
    .map((x) => x.wire);
}

/** « 4K DV », « HD »: a quality and its dynamic range; null without a known quality. */
export function qualityBadgeOf(s: { max_quality?: Quality; dynamic_range?: DynamicRange }): string | null {
  if (!s.max_quality) return null;
  return s.dynamic_range ? `${s.max_quality} ${s.dynamic_range}` : s.max_quality;
}

export function variantsSummary(variants: VariantWire[]): { max_quality?: Quality; dynamic_range?: DynamicRange; languages: string[] } {
  let q = 0,
    d = 0;
  for (const v of variants) {
    q = Math.max(q, QUALITY_RANK[v.quality]);
    if (v.dynamic_range) d = Math.max(d, DYNAMIC_RANGE_RANK[v.dynamic_range]);
  }
  return {
    ...(q ? { max_quality: qualityOfRank(q) } : {}),
    ...(d ? { dynamic_range: d === 2 ? "DV" : "HDR" } : {}),
    languages: [...new Set(variants.map((v) => v.language))], // `wireVariants` already put the profile's first
  };
}
