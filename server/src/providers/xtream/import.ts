import { lt, sql } from "drizzle-orm";
import { db, schema, type Kind } from "@/db";
import { getSettings, setSettings } from "@/config";
import { XtreamClient, xtreamFromSettings, type XCategory, type XStream } from "./client";

const CHUNK = 500;

/**
 * Upstream servers list the same stream_id/category_id more than once (a channel shown in
 * two categories). Postgres refuses an ON CONFLICT DO UPDATE that touches a row twice in the
 * same statement, so keep the first occurrence of each id.
 */
function dedupe<T>(list: T[], key: (x: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const x of list) {
    const k = key(x);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}

/** The provider's id for an entry, as an opaque trimmed string. Null when unusable. */
export function upstreamId(kind: Kind, x: XStream): string | null {
  const raw = kind === "series" ? x.series_id : x.stream_id;
  if (raw === null || raw === undefined) return null;
  const id = String(raw).trim();
  return id && id !== "null" && id !== "undefined" ? id : null;
}

/**
 * Full catalogue import from the upstream Xtream server: categories and entries upserted,
 * the ones no longer listed removed. Nothing else: the pipeline re-filters and regroups after.
 */
export async function runSync(): Promise<Record<string, number>> {
  const client = xtreamFromSettings(await getSettings());
  if (!client) throw new Error("Serveur Xtream non configuré");
  const started = new Date();
  const stats: Record<string, number> = {};
  const acct = await client.account();
  if (!acct?.user_info || Number(acct.user_info.auth) !== 1) throw new Error("Authentification Xtream refusée");

  const kinds: [Kind, () => Promise<XCategory[]>, () => Promise<XStream[]>][] = [
    ["live", () => client.liveCategories(), () => client.liveStreams()],
    ["vod", () => client.vodCategories(), () => client.vodStreams()],
    ["series", () => client.seriesCategories(), () => client.series()],
  ];
  for (const [kind, cats, streams] of kinds) {
    const c = await cats();
    stats[`${kind}_categories`] = await upsertCategories(kind, Array.isArray(c) ? c : [], started);
    const st = await streams();
    stats[`${kind}_items`] = await upsertItems(kind, Array.isArray(st) ? st : [], started);
  }
  // Remove entries not seen in this sync
  const dc = await db.delete(schema.categories).where(lt(schema.categories.seenAt, started)).returning({ id: schema.categories.id });
  const di = await db.delete(schema.items).where(lt(schema.items.seenAt, started)).returning({ id: schema.items.id });
  stats.removed_categories = dc.length;
  stats.removed_items = di.length;
  await setSettings({ last_sync_at: new Date().toISOString() });
  return stats;
}

async function upsertCategories(kind: Kind, cats: XCategory[], seenAt: Date) {
  let n = 0;
  const list = dedupe(cats, (c) => String(c.category_id));
  for (let i = 0; i < list.length; i += CHUNK) {
    const rows = list.slice(i, i + CHUNK).map((c, j) => ({
      kind,
      xtreamId: String(c.category_id),
      name: String(c.category_name ?? ""),
      parentId: Number(c.parent_id ?? 0) || 0,
      position: i + j,
      raw: c as Record<string, unknown>,
      seenAt,
    }));
    if (!rows.length) continue;
    await db
      .insert(schema.categories)
      .values(rows)
      .onConflictDoUpdate({
        target: [schema.categories.kind, schema.categories.xtreamId],
        set: {
          name: sql`excluded.name`,
          parentId: sql`excluded.parent_id`,
          position: sql`excluded.position`,
          raw: sql`excluded.raw`,
          seenAt,
        },
      });
    n += rows.length;
  }
  return n;
}

async function upsertItems(kind: Kind, all: XStream[], seenAt: Date) {
  let n = 0;
  const list = dedupe(all, (x) => upstreamId(kind, x) ?? "");
  for (let i = 0; i < list.length; i += CHUNK) {
    const rows = list.slice(i, i + CHUNK).flatMap((x, j) => {
      const id = upstreamId(kind, x);
      if (!id) return [];
      const name = String(x.name ?? "");
      return [
        {
          kind,
          xtreamId: id,
          name,
          categoryXtreamId: x.category_id != null ? String(x.category_id) : null,
          position: i + j,
          raw: x as Record<string, unknown>,
          seenAt,
          matchStatus: (kind === "live" ? "skipped" : "pending") as "skipped" | "pending",
        },
      ];
    });
    if (!rows.length) continue;
    // On conflict keep the TMDB match unless the name changed. `clean_title` and `year` are the
    // grouping step's to write: it re-reads every name anyway.
    await db
      .insert(schema.items)
      .values(rows)
      .onConflictDoUpdate({
        target: [schema.items.kind, schema.items.xtreamId],
        set: {
          categoryXtreamId: sql`excluded.category_xtream_id`,
          position: sql`excluded.position`,
          raw: sql`excluded.raw`,
          seenAt,
          matchStatus: sql`CASE WHEN ${schema.items.name} <> excluded.name AND ${schema.items.matchStatus} <> 'manual' THEN 'pending'::match_status ELSE ${schema.items.matchStatus} END`,
          name: sql`excluded.name`,
        },
      });
    n += rows.length;
  }
  return n;
}

/** Test upstream credentials without touching the DB. */
export async function testXtream(url: string, username: string, password: string) {
  const c = new XtreamClient(url, username, password);
  const acct = await c.account();
  if (!acct?.user_info) throw new Error("Réponse inattendue du serveur");
  return acct;
}
