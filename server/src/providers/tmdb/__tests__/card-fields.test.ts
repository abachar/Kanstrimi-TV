import { describe, it, expect } from "vitest";
import type { TmdbDetails, TmdbLogo } from "../client";
import { logoOf } from "../card-fields";

const doc = (logos: TmdbLogo[], english?: string): TmdbDetails => ({
  id: 1,
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

  it("leaves the title as text when no logo reads as it", () => {
    expect(logoOf(doc([{ file_path: "/en.png", iso_639_1: "en" }], "Taken"), "fr-FR", "Io vi troverò")).toBeNull();
    expect(logoOf(doc([]), "fr-FR", "Matrix")).toBeNull();
    expect(logoOf({ id: 1 }, "fr-FR", "Matrix")).toBeNull();
  });
});
