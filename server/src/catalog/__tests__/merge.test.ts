import { describe, it, expect } from "vitest";
import { deriveEntries, RADIO_CATEGORY_ID, type RawEntry } from "../merge";

const e = (position: number, name: string, category: string | null, more: Partial<RawEntry> = {}): RawEntry => ({
  kind: "live",
  xtreamId: String(position),
  position,
  name,
  category,
  streamType: null,
  added: null,
  lastModified: null,
  ...more,
});

describe("deriveEntries", () => {
  it("turns separator lines into the section of what follows them in their category", () => {
    const { entries } = deriveEntries([
      e(0, "♣♦♣-----|FR| FRANCE FHD |FR|----♣♦♣", "10"),
      e(1, "A", "10"),
      e(2, "B", "11"),
      e(3, "•●★--|FR| SPORT |FR|---★●•", "10"),
      e(4, "C", "10"),
    ]);
    expect(entries.map((x) => [x.name, x.section])).toEqual([
      ["A", "|FR| FRANCE FHD |FR|"],
      ["B", null],
      ["C", "|FR| SPORT |FR|"],
    ]);
  });

  it("follows the provider's order, whatever the order it is given in", () => {
    const { entries } = deriveEntries([e(1, "A", "10"), e(0, "•●★--|FR| SPORT |FR|---★●•", "10")]);
    expect(entries.map((x) => x.section)).toEqual(["|FR| SPORT |FR|"]);
  });

  it("files radios without a category under ours, their separators naming their sections", () => {
    const { entries, radios } = deriveEntries([
      e(0, "•●★--|FR| FRANCE |FR|---★●•", null, { streamType: "radio_streams" }),
      e(1, "|FR| BEL RTL", null, { streamType: "radio_streams" }),
    ]);
    expect(radios).toBe(1);
    expect(entries).toMatchObject([{ name: "|FR| BEL RTL", category: RADIO_CATEGORY_ID, section: "|FR| FRANCE |FR|" }]);
  });

  it("reads the arrival date, null when dirty or in the future", () => {
    const { entries } = deriveEntries([
      e(0, "Date valide", "10", { added: "1720000000" }),
      e(1, "Date sale", "10", { added: "abc" }),
      e(2, "Date dans le futur", "10", { added: "4000000000" }),
      e(3, "Série", "30", { kind: "series", lastModified: "1720000100", added: "1" }),
    ]);
    expect(entries.map((x) => x.addedAt)).toEqual([new Date(1720000000 * 1000), null, null, new Date(1720000100 * 1000)]);
  });
});
