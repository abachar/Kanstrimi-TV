import { client as pg, KINDS, type Kind } from "@/db";
import { checkCancelled } from "@/shared";
import { isSeparator, separatorText, SHRINK_FLOOR, SHRINK_HINT, SHRINK_RATIO } from "@/providers/xtream";
import { runNaming } from "./grouping/group";
import { withCatalogLock } from "./lock";

/**
 * The `merge` step: the provider's raw copy (`xtream_categories`, `xtream_streams`, written by
 * `source`) → the catalogue (`catalog_categories`, `catalog_variants`), by difference. A new entry is
 * inserted, a changed one updated, a vanished one deleted; an unchanged one is not written at all.
 * Then the names are parsed again (`runNaming`, which writes only what changed).
 *
 * The same guard as `source` stands before the deletions: a copy that would remove more than half
 * of a kind (empty after a deploy, a provider failure) is refused unless `acceptShrink`.
 */

/**
 * Radio streams (`stream_type: "radio_streams"`) come without any category: no category rule
 * or switch could reach them, and the admin had nowhere to list them. They get a category of
 * ours, created when at least one exists; its id cannot collide with the provider's numbers.
 */
export const RADIO_CATEGORY_ID = "_radio";
const RADIO_CATEGORY_NAME = "RADIOS";

const CHUNK = 5000;

export type RawEntry = {
  kind: Kind;
  xtreamId: string;
  position: number;
  name: string | null;
  category: string | null;
  streamType: string | null;
  added: string | null;
  lastModified: string | null;
};
export type DerivedEntry = {
  kind: Kind;
  xtreamId: string;
  position: number;
  name: string;
  category: string | null;
  section: string | null;
  addedAt: Date | null;
};

/**
 * The arrival date: `added` for live/vod, `last_modified` for series, Unix seconds as strings.
 * Null when missing, invalid or in the future: the stored date is kept, else the insert time.
 */
export function parseAddedDate(kind: Kind, e: Pick<RawEntry, "added" | "lastModified">, now = new Date()): Date | null {
  const v = kind === "series" ? e.lastModified : e.added;
  if (!v) return null;
  const n = Number(v);
  if (Number.isNaN(n) || n <= 0) return null;
  const d = new Date(n * 1000);
  return Number.isNaN(d.getTime()) || d > now ? null : d;
}

/**
 * The entries as the catalogue stores them, from the raw copy in the provider's order. A separator
 * line names the section of the entries that follow it in the same category (« ----|FR| SPORT |FR|---- »);
 * it is not an entry. Radios without a category go to ours.
 */
export function deriveEntries(raw: RawEntry[]): { entries: DerivedEntry[]; radios: number } {
  const entries: DerivedEntry[] = [];
  let radios = 0;
  const sections = new Map<string, string>();
  for (const e of [...raw].sort((a, b) => KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) || a.position - b.position)) {
    const name = e.name ?? "";
    const sectionKey = `${e.kind}:${e.category ?? ""}`;
    if (isSeparator(name)) {
      sections.set(sectionKey, separatorText(name));
      continue;
    }
    const radio = e.kind === "live" && !e.category && e.streamType === "radio_streams";
    if (radio) radios++;
    entries.push({
      kind: e.kind,
      xtreamId: e.xtreamId,
      position: e.position,
      name,
      category: radio ? RADIO_CATEGORY_ID : e.category,
      section: sections.get(sectionKey) ?? null,
      addedAt: parseAddedDate(e.kind, e),
    });
  }
  return { entries, radios };
}

export type MergeStats = {
  categories_added: number;
  categories_updated: number;
  categories_removed: number;
  items_added: number;
  items_updated: number;
  items_removed: number;
  items_named: number;
};

export function runMerge(opts: { acceptShrink?: boolean } = {}): Promise<MergeStats> {
  return withCatalogLock(async () => {
    const stats = await mergeCopy(opts.acceptShrink ?? false);
    const named = await runNaming();
    return { ...stats, items_named: named.items_named };
  });
}

async function mergeCopy(acceptShrink: boolean): Promise<Omit<MergeStats, "items_named">> {
  const raw = await pg<RawEntry[]>`
    select kind, xtream_id as "xtreamId", position, raw->>'name' as name, raw->>'category_id' as category,
           raw->>'stream_type' as "streamType", raw->>'added' as added, raw->>'last_modified' as "lastModified"
    from xtream_streams`;
  const { entries, radios } = deriveEntries(raw);

  return pg.begin(async (tx) => {
    await tx`create temp table merge_entries (
      kind content_kind, xtream_id text, position int, name text, category text, section text, added_at timestamptz,
      primary key (kind, xtream_id)) on commit drop`;
    for (let i = 0; i < entries.length; i += CHUNK) {
      checkCancelled();
      const part = entries.slice(i, i + CHUNK);
      await tx`
        insert into merge_entries
        select kind::content_kind, xtream_id, position, name, category, section, added_at::timestamptz
        from unnest(${part.map((e) => e.kind)}::text[], ${part.map((e) => e.xtreamId)}::text[], ${part.map((e) => e.position)}::int[],
                    ${part.map((e) => e.name)}::text[], ${part.map((e) => e.category)}::text[], ${part.map((e) => e.section)}::text[],
                    ${part.map((e) => e.addedAt?.toISOString() ?? null)}::text[])
          as u(kind, xtream_id, position, name, category, section, added_at)`;
    }

    // The guard: what would go, kind by kind, against what the catalogue holds.
    const gone = await tx<{ kind: Kind; total: number; removed: number }[]>`
      select v.kind, count(*)::int as total,
             count(*) filter (where not exists (select 1 from merge_entries m where m.kind = v.kind and m.xtream_id = v.xtream_id))::int as removed
      from catalog_variants v group by v.kind`;
    for (const g of gone)
      if (!acceptShrink && g.total >= SHRINK_FLOOR && g.total - g.removed < g.total * SHRINK_RATIO)
        throw new Error(
          `La copie du fournisseur retirerait ${g.removed} des ${g.total} entrées ${g.kind} : fusion refusée, catalogue conservé (${SHRINK_HINT})`,
        );

    // Categories: the provider's, plus ours for the radios.
    const cats = await tx`
      with src as (
        select kind, xtream_id, coalesce(raw->>'category_name', '') as name,
               case when raw->>'parent_id' ~ '^[0-9]+$' then (raw->>'parent_id')::int else 0 end as parent_id, position, raw
        from xtream_categories
        union all
        select 'live', ${RADIO_CATEGORY_ID}, ${RADIO_CATEGORY_NAME}, 0, 1000000, '{}'::jsonb where ${radios > 0}
      ),
      upd as (
        update catalog_categories c set name = s.name, parent_id = s.parent_id, position = s.position, raw = s.raw, changed_at = now()
        from src s
        where c.kind = s.kind and c.xtream_id = s.xtream_id
          and (c.name, c.parent_id, c.position, c.raw) is distinct from (s.name, s.parent_id, s.position, s.raw)
        returning 1
      ),
      ins as (
        insert into catalog_categories (kind, xtream_id, name, parent_id, position, raw)
        select s.kind, s.xtream_id, s.name, s.parent_id, s.position, s.raw from src s
        where not exists (select 1 from catalog_categories c where c.kind = s.kind and c.xtream_id = s.xtream_id)
        returning 1
      ),
      del as (
        delete from catalog_categories c
        where not exists (select 1 from src s where s.kind = c.kind and s.xtream_id = c.xtream_id)
        returning 1
      )
      select (select count(*) from ins)::int as added, (select count(*) from upd)::int as updated, (select count(*) from del)::int as removed`;

    // Variants. A changed name sends a TMDB match back to pending (a manual one stays); a date the
    // provider no longer gives cleanly keeps the stored one. What counts as a change beyond the name,
    // category, section and date: for live, the rank and the raw entry whole (`num` is the channel
    // number); for movies and series not `num` nor the rank, which only say where the entry sits in the
    // provider's list: one title added at the top shifts every other, and comparing them would rewrite
    // 70 000 rows for one new movie. They are refreshed whenever the entry changes for another reason.
    const [upd] = await tx`
      with u as (
        update catalog_variants v set
          name = m.name, category_xtream_id = m.category, position = m.position, raw = s.raw, section = m.section,
          added_at = coalesce(m.added_at, v.added_at), changed_at = now(),
          match_status = case when v.name <> m.name and v.match_status in ('matched', 'unmatched', 'pending') then 'pending'::match_status else v.match_status end,
          match_attempts = case when v.name <> m.name then 0 else v.match_attempts end
        from merge_entries m join xtream_streams s on s.kind = m.kind and s.xtream_id = m.xtream_id
        where v.kind = m.kind and v.xtream_id = m.xtream_id
          and (v.name, v.category_xtream_id, v.section, v.added_at,
               case when v.kind = 'live' then v.position end, case when v.kind = 'live' then v.raw else v.raw - 'num' end)
              is distinct from (m.name, m.category, m.section, coalesce(m.added_at, v.added_at),
               case when m.kind = 'live' then m.position end, case when m.kind = 'live' then s.raw else s.raw - 'num' end)
        returning 1
      )
      select count(*)::int as n from u`;
    const [ins] = await tx`
      with i as (
        insert into catalog_variants (kind, xtream_id, name, category_xtream_id, position, raw, section, added_at, match_status)
        select m.kind, m.xtream_id, m.name, m.category, m.position, s.raw, m.section, coalesce(m.added_at, now()),
               case when m.kind = 'live' then 'skipped'::match_status else 'pending'::match_status end
        from merge_entries m join xtream_streams s on s.kind = m.kind and s.xtream_id = m.xtream_id
        where not exists (select 1 from catalog_variants v where v.kind = m.kind and v.xtream_id = m.xtream_id)
        returning 1
      )
      select count(*)::int as n from i`;
    const [del] = await tx`
      with d as (
        delete from catalog_variants v
        where not exists (select 1 from merge_entries m where m.kind = v.kind and m.xtream_id = v.xtream_id)
        returning 1
      )
      select count(*)::int as n from d`;

    const [c] = cats;
    return {
      categories_added: c.added,
      categories_updated: c.updated,
      categories_removed: c.removed,
      items_added: ins.n,
      items_updated: upd.n,
      items_removed: del.n,
    };
  });
}
