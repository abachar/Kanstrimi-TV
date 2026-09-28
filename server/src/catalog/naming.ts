/**
 * One grammar for provider names. Pure: no database, no network.
 *
 * Extracts the market prefix (`|FR|`), the language, the quality, the dynamic range and
 * the year from an Xtream entry name, and returns the cleaned title used for display
 * and TMDB matching. Values are stored in the API vocabulary straight away
 * (`VF` / `VOSTFR` / `VO` / ISO code, `SD` / `HD` / `FHD` / `4K`, `HDR` / `DV`), so the
 * database and `/player` speak the same words.
 *
 * Merges the regexes of the former `tmdb/match.ts` (calibrated on the production
 * catalogue) with the market and Unicode tags of `_Old/kanstrimi/…/cleanNames.ts`.
 */

import type { Kind } from "@/db";
import { stripAccents, stripOrnaments } from "@/shared";
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

export type CategoryHints = Pick<ParsedName, "market" | "language" | "quality" | "dynamicRange" | "tags"> & { title: string };

export const QUALITY_RANK: Record<Quality, number> = { SD: 1, HD: 2, FHD: 3, "4K": 4 };
export const DYNAMIC_RANGE_RANK: Record<DynamicRange, number> = { HDR: 1, DV: 2 };
/** Inverse of `QUALITY_RANK`; null for an unknown quality (rank 0). */
export function qualityOfRank(rank: number): Quality | null {
  return (Object.keys(QUALITY_RANK) as Quality[]).find((q) => QUALITY_RANK[q] === rank) ?? null;
}

// ---------------------------------------------------------------- vocabulary

/** Word → language. Multi-audio counts as VF: the French track is there, VLC picks it. */
const LANG_WORDS: Record<string, Language> = {
  FR: "VF",
  VF: "VF",
  VFF: "VF",
  VFQ: "VF",
  VFI: "VF",
  TRUEFRENCH: "VF",
  FRENCH: "VF",
  VOSTFR: "VOSTFR",
  VOST: "VOSTFR",
  VOSTA: "VOSTFR",
  SUB: "VOSTFR",
  SUBBED: "VOSTFR",
  MSUB: "VOSTFR",
  ESUB: "VOSTFR",
  MULTI: "VF",
  "MULTI-AUDIO": "VF",
  MULTISUB: "VOSTFR",
  "MULTI-SUB": "VOSTFR",
  DUB: "VF",
  DUBBED: "VF",
  EN: "VO",
  ENG: "VO",
  VO: "VO",
};
/** Two-letter codes accepted as a bare suffix or inside brackets (never mid-title). */
const ISO_CODES = new Set([
  "IT",
  "ES",
  "DE",
  "PT",
  "AR",
  "NL",
  "TR",
  "PL",
  "RU",
  "RO",
  "GR",
  "SE",
  "NO",
  "DK",
  "FI",
  "HU",
  "CZ",
  "BG",
  "HR",
  "SR",
  "JP",
  "KR",
  "CN",
  "TH",
  "FA",
  "HE",
  "UR",
  "HI",
]);
const QUALITY_WORDS: Record<string, Quality> = {
  SD: "SD",
  "480P": "SD",
  ˢᴰ: "SD",
  HD: "HD",
  "720P": "HD",
  ᴴᴰ: "HD",
  HDTV: "HD",
  FHD: "FHD",
  "1080P": "FHD",
  "1080I": "FHD",
  BLURAY: "FHD",
  BDRIP: "FHD",
  REMUX: "FHD",
  "4K": "4K",
  UHD: "4K",
  "2160P": "4K",
  ᵁᴴᴰ: "4K",
  "3840P": "4K",
  "8K": "4K",
};
const DR_WORDS: Record<string, DynamicRange> = {
  HDR: "HDR",
  HDR10: "HDR",
  "HDR10+": "HDR",
  DV: "DV",
  DOVI: "DV",
  "DOLBY VISION": "DV",
  DOLBYVISION: "DV",
};
/** Tags that mean nothing to the app but must leave the title. */
const NOISE_WORDS = [
  "HEVC",
  "X265",
  "X264",
  "H264",
  "H265",
  "AVC",
  "10BIT",
  "IMAX",
  "3D",
  "WEBRIP",
  "WEB-DL",
  "WEBDL",
  "HDRIP",
  "DVDRIP",
  "CAM",
  "TS",
  "LIGHT",
  "AC3",
  "EAC3",
  "AAC",
  "DTS",
  "ATMOS",
  "DD+",
  "DD",
  "5.1",
  "7.1",
  "DUAL",
  "BACKUP",
  "VIP",
  "PPV",
  "24/7",
  "REPLAY",
  "NO EVENT",
  "OFF AIR",
];
/** Anything tag-like, longest first so "DOLBY VISION" wins over "DV". */
const ALL_WORDS = [...Object.keys(LANG_WORDS), ...ISO_CODES, ...Object.keys(QUALITY_WORDS), ...Object.keys(DR_WORDS), ...NOISE_WORDS].sort(
  (a, b) => b.length - a.length,
);
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const WORDS_ALT = ALL_WORDS.map(esc).join("|");
/** A bracketed group made only of tags: "(VOST)", "[FR/4K]", "(4K DV)", "(DD+ 5.1)". */
const BRACKET_GROUP = new RegExp(`[\\[\\(\\{]\\s*(?:${WORDS_ALT})(?:[\\s/,+\\-|]+(?:${WORDS_ALT}))*\\s*[\\]\\)\\}]`, "g");
/** Bare tags at a word boundary. Case-sensitive: "It" or "Old" must stay in a title. */
const BARE_TAG = new RegExp(`(?:^|[\\s\\-|:])(${WORDS_ALT}|\\d{3,4}[pi]|4k|8k)(?=$|[\\s\\-|:,.)])`, "g");
const MARKET_PREFIX = /^(?:[[|(]\s*([A-Za-z]{2,7}(?:-[A-Za-z]{2,3})?)\s*[\]|)]\s*[-:|]?\s*)/;
const BARE_PREFIX = /^([A-Z]{2,7})\s*[-:|]\s+/;
const TZ_DELAY = /\|?\s*[-+]?\d{1,2}H\s*\|?/gi;
const SEASON_TAG = /(?:^|[\s\-(\[|])(?:S(\d{1,2})|(?:Saison|Season|Temporada|Stagione)\s*(\d{1,2}))(?=$|[\s\-)\]|])/i;

// ---------------------------------------------------------------- helpers

type Found = { language?: Language; quality?: Quality; dynamicRange?: DynamicRange; tags: Set<string> };

function classify(word: string, f: Found, bracketed: boolean) {
  const w = word.toUpperCase().replace(/\s+/g, " ");
  if (LANG_WORDS[w]) {
    f.language ??= LANG_WORDS[w];
    if (w.startsWith("MULTI") || w === "DUB" || w === "DUBBED") f.tags.add("multi");
    return;
  }
  if (ISO_CODES.has(w)) {
    if (bracketed || !f.language) f.language ??= w;
    return;
  }
  if (QUALITY_WORDS[w]) {
    const q = QUALITY_WORDS[w];
    if (!f.quality || QUALITY_RANK[q] > QUALITY_RANK[f.quality]) f.quality = q;
    if (w === "BLURAY" || w === "REMUX") f.tags.add(w.toLowerCase());
    return;
  }
  if (DR_WORDS[w]) {
    const d = DR_WORDS[w];
    if (!f.dynamicRange || DYNAMIC_RANGE_RANK[d] > DYNAMIC_RANGE_RANK[f.dynamicRange]) f.dynamicRange = d;
    return;
  }
  if (/^\d{3,4}[PI]$/.test(w)) {
    const n = Number(w.slice(0, -1));
    const q: Quality = n >= 2160 ? "4K" : n >= 1080 ? "FHD" : n >= 720 ? "HD" : "SD";
    if (!f.quality || QUALITY_RANK[q] > QUALITY_RANK[f.quality]) f.quality = q;
    return;
  }
  const tag = w.toLowerCase();
  if (["hevc", "x265", "h265", "3d", "10bit", "imax", "atmos"].includes(tag)) f.tags.add(tag);
}

function extractTags(s: string, f: Found): string {
  s = s.replace(BRACKET_GROUP, (m) => {
    for (const w of m
      .slice(1, -1)
      .split(/[\s/,+\-|]+/)
      .filter(Boolean))
      classify(w, f, true);
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
  s = s
    .replace(/\s+-\s+-\s+/g, " - ")
    .replace(/(?:\s*[-:|,]\s*)+$/g, "")
    .replace(/^(?:\s*[-:|,]\s*)+/g, "");
  return s.replace(/\s{2,}/g, " ").trim();
}

// ---------------------------------------------------------------- public

export function parseName(raw: string, kind: Kind): ParsedName {
  const f: Found = { tags: new Set() };
  let s = stripOrnaments(raw.normalize("NFC")).replace(/^[\s\-_=~]+|[\s\-_=~]+$/g, "");
  let market: string | undefined;

  // Market prefixes, possibly stacked: "|FR| ", "[FR] ", "(FR) ", "FR - ", "VOD FR |".
  for (;;) {
    const m = MARKET_PREFIX.exec(s) ?? BARE_PREFIX.exec(s);
    if (!m) break;
    const code = m[1].toUpperCase();
    // Technical prefixes some providers stamp on scene releases ("AZ - Title.2013"): not a market.
    if (["AZ", "VOD", "TV", "LIVE", "NEWS", "MAG", "PPV"].includes(code)) {
      s = s.slice(m[0].length);
      continue;
    }
    // "|FR|" is a market, not a language: "|FR| Tenet (VOST)" is sold in France, in VOSTFR.
    if (/^[A-Z]{2,3}(?:-[A-Z]{2,3})?$/.test(code) && !["VF", "VO", "SUB", "DUB", "ENG", "VFF", "VFQ"].includes(code))
      market ??= code.toLowerCase();
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
    if (m) {
      seasonHint = Number(m[1] ?? m[2]);
      s = s.replace(m[0], m[0].startsWith("(") || m[0].startsWith("[") ? " " : " ");
    }
  }

  const y = extractYear(s);
  s = y.s;
  s = extractTags(s, f);
  // Provider labels on live channels: "[P.TV]", "[TF1+]", "(Niger)" stay for the last, go for the first.
  if (kind === "live") s = s.replace(/\[[A-Z0-9.+ -]{1,8}\]/g, " ");
  s = tidy(s);

  return {
    title: s || raw.trim(),
    year: y.year,
    market,
    language: f.language,
    quality: f.quality,
    dynamicRange: f.dynamicRange,
    tags: [...f.tags].sort(),
    seasonHint,
  };
}

const ADULT_WORDS =
  /(^|[\s|\[\](){}:./-])(XXX|ADULTES?|ADULT(?!\s*SWIM)|PORN(?:O)?|\+18|18\+|EROTI(?:QUES?|CS?|K)|HENTAI|FOR ADULTS|ONLY ?FANS|BRAZZERS|PLAYBOY)(?=$|[\s|\[\](){}:./-])/i;
/** Only an explicit bracketed tag: « xXx : Reactivated » and « Bienvenue dans l'âge adulte » are films. */
const ADULT_TAG = /[\[({]\s*(XXX|18\+|\+18|ADULTES?|PORNO?)\s*[\])}]/i;
/** Does a provider category announce adult content? Words are enough there. */
export function isAdultCategory(name: string): boolean {
  return ADULT_WORDS.test(stripAccents(name));
}
/** Does an entry name carry an explicit adult tag? Plain words in a title never count. */
export function isAdultEntryName(name: string): boolean {
  return ADULT_TAG.test(stripAccents(name));
}

/** Hints carried by a category name: "|FR| FILMS 4K DV" → fr, 4K, DV ; "|AR| MAGHREB VOSTFR" → ar, VOSTFR. */
export function parseCategory(name: string): CategoryHints {
  const p = parseName(name, "vod");
  return { title: p.title, market: p.market, language: p.language, quality: p.quality, dynamicRange: p.dynamicRange, tags: p.tags };
}

/** The language served to the app when neither the name nor the category said one. */
export function defaultLanguage(market?: string): Language {
  if (!market) return "VO";
  if (market === "fr" || market === "be" || market === "ch" || market === "ca" || market === "ma" || market === "dz" || market === "tn")
    return "VF";
  if (market === "en" || market === "us" || market === "uk" || market === "gb" || market === "au") return "VO";
  return market.toUpperCase();
}

// ---------------------------------------------------------------- live sections and themes

/** « |FR| CINEMA FHD |FR| » (the text of a separator line, as the import stored it) → "CINEMA". */
export function sectionLabel(section: string): string {
  return parseName(section, "live").title;
}

/** The themes the app groups channels by, in display order. Labels are what the app shows. */
export const LIVE_THEMES = [
  "Généralistes",
  "Cinéma",
  "Séries",
  "Sport",
  "Jeunesse",
  "Infos",
  "Découverte",
  "Musique",
  "Régionales",
  "Religion",
] as const;
export type LiveTheme = (typeof LIVE_THEMES)[number];
const GENERAL: LiveTheme = "Généralistes";

/** Whole words in any script: `\b` only knows ASCII, Cyrillic and accented labels need this. */
const words = (list: string) => new RegExp(`(?<![\\p{L}])(?:${list})(?![\\p{L}])`, "u");

/**
 * Section or category words → theme. Matched on the accent-free upper-case label, so the
 * provider's own languages count too: « DEPORTES », « SPOR », « FËMIJËT », « ДЕТСКИЕ » are one theme each.
 */
const THEME_WORDS: [RegExp, LiveTheme][] = [
  [
    words(
      "SPORTS?|SPORTIVE?S?|SPORTIVNI|SPORTOWE|FOOT(BALL)?|CALCIO|FUTBOL|FUTEBOL|DEPORTES?|DESPORTO|SPOR|BEIN|ESPN|DAZN|RACING|GOLF|TENNIS|FIGHT|MMA|UFC|WRESTLING|NBA|NFL|NHL|MLB|RUGBY|LIBERTADORES|СПОРТ|СПОРТИВНЫЕ",
    ),
    "Sport",
  ],
  [
    words("CINEMAS?|CINE|MOVIES?|FILMS?|FILMA|FILME|FILMSKI|FILMLER|FILMOVE|FILMY|KINO|PELICULAS|BOX OFFICE|КИНО|КИНОКАНАЛЫ|ФИЛЬМЫ"),
    "Cinéma",
  ],
  [words("SERIES?|SERIALE|SERIEN|SERIJE|SERIALY|DIZI(LER)?|СЕРИАЛЫ"), "Séries"],
  [
    words(
      "ENFANCE|ENFANTS?|JEUNESSE|KIDS?|JUNIOR|CARTOONS?|DISNEY|NICKELODEON|INFANTIL|KINDER|FEMIJET|DETSKE|DETSKIE|COCUKLAR|DJECA|DECA|CRIANCAS|DZIECI|ДЕТСКИЕ|ДЕТИ",
    ),
    "Jeunesse",
  ],
  [
    words(
      "INFOS?|INFORMATIONS?|NEWS|ACTUALITES?|NOTICIAS|NACHRICHTEN|HABER(LER)?|VIJESTI|VESTI|LAJME|ZPRAVY|ZPRAVODAJSKE|WIADOMOSCI|НОВОСТИ|НОВОСТНЫЕ|ИНФОРМАЦИОННЫЕ",
    ),
    "Infos",
  ],
  [words("MUSIQUES?|MUSIC|MUSICA|MUSIK|MUZIK|MUZIKA|MUZICKI|MUZYKA|HUDBA|CONCERTS?|RADIOS?|CLIPS?|МУЗЫКА|МУЗЫКАЛЬНЫЕ"), "Musique"],
  [
    words(
      "DECOUVERTES?|DOCUMENTAIRES?|DOCUS?|DOCS?|DOKUS?|DOKUMENTARNI|DOKUMENTARNE|DOKUMENTY|DOCUMENTALES|DOCUMENTARIOS|BELGESEL(LER)?|DISCOVERY|NATURE|SCIENCES?|HISTOIRE|HISTORY|VOYAGES?|TRAVEL|CULTURE|CULTURA|KULTURA|KULTUR|ПОЗНАВАТЕЛЬНЫЕ|ДОКУМЕНТАЛЬНЫЕ",
    ),
    "Découverte",
  ],
  [words("REGIONS?|REGIONAL(ES?|I)?|LOCAL(ES?)?|LOKAL(NE)?|BOLGESEL|OUTRE-MER|РЕГИОНАЛЬНЫЕ"), "Régionales"],
  [words("RELIGIONS?|RELIGIEUSES?|ISLAM(IC)?|CHRISTIAN|CHRETIENS?|CATHOLIQUES?|QURAN|CORAN|GOSPEL|DINI"), "Religion"],
  [
    words(
      "GENERALISTES?|GENERAL(ES|I)?|GENEL|NATIONAL(ES)?|TNT|ENTERTAINMENT|DIVERTISSEMENT|VARIEDADES|ALLGEMEIN|VSEOBECNE|OPCI|OPSTI|ОБЩИЕ|ОСНОВНЫЕ",
    ),
    GENERAL,
  ],
];

/**
 * A section named after a country (« FRANCE », « ITALIA », « SWISS ») is the national list, unless
 * the category is a region (« ARAB WORLD », « BALKANS », « LATIN AMERICA »): there, countries are
 * the sections worth keeping (« Egypte », « Maroc », « Srbija »).
 */
const COUNTRY_WORDS = words(
  "FRANCE|FRENCH|FRANCAIS|BELGIUM|BELGIQUE|BELGIE|SWISS|SUISSE|SWITZERLAND|SCHWEIZ|LUXEMBOURG|CANADA|QUEBEC|USA|AMERICA|UK|ENGLAND|BRITAIN|IRELAND|ITALY|ITALIA|SPAIN|ESPANA|PORTUGAL|GERMANY|DEUTSCHLAND|AUSTRIA|NETHERLANDS|HOLLAND|NEDERLAND|VLAANDEREN|TURKEY|TURKIYE|RUSSIA|ROSSIYA|UKRAINE|POLAND|POLSKA|ROMANIA|BULGARIA|GREECE|HELLAS|HUNGARY|CZECH|CZECHIA|SLOVAKIA|ALBANIA|SHQIPERIA|SERBIA|SRBIJA|CROATIA|HRVATSKA|BOSNIA|MACEDONIA|MAKEDONIJA|MONTENEGRO|CRNA GORA|SLOVENIA|SWEDEN|SVERIGE|NORWAY|NORGE|DENMARK|DANMARK|FINLAND|ICELAND|IRAN|IRAK|IRAQ|ISRAEL|ARMENIA|INDIA|PAKISTAN|CHINA|JAPAN|KOREA|BRAZIL|BRASIL|MEXICO|ARGENTINA|COLOMBIA|CHILE|PERU|BOLIVIA|VENEZUELA|EGYPT|EGYPTE|MAROC|MOROCCO|ALGERIE|ALGERIA|TUNISIE|TUNISIA|LIBAN|LEBANON|SYRIA|SYRIE|JORDAN|KUWAIT|QATAR|EMIRATES|UAE|SAOUDI|SAUDI|BAHRAIN|OMAN|YEMEN|LIBYA|SUDAN",
);
const REGION_WORDS = words("ARAB|ARABIC|MAGHREB|BALKANS?|LATIN|LATINO|SCANDINAVIA|BALTICS?|INTERNATIONAL|WORLD|EUROPE|AFRICA|ASIA|EX-YU");
const norm = (s: string) => stripAccents(s).toUpperCase();

/** The theme a section or category label announces, or null when its words say nothing known. */
export function themeOf(label: string): LiveTheme | null {
  const upper = norm(label);
  return THEME_WORDS.find(([re]) => re.test(upper))?.[1] ?? null;
}

/**
 * The theme of a channel: its section first (« SPORT »), else its category (« SPORTS HD »). A
 * section named like its category or like a country is the general list; so is a category
 * without any known word (« USA », « SKY UK »). An unknown section keeps its own label,
 * capitalised, so nothing is lost: the app shows « Nouvelle gener. » as a group of its own.
 */
export function liveTheme(section: string | null, categoryTitle: string | null): string {
  if (section) {
    const label = sectionLabel(section);
    const t = themeOf(label);
    if (t) return t;
    const upper = norm(label);
    if (categoryTitle && upper === norm(categoryTitle)) return GENERAL;
    if (COUNTRY_WORDS.test(upper) && !(categoryTitle && REGION_WORDS.test(norm(categoryTitle)))) return GENERAL;
    return label.charAt(0).toUpperCase() + label.slice(1).toLowerCase();
  }
  return (categoryTitle && themeOf(categoryTitle)) || GENERAL;
}

export type CleanResult = { title: string; year?: number };
/** Cleaned title + year of a VOD/series name, for the TMDB matching. */
export function cleanTitle(raw: string): CleanResult {
  const p = parseName(raw, "vod");
  return { title: p.title, year: p.year };
}
