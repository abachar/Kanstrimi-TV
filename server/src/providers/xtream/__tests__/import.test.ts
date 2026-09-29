import { describe, it, expect, vi, beforeEach } from "vitest";
import type { XStream, XCategory } from "../client";

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
    getSettings: async () => ({ xtream_url: "http://x", xtream_username: "u", xtream_password: "p", tmdb_language: "fr-FR" }),
    isXtreamConfigured: () => true,
    setSettings: async () => undefined,
  };
});

const cats: XCategory[] = [
  { category_id: "10", category_name: "Live FR" },
  { category_id: "11", category_name: "Live IT" },
  { category_id: "10", category_name: "Live FR (doublon)" },
];
const streams: XStream[] = [
  { name: "♣♦♣-----|FR| FRANCE FHD |FR|----♣♦♣", stream_id: 900, category_id: "10" },
  { name: "A", stream_id: 1, category_id: "10" },
  { name: "B", stream_id: 2, category_id: "11" },
  { name: "•●★--|FR| SPORT |FR|---★●•", stream_id: 901, category_id: "10" },
  { name: "A (autre catégorie)", stream_id: 1, category_id: "11" },
  { name: "Id texte", stream_id: "ab-12" as unknown as number, category_id: "10" },
  { name: "Id numérique en texte", stream_id: " 2 " as unknown as number, category_id: "10" }, // doublon de B
  { name: "Sans id", category_id: "10" },
  { name: "Id null", stream_id: null as unknown as number, category_id: "10" },
  { name: "Date valide", stream_id: 4, added: "1720000000" },
  { name: "Date sale", stream_id: 5, added: "abc" },
  { name: "Date dans le futur", stream_id: 6, added: "4000000000" },
  // Radios arrive without a category, under their own separators: they get the « RADIOS » category of ours.
  { name: "•●★--|FR| FRANCE |FR|---★●•", stream_id: 902, category_id: null as unknown as string, stream_type: "radio_streams" },
  { name: "|FR| BEL RTL", stream_id: 3, category_id: null as unknown as string, stream_type: "radio_streams" },
];

vi.mock("../client", () => {
  class XtreamClient {
    base = "http://x";
    account = async () => ({ user_info: { auth: 1 } });
    liveCategories = async () => cats;
    vodCategories = async () => [];
    seriesCategories = async () => [];
    liveStreams = async () => streams;
    vodStreams = async () => [];
    series = async () => [];
  }
  return { XtreamError: class extends Error {}, XtreamClient, xtreamFromSettings: () => new XtreamClient() };
});

describe("sync deduplication and id hygiene", () => {
  beforeEach(() => {
    inserted.length = 0;
  });

  it("keeps opaque ids, drops entries without one, never repeats an id in one insert", async () => {
    const { runSync } = await import("../import");
    await runSync();
    expect(inserted.length).toBeGreaterThan(0);
    for (const { rows } of inserted) {
      const ids = rows.map((r) => `${r.kind}:${r.xtreamId}`);
      expect(new Set(ids).size).toBe(ids.length);
    }
    const items = inserted.filter((i) => i.table === "items").flatMap((i) => i.rows) as {
      xtreamId: string;
      name: string;
      section: string | null;
      categoryXtreamId: string;
      addedAt: Date;
      seenAt: Date;
    }[];
    expect(items.map((r) => r.xtreamId)).toEqual(["1", "2", "ab-12", "4", "5", "6", "3"]);
    expect(items[0].name).toBe("A"); // first occurrence wins
    // Separator lines are not entries; each names the section of what follows it in its category.
    expect(items.map((r) => [r.xtreamId, r.section])).toEqual([
      ["1", "|FR| FRANCE FHD |FR|"],
      ["2", null],
      ["ab-12", "|FR| SPORT |FR|"],
      ["4", null],
      ["5", null],
      ["6", null],
      ["3", "|FR| FRANCE |FR|"],
    ]);
    // Radio category mapping
    expect(items.find((r) => r.xtreamId === "3")?.categoryXtreamId).toBe("_radio");
    // Dates
    expect(items.find((r) => r.xtreamId === "4")!.addedAt).toEqual(new Date(1720000000 * 1000));
    expect(items.find((r) => r.xtreamId === "5")!.addedAt).toEqual(items[0].seenAt);
    expect(items.find((r) => r.xtreamId === "6")!.addedAt).toEqual(items[0].seenAt);

    const categories = inserted.filter((i) => i.table === "categories").flatMap((i) => i.rows);
    expect(categories.map((r) => r.xtreamId)).toEqual(["10", "11", "_radio"]);
  });
});
