import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parseName, parseCategory, contentKey, parseKey, episodeKey, slug, defaultLanguage, type Kind } from "../tags";
import { cleanTitle } from "@/lib/tmdb/match";

describe("parseName", () => {
  it.each<[string, Kind, Partial<ReturnType<typeof parseName>>]>([
    // The former cleanTitle cases: same titles, same years.
    ["FR - The Matrix (1999) 4K", "vod", { title: "The Matrix", year: 1999, market: "fr", quality: "4K" }],
    ["|FR| Inception 1080p", "vod", { title: "Inception", quality: "FHD" }],
    ["Le Fabuleux Destin d'Amélie Poulain [FR] (2001)", "vod", { title: "Le Fabuleux Destin d'Amélie Poulain", year: 2001, language: "VF" }],
    ["VOSTFR Parasite - 2019 - HD", "vod", { title: "Parasite", year: 2019, language: "VOSTFR", quality: "HD" }],
    ["Breaking Bad MULTI", "series", { title: "Breaking Bad", language: "VF", tags: ["multi"] }],
    ["Dune: Part Two (2024) HDR", "vod", { title: "Dune: Part Two", year: 2024, dynamicRange: "HDR" }],
    ["Blade Runner 2049 (2017)", "vod", { title: "Blade Runner 2049", year: 2017 }],
    // Market is not language: sold in France, subtitled.
    ["|FR| Spring Snow (VOST)", "vod", { title: "Spring Snow", market: "fr", language: "VOSTFR" }],
    ["|IT| Spider-Man 2", "vod", { title: "Spider-Man 2", market: "it", language: undefined }],
    // Pipe-separated year and tags, foreign-script subtitle dropped.
    ["|FR| Ghosts | 2019 (MULTI)", "series", { title: "Ghosts", year: 2019, language: "VF" }],
    ["|AR| Selena | 2006 | مترجم | سيلينا", "series", { title: "Selena", year: 2006, market: "ar" }],
    ["|FR| The Twisted Tale of Amanda Knox | MULTI (UHD)", "series", { title: "The Twisted Tale of Amanda Knox", language: "VF", quality: "4K" }],
    ["|FR| Le Dernier Refuge | 2026 (DV)", "vod", { title: "Le Dernier Refuge", year: 2026, dynamicRange: "DV" }],
    // Numbers that are titles, not years.
    ["|IT| 1917", "vod", { title: "1917", year: undefined }],
    ["|FR| Fear Street Parte 1: 1994", "vod", { title: "Fear Street Parte 1", year: 1994 }],
    // Case matters for bare tags: "It", "Old" and "DE" inside a title stay.
    ["|FR| It (2017)", "vod", { title: "It", year: 2017 }],
    ["|FR| Old (DV)", "vod", { title: "Old", dynamicRange: "DV" }],
    ["|FR| LA GUERRE DE TROIE", "vod", { title: "LA GUERRE DE TROIE", language: undefined }],
    ["Desperate Housewives - I segreti di Wisteria Lane IT", "series", { title: "Desperate Housewives - I segreti di Wisteria Lane", language: "IT" }],
    // Series split per season upstream.
    ["Vincenzo (MULTI) S01", "series", { title: "Vincenzo", seasonHint: 1 }],
    ["|FR| Squid Game - Saison 2 (VOSTFR)", "series", { title: "Squid Game", seasonHint: 2, language: "VOSTFR" }],
    ["|FR| Haute saison", "series", { title: "Haute saison", seasonHint: undefined }],
    // Live: Unicode quality, delays, provider labels, audio tags, ornaments, hyphenated markets.
    ["|MA| ARRIADIA |-12H| ᴴᴰ", "live", { title: "ARRIADIA", market: "ma", quality: "HD" }],
    ["|FR| CANAL+ FOOT 4K HDR (DD+ 5.1)", "live", { title: "CANAL+ FOOT", quality: "4K", dynamicRange: "HDR" }],
    ["|FR| HITS FRANCE [P.TV]", "live", { title: "HITS FRANCE" }],
    ["•●★---|FR| S.TV SERIES |FR|---★●•", "live", { title: "S.TV SERIES", market: "fr" }],
    ["|EX-YU| NOVA CINEMA 2 FHD", "live", { title: "NOVA CINEMA 2", market: "ex-yu", quality: "FHD" }],
    ["|RU| СЕРИАЛ UHD", "live", { title: "СЕРИАЛ", market: "ru", quality: "4K" }],
    ["|UK| TBN UK", "live", { title: "TBN UK", language: undefined }],
    // Scene-style names behind a technical prefix.
    ["AZ - Silver.Book.of.Dreams.2013", "vod", { title: "Silver Book of Dreams", year: 2013, market: undefined }],
    ["FR - Karate.Kid.Legends.2025.MULTI", "vod", { title: "Karate Kid Legends", year: 2025, market: "fr", language: "VF" }],
  ])("%s", (name, kind, expected) => {
    const p = parseName(name, kind);
    for (const [k, v] of Object.entries(expected)) expect(p[k as keyof typeof p], k).toEqual(v);
  });

  it("cleanTitle is the same grammar", () => {
    for (const n of ["FR - The Matrix (1999) 4K", "|FR| Ghosts | 2019 (MULTI)", "Blade Runner 2049 (2017)"]) {
      const p = parseName(n, "vod");
      expect(cleanTitle(n)).toEqual({ title: p.title, year: p.year });
    }
  });

  it("never returns an empty title", () => {
    expect(parseName("(4K)", "vod").title).toBe("(4K)");
    expect(parseName("", "vod").title).toBe("");
  });

  /** ~200 real names frozen after review: a change here is a change in the catalogue. */
  it("matches the frozen corpus", () => {
    const lines = fs.readFileSync(path.join(__dirname, "corpus.txt"), "utf8").split("\n").filter(Boolean);
    expect(lines.length).toBeGreaterThan(150);
    const diffs: string[] = [];
    for (const line of lines) {
      const [kind, name, expected] = line.split(" ⇒ ");
      const p = parseName(name, kind as Kind);
      const got = [p.title, p.year ?? "", p.market ?? "", p.language ?? "", p.quality ?? "", p.dynamicRange ?? "", p.tags.join(","), p.seasonHint ?? ""].join(" | ");
      if (got !== expected) diffs.push(`${name}\n   attendu ${expected}\n   obtenu  ${got}`);
    }
    expect(diffs, diffs.join("\n")).toEqual([]);
  });
});

describe("isAdultName", () => {
  it("spots adult categories and tags, not ordinary words", async () => {
    const { isAdultName } = await import("../tags");
    for (const n of ["|FR| ADULTES", "XXX | VOD", "|IT| FILM PORNO", "Some Title (18+)", "|EN| FOR ADULTS", "|FR| Films Érotiques"]) expect(isAdultName(n), n).toBe(true);
    for (const n of ["|FR| Sex and the City", "|FR| Adult Swim Shows", "|FR| Les 18 Jours", "|FR| Playboys of the Western World"]) expect(isAdultName(n), n).toBe(false);
  });
});

describe("parseCategory", () => {
  it.each([
    ["|FR| FILMS 4K DV", { market: "fr", quality: "4K", dynamicRange: "DV" }],
    ["|FR| FILMS VOST", { market: "fr", language: "VOSTFR" }],
    ["|AR| MAGHREB VOSTFR", { market: "ar", language: "VOSTFR" }],
    ["FRANCE FHD | TV", { quality: "FHD" }],
    ["|IT| FILM 3D", { market: "it", tags: ["3d"] }],
    ["|FR| NOUVEAUTES", { market: "fr", language: undefined, quality: undefined }],
  ])("%s", (name, expected) => {
    const h = parseCategory(name);
    for (const [k, v] of Object.entries(expected)) expect(h[k as keyof typeof h], k).toEqual(v);
  });
});

describe("defaultLanguage", () => {
  it("maps the market", () => {
    expect(defaultLanguage("fr")).toBe("VF");
    expect(defaultLanguage("be")).toBe("VF");
    expect(defaultLanguage("us")).toBe("VO");
    expect(defaultLanguage("it")).toBe("IT");
    expect(defaultLanguage(undefined)).toBe("VO");
  });
});

describe("slug", () => {
  it("keeps every script, drops accents and punctuation", () => {
    expect(slug("Tár")).toBe("tar");
    expect(slug("L'Ombre d'un mensonge")).toBe("l-ombre-d-un-mensonge");
    expect(slug("СЕРИАЛ 24")).toBe("сериал-24");
    expect(slug("Tom & Jerry")).toBe("tom-and-jerry");
    expect(slug("•")).toBe("-");
  });
});

describe("contentKey", () => {
  it("prefers the override, then a verified TMDB id, then the title", () => {
    expect(contentKey({ kind: "vod", title: "Tenet", year: 2020, tmdbId: 577922, matchStatus: "matched", keyOverride: "manual:12" })).toBe("manual:12");
    expect(contentKey({ kind: "vod", title: "Tenet", year: 2020, tmdbId: 577922, matchStatus: "matched" })).toBe("tmdb:movie:577922");
    expect(contentKey({ kind: "series", title: "Vincenzo", tmdbId: 1396, matchStatus: "manual" })).toBe("tmdb:tv:1396");
    // A pending or rejected id is not an identity.
    expect(contentKey({ kind: "vod", title: "Tenet", year: 2020, tmdbId: 577922, matchStatus: "pending" })).toBe("fallback:movie:tenet:2020");
    expect(contentKey({ kind: "vod", title: "Pinocchio" })).toBe("fallback:movie:pinocchio:-");
    expect(contentKey({ kind: "series", title: "Vincenzo", year: 2021 })).toBe("fallback:series:vincenzo:2021");
  });
  it("keys channels by market and name", () => {
    expect(contentKey({ kind: "live", title: "TF1", market: "fr" })).toBe("live:fr-tf1");
    expect(contentKey({ kind: "live", title: "TF1", market: "be" })).toBe("live:be-tf1");
    expect(contentKey({ kind: "live", title: "TF1" })).toBe("live:tf1");
  });
  it("isolates names without a letter instead of merging them", () => {
    const a = contentKey({ kind: "live", title: "•", market: "fr" }), b = contentKey({ kind: "live", title: "★★", market: "fr" });
    expect(a).toMatch(/^live:fr-x[0-9a-f]{10}$/);
    expect(a).not.toBe(b);
  });
});

describe("parseKey / episodeKey", () => {
  it("round-trips", () => {
    expect(parseKey("tmdb:movie:603")).toEqual({ kind: "vod", tmdbId: 603, season: undefined, episode: undefined, seriesKey: "tmdb:movie:603" });
    expect(parseKey("tmdb:tv:1396:s01e05")).toEqual({ kind: "series", tmdbId: 1396, season: 1, episode: 5, seriesKey: "tmdb:tv:1396" });
    expect(parseKey("fallback:series:vincenzo:2021:s02e10")).toMatchObject({ kind: "series", season: 2, episode: 10, seriesKey: "fallback:series:vincenzo:2021" });
    expect(parseKey("live:fr-tf1")).toMatchObject({ kind: "live" });
    expect(parseKey("tmdb:movie:603:s01e01")).toBeNull();
    expect(parseKey("12345")).toBeNull();
    expect(parseKey("manual:12")).toBeNull();
    expect(episodeKey("tmdb:tv:1396", 1, 5)).toBe("tmdb:tv:1396:s01e05");
  });
});
