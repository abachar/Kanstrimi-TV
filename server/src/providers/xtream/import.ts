import { lt, sql } from "drizzle-orm";
import { db, schema, type Kind } from "@/db";
import { stripOrnaments } from "@/shared";
import { getSettings, setSettings } from "@/config";
import { XtreamClient, xtreamFromSettings, type XCategory, type XStream } from "./client";

const CHUNK = 500;

/**
 * Radio streams (`stream_type: "radio_streams"`) come without any category: no category rule
 * or switch could reach them, and the admin had nowhere to list them. They get a category of
 * ours, created at import when at least one exists; its id cannot collide with the provider's numbers.
 */
export const RADIO_CATEGORY_ID = "_radio";
const RADIO_CATEGORY_NAME = "RADIOS";
const isRadio = (x: XStream) => x.stream_type === "radio_streams";

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

/**
 * Xtream lists carry separator lines between groups of channels: « ♣♦♣-----|FR| FRANCE FHD |FR|----♣♦♣ »,
 * « •●★-----|FR| SPORT |FR|-----★●• ». Only their shape is known here; what the text means is the
 * catalogue's business (`liveTheme`).
 */
// Two dashes are enough: « •●★--|TR| BELGESELLER |TR|---★●• » exists, no channel starts with "--".
const SEPARATOR = /^[\s\-_=~]*[-_=~]{2,}/;
export const isSeparator = (name: string) => SEPARATOR.test(stripOrnaments(name.normalize("NFC")).trim());
/** The text between the dashes, ornaments gone, otherwise untouched: « |FR| SPORT |FR| ». */
export const separatorText = (name: string) =>
  stripOrnaments(name.normalize("NFC"))
    .replace(/^[\s\-_=~]+|[\s\-_=~]+$/g, "")
    .trim();

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
    const items = await upsertItems(kind, Array.isArray(st) ? st : [], started);
    stats[`${kind}_items`] = items.count;
    if (items.radios) await upsertRadioCategory(started);
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

/** The synthetic « RADIOS » category, last in the list, kept alive by `seenAt` like the provider's. */
async function upsertRadioCategory(seenAt: Date) {
  await db
    .insert(schema.categories)
    .values([{ kind: "live", xtreamId: RADIO_CATEGORY_ID, name: RADIO_CATEGORY_NAME, parentId: 0, position: 1_000_000, raw: {}, seenAt }])
    .onConflictDoUpdate({ target: [schema.categories.kind, schema.categories.xtreamId], set: { seenAt } });
}

async function upsertItems(kind: Kind, all: XStream[], seenAt: Date): Promise<{ count: number; radios: number }> {
  let n = 0,
    radios = 0;
  const list = dedupe(all, (x) => upstreamId(kind, x) ?? "");
  // A separator line names the section of the entries that follow it in the same category
  // (« ----|FR| SPORT |FR|---- »); it is not an entry and is never stored.
  const sections = new Map<string, string>();
  for (let i = 0; i < list.length; i += CHUNK) {
    const rows = list.slice(i, i + CHUNK).flatMap((x, j) => {
      const id = upstreamId(kind, x);
      if (!id) return [];
      const name = String(x.name ?? "");
      const upstreamCategory = x.category_id != null ? String(x.category_id) : null;
      if (isSeparator(name)) {
        sections.set(upstreamCategory ?? "", separatorText(name));
        return [];
      }
      const radio = kind === "live" && !upstreamCategory && isRadio(x);
      if (radio) radios++;
      const categoryXtreamId = radio ? RADIO_CATEGORY_ID : upstreamCategory;
      return [
        {
          kind,
          xtreamId: id,
          name,
          categoryXtreamId,
          position: i + j,
          raw: x as Record<string, unknown>,
          seenAt,
          section: sections.get(upstreamCategory ?? "") ?? null,
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
          section: sql`excluded.section`,
          matchStatus: sql`CASE WHEN ${schema.items.name} <> excluded.name AND ${schema.items.matchStatus} <> 'manual' THEN 'pending'::match_status ELSE ${schema.items.matchStatus} END`,
          name: sql`excluded.name`,
        },
      });
    n += rows.length;
  }
  return { count: n, radios };
}

/** Test upstream credentials without touching the DB. */
export async function testXtream(url: string, username: string, password: string) {
  const c = new XtreamClient(url, username, password);
  const acct = await c.account();
  if (!acct?.user_info) throw new Error("Réponse inattendue du serveur");
  return acct;
}
