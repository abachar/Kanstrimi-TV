import type { TmdbSearchResult } from "./client";

import { parseName } from "@/lib/grouping/tags";

export type CleanResult = { title: string; year?: number };

/** Cleaned title + year of a VOD/series name. One grammar for the whole server: `grouping/tags.ts`. */
export function cleanTitle(raw: string): CleanResult {
  const p = parseName(raw, "vod");
  return { title: p.title, year: p.year };
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
