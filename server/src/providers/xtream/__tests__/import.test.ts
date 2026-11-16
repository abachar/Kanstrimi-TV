import { describe, it, expect } from "vitest";
import type { XStream } from "../client";
import { checkShrink, deriveEntries, prepareCategories, prepareStreams, RADIO_CATEGORY_ID, ShrinkError } from "../import";

const streams: XStream[] = [
  { name: "♣♦♣-----|FR| FRANCE FHD |FR|----♣♦♣", stream_id: 900, category_id: "10" },
  { name: "A", stream_id: 1, category_id: "10" },
  { name: "B", stream_id: 2, category_id: "11" },
  { name: "A (autre catégorie)", stream_id: 1, category_id: "11" },
  { name: "Id texte", stream_id: "ab-12" as unknown as number, category_id: "10" },
  { name: "Id numérique en texte", stream_id: " 2 " as unknown as number, category_id: "10" }, // doublon de B
  { name: "Sans id", category_id: "10" },
  { name: "Id null", stream_id: null as unknown as number, category_id: "10" },
];

describe("prepareStreams", () => {
  it("keeps opaque ids, drops entries without one, keeps the first occurrence of each id", () => {
    const out = prepareStreams("live", streams);
    expect(out.map((s) => s.upstreamId)).toEqual(["900", "1", "2", "ab-12"]);
    expect(out[1].raw.name).toBe("A"); // first occurrence wins
    // Separator lines are kept as the provider sent them: the catalogue reads them (`merge`).
    expect(out[0].raw.name).toContain("FRANCE FHD");
  });

  it("reads series by series_id", () => {
    expect(prepareStreams("series", [{ name: "S", series_id: 7 }]).map((s) => s.upstreamId)).toEqual(["7"]);
  });
});

describe("prepareCategories", () => {
  it("keeps the first occurrence of each category id", () => {
    const out = prepareCategories([
      { category_id: "10", category_name: "Live FR" },
      { category_id: 11, category_name: "Live IT" },
      { category_id: "10", category_name: "Live FR (doublon)" },
    ]);
    expect(out.map((c) => [c.xtreamId, c.raw.category_name])).toEqual([
      ["10", "Live FR"],
      ["11", "Live IT"],
    ]);
  });
});

describe("checkShrink", () => {
  const current = { live: 1000, vod: 1000, series: 10 };
  it("refuses a kind that lost more than half of the catalogue", () => {
    expect(() => checkShrink({ live: 1000, vod: 400, series: 10 }, current)).toThrow(ShrinkError);
    expect(() => checkShrink({ live: 0, vod: 1000, series: 10 }, current)).toThrow(/live .* 0 entrées pour 1000/);
  });
  it("lets a normal variation, a tiny catalogue or an accepted shrink through", () => {
    expect(() => checkShrink({ live: 600, vod: 1000, series: 10 }, current)).not.toThrow();
    expect(() => checkShrink({ live: 1000, vod: 1000, series: 0 }, current)).not.toThrow(); // under the floor
    expect(() => checkShrink({ live: 0, vod: 0, series: 0 }, current, true)).not.toThrow();
  });
});

const e = (id: number, name: string, category: string | null, more: Partial<XStream> = {}) => ({
  upstreamId: String(id),
  raw: { stream_id: id, name, category_id: category as string, ...more } as XStream,
});

describe("deriveEntries", () => {
  it("keeps separator lines, which name the section of what follows them in their category", () => {
    const { entries } = deriveEntries("live", [
      e(0, "♣♦♣-----|FR| FRANCE FHD |FR|----♣♦♣", "10"),
      e(1, "A", "10"),
      e(2, "B", "11"),
      e(3, "•●★--|FR| SPORT |FR|---★●•", "10"),
      e(4, "C", "10"),
    ]);
    expect(entries.map((x) => [x.name, x.separator, x.section, x.position])).toEqual([
      ["♣♦♣-----|FR| FRANCE FHD |FR|----♣♦♣", true, null, 0],
      ["A", false, "|FR| FRANCE FHD |FR|", 1],
      ["B", false, null, 2],
      ["•●★--|FR| SPORT |FR|---★●•", true, null, 3],
      ["C", false, "|FR| SPORT |FR|", 4],
    ]);
  });

  it("knows the separators another provider frames with hashes", () => {
    const { entries } = deriveEntries("live", [e(0, "##### MA - MOROCCO #####", "10"), e(1, "MA - 2M", "10"), e(2, "#1 HITS", "10")]);
    expect(entries.filter((x) => !x.separator).map((x) => [x.name, x.section])).toEqual([
      ["MA - 2M", "MA - MOROCCO"],
      ["#1 HITS", "MA - MOROCCO"],
    ]);
  });

  it("files radios without a category under ours, their separators naming their sections", () => {
    const { entries, radios } = deriveEntries("live", [
      e(0, "•●★--|FR| FRANCE |FR|---★●•", null, { stream_type: "radio_streams" }),
      e(1, "|FR| BEL RTL", null, { stream_type: "radio_streams" }),
    ]);
    expect(radios).toBe(true);
    expect(entries[1]).toMatchObject({ name: "|FR| BEL RTL", category: RADIO_CATEGORY_ID, section: "|FR| FRANCE |FR|" });
    expect(deriveEntries("live", [e(0, "TF1", "10")]).radios).toBe(false);
  });

  it("reads the arrival date, null when dirty or in the future", () => {
    const { entries } = deriveEntries("vod", [
      e(0, "Date valide", "10", { added: "1720000000" }),
      e(1, "Date sale", "10", { added: "abc" }),
      e(2, "Date dans le futur", "10", { added: "4000000000" }),
    ]);
    expect(entries.map((x) => x.addedAt)).toEqual([new Date(1720000000 * 1000), null, null]);
    const series = deriveEntries("series", [e(3, "Série", "30", { last_modified: "1720000100", added: "1" })]);
    expect(series.entries[0].addedAt).toEqual(new Date(1720000100 * 1000));
  });
});
