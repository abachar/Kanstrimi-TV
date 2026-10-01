import { QUALITY_RANK } from "@/catalog";
import { qualityOf, type Playable } from "./versions";
import type { Version } from "./types";

/**
 * The guide (EPG id) of each version of a channel. Its own: the first of its sources whose EPG id has
 * programmes. Else the closest lower quality's, else the closest higher one's: « TF1 4K » files no
 * programme and takes « TF1 FHD »'s, « M6 4K » keeps its own. Null when no quality has a guide.
 */
export function guidesOf(versions: Version[], playables: Playable[], hasGuide: (epgId: string) => boolean): Map<string, string | null> {
  const guideOf = (p: Playable) => p.epgIds.find(hasGuide) ?? null;
  const rank = (p: Playable) => QUALITY_RANK[qualityOf(p.quality)];
  const bySource = new Map(playables.map((p) => [p.sourceId, p]));
  const guided = [...playables].sort((a, b) => a.position - b.position || a.id - b.id).filter((p) => guideOf(p));
  const out = new Map<string, string | null>();
  for (const v of versions) {
    const own = v.sources.map((s) => bySource.get(s.id)).find((p) => p && guideOf(p));
    if (own) {
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
