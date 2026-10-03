import { QUALITY_RANK, DYNAMIC_RANGE_RANK, qualityOfRank as knownQualityOfRank } from "@/catalog";
import type { Variant } from "@/db";
import type { DynamicRange, Quality, Version } from "./types";
import { slug } from "@/shared";
import type { RestContext } from "./context";
import { sourceId } from "./stream-links";

/** A version = language × quality × dynamic range × edition; its sources are the playable variants behind it. */

export const DEFAULT_LANGUAGE_ORDER = ["VF", "VOSTFR", "VO"];
const LANG_RANK = (l: string) => {
  const i = DEFAULT_LANGUAGE_ORDER.indexOf(l);
  return i === -1 ? 3 : i;
};
export function sortLanguages(langs: Iterable<string>): string[] {
  return [...new Set(langs)].sort((a, b) => LANG_RANK(a) - LANG_RANK(b) || a.localeCompare(b));
}
/** Unknown quality is served as HD: the app needs a value, and providers rarely ship worse. */
export const qualityOf = (q: string | null | undefined): Quality => (q && q in QUALITY_RANK ? (q as Quality) : "HD");
export const qualityOfRank = (r: number): Quality => knownQualityOfRank(r) ?? "HD";
export const drOf = (d: string | null | undefined): DynamicRange | undefined => (d === "HDR" || d === "DV" ? d : undefined);

/** What a version needs from a playable row, whether it is an item or an episode source. */
export type Playable = {
  sourceId: string;
  container: string;
  /** Where the provider serves it: `/{kind}/{user}/{password}/{id}.{ext}`. */
  upstream: { kind: "live" | "movie" | "series"; id: string; ext: string };
  lang: string | null;
  quality: string | null;
  dynamicRange: string | null;
  edition: string | null;
  /** Live: the EPG ids to try, in order (the provider's, then iptv-org's when they disagree). */
  epgIds: string[];
  categoryName: string | null;
  qualityRank: number;
  position: number;
  id: number;
};

/** The provider's EPG id, then iptv-org's when they name different channels: the first with programmes wins. */
function epgIdsOf(it: Variant): string[] {
  if (it.kind !== "live") return [];
  const own = String(it.raw.epg_channel_id ?? "") || null;
  return [own, it.epgMismatch ? it.iptvId : null].filter((x): x is string => Boolean(x));
}

export function playableOfItem(it: Variant, categoryName: string | null): Playable {
  const ext = String(it.raw.container_extension ?? (it.kind === "live" ? "ts" : "mp4"));
  return {
    sourceId: sourceId("item", it.id),
    container: ext.toUpperCase(),
    upstream: { kind: it.kind === "live" ? "live" : "movie", id: it.xtreamId, ext },
    lang: it.lang,
    quality: it.quality,
    dynamicRange: it.dynamicRange,
    edition: it.edition,
    epgIds: epgIdsOf(it),
    categoryName,
    qualityRank: it.qualityRank,
    position: it.position,
    id: it.id,
  };
}

/**
 * The provider's own URL, played as is: its account is in the path, so it goes to the paired devices only
 * (the admin reads the catalogue without one and never plays).
 */
const streamUrl = (ctx: RestContext, r: Playable) => (ctx.device && ctx.upstreamUrl(r.upstream.kind, r.upstream.id, r.upstream.ext)) || "";

/** Group playable rows by language × quality × dynamic range × edition; sources in server order. */
export function versionsOf(ctx: RestContext, rows: Playable[], withSources = true): Version[] {
  const map = new Map<string, Version & { _q: number; _d: number; _e: string }>();
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
      };
      map.set(id, v);
    }
    if (withSources)
      v.sources.push({
        id: r.sourceId,
        container: r.container,
        stream_url: streamUrl(ctx, r),
        provider: { id: "xtream", name: ctx.providerName, kind: "xtream" },
        origin: r.categoryName,
      });
  }
  // The usual cut first: an edition is a choice, never what plays by default.
  return [...map.values()]
    .sort(
      (a, b) =>
        LANG_RANK(a.language) - LANG_RANK(b.language) ||
        a.language.localeCompare(b.language) ||
        Number(Boolean(a._e)) - Number(Boolean(b._e)) ||
        b._q - a._q ||
        b._d - a._d ||
        a._e.localeCompare(b._e),
    )
    .map(({ _q, _d, _e, ...v }) => v);
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
    languages: sortLanguages(versions.map((v) => v.language)),
  };
}
