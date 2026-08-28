import type { TmdbSearchResult } from "./client";

const LANG_TAGS = "FR|EN|VF|VO|VOSTFR|VOST|VFF|VFQ|MULTI|TRUEFRENCH|FRENCH|IT|ES|DE|PT|AR|NL|TR|PL|RU|SUB|SUBBED|DUBBED";
const QUALITY_TAGS = "4K|UHD|2160P|1080P|720P|480P|HD|FHD|SD|HDR|HDR10|DV|DOLBY VISION|HEVC|X265|X264|H264|H265|BLURAY|BDRIP|WEBRIP|WEB-DL|WEBDL|HDRIP|DVDRIP|CAM|TS|REMUX|10BIT|IMAX";

export type CleanResult = { title: string; year?: number };

/** Strip language/quality tags, provider prefixes and extract the year from an Xtream title. */
export function cleanTitle(raw: string): CleanResult {
  let s = raw.normalize("NFC").trim();
  // provider prefixes: "FR - ", "|FR| ", "[FR] ", "FR: ", "VOD FR |"
  s = s.replace(/^(?:[\[\|\(]\s*[A-Z]{2,7}\s*[\]\|\)]\s*[-:|]?\s*)+/i, "");
  s = s.replace(new RegExp(`^(?:(?:${LANG_TAGS})\\s*[-:|]\\s*)+`, "i"), "");
  // year (keep the last plausible 19xx/20xx)
  let year: number | undefined;
  const paren = /[\(\[]\s*((?:19|20)\d{2})\s*[\)\]]/.exec(s);
  if (paren) {
    year = Number(paren[1]);
    s = s.replace(paren[0], " ");
  } else {
    // bare year: take the last one that is not the first word (e.g. "Blade Runner 2049" keeps 2049 when nothing follows... see below)
    const ym = [...s.matchAll(/(?:^|[\s\-\.])((?:19|20)\d{2})(?=$|[\s\-\.])/g)];
    const m = ym[ym.length - 1];
    if (m && m.index !== undefined && m.index > 0) {
      const after = s.slice(m.index + m[0].length).trim();
      const before = s.slice(0, m.index).trim();
      // A bare year is treated as a year only when something tag-like follows it, or a separator precedes it.
      if (after.length > 0 || /[-|]\s*$/.test(before)) {
        year = Number(m[1]);
        s = s.slice(0, m.index) + " " + s.slice(m.index + m[0].length);
      }
    }
  }
  // bracketed / trailing tags
  s = s.replace(new RegExp(`[\\[\\(\\{]\\s*(?:${LANG_TAGS}|${QUALITY_TAGS})(?:[\\s/,+-]+(?:${LANG_TAGS}|${QUALITY_TAGS}))*\\s*[\\]\\)\\}]`, "gi"), " ");
  s = s.replace(new RegExp(`(?:^|[\\s\\-|:])(?:${LANG_TAGS}|${QUALITY_TAGS})(?=$|[\\s\\-|:])`, "gi"), " ");
  s = s.replace(/[\[\]\{\}\|]/g, " ");
  s = s.replace(/\s+-\s+-\s+/g, " - ").replace(/(?:\s*[-:]\s*)+$/g, "").replace(/^(?:\s*[-:]\s*)+/g, "");
  s = s.replace(/\s{2,}/g, " ").trim();
  // "Title - Subtitle" keep as is; strip trailing empty parens
  s = s.replace(/\(\s*\)/g, "").trim();
  return { title: s || raw.trim(), year };
}

export function normalize(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
}

/** Dice coefficient on bigrams — good enough for title similarity. */
export function similarity(a: string, b: string): number {
  const na = normalize(a), nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const bg = (s: string) => { const m = new Map<string, number>(); for (let i = 0; i < s.length - 1; i++) { const k = s.slice(i, i + 2); m.set(k, (m.get(k) ?? 0) + 1); } return m; };
  const A = bg(na), B = bg(nb);
  let inter = 0;
  for (const [k, v] of A) inter += Math.min(v, B.get(k) ?? 0);
  return (2 * inter) / ((na.length - 1) + (nb.length - 1));
}

export type Scored = { result: TmdbSearchResult; score: number };

/** Pick the best TMDB search result for a cleaned title (+ optional year). */
export function pickBest(results: TmdbSearchResult[], title: string, year?: number): Scored | null {
  let best: Scored | null = null;
  for (const r of results) {
    const names = [r.title, r.name, r.original_title, r.original_name].filter(Boolean) as string[];
    const sim = Math.max(0, ...names.map((n) => similarity(n, title)));
    const ry = Number((r.release_date ?? r.first_air_date ?? "").slice(0, 4)) || undefined;
    let score = sim;
    if (year && ry) score += Math.abs(ry - year) <= 1 ? 0.15 : -0.2;
    score += Math.min((r.vote_count ?? 0) / 5000, 0.05);
    if (!best || score > best.score) best = { result: r, score };
  }
  return best;
}

export const MATCH_THRESHOLD = 0.72;
