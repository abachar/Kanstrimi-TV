import { db, schema } from "@/db";
import { inArray, lt, sql } from "drizzle-orm";
import { XtreamClient } from "@/lib/xtream/client";
import type { XCategory, XStream } from "@/lib/xtream/types";
import { getSettings, isXtreamConfigured, setSettings } from "@/lib/settings";
import { compileRules, isHidden, type Kind } from "@/lib/filters/rules";
import { cleanTitle } from "@/lib/tmdb/match";
import { startLog, finishLog } from "@/lib/jobs/log";
import { describeError } from "@/lib/errors";

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

/** Full catalog synchronisation from the upstream Xtream server. */
export async function runSync(): Promise<{ stats: Record<string, number> }> {
  const s = await getSettings();
  if (!isXtreamConfigured(s)) throw new Error("Serveur Xtream non configuré");
  const client = new XtreamClient(s.xtream_url, s.xtream_username, s.xtream_password);
  const logId = await startLog("source");
  const started = new Date();
  const stats: Record<string, number> = {};
  try {
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
    await applyRules();
    await setSettings({ last_sync_at: new Date().toISOString() });
    await finishLog(logId, "success", undefined, stats);
    return { stats };
  } catch (e) {
    await finishLog(logId, "error", describeError(e), stats);
    throw e;
  }
}

async function upsertCategories(kind: Kind, cats: XCategory[], seenAt: Date) {
  let n = 0;
  const list = dedupe(cats, (c) => String(c.category_id));
  for (let i = 0; i < list.length; i += CHUNK) {
    const rows = list.slice(i, i + CHUNK).map((c, j) => ({
      kind, xtreamId: String(c.category_id), name: String(c.category_name ?? ""),
      parentId: Number(c.parent_id ?? 0) || 0, position: i + j, raw: c as Record<string, unknown>, seenAt,
    }));
    if (!rows.length) continue;
    await db.insert(schema.categories).values(rows).onConflictDoUpdate({
      target: [schema.categories.kind, schema.categories.xtreamId],
      set: { name: sql`excluded.name`, parentId: sql`excluded.parent_id`, position: sql`excluded.position`, raw: sql`excluded.raw`, seenAt },
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
      const ct = kind === "live" ? null : cleanTitle(name);
      return [{
        kind, xtreamId: id, name,
        categoryXtreamId: x.category_id != null ? String(x.category_id) : null,
        position: i + j, raw: x as Record<string, unknown>, seenAt,
        cleanTitle: ct?.title ?? null, year: ct?.year ?? null,
        matchStatus: (kind === "live" ? "skipped" : "pending") as "skipped" | "pending",
      }];
    });
    if (!rows.length) continue;
    // On conflict keep tmdb match unless the name changed.
    await db.insert(schema.items).values(rows).onConflictDoUpdate({
      target: [schema.items.kind, schema.items.xtreamId],
      set: {
        categoryXtreamId: sql`excluded.category_xtream_id`, position: sql`excluded.position`, raw: sql`excluded.raw`, seenAt,
        cleanTitle: sql`excluded.clean_title`, year: sql`excluded.year`,
        matchStatus: sql`CASE WHEN ${schema.items.name} <> excluded.name AND ${schema.items.matchStatus} <> 'manual' THEN 'pending'::match_status ELSE ${schema.items.matchStatus} END`,
        name: sql`excluded.name`,
      },
    });
    n += rows.length;
  }
  return n;
}

/** Recompute hidden_by_rule for all categories and items from the current rule set. */
export async function applyRules() {
  const rules = await db.select().from(schema.filterRules);
  const compiled = compileRules(rules);
  const cats = await db.select({ id: schema.categories.id, kind: schema.categories.kind, name: schema.categories.name, xtreamId: schema.categories.xtreamId, hidden: schema.categories.hiddenByRule }).from(schema.categories);
  const hiddenCatKeys = new Set<string>();
  const catName = new Map<string, string>();
  const catUpdates: { ids: number[]; hidden: boolean }[] = [{ ids: [], hidden: true }, { ids: [], hidden: false }];
  for (const c of cats) {
    const h = isHidden(compiled, c.kind, "category", c.name);
    catName.set(`${c.kind}:${c.xtreamId}`, c.name);
    if (h) hiddenCatKeys.add(`${c.kind}:${c.xtreamId}`);
    if (h !== c.hidden) catUpdates[h ? 0 : 1].ids.push(c.id);
  }
  for (const u of catUpdates) for (let i = 0; i < u.ids.length; i += CHUNK)
    await db.update(schema.categories).set({ hiddenByRule: u.hidden }).where(inArray(schema.categories.id, u.ids.slice(i, i + CHUNK)));

  const its = await db.select({ id: schema.items.id, kind: schema.items.kind, name: schema.items.name, cat: schema.items.categoryXtreamId, hidden: schema.items.hiddenByRule }).from(schema.items);
  const itemUpdates: { ids: number[]; hidden: boolean }[] = [{ ids: [], hidden: true }, { ids: [], hidden: false }];
  for (const it of its) {
    const key = `${it.kind}:${it.cat}`;
    const h = hiddenCatKeys.has(key) || isHidden(compiled, it.kind, "name", it.name);
    if (h !== it.hidden) itemUpdates[h ? 0 : 1].ids.push(it.id);
  }
  for (const u of itemUpdates) for (let i = 0; i < u.ids.length; i += CHUNK)
    await db.update(schema.items).set({ hiddenByRule: u.hidden }).where(inArray(schema.items.id, u.ids.slice(i, i + CHUNK)));
  return { categories: catUpdates[0].ids.length + catUpdates[1].ids.length, items: itemUpdates[0].ids.length + itemUpdates[1].ids.length };
}

/** Test upstream credentials without touching the DB. */
export async function testXtream(url: string, username: string, password: string) {
  const c = new XtreamClient(url, username, password);
  const acct = await c.account();
  if (!acct?.user_info) throw new Error("Réponse inattendue du serveur");
  return acct;
}

