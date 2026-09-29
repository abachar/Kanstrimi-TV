/**
 * The one place that strips accents. Four callers need four shapes of the same text, each
 * kept exactly as it was: content keys and the search index are stored in the database, so a
 * change here would orphan favourites and progress rows.
 */

/** NFD, combining marks removed, *not* recomposed: `slug` and the adult regexes rely on this exact form. */
export function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Accent-free lower-case text for `to_tsvector('simple', …)`; the same rule is applied to
 * queries. Recomposed (NFC) so Hangul and other scripts that NFD breaks apart match again.
 */
export function searchText(s: string): string {
  return stripAccents(s).normalize("NFC").toLowerCase();
}

/** ASCII letters and digits only, for the title similarity: "Amélie & Co." → "amelie and co". */
export function similarityKey(s: string): string {
  return stripAccents(s)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Ornaments around separator lines and "premium" names: any "other symbol" (♣ ★ • ● ✪), never "+" or "&". */
export function stripOrnaments(s: string): string {
  return s.replace(/[\p{So}•·‣▪]/gu, " ");
}

/** Accent-free lower-case tokens joined by dashes, any script, at most 100 characters. Empty → "-". */
export function slug(s: string): string {
  return (
    stripAccents(s)
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
      .split(" ")
      .filter(Boolean)
      .join("-")
      .slice(0, 100)
      .replace(/-+$/, "") || "-"
  );
}

/** Dice coefficient on bigrams — good enough for title similarity. */
export function similarity(a: string, b: string): number {
  const na = similarityKey(a),
    nb = similarityKey(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const bg = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const k = s.slice(i, i + 2);
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  };
  const A = bg(na),
    B = bg(nb);
  let inter = 0;
  for (const [k, v] of A) inter += Math.min(v, B.get(k) ?? 0);
  return (2 * inter) / (na.length - 1 + (nb.length - 1));
}
