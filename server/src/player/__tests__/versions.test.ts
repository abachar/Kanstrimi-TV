import { describe, it, expect } from "vitest";
import { distinguish } from "../versions";

describe("distinguish", () => {
  it("names each copy by the words of its category the others lack", () => {
    expect(
      distinguish([
        { categoryName: "|FR| FILMS 4K UHD", name: "|FR| Dark Waters (UHD)" },
        { categoryName: "|FR| FILMS 4K LIGHT", name: "|FR| Dark Waters (4K)" },
      ]),
    ).toEqual(["UHD", "LIGHT"]);
    expect(
      distinguish([
        { categoryName: "|FR| 4K DOLBY VISION", name: "a" },
        { categoryName: "|FR| NOUVEAUTÉS", name: "b" },
      ]),
    ).toEqual(["4K DOLBY VISION", "NOUVEAUTÉS"]);
  });

  it("falls back on the raw titles, then on letters", () => {
    expect(
      distinguish([
        { categoryName: "|FR| V.O SOUS TITRÉS", name: "|FR| Les jours parfaits | 2023" },
        { categoryName: "|FR| V.O SOUS TITRÉS", name: "|FR| Perfect Days | 2023" },
      ]),
    ).toEqual(["LES JOURS PARFAITS 2023", "PERFECT DAYS 2023"]);
    expect(
      distinguish([
        { categoryName: "|FR| FILMS ANCIENS", name: "|FR| Sissi (1955)  " },
        { categoryName: "|FR| FILMS ANCIENS", name: "|FR| Sissi (1955)" },
      ]),
    ).toEqual(["A", "B"]);
    // One copy whose category adds nothing to the other's: the category cannot tell them apart.
    expect(
      distinguish([
        { categoryName: "|FR| FILMS 4K", name: "|FR| Dune (2021)" },
        { categoryName: "|FR| FILMS 4K UHD", name: "|FR| Dune (2021)" },
      ]),
    ).toEqual(["A", "B"]);
  });
});
