import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { db, schema } from "@/db";
import { resetDb, closeDb } from "@/test/db";
import { setSecretsForTests } from "@/config";
import { runTrending } from "../trending";

const ranks = async () => (await db.select().from(schema.tmdbTrending)).map((r) => [r.mediaType, r.tmdbId]).sort();

beforeAll(async () => {
  await resetDb();
  setSecretsForTests({ tmdb_api_key: "k" });
});
afterEach(() => vi.unstubAllGlobals());
afterAll(closeDb);

describe("trending", () => {
  it("replaces the lists, but keeps the previous ones when TMDB answers empty", async () => {
    vi.stubGlobal("fetch", async (u: URL) =>
      Response.json({
        results: new URL(String(u)).searchParams.get("page") === "1" ? [{ id: String(u).includes("/movie/") ? 603 : 1396 }] : [],
      }),
    );
    expect(await runTrending()).toEqual({ movies: 1, series: 1 });
    expect(await ranks()).toEqual([
      ["movie", 603],
      ["tv", 1396],
    ]);
    vi.stubGlobal("fetch", async (u: URL) => Response.json({ results: String(u).includes("/tv/") ? [{ id: 1399 }] : [] }));
    await expect(runTrending()).rejects.toThrow("Tendances TMDB vides (0 films, 1 séries)");
    expect(await ranks()).toEqual([
      ["movie", 603],
      ["tv", 1396],
    ]);
  });
});
