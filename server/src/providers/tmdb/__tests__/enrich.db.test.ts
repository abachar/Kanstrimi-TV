import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { resetDb, closeDb, seedItems } from "@/test/db";
import { setSettings, verify } from "@/config";
import { runEnrich } from "../enrich";

beforeAll(async () => {
  await resetDb();
  expect(await verify("test")).toBe(true);
  await setSettings({ tmdb_api_key: "k" });
  await seedItems(Array.from({ length: 60 }, (_, i) => ({ kind: "vod" as const, xtreamId: String(i), name: `|FR| Film ${i}` })));
});
afterEach(() => vi.unstubAllGlobals());
afterAll(closeDb);

describe("runEnrich", () => {
  it("stops after a streak of outages, leaves the rest pending and says so", async () => {
    const fetch = vi.fn(async () => {
      throw Object.assign(new TypeError("fetch failed"), {
        cause: Object.assign(new Error("getaddrinfo ENOTFOUND api.themoviedb.org"), { code: "ENOTFOUND" }),
      });
    });
    vi.stubGlobal("fetch", fetch);
    await expect(runEnrich()).rejects.toThrow(/TMDB injoignable .*restent en attente/);
    expect(fetch.mock.calls.length).toBeLessThan(60);
    const pending = await db.select().from(schema.items).where(eq(schema.items.matchStatus, "pending"));
    expect(pending).toHaveLength(60);
  });
});
