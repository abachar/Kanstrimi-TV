import { sql } from "drizzle-orm";
import { db, schema, KINDS, type Kind } from "@/db";
import { checkCancelled, stripOrnaments } from "@/shared";
import { getSettings, setSettings } from "@/config";
import { XtreamClient, xtreamFromSettings, type XCategory, type XStream } from "./client";

const CHUNK = 1000;

/**
 * A list that shrinks under this share of what the catalogue holds is taken for a provider
 * failure (a backend answering `[]`), not for a cleanup: the import stops, the catalogue stays.
 * Below `SHRINK_FLOOR` entries the check says nothing (a new or tiny account).
 */
export const SHRINK_RATIO = 0.5;
const SHRINK_FLOOR = 50;

export class ShrinkError extends Error {}
/** Ends every refusal of a shrinking catalogue (here and in `merge`): the admin offers to accept it. */
export const SHRINK_HINT = "relancer à la main en acceptant la baisse si elle est réelle";

/**
 * Upstream servers list the same stream_id/category_id more than once (a channel shown in
 * two categories): keep the first occurrence of each id.
 */
function dedupe<T>(list: T[], key: (x: T) => string | null): T[] {
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

/** A list the provider sent, or an error: an object or an error page is never taken for an empty list. */
function asList<T>(what: string, v: unknown): T[] {
  if (!Array.isArray(v)) throw new Error(`Réponse Xtream inattendue pour ${what} : pas une liste`);
  return v as T[];
}

/** The entries of one kind, deduplicated, each with its id, in the provider's order. */
export function prepareStreams(kind: Kind, list: XStream[]): { xtreamId: string; raw: XStream }[] {
  return dedupe(list, (x) => upstreamId(kind, x)).map((x) => ({ xtreamId: upstreamId(kind, x)!, raw: x }));
}
export function prepareCategories(list: XCategory[]): { xtreamId: string; raw: XCategory }[] {
  const id = (c: XCategory) => (c.category_id === null || c.category_id === undefined ? null : String(c.category_id));
  return dedupe(list, id).map((c) => ({ xtreamId: id(c)!, raw: c }));
}

/**
 * Throws when a kind lost more than half of what the catalogue holds: a provider failure far more
 * often than a real cleanup. `acceptShrink` (a manual run from the admin) lets a real one through.
 */
export function checkShrink(received: Record<Kind, number>, current: Record<Kind, number>, acceptShrink = false) {
  if (acceptShrink) return;
  for (const kind of KINDS) {
    const had = current[kind] ?? 0;
    if (had >= SHRINK_FLOOR && received[kind] < had * SHRINK_RATIO)
      throw new ShrinkError(
        `Liste ${kind} du fournisseur réduite à ${received[kind]} entrées pour ${had} au catalogue : import refusé, catalogue conservé (${SHRINK_HINT})`,
      );
  }
}

/**
 * The `source` step: reads the provider's lists and, once they pass the checks, replaces the raw
 * copy (`xtream_categories`, `xtream_streams`) in one transaction. Never touches the catalogue:
 * `merge` derives it from the copy.
 */
export async function runSync(opts: { acceptShrink?: boolean } = {}): Promise<Record<string, number>> {
  const client = xtreamFromSettings(await getSettings());
  if (!client) throw new Error("Serveur Xtream non configuré");
  const acct = await client.account();
  if (!acct?.user_info || Number(acct.user_info.auth) !== 1) throw new Error("Authentification Xtream refusée");

  const fetchers: Record<Kind, [() => Promise<XCategory[]>, () => Promise<XStream[]>]> = {
    live: [() => client.liveCategories(), () => client.liveStreams()],
    vod: [() => client.vodCategories(), () => client.vodStreams()],
    series: [() => client.seriesCategories(), () => client.series()],
  };
  const cats: { kind: Kind; xtreamId: string; position: number; raw: Record<string, unknown> }[] = [];
  const streams: typeof cats = [];
  const received = { live: 0, vod: 0, series: 0 } as Record<Kind, number>;
  const stats: Record<string, number> = {};
  for (const kind of KINDS) {
    const [getCats, getStreams] = fetchers[kind];
    const c = prepareCategories(asList(`${kind}_categories`, await getCats()));
    const s = prepareStreams(kind, asList(`${kind}_streams`, await getStreams()));
    cats.push(...c.map((x, i) => ({ kind, xtreamId: x.xtreamId, position: i, raw: x.raw as Record<string, unknown> })));
    for (const [i, x] of s.entries()) streams.push({ kind, xtreamId: x.xtreamId, position: i, raw: x.raw as Record<string, unknown> });
    received[kind] = s.length;
    stats[`${kind}_categories`] = c.length;
    stats[`${kind}_items`] = s.length;
  }

  const current = { live: 0, vod: 0, series: 0 } as Record<Kind, number>;
  const rows = await db
    .select({ kind: schema.catalogVariants.kind, n: sql<number>`count(*)::int` })
    .from(schema.catalogVariants)
    .groupBy(schema.catalogVariants.kind);
  for (const r of rows) current[r.kind] = r.n;
  checkShrink(received, current, opts.acceptShrink);

  checkCancelled();
  await db.transaction(async (tx) => {
    await tx.execute(sql`truncate table ${schema.xtreamCategories}, ${schema.xtreamStreams}`);
    for (let i = 0; i < cats.length; i += CHUNK) await tx.insert(schema.xtreamCategories).values(cats.slice(i, i + CHUNK));
    for (let i = 0; i < streams.length; i += CHUNK) await tx.insert(schema.xtreamStreams).values(streams.slice(i, i + CHUNK));
  });
  await setSettings({ last_sync_at: new Date().toISOString() });
  return stats;
}

/** Test upstream credentials without touching the DB. */
export async function testXtream(url: string, username: string, password: string) {
  const c = new XtreamClient(url, username, password);
  const acct = await c.account();
  if (!acct?.user_info) throw new Error("Réponse inattendue du serveur");
  return acct;
}
