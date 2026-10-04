import { stripAccents } from "@/shared";

/**
 * Guide ids. The provider's are its own (`TF1.fr`); a fallback source's channel is stored as
 * `@<source id>/<its id>` (`@3/beIN SPORTS 1.qa`): two sources may use the same id for different
 * channels, and a suffix rule of the provider (`*.qa`) must not shift a source's guide.
 */
export const sourceGuideId = (sourceId: number, channelId: string) => `@${sourceId}/${channelId}`;

export function parseSourceGuideId(id: string): { sourceId: number; channelId: string } | null {
  const m = /^@(\d+)\/(.+)$/s.exec(id);
  return m ? { sourceId: Number(m[1]), channelId: m[2] } : null;
}

/**
 * The key a channel is found by in a fallback source: its name or id without accents, country
 * prefix (« FR - », « |AR| ») or suffix (`.qa`), parentheses (« (A) »), quality words and
 * punctuation. « BEIN SPORTS MAX 1 (A) », `beIN SPORTS MAX 1.qa` and `beINSportsMax1.qa` meet on
 * `beinsportsmax1`.
 */
export function guideNameKey(s: string): string {
  return stripAccents(s)
    .toLowerCase()
    .replace(/^\s*(?:\|[a-z]{2,3}\||[a-z]{2,3}\s*[-:|])\s*/, "")
    .replace(/\.[a-z]{2,3}$/, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\benglish\b/g, "en")
    .replace(/\bfrench\b/g, "fr")
    .replace(/\b(?:fhd|uhd|hd|sd|4k|hevc|digital)\b/g, " ")
    .replace(/[^a-z0-9]/g, "");
}
