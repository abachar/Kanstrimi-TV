import { describe, it, expect, vi, beforeEach } from "vitest";
import type { XStream, XCategory } from "@/lib/xtream/types";

/** Capture the rows Drizzle would insert, to assert no batch carries the same id twice. */
const inserted: { table: string; rows: Record<string, unknown>[] }[] = [];

vi.mock("@/db", () => {
  const tables = { categories: "categories", items: "items", settings: "settings", filterRules: "filter_rules", syncLogs: "sync_logs" };
  return {
    schema: tables,
    db: {
      insert: (table: string) => ({
        values(rows: Record<string, unknown>[]) {
          inserted.push({ table, rows });
          return { onConflictDoUpdate: async () => undefined, onConflictDoNothing: async () => undefined };
        },
      }),
      select: () => ({ from: async () => [] }),
      update: () => ({ set: () => ({ where: async () => undefined }) }),
      delete: () => ({ where: () => ({ returning: async () => [] }) }),
    },
  };
});
vi.mock("@/lib/settings", () => ({
  getSettings: async () => ({ xtream_url: "http://x", xtream_username: "u", xtream_password: "p", tmdb_language: "fr-FR" }),
  isXtreamConfigured: () => true,
  setSettings: async () => undefined,
}));
vi.mock("@/lib/jobs/log", () => ({ startLog: async () => 1, finishLog: async () => undefined }));

const cats: XCategory[] = [
  { category_id: "10", category_name: "Live FR" },
  { category_id: "11", category_name: "Live IT" },
  { category_id: "10", category_name: "Live FR (doublon)" },
];
const streams: XStream[] = [
  { name: "A", stream_id: 1, category_id: "10" },
  { name: "B", stream_id: 2, category_id: "11" },
  { name: "A (autre catégorie)", stream_id: 1, category_id: "11" },
  { name: "Id texte", stream_id: "ab-12" as unknown as number, category_id: "10" },
  { name: "Id numérique en texte", stream_id: " 2 " as unknown as number, category_id: "10" }, // doublon de B
  { name: "Sans id", category_id: "10" },
  { name: "Id null", stream_id: null as unknown as number, category_id: "10" },
];

vi.mock("@/lib/xtream/client", () => ({
  XtreamError: class extends Error {},
  XtreamClient: class {
    base = "http://x";
    account = async () => ({ user_info: { auth: 1 } });
    liveCategories = async () => cats;
    vodCategories = async () => [];
    seriesCategories = async () => [];
    liveStreams = async () => streams;
    vodStreams = async () => [];
    series = async () => [];
  },
}));

describe("sync deduplication and id hygiene", () => {
  beforeEach(() => { inserted.length = 0; });

  it("keeps opaque ids, drops entries without one, never repeats an id in one insert", async () => {
    const { runSync } = await import("../sync");
    await runSync();
    expect(inserted.length).toBeGreaterThan(0);
    for (const { rows } of inserted) {
      const ids = rows.map((r) => `${r.kind}:${r.xtreamId}`);
      expect(new Set(ids).size).toBe(ids.length);
    }
    const items = inserted.filter((i) => i.table === "items").flatMap((i) => i.rows);
    expect(items.map((r) => r.xtreamId)).toEqual(["1", "2", "ab-12"]);
    expect(items[0].name).toBe("A"); // first occurrence wins
    const categories = inserted.filter((i) => i.table === "categories").flatMap((i) => i.rows);
    expect(categories.map((r) => r.xtreamId)).toEqual(["10", "11"]);
  });
});
