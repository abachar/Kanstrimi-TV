import { describe, it, expect } from "vitest";
import type { XStream } from "../client";
import { checkShrink, prepareCategories, prepareStreams, ShrinkError } from "../import";

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
    expect(out.map((s) => s.xtreamId)).toEqual(["900", "1", "2", "ab-12"]);
    expect(out[1].raw.name).toBe("A"); // first occurrence wins
    // Separator lines are kept as the provider sent them: the catalogue reads them (`merge`).
    expect(out[0].raw.name).toContain("FRANCE FHD");
  });

  it("reads series by series_id", () => {
    expect(prepareStreams("series", [{ name: "S", series_id: 7 }]).map((s) => s.xtreamId)).toEqual(["7"]);
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
