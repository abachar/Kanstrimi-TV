import { client as pg, KINDS, type Kind, type ProviderAccount } from "@/db";
import { checkCancelled, describeError, isCancelled, stripOrnaments } from "@/shared";
import { activeAccounts, setSettings } from "@/config";
import { XtreamClient, xtreamFor, type XCategory, type XStream } from "./client";

const CHUNK = 5000;

/**
 * A list that shrinks under this share of what the catalogue holds is taken for a provider
 * failure (a backend answering `[]`), not for a cleanup: the import stops, the catalogue stays.
 * Below `SHRINK_FLOOR` entries the check says nothing (a new or tiny account).
 */
export const SHRINK_RATIO = 0.5;
export const SHRINK_FLOOR = 50;

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
// Another provider frames them with hashes: « ##### MA - MOROCCO ##### » (three at least: « #1 HITS » is a channel).
const SEPARATOR = /^[\s\-_=~#]*(?:[-_=~]{2,}|#{3,})/;
export const isSeparator = (name: string) => SEPARATOR.test(stripOrnaments(name.normalize("NFC")).trim());
/** The text between the dashes, ornaments gone, otherwise untouched: « |FR| SPORT |FR| ». */
export const separatorText = (name: string) =>
  stripOrnaments(name.normalize("NFC"))
    .replace(/^[\s\-_=~#]+|[\s\-_=~#]+$/g, "")
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
 * Radio streams (`stream_type: "radio_streams"`) come without any category: no category rule
 * or switch could reach them, and the admin had nowhere to list them. They get a category of
 * ours, created when at least one exists; its id cannot collide with the provider's numbers.
 */
export const RADIO_CATEGORY_ID = "_radio";
const RADIO_CATEGORY_NAME = "RADIOS";

/** A scalar of the provider's JSON as text, as `raw->>'field'` would give it. */
const asText = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

/**
 * The arrival date: `added` for live/vod, `last_modified` for series, Unix seconds as strings.
 * Null when missing, invalid or in the future: the stored date is kept, else the insert time.
 */
export function parseAddedDate(kind: Kind, raw: Pick<XStream, "added" | "last_modified">, now = new Date()): Date | null {
  const v = asText(kind === "series" ? raw.last_modified : raw.added);
  if (!v) return null;
  const n = Number(v);
  if (Number.isNaN(n) || n <= 0) return null;
  const d = new Date(n * 1000);
  return Number.isNaN(d.getTime()) || d > now ? null : d;
}

/** One entry of a provider's list as `xtream_streams` stores it. */
export type StreamEntry = {
  kind: Kind;
  upstreamId: string;
  position: number;
  raw: XStream;
  name: string;
  category: string | null;
  /** A separator line: kept, it names the section of the entries that follow it in the same category. */
  separator: boolean;
  section: string | null;
  addedAt: Date | null;
};

/**
 * The entries of one kind in the provider's order. A separator line names the section of the entries
 * that follow it in the same category (« ----|FR| SPORT |FR|---- »). Radios without a category go to
 * ours (`radios`: the list has some).
 */
export function deriveEntries(kind: Kind, list: { xtreamId: string; raw: XStream }[]): { entries: StreamEntry[]; radios: boolean } {
  const entries: StreamEntry[] = [];
  const sections = new Map<string, string>();
  let radios = false;
  for (const [position, x] of list.entries()) {
    const name = asText(x.raw.name) ?? "";
    const own = asText(x.raw.category_id);
    const separator = isSeparator(name);
    if (separator) sections.set(own ?? "", separatorText(name));
    const radio = !separator && kind === "live" && !own && x.raw.stream_type === "radio_streams";
    if (radio) radios = true;
    entries.push({
      kind,
      upstreamId: x.xtreamId,
      position,
      raw: x.raw,
      name,
      category: radio ? RADIO_CATEGORY_ID : own,
      separator,
      section: separator ? null : (sections.get(own ?? "") ?? null),
      addedAt: parseAddedDate(kind, x.raw),
    });
  }
  return { entries, radios };
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

export type SyncResult = {
  /** Totals over the accounts read (lists received, entries and categories added, updated, removed), plus `accounts` read and `accounts_failed`. */
  stats: Record<string, number>;
  /** One line per account that could not be read, its copy kept. */
  failed: string[];
};

/** How many entries (separators apart) each account holds per kind: what its lists are checked against. */
export async function streamCounts(): Promise<Map<number, Record<Kind, number>>> {
  const rows = await pg<{ accountId: number; kind: Kind; n: number }[]>`
    select account_id as "accountId", kind, count(*)::int as n from xtream_streams where not separator group by account_id, kind`;
  const out = new Map<number, Record<Kind, number>>();
  for (const r of rows) {
    const counts = out.get(r.accountId) ?? ({ live: 0, vod: 0, series: 0 } as Record<Kind, number>);
    counts[r.kind] = r.n;
    out.set(r.accountId, counts);
  }
  return out;
}

const NO_COUNTS: Record<Kind, number> = { live: 0, vod: 0, series: 0 };

/**
 * The `source` step: reads the lists of every enabled account and, once they pass the checks, writes
 * them to `xtream_categories` and `xtream_streams` by difference, in one transaction: a new entry is
 * inserted, a changed one updated, a vanished one deleted, an unchanged one not written at all, so a
 * stream keeps its id for as long as the provider lists it. An account that fails (down, refused,
 * shrunk) keeps what it had and is reported; the step fails only when none could be read. What the
 * catalogue decided about a stream (`catalog_variants`) is not its business: it goes with a deleted stream.
 */
export async function runSync(opts: { acceptShrink?: boolean } = {}): Promise<SyncResult> {
  const accounts = await activeAccounts();
  if (!accounts.length) throw new Error("Aucun fournisseur actif (page Fournisseurs)");
  const current = await streamCounts();
  const totals: Record<string, number> = { accounts: 0, accounts_failed: 0 };
  const failed: string[] = [];
  for (const a of accounts) {
    checkCancelled();
    try {
      const stats = await syncAccount(a, current.get(a.id) ?? NO_COUNTS, opts.acceptShrink ?? false);
      for (const [k, v] of Object.entries(stats)) totals[k] = (totals[k] ?? 0) + v;
      totals.accounts++;
      console.log(`[source] ${a.name} : ${JSON.stringify(stats)}`);
    } catch (e) {
      if (isCancelled(e)) throw e;
      totals.accounts_failed++;
      failed.push(`${a.name} : ${describeError(e)}`);
      console.error(`[source] ${a.name} en échec, copie conservée : ${describeError(e)}`);
    }
  }
  if (!totals.accounts) throw new Error(failed.join(" ; "));
  await setSettings({ last_sync_at: new Date().toISOString() });
  return { stats: totals, failed };
}

async function syncAccount(
  account: ProviderAccount,
  currentCounts: Record<Kind, number>,
  acceptShrink: boolean,
): Promise<Record<string, number>> {
  const client = xtreamFor(account);
  const acct = await client.account();
  if (!acct?.user_info || Number(acct.user_info.auth) !== 1) throw new Error("Authentification Xtream refusée");

  const fetchers: Record<Kind, [() => Promise<XCategory[]>, () => Promise<XStream[]>]> = {
    live: [() => client.liveCategories(), () => client.liveStreams()],
    vod: [() => client.vodCategories(), () => client.vodStreams()],
    series: [() => client.seriesCategories(), () => client.series()],
  };
  const cats: { kind: Kind; xtreamId: string; name: string; parentId: number; position: number; raw: Record<string, unknown> }[] = [];
  const streams: StreamEntry[] = [];
  const received = { live: 0, vod: 0, series: 0 } as Record<Kind, number>;
  const stats: Record<string, number> = {};
  for (const kind of KINDS) {
    const [getCats, getStreams] = fetchers[kind];
    const c = prepareCategories(asList(`${kind}_categories`, await getCats()));
    const s = deriveEntries(kind, prepareStreams(kind, asList(`${kind}_streams`, await getStreams())));
    for (const [i, x] of c.entries()) {
      const parent = asText((x.raw as Record<string, unknown>).parent_id) ?? "";
      cats.push({
        kind,
        xtreamId: x.xtreamId,
        name: asText(x.raw.category_name) ?? "",
        parentId: /^[0-9]+$/.test(parent) ? Number(parent) : 0,
        position: i,
        raw: x.raw as Record<string, unknown>,
      });
    }
    // Ours, for the radios the provider lists without a category.
    if (s.radios) cats.push({ kind, xtreamId: RADIO_CATEGORY_ID, name: RADIO_CATEGORY_NAME, parentId: 0, position: 1_000_000, raw: {} });
    streams.push(...s.entries);
    received[kind] = s.entries.filter((e) => !e.separator).length;
    stats[`${kind}_categories`] = c.length;
    stats[`${kind}_items`] = received[kind];
  }

  checkShrink(received, currentCounts, acceptShrink);

  checkCancelled();
  const written = await pg.begin(async (tx) => {
    const id = account.id;
    const [c] = await tx`
      with src as (
        select kind::content_kind as kind, xtream_id, name, parent_id, position, raw::jsonb as raw
        from unnest(${cats.map((x) => x.kind)}::text[], ${cats.map((x) => x.xtreamId)}::text[], ${cats.map((x) => x.name)}::text[],
                    ${cats.map((x) => x.parentId)}::int[], ${cats.map((x) => x.position)}::int[], ${cats.map((x) => JSON.stringify(x.raw))}::text[])
          as u(kind, xtream_id, name, parent_id, position, raw)
      ),
      upd as (
        update xtream_categories c set name = s.name, parent_id = s.parent_id, position = s.position, raw = s.raw, changed_at = now()
        from src s
        where c.account_id = ${id} and c.kind = s.kind and c.xtream_id = s.xtream_id
          and (c.name, c.parent_id, c.position, c.raw) is distinct from (s.name, s.parent_id, s.position, s.raw)
        returning 1
      ),
      ins as (
        insert into xtream_categories (account_id, kind, xtream_id, name, parent_id, position, raw)
        select ${id}, s.kind, s.xtream_id, s.name, s.parent_id, s.position, s.raw from src s
        where not exists (select 1 from xtream_categories c where c.account_id = ${id} and c.kind = s.kind and c.xtream_id = s.xtream_id)
        returning 1
      ),
      del as (
        delete from xtream_categories c
        where c.account_id = ${id} and not exists (select 1 from src s where s.kind = c.kind and s.xtream_id = c.xtream_id)
        returning 1
      )
      select (select count(*) from ins)::int as added, (select count(*) from upd)::int as updated, (select count(*) from del)::int as removed`;

    await tx`create temp table sync_streams (
      kind content_kind, upstream_id text, position int, raw jsonb, name text, category text, separator boolean, section text, added_at timestamptz,
      primary key (kind, upstream_id)) on commit drop`;
    for (let i = 0; i < streams.length; i += CHUNK) {
      checkCancelled();
      const part = streams.slice(i, i + CHUNK);
      await tx`
        insert into sync_streams
        select kind::content_kind, upstream_id, position, raw::jsonb, name, category, separator::boolean, section, added_at::timestamptz
        from unnest(${part.map((e) => e.kind)}::text[], ${part.map((e) => e.upstreamId)}::text[], ${part.map((e) => e.position)}::int[],
                    ${part.map((e) => JSON.stringify(e.raw))}::text[], ${part.map((e) => e.name)}::text[], ${part.map((e) => e.category)}::text[],
                    ${part.map((e) => String(e.separator))}::text[], ${part.map((e) => e.section)}::text[],
                    ${part.map((e) => e.addedAt?.toISOString() ?? null)}::text[])
          as u(kind, upstream_id, position, raw, name, category, separator, section, added_at)`;
    }

    // A changed name voids what was read in the old one (`title` null: to be read again); a date the
    // provider no longer gives cleanly keeps the stored one. What counts as a change beyond the name,
    // category, section and date: for live, the rank and the raw entry whole (`num` is the channel
    // number); for movies and series not `num` nor the rank, which only say where the entry sits in the
    // provider's list: one title added at the top shifts every other, and comparing them would rewrite
    // 70 000 rows for one new movie. They are refreshed whenever the entry changes for another reason.
    const [upd] = await tx`
      with u as (
        update xtream_streams s set
          name = n.name, category_xtream_id = n.category, position = n.position, raw = n.raw, separator = n.separator, section = n.section,
          added_at = coalesce(n.added_at, s.added_at), changed_at = now(),
          title = case when s.name <> n.name then null else s.title end
        from sync_streams n
        where s.account_id = ${id} and s.kind = n.kind and s.upstream_id = n.upstream_id
          and (s.name, s.category_xtream_id, s.section, s.separator, s.added_at,
               case when s.kind = 'live' then s.position end, case when s.kind = 'live' then s.raw else s.raw - 'num' end)
              is distinct from (n.name, n.category, n.section, n.separator, coalesce(n.added_at, s.added_at),
               case when n.kind = 'live' then n.position end, case when n.kind = 'live' then n.raw else n.raw - 'num' end)
        returning s.separator
      )
      select count(*) filter (where not separator)::int as n from u`;
    const [ins] = await tx`
      with i as (
        insert into xtream_streams (account_id, kind, upstream_id, position, raw, name, category_xtream_id, separator, section, added_at)
        select ${id}, n.kind, n.upstream_id, n.position, n.raw, n.name, n.category, n.separator, n.section, coalesce(n.added_at, now())
        from sync_streams n
        where not exists (select 1 from xtream_streams s where s.account_id = ${id} and s.kind = n.kind and s.upstream_id = n.upstream_id)
        returning separator
      )
      select count(*) filter (where not separator)::int as n from i`;
    const [del] = await tx`
      with d as (
        delete from xtream_streams s
        where s.account_id = ${id} and not exists (select 1 from sync_streams n where n.kind = s.kind and n.upstream_id = s.upstream_id)
        returning separator
      )
      select count(*) filter (where not separator)::int as n from d`;
    return {
      categories_added: c.added,
      categories_updated: c.updated,
      categories_removed: c.removed,
      items_added: ins.n,
      items_updated: upd.n,
      items_removed: del.n,
    };
  });
  return { ...stats, ...written };
}

/** Test upstream credentials without touching the DB. */
export async function testXtream(url: string, username: string, password: string) {
  const c = new XtreamClient(url, username, password);
  const acct = await c.account();
  if (!acct?.user_info) throw new Error("Réponse inattendue du serveur");
  return acct;
}
