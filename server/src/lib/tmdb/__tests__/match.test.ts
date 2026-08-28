import { describe, it, expect } from "vitest";
import { cleanTitle, similarity, pickBest } from "../match";

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
    const best = pickBest([
      { id: 1, title: "Dune", release_date: "1984-12-14", vote_count: 1000 },
      { id: 2, title: "Dune", release_date: "2021-10-22", vote_count: 9000 },
    ], "Dune", 2021);
    expect(best?.result.id).toBe(2);
  });
});
