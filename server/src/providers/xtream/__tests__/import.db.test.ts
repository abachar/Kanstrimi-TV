import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { resetDb, closeDb } from "@/test/db";
import { setSettings } from "@/config";
import { runSync } from "../import";
import type { XStream } from "../client";

// What the provider lists; each test rewrites it before a sync.
let series: XStream[] = [];

vi.mock("../client", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../client")>();
  return {
    ...mod,
    xtreamFromSettings: () => ({
      account: async () => ({ user_info: { auth: 1 } }),
      liveCategories: async () => [],
      vodCategories: async () => [],
      seriesCategories: async () => [{ category_id: "30", category_name: "Series" }],
      liveStreams: async () => [],
      vodStreams: async () => [],
      series: async () => series,
    }),
  };
});

beforeAll(async () => {
  await resetDb();
  const { verify } = await import("@/config");
  await verify("test");
  await setSettings({ xtream_url: "http://provider.test", xtream_username: "u", xtream_password: "p" });
});

afterAll(closeDb);

const seriesItems = async () => {
  const rows = await db.select().from(schema.items).where(eq(schema.items.kind, "series"));
  return new Map(rows.map((r) => [r.xtreamId, r]));
};

describe("arrival date on re-import", () => {
  it("follows last_modified when it advances, keeps the stored date when the value is dirty", async () => {
    series = [
      { series_id: 1, name: "S1", category_id: "30", last_modified: "1720000000" },
      { series_id: 2, name: "S2", category_id: "30" },
    ];
    await runSync();
    const before = await seriesItems();
    expect(before.get("1")?.addedAt).toEqual(new Date(1720000000 * 1000));

    series = [
      { series_id: 1, name: "S1", category_id: "30", last_modified: "1720000100" },
      { series_id: 2, name: "S2", category_id: "30", last_modified: "abc" },
    ];
    await runSync();
    const after = await seriesItems();
    expect(after.get("1")?.addedAt).toEqual(new Date(1720000100 * 1000));
    expect(after.get("2")?.addedAt).toEqual(before.get("2")?.addedAt);
  });
});
