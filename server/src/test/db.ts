import { db, schema, client } from "@/db";
import { sql } from "drizzle-orm";
import type { XStream } from "@/sync";

/** Empty every catalogue table between test files. */
export async function resetDb() {
  await db.execute(sql`truncate table items, contents, episodes, episode_sources, categories, tmdb_cache, info_cache, filter_rules, sync_logs, settings, watch_progress, favorites, devices restart identity cascade`);
}

export async function closeDb() { await client.end({ timeout: 5 }); }

export type ItemSeed = {
  kind: "live" | "vod" | "series"; xtreamId: string; name: string; cat?: string;
  tmdbId?: number; matchStatus?: "pending" | "matched" | "unmatched" | "manual" | "skipped";
  hiddenManual?: boolean; hiddenByRule?: boolean; raw?: Partial<XStream>; addedAt?: Date; keyOverride?: string;
};

export async function seedCategories(rows: { kind: "live" | "vod" | "series"; xtreamId: string; name: string; hiddenManual?: boolean }[]) {
  if (!rows.length) return;
  await db.insert(schema.categories).values(rows.map((c, i) => ({ kind: c.kind, xtreamId: c.xtreamId, name: c.name, position: i, hiddenManual: c.hiddenManual ?? false, raw: {} })));
}

export async function seedItems(rows: ItemSeed[]) {
  if (!rows.length) return [];
  return db.insert(schema.items).values(rows.map((r, i) => ({
    kind: r.kind, xtreamId: r.xtreamId, name: r.name, categoryXtreamId: r.cat ?? null, position: i,
    tmdbId: r.tmdbId ?? null, matchStatus: r.matchStatus ?? (r.kind === "live" ? "skipped" : "pending"),
    hiddenManual: r.hiddenManual ?? false, hiddenByRule: r.hiddenByRule ?? false, keyOverride: r.keyOverride ?? null,
    raw: { name: r.name, stream_id: Number(r.xtreamId) || r.xtreamId, container_extension: r.kind === "live" ? "ts" : "mkv", ...r.raw } as Record<string, unknown>,
    addedAt: r.addedAt ?? new Date("2026-09-20T04:10:00Z"),
  }))).returning({ id: schema.items.id, xtreamId: schema.items.xtreamId });
}

export async function seedTmdb(mediaType: "movie" | "tv", tmdbId: number, data: Record<string, unknown>, lang = "fr-FR") {
  await db.insert(schema.tmdbCache).values({ mediaType, tmdbId, lang, data: { id: tmdbId, ...data } }).onConflictDoNothing();
}
