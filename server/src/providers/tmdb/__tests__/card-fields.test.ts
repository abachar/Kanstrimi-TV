import { describe, it, expect } from "vitest";
import type { TmdbDetails, TmdbLogo } from "../client";
import { cardFields, logoOf } from "../card-fields";

const doc = (logos: TmdbLogo[], english?: string, original = "en"): TmdbDetails => ({
  id: 1,
  original_language: original,
  images: { logos },
  translations: { translations: english ? [{ iso_639_1: "en", data: { title: english } }] : [] },
});

describe("logoOf", () => {
  it("takes the best voted PNG in the card's language", () => {
    const d = doc([
      { file_path: "/fr-low.png", iso_639_1: "fr", vote_average: 3 },
      { file_path: "/fr-high.png", iso_639_1: "fr", vote_average: 6 },
      { file_path: "/fr-best.svg", iso_639_1: "fr", vote_average: 9 },
      { file_path: "/en.png", iso_639_1: "en", vote_average: 10 },
    ]);
    expect(logoOf(d, "fr-FR", "Les Évadés")).toBe("/fr-high.png");
  });

  it("takes an English logo only when the displayed title is the English one", () => {
    const logos = [
      { file_path: "/en.png", iso_639_1: "en", vote_average: 5 },
      { file_path: "/none.png", iso_639_1: null, vote_average: 5 },
    ];
    expect(logoOf(doc(logos, "Inception"), "fr-FR", "Inception")).toBe("/en.png");
    expect(logoOf(doc(logos, "The Shawshank Redemption"), "fr-FR", "Les Évadés")).toBe("/none.png");
  });

  it("takes a logo without language only for a French or English work: TMDB files others' there", () => {
    const logos = [{ file_path: "/none.png", iso_639_1: null, vote_average: 5 }];
    expect(logoOf(doc(logos, undefined, "fr"), "fr-FR", "Les Intouchables")).toBe("/none.png");
    expect(logoOf(doc(logos, undefined, "ru"), "fr-FR", "Unabomber")).toBeNull();
    expect(logoOf({ id: 1, images: { logos } }, "fr-FR", "Sans langue")).toBeNull();
  });

  it("takes an English logo for the original title of an English work, whatever its alternatives", () => {
    // UNABOMBER (1492640): no English translation, a US working title « Unabom », three English
    // logos and a Cyrillic one filed without language.
    const d: TmdbDetails = {
      id: 1492640,
      original_language: "en",
      original_title: "UNABOMBER",
      translations: { translations: [{ iso_639_1: "ru", iso_3166_1: "RU", data: { title: "Унабомбер" } }] },
      alternative_titles: { titles: [{ iso_3166_1: "US", title: "Unabom" }] },
      images: {
        logos: [
          { file_path: "/en.png", iso_639_1: "en", vote_average: 3.3 },
          { file_path: "/cyrillic.png", iso_639_1: null, vote_average: 0 },
        ],
      },
    };
    expect(logoOf(d, "fr-FR", "UNABOMBER")).toBe("/en.png");
  });

  it("leaves the title as text when no logo reads as it", () => {
    expect(logoOf(doc([{ file_path: "/en.png", iso_639_1: "en" }], "Taken"), "fr-FR", "Io vi troverò")).toBeNull();
    expect(logoOf(doc([]), "fr-FR", "Matrix")).toBeNull();
    expect(logoOf({ id: 1 }, "fr-FR", "Matrix")).toBeNull();
  });
});

describe("cardFields cast", () => {
  const cast = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: 100 + i, name: `Actor ${i}`, character: `Role ${i}`, profile_path: `/p${i}.jpg` }));
  const fields = (list: NonNullable<NonNullable<TmdbDetails["credits"]>["cast"]>) =>
    cardFields("movie", { id: 1, credits: { cast: list, crew: [] } }, "fr-FR", "Fallback");

  it("keeps the TMDB id, the photo and the role", () => {
    expect(fields(cast(1)).cast).toEqual([{ id: 100, name: "Actor 0", role: "Role 0", profile: "/p0.jpg" }]);
  });

  it("keeps the first ten only", () => {
    expect(fields(cast(15)).cast.map((p) => p.id)).toEqual(cast(10).map((p) => p.id));
  });

  it("gives null to what TMDB leaves out", () => {
    expect(fields([{ name: "Extra" }]).cast).toEqual([{ id: null, name: "Extra", role: null, profile: null }]);
  });
});
