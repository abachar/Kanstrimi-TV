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

/**
 * What a text says outside the Latin alphabet (Arabic, Cyrillic, Greek, Hebrew, Chinese…), for the
 * title similarity: its other letters and its digits, with what Arabic spells loosely written one
 * way (vowel marks and the hamza dropped, « ة » as « ه », « ى » as « ي », « ٢ » as « 2 »). Empty
 * when it holds no such letter: « Avatar 2 » says nothing here.
 */
export function otherScriptKey(s: string): string {
  // NFD first: « أ », « إ », « آ », « ؤ », « ئ » are a letter and a mark.
  const k = stripAccents(s)
    .replace(/[\u0591-\u05c7\u064b-\u065f\u0670\u0640]/g, "")
    .replace(/\u0671/g, "\u0627")
    .replace(/[\u0649\u06cc]/g, "\u064a")
    .replace(/\u0629/g, "\u0647")
    .replace(/\u06a9/g, "\u0643")
    .replace(/[\u0660-\u0669\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) & 0xf))
    .toLowerCase()
    .replace(/\p{Script=Latin}+/gu, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  return /\p{L}/u.test(k) ? k : "";
}

/**
 * How close two titles are, each alphabet on its own: what they say in Latin letters, or what they
 * say in another script, whichever agrees most. « Fas Melh Wa Dakh فص ملح وداخ » is both
 * « Fas Melh Wa Dakh » and « فص ملح وداخ ».
 */
export function similarity(a: string, b: string): number {
  return Math.max(dice(similarityKey(a), similarityKey(b)), dice(otherScriptKey(a), otherScriptKey(b)));
}

/** Dice coefficient on bigrams — good enough for title similarity. */
function dice(na: string, nb: string): number {
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  // Two different single characters share no pair of letters.
  if (na.length + nb.length <= 2) return 0;
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
