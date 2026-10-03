import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { searchText } from "@/shared";
import { resetDb, closeDb } from "@/test/db";
import { search } from "../search";
import type { RestContext } from "../context";

const ctx: RestContext = {
  baseUrl: "http://k.test",
  device: null,
  tmdbLang: "fr-FR",
  providerName: "p",
  upstreamUrl: () => null,
  serveAdult: false,
};
const titles = (r: { items: { title: string }[] }) => r.items.map((c) => c.title);

beforeAll(async () => {
  await resetDb();
  const movies: [id: number, title: string, votes: number][] = [
    [1, "Mad Max", 9000],
    [2, "Mars Attacks!", 5000],
    [3, "Ma", 10],
    [4, "Heat", 7000],
    [5, "A", 3],
  ];
  await db.insert(schema.catalogContents).values(
    movies.map(([id, title, voteCount]) => ({
      key: `tmdb:movie:${id}`,
      kind: "vod" as const,
      tmdbId: id,
      title,
      voteCount,
      visible: true,
      addedAt: new Date(),
      search: sql`to_tsvector('simple', ${searchText(title)})`,
    })),
  );
});
afterAll(closeDb);

describe("search", () => {
  it("a single character is a word, not a prefix: it would match half the catalogue", async () => {
    expect(titles(await search(ctx, "h", "movies"))).toEqual([]);
    expect(titles(await search(ctx, "he", "movies"))).toEqual(["Heat"]);
    expect(titles(await search(ctx, "a", "movies"))).toEqual(["A"]);
  });

  it("ranks only the most voted matches, and the titles made of the very words searched", async () => {
    expect(titles(await search(ctx, "ma", "movies"))).toEqual(["Ma", "Mad Max", "Mars Attacks!"]);
    // One candidate per side: the most voted prefix match, and « Ma », a title equal to the query despite its votes.
    const r = await search(ctx, "ma", "movies", 1);
    expect(titles(r)).toEqual(["Ma", "Mad Max"]);
  });
});
