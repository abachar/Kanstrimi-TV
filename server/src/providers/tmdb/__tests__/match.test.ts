import { describe, it, expect } from "vitest";
import { cleanTitle } from "@/catalog";
import { similarity, pickBest } from "../match";

describe("cleanTitle", () => {
  it.each([
    ["FR - The Matrix (1999) 4K", "The Matrix", 1999],
    ["|FR| Inception 1080p", "Inception", undefined],
    ["Le Fabuleux Destin d'Amélie Poulain [FR] (2001)", "Le Fabuleux Destin d'Amélie Poulain", 2001],
    ["VOSTFR Parasite - 2019 - HD", "Parasite", 2019],
    ["Breaking Bad MULTI", "Breaking Bad", undefined],
    ["Dune: Part Two (2024) HDR", "Dune: Part Two", 2024],
    ["Blade Runner 2049 (2017)", "Blade Runner 2049", 2017],
  ])("%s → %s / %s", (raw, title, year) => {
    const r = cleanTitle(raw);
    expect(r.title).toBe(title);
    expect(r.year).toBe(year);
  });
});

describe("similarity", () => {
  it("is 1 for identical (accent/case insensitive)", () => expect(similarity("Amélie", "amelie")).toBe(1));
  it("is low for different titles", () => expect(similarity("The Matrix", "Titanic")).toBeLessThan(0.3));
});

describe("pickBest", () => {
  it("prefers the year match", () => {
    const best = pickBest(
      [
        { id: 1, title: "Dune", release_date: "1984-12-14", vote_count: 1000 },
        { id: 2, title: "Dune", release_date: "2021-10-22", vote_count: 9000 },
      ],
      "Dune",
      2021,
    );
    expect(best?.result.id).toBe(2);
  });
});

describe("namesOf / bestSimilarity", () => {
  it("includes translated titles, trimmed to titles only: the English name of an Indonesian film", async () => {
    const { namesOf, bestSimilarity, hasAllNames } = await import("../match");
    const { trimTranslations } = await import("../client");
    const raw = {
      id: 1773587,
      title: "Conspiration générale : Le meurtre du Brigadier J.",
      original_title: "Skenario Sang Jenderal",
      alternative_titles: { titles: [] },
      translations: {
        translations: [
          { iso_639_1: "en", iso_3166_1: "US", data: { title: "General Mayhem: The Killing of Brigadier J", overview: "long text…" } },
          { iso_639_1: "fr", iso_3166_1: "FR", data: { title: "", overview: "texte" } },
        ],
      },
    };
    const d = trimTranslations(raw);
    expect(JSON.stringify(d)).not.toContain("long text");
    expect(hasAllNames(d)).toBe(true);
    expect(hasAllNames({ title: "x" })).toBe(false);
    expect(namesOf(d)).toContain("General Mayhem: The Killing of Brigadier J");
    expect(bestSimilarity(d, "General Mayhem: The Killing of Brigadier J")).toBe(1);
  });
  it("includes alternative titles: an English name matches a film whose original title is not English", async () => {
    const { namesOf, bestSimilarity } = await import("../match");
    const d = {
      title: "Conspiration générale : Le meurtre du Brigadier J.",
      original_title: "Generaal Chaos",
      alternative_titles: { titles: [{ iso_3166_1: "GB", title: "General Mayhem: The Killing of Brigadier J" }] },
    };
    expect(namesOf(d)).toHaveLength(3);
    expect(bestSimilarity(d, "General Mayhem: The Killing of Brigadier J")).toBe(1);
    expect(bestSimilarity({ title: d.title, original_title: d.original_title }, "General Mayhem: The Killing of Brigadier J")).toBeLessThan(
      0.5,
    );
  });
});

describe("idEvidence", () => {
  const patriarche = {
    id: 0,
    kind: "series" as const,
    name: "|FR| Patriarche (MULTI)",
    cleanTitle: "Patriarche",
    year: 2025,
    raw: {
      cast: "Nikki Amuka-Bird, Daniel Rigby, Gemma Jones",
      director: "Chris Lang",
      year: "2025",
      backdrop_path: ["http://logip.firstcloud.me/posters/eDB1CCNcxnFANadgiWyFlzaqvK6..jpg"],
      youtube_trailer: "SnuP9SjGq4w",
    },
  };
  const heritage = {
    id: 262899,
    name: "Héritage",
    original_name: "I, Jack Wright",
    first_air_date: "2025-04-01",
    credits: { cast: [{ name: "John Simm" }, { name: "Nikki Amuka-Bird" }, { name: "Daniel Rigby" }], crew: [] },
    created_by: [{ name: "Chris Lang" }],
    backdrop_path: "/zzz.jpg",
    images: { backdrops: [{ file_path: "/eDB1CCNcxnFANadgiWyFlzaqvK6.jpg" }] },
    videos: { results: [{ key: "SnuP9SjGq4w", site: "YouTube", type: "Trailer" }] },
  };
  it("accepts a provider title TMDB never recorded when cast, image or trailer agree", async () => {
    const { idEvidence } = await import("../match");
    const ev = idEvidence(heritage, patriarche);
    expect(ev.similarity).toBeLessThan(0.3);
    expect(ev.castOverlap).toBe(2);
    expect(ev.imageMatch).toBe(true);
    expect(ev.trailerMatch).toBe(true);
    expect(ev.directorMatch).toBe(true);
    expect(ev.accepted).toBe(true);
    // Cast alone is enough; one actor needs the year or the director too.
    expect(idEvidence({ ...heritage, images: undefined, videos: undefined, backdrop_path: null }, patriarche).accepted).toBe(true);
    const one = {
      ...heritage,
      credits: { cast: [{ name: "Nikki Amuka-Bird" }], crew: [] },
      images: undefined,
      videos: undefined,
      backdrop_path: null,
    };
    expect(idEvidence(one, patriarche).reasons).toEqual(["1 acteur en commun et même réalisateur"]);
    expect(idEvidence({ ...one, created_by: [], first_air_date: "2010-01-01" }, patriarche).accepted).toBe(false);
  });
  it("still rejects a wrong film that shares nothing", async () => {
    const { idEvidence } = await import("../match");
    const other = {
      id: 1,
      title: "Titanic",
      original_title: "Titanic",
      release_date: "1997-12-19",
      credits: { cast: [{ name: "Leonardo DiCaprio" }], crew: [{ name: "James Cameron", job: "Director" }] },
    };
    expect(idEvidence(other, patriarche).accepted).toBe(false);
  });
});

describe("englishTitleOf", () => {
  it("prefers the en translation, then a US/GB alternative title, then an English original", async () => {
    const { englishTitleOf } = await import("../match");
    expect(
      englishTitleOf({
        title: "Héritage",
        original_title: "I, Jack Wright",
        original_language: "en",
        translations: { translations: [{ iso_639_1: "en", data: { title: "I, Jack Wright" } }] },
      }),
    ).toBe("I, Jack Wright");
    expect(englishTitleOf({ title: "X", alternative_titles: { titles: [{ iso_3166_1: "GB", title: "The X" }] } })).toBe("The X");
    expect(englishTitleOf({ title: "Matrix", original_title: "The Matrix", original_language: "en" })).toBe("The Matrix");
    expect(englishTitleOf({ title: "Conspiration", original_title: "Skenario", original_language: "id" })).toBeNull();
  });
});
