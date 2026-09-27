/**
 * Real Xtream panels send `stream_id` / `series_id` as integers, and typed clients (Kotlin,
 * Swift) reject a string there — series lists are where it shows, movies being parsed more
 * leniently. We store ids as opaque text because upstream is not trustworthy, so only an id
 * that survives a number round-trip goes back out as a number; anything else stays a string.
 */
export function wireId(id: string): number | string {
  const n = Number(id);
  return Number.isSafeInteger(n) && String(n) === id ? n : id;
}
