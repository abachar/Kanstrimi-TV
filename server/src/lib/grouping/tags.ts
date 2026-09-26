/**
 * One grammar for provider names. Pure: no database, no network.
 *
 * Extracts the market prefix (`|FR|`), the language, the quality, the dynamic range and
 * the year from an Xtream entry name, and returns the cleaned title used for display
 * and TMDB matching. Values are stored in the API vocabulary straight away
 * (`VF` / `VOSTFR` / `VO` / ISO code, `SD` / `HD` / `FHD` / `4K`, `HDR` / `DV`), so the
 * database and `/api/v1` speak the same words.
 *
 * Merges the regexes of the former `tmdb/match.ts` (calibrated on the production
 * catalogue) with the market and Unicode tags of `_Old/kanstrimi/…/cleanNames.ts`.
 */

import { createHash } from "node:crypto";

export type Kind = "live" | "vod" | "series";
export type Language = "VF" | "VOSTFR" | "VO" | (string & {});
export type Quality = "SD" | "HD" | "FHD" | "4K";
export type DynamicRange = "HDR" | "DV";

export type ParsedName = {
  /** Cleaned title, for display and TMDB. */
  title: string;
  year?: number;
  /** Lower-case market code from the prefix: "fr", "be", "ma"… */
  market?: string;
  language?: Language;
  quality?: Quality;
  dynamicRange?: DynamicRange;
  /** Informative leftovers: "multi", "hevc", "3d", "bluray"… */
  tags: string[];
  /** Series split per season upstream: « Vincenzo (MULTI) S01 » → 1. */
  seasonHint?: number;
};

export type CategoryHints = Pick<ParsedName, "market" | "language" | "quality" | "dynamicRange" | "tags">;

export const QUALITY_RANK: Record<Quality, number> = { SD: 1, HD: 2, FHD: 3, "4K": 4 };
export const DYNAMIC_RANGE_RANK: Record<DynamicRange, number> = { HDR: 1, DV: 2 };

// ---------------------------------------------------------------- vocabulary

/** Word → language. Multi-audio counts as VF: the French track is there, VLC picks it. */
const LANG_WORDS: Record<string, Language> = {
  FR: "VF", VF: "VF", VFF: "VF", VFQ: "VF", VFI: "VF", TRUEFRENCH: "VF", FRENCH: "VF",
  VOSTFR: "VOSTFR", VOST: "VOSTFR", VOSTA: "VOSTFR", SUB: "VOSTFR", SUBBED: "VOSTFR", MSUB: "VOSTFR", ESUB: "VOSTFR",
  MULTI: "VF", "MULTI-AUDIO": "VF", MULTISUB: "VOSTFR", "MULTI-SUB": "VOSTFR", DUB: "VF", DUBBED: "VF",
  EN: "VO", ENG: "VO", VO: "VO",
};
/** Two-letter codes accepted as a bare suffix or inside brackets (never mid-title). */
const ISO_CODES = new Set(["IT", "ES", "DE", "PT", "AR", "NL", "TR", "PL", "RU", "RO", "GR", "SE", "NO", "DK", "FI", "HU", "CZ", "BG", "HR", "SR", "JP", "KR", "CN", "TH", "FA", "HE", "UR", "HI"]);
const QUALITY_WORDS: Record<string, Quality> = {
  SD: "SD", "480P": "SD", "ˢᴰ": "SD",
  HD: "HD", "720P": "HD", "ᴴᴰ": "HD", HDTV: "HD",
  FHD: "FHD", "1080P": "FHD", "1080I": "FHD", BLURAY: "FHD", BDRIP: "FHD", REMUX: "FHD",
  "4K": "4K", UHD: "4K", "2160P": "4K", "ᵁᴴᴰ": "4K", "3840P": "4K", "8K": "4K",
};
const DR_WORDS: Record<string, DynamicRange> = { HDR: "HDR", HDR10: "HDR", "HDR10+": "HDR", DV: "DV", DOVI: "DV", "DOLBY VISION": "DV", "DOLBYVISION": "DV" };
/** Tags that mean nothing to the app but must leave the title. */
const NOISE_WORDS = ["HEVC", "X265", "X264", "H264", "H265", "AVC", "10BIT", "IMAX", "3D", "WEBRIP", "WEB-DL", "WEBDL", "HDRIP", "DVDRIP", "CAM", "TS", "LIGHT", "AC3", "EAC3", "AAC", "DTS", "ATMOS", "DD+", "DD", "5.1", "7.1", "DUAL", "BACKUP", "VIP", "PPV", "24/7", "REPLAY", "NO EVENT", "OFF AIR"];
/** Anything tag-like, longest first so "DOLBY VISION" wins over "DV". */
const ALL_WORDS = [...Object.keys(LANG_WORDS), ...ISO_CODES, ...Object.keys(QUALITY_WORDS), ...Object.keys(DR_WORDS), ...NOISE_WORDS]
  .sort((a, b) => b.length - a.length);
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const WORDS_ALT = ALL_WORDS.map(esc).join("|");
/** A bracketed group made only of tags: "(VOST)", "[FR/4K]", "(4K DV)", "(DD+ 5.1)". */
const BRACKET_GROUP = new RegExp(`[\\[\\(\\{]\\s*(?:${WORDS_ALT})(?:[\\s/,+\\-|]+(?:${WORDS_ALT}))*\\s*[\\]\\)\\}]`, "g");
/** Bare tags at a word boundary. Case-sensitive: "It" or "Old" must stay in a title. */
const BARE_TAG = new RegExp(`(?:^|[\\s\\-|:])(${WORDS_ALT}|\\d{3,4}[pi]|4k|8k)(?=$|[\\s\\-|:,.)])`, "g");
const MARKET_PREFIX = /^(?:[[|(]\s*([A-Za-z]{2,7}(?:-[A-Za-z]{2,3})?)\s*[\]|)]\s*[-:|]?\s*)/;
const BARE_PREFIX = /^([A-Z]{2,7})\s*[-:|]\s+/;
/** Ornaments around separator lines and "premium" names: any "other symbol" (♣ ★ • ● ✪), never "+" or "&". */
const DECORATIONS = /[\p{So}•·‣▪]/gu;
const TZ_DELAY = /\|?\s*[-+]?\d{1,2}H\s*\|?/gi;
const SEASON_TAG = /(?:^|[\s\-(\[|])(?:S(\d{1,2})|(?:Saison|Season|Temporada|Stagione)\s*(\d{1,2}))(?=$|[\s\-)\]|])/i;

// ---------------------------------------------------------------- helpers

type Found = { language?: Language; quality?: Quality; dynamicRange?: DynamicRange; tags: Set<string> };

function classify(word: string, f: Found, bracketed: boolean) {
  const w = word.toUpperCase().replace(/\s+/g, " ");
  if (LANG_WORDS[w]) { f.language ??= LANG_WORDS[w]; if (w.startsWith("MULTI") || w === "DUB" || w === "DUBBED") f.tags.add("multi"); return; }
  if (ISO_CODES.has(w)) { if (bracketed || !f.language) f.language ??= w; return; }
  if (QUALITY_WORDS[w]) { const q = QUALITY_WORDS[w]; if (!f.quality || QUALITY_RANK[q] > QUALITY_RANK[f.quality]) f.quality = q; if (w === "BLURAY" || w === "REMUX") f.tags.add(w.toLowerCase()); return; }
  if (DR_WORDS[w]) { const d = DR_WORDS[w]; if (!f.dynamicRange || DYNAMIC_RANGE_RANK[d] > DYNAMIC_RANGE_RANK[f.dynamicRange]) f.dynamicRange = d; return; }
  if (/^\d{3,4}[PI]$/.test(w)) { const n = Number(w.slice(0, -1)); const q: Quality = n >= 2160 ? "4K" : n >= 1080 ? "FHD" : n >= 720 ? "HD" : "SD"; if (!f.quality || QUALITY_RANK[q] > QUALITY_RANK[f.quality]) f.quality = q; return; }
  const tag = w.toLowerCase();
  if (["hevc", "x265", "h265", "3d", "10bit", "imax", "atmos"].includes(tag)) f.tags.add(tag);
}

function extractTags(s: string, f: Found): string {
  s = s.replace(BRACKET_GROUP, (m) => {
    for (const w of m.slice(1, -1).split(/[\s/,+\-|]+/).filter(Boolean)) classify(w, f, true);
    // "DOLBY VISION" spans a space: catch it on the whole group too.
    if (/DOLBY\s*VISION/i.test(m)) classify("DOLBY VISION", f, true);
    return " ";
  });
  s = s.replace(BARE_TAG, (m, w: string) => {
    // A bare ISO code is a suffix only: it must be the last word (title words like "DE" stay).
    if (ISO_CODES.has(w.toUpperCase()) && /\S/.test(s.slice(s.indexOf(m) + m.length))) return m;
    classify(w, f, false);
    return " ";
  });
  return s;
}

/** Year extraction with the heuristics of the former `cleanTitle`. */
function extractYear(s: string): { s: string; year?: number } {
  const paren = /[([]\s*((?:19|20)\d{2})\s*[)\]]/.exec(s);
  if (paren) return { s: s.replace(paren[0], " "), year: Number(paren[1]) };
  // Scene-style names: "Silver.Book.of.Dreams.2013" → the dots are spaces and the tail is the year.
  const scene = /^(\S+\.\S+)\.((?:19|20)\d{2})((?:\.\S+)*)$/.exec(s.trim());
  if (scene && !/\s/.test(s.trim())) return { s: scene[1].replace(/\./g, " ") + scene[3].replace(/\./g, " "), year: Number(scene[2]) };
  const ym = [...s.matchAll(/(?:^|[\s\-.|:])((?:19|20)\d{2})(?=$|[\s\-.|:])/g)];
  const m = ym[ym.length - 1];
  if (m && m.index !== undefined && m.index > 0) {
    const after = s.slice(m.index + m[0].length).trim();
    const before = s.slice(0, m.index).trim();
    // A bare year counts as a year only when something follows it or a separator precedes it:
    // "Blade Runner 2049" keeps its number, "Ballerina | 2023" and "Life | 2015 (UHD)" lose theirs.
    if ((after.length > 0 && !/^[\s\-.|:]*$/.test(after)) || /[-|:]\s*$/.test(before)) {
      return { s: s.slice(0, m.index) + " " + s.slice(m.index + m[0].length), year: Number(m[1]) };
    }
    if (/[-|:]\s*$/.test(before)) return { s: s.slice(0, m.index), year: Number(m[1]) };
  }
  return { s };
}

function tidy(s: string): string {
  s = s.replace(/[[\]{}]/g, " ");
  // Keep the first pipe segment when it is not empty: "Selena | 2006 | مترجم | سيلينا" → "Selena".
  const segs = s.split("|").map((x) => x.trim());
  s = segs.find(Boolean) ?? "";
  s = s.replace(/\(\s*\)/g, " ");
  s = s.replace(/\s+-\s+-\s+/g, " - ").replace(/(?:\s*[-:|,]\s*)+$/g, "").replace(/^(?:\s*[-:|,]\s*)+/g, "");
  return s.replace(/\s{2,}/g, " ").trim();
}

// ---------------------------------------------------------------- public

export function parseName(raw: string, kind: Kind): ParsedName {
  const f: Found = { tags: new Set() };
  let s = raw.normalize("NFC").replace(DECORATIONS, " ").replace(/^[\s\-_=~]+|[\s\-_=~]+$/g, "");
  let market: string | undefined;

  // Market prefixes, possibly stacked: "|FR| ", "[FR] ", "(FR) ", "FR - ", "VOD FR |".
  for (;;) {
    const m = MARKET_PREFIX.exec(s) ?? BARE_PREFIX.exec(s);
    if (!m) break;
    const code = m[1].toUpperCase();
    // Technical prefixes some providers stamp on scene releases ("AZ - Title.2013"): not a market.
    if (["AZ", "VOD", "TV", "LIVE", "NEWS", "MAG", "PPV"].includes(code)) { s = s.slice(m[0].length); continue; }
    // "|FR|" is a market, not a language: "|FR| Tenet (VOST)" is sold in France, in VOSTFR.
    if (/^[A-Z]{2,3}(?:-[A-Z]{2,3})?$/.test(code) && !["VF", "VO", "SUB", "DUB", "ENG", "VFF", "VFQ"].includes(code)) market ??= code.toLowerCase();
    else if (LANG_WORDS[code]) f.language ??= LANG_WORDS[code];
    else break;
    s = s.slice(m[0].length);
  }
  // Leading language words without a separator: "VOSTFR Parasite - 2019".
  s = s.replace(new RegExp(`^(?:(?:${Object.keys(LANG_WORDS).map(esc).join("|")})\\s*[-:|]?\\s+)+`, ""), (m) => {
    for (const w of m.split(/[\s\-:|]+/).filter(Boolean)) classify(w, f, false);
    return "";
  });
  if (kind === "live") s = s.replace(TZ_DELAY, " ");

  let seasonHint: number | undefined;
  if (kind === "series") {
    const m = SEASON_TAG.exec(s);
    if (m) { seasonHint = Number(m[1] ?? m[2]); s = s.replace(m[0], m[0].startsWith("(") || m[0].startsWith("[") ? " " : " "); }
  }

  const y = extractYear(s);
  s = y.s;
  s = extractTags(s, f);
  // Provider labels on live channels: "[P.TV]", "[TF1+]", "(Niger)" stay for the last, go for the first.
  if (kind === "live") s = s.replace(/\[[A-Z0-9.+ -]{1,8}\]/g, " ");
  s = tidy(s);

  return {
    title: s || raw.trim(), year: y.year, market,
    language: f.language, quality: f.quality, dynamicRange: f.dynamicRange,
    tags: [...f.tags].sort(), seasonHint,
  };
}

/** Hints carried by a category name: "|FR| FILMS 4K DV" → fr, 4K, DV ; "|AR| MAGHREB VOSTFR" → ar, VOSTFR. */
export function parseCategory(name: string): CategoryHints {
  const p = parseName(name, "vod");
  return { market: p.market, language: p.language, quality: p.quality, dynamicRange: p.dynamicRange, tags: p.tags };
}

/** The language served to the app when neither the name nor the category said one. */
export function defaultLanguage(market?: string): Language {
  if (!market) return "VO";
  if (market === "fr" || market === "be" || market === "ch" || market === "ca" || market === "ma" || market === "dz" || market === "tn") return "VF";
  if (market === "en" || market === "us" || market === "uk" || market === "gb" || market === "au") return "VO";
  return market.toUpperCase();
}

/** Accent-free lower-case tokens joined by dashes, any script, at most 100 characters. Empty → "-". */
export function slug(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/&/g, " and ").replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(" ").filter(Boolean).join("-").slice(0, 100).replace(/-+$/, "") || "-";
}

export type KeyInput = {
  kind: Kind; title: string; year?: number | null; market?: string | null;
  tmdbId?: number | null; matchStatus?: string | null; keyOverride?: string | null;
};

/**
 * The stable identity of a content, in priority order: manual override, verified TMDB id,
 * then a fallback on the cleaned title. Never a provider id.
 */
export function contentKey(i: KeyInput): string {
  if (i.keyOverride) return i.keyOverride;
  // A name without a single letter or digit (separator lines, emoji-only entries) gets a
  // key of its own instead of joining every other junk entry in one 400-variant group.
  const s = slug(i.title);
  const id = s === "-" ? `x${createHash("sha1").update(i.title).digest("hex").slice(0, 10)}` : s;
  if (i.kind === "live") return `live:${i.market ? i.market + "-" : ""}${id}`;
  const kind = i.kind === "vod" ? "movie" : "series";
  if (i.tmdbId && (i.matchStatus === "matched" || i.matchStatus === "manual")) return `tmdb:${i.kind === "vod" ? "movie" : "tv"}:${i.tmdbId}`;
  return `fallback:${kind}:${id}:${i.year ?? "-"}`;
}

/** Parse a REST content id back into its parts. Null when it is not one of ours. */
export function parseKey(key: string): { kind: Kind; tmdbId?: number; season?: number; episode?: number; seriesKey: string } | null {
  const ep = /^(.*):s(\d{2})e(\d{2})$/.exec(key);
  const base = ep ? ep[1] : key;
  let kind: Kind;
  let tmdbId: number | undefined;
  let m: RegExpExecArray | null;
  if ((m = /^tmdb:(movie|tv):(\d+)$/.exec(base))) { kind = m[1] === "movie" ? "vod" : "series"; tmdbId = Number(m[2]); }
  else if ((m = /^fallback:(movie|series):.+$/.exec(base))) kind = m[1] === "movie" ? "vod" : "series";
  else if (/^live:.+$/.test(base)) kind = "live";
  else if (/^manual:\d+$/.test(base)) return null;
  else return null;
  if (ep && kind !== "series") return null;
  return { kind, tmdbId, season: ep ? Number(ep[2]) : undefined, episode: ep ? Number(ep[3]) : undefined, seriesKey: base };
}

export function episodeKey(seriesKey: string, season: number, episode: number) {
  return `${seriesKey}:s${String(season).padStart(2, "0")}e${String(episode).padStart(2, "0")}`;
}
