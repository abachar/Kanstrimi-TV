import { QUALITY_RANK } from "@/catalog";
import { qualityOf, type Playable } from "./variants";
import type { Variant } from "./types";

/**
 * The guide (EPG id) of each variant of a channel. Its own: the first of its EPG ids that has programmes.
 * Else the closest lower quality's, else the closest higher one's: « TF1 4K » files no programme and takes
 * « TF1 FHD »'s, « M6 4K » keeps its own. Null when no quality has a guide.
 */
export function guidesOf(variants: Variant[], playables: Playable[], hasGuide: (epgId: string) => boolean): Map<string, string | null> {
  const guideOf = (p: Playable) => p.epgIds.find(hasGuide) ?? null;
  const rank = (p: Playable) => QUALITY_RANK[qualityOf(p.quality)];
  const byId = new Map(playables.map((p) => [p.variantId, p]));
  const guided = [...playables].sort((a, b) => a.position - b.position || a.id - b.id).filter((p) => guideOf(p));
  const out = new Map<string, string | null>();
  for (const v of variants) {
    const own = byId.get(v.id);
    if (own && guideOf(own)) {
      out.set(v.id, guideOf(own));
      continue;
    }
    const q = QUALITY_RANK[v.quality];
    const lower = guided.filter((p) => rank(p) <= q).sort((a, b) => rank(b) - rank(a))[0];
    const higher = guided.filter((p) => rank(p) > q).sort((a, b) => rank(a) - rank(b))[0];
    const p = lower ?? higher;
    out.set(v.id, p ? guideOf(p) : null);
  }
  return out;
}
