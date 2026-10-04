import { describe, it, expect } from "vitest";
import { episodeKey, parseKey } from "../keys";

describe("episode keys", () => {
  it("reads back an episode numbered 100 or more", () => {
    expect(parseKey(episodeKey("tmdb:tv:1", 1, 100))).toEqual({
      kind: "series",
      tmdbId: 1,
      season: 1,
      episode: 100,
      seriesKey: "tmdb:tv:1",
    });
  });

  it("reads back a season numbered 100 or more", () => {
    expect(parseKey(episodeKey("tmdb:tv:1", 100, 2))).toEqual({
      kind: "series",
      tmdbId: 1,
      season: 100,
      episode: 2,
      seriesKey: "tmdb:tv:1",
    });
  });

  it("keeps the two-digit form", () => {
    expect(parseKey("tmdb:tv:1:s01e05")).toEqual({ kind: "series", tmdbId: 1, season: 1, episode: 5, seriesKey: "tmdb:tv:1" });
  });
});
