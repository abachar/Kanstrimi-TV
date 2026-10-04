import { and, asc, eq, like, sql } from "drizzle-orm";
import { db, schema, visibleItem, type EpgSource } from "@/db";
import { checkCancelled, describeError, isCancelled } from "@/shared";
import { fetchXmltv, type ProgrammeRow } from "@/providers/xmltv";
import { guideNameKey, parseSourceGuideId, sourceGuideId } from "./epg-ids";
import { isOffsetMinutes, reapplyOffsets } from "./epg-offsets";

/**
 * Fallback guides: XMLTV files (open-epg…) that complete the provider's for the visible channels it
 * leaves without programmes. Each source lists its channels (`catalog_epg_source_channels`); a
 * channel of ours is linked to one of them by name, or by hand in the admin (`curation_epg_links`).
 * The first enabled source, in their order, whose linked channel has programmes gives the channel its
 * `epg_fallback_id`; the app tries it after the provider's guide ids.
 */

const BATCH = 1000;

export const listEpgSources = () =>
  db.select().from(schema.curationEpgSources).orderBy(asc(schema.curationEpgSources.position), asc(schema.curationEpgSources.id));

export async function epgSourceById(id: number): Promise<EpgSource | null> {
  const [s] = await db.select().from(schema.curationEpgSources).where(eq(schema.curationEpgSources.id, id));
  return s ?? null;
}

/** An http(s) URL, trimmed; else an error the admin shows. */
function checkUrl(raw: string): string {
  const url = raw.trim();
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error("Adresse invalide");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("Adresse invalide : http ou https seulement");
  return url;
}

/** The file's name when none is given: `…/files/qatar1.xml` → « qatar1 ». */
const defaultName = (url: string) =>
  new URL(url).pathname
    .split("/")
    .pop()
    ?.replace(/\.xml(\.gz)?$/i, "") || new URL(url).host;

/** Adds a source at the end of the list; its channels come with the next EPG import. */
export async function addEpgSource(input: { name?: string; url: string }): Promise<EpgSource> {
  const url = checkUrl(input.url);
  const name = input.name?.trim() || defaultName(url);
  const [{ max }] = await db.select({ max: sql<number>`coalesce(max(position), -1)::int` }).from(schema.curationEpgSources);
  const [s] = await db
    .insert(schema.curationEpgSources)
    .values({ name, url, position: max + 1 })
    .onConflictDoNothing()
    .returning();
  if (!s) throw new Error("Cette adresse est déjà une source");
  return s;
}

/** Renames, re-points, switches or shifts a source; a new shift moves its stored programmes at once. */
export async function updateEpgSource(id: number, input: { name: string; url: string; enabled: boolean; offsetMinutes: number }) {
  const before = await epgSourceById(id);
  if (!before) throw new Error("Source introuvable");
  if (!isOffsetMinutes(input.offsetMinutes)) throw new Error("Décalage invalide : ± 12 h par pas de 5 min");
  const url = checkUrl(input.url);
  const clash = await db
    .select({ id: schema.curationEpgSources.id })
    .from(schema.curationEpgSources)
    .where(and(eq(schema.curationEpgSources.url, url), sql`${schema.curationEpgSources.id} <> ${id}`));
  if (clash.length) throw new Error("Cette adresse est déjà une source");
  await db
    .update(schema.curationEpgSources)
    .set({ name: input.name.trim() || defaultName(url), url, enabled: input.enabled, offsetMinutes: input.offsetMinutes })
    .where(eq(schema.curationEpgSources.id, id));
  if (before.offsetMinutes !== input.offsetMinutes) await reapplyOffsets();
  if (before.enabled !== input.enabled) await refreshEpgFallbacks();
}

/** Moves a source one place up (-1) or down (+1): the first one with a guide for a channel wins. */
export async function moveEpgSource(id: number, step: -1 | 1) {
  const all = await listEpgSources();
  const i = all.findIndex((s) => s.id === id);
  const j = i + step;
  if (i === -1 || j < 0 || j >= all.length) return;
  [all[i], all[j]] = [all[j], all[i]];
  await db.transaction(async (tx) => {
    for (const [position, s] of all.entries())
      await tx.update(schema.curationEpgSources).set({ position }).where(eq(schema.curationEpgSources.id, s.id));
  });
  await refreshEpgFallbacks();
}

/** Removes a source, its channels, its links and its programmes. */
export async function deleteEpgSource(id: number) {
  await db.transaction(async (tx) => {
    await tx.delete(schema.curationEpgSources).where(eq(schema.curationEpgSources.id, id));
    await tx.delete(schema.catalogEpgProgrammes).where(like(schema.catalogEpgProgrammes.channelId, `@${id}/%`));
  });
  await refreshEpgFallbacks();
}

/**
 * The admin's choice for a channel of ours in a source: one of its channels, `null` for none, or
 * `"auto"` to go back to the link found by name. Programmes of a newly linked channel come with the
 * next import.
 */
export async function setEpgLink(sourceId: number, contentKey: string, choice: string | null | "auto") {
  const t = schema.curationEpgLinks;
  if (choice === "auto") await db.delete(t).where(and(eq(t.sourceId, sourceId), eq(t.contentKey, contentKey)));
  else {
    if (choice !== null) {
      const [known] = await db
        .select({ id: schema.catalogEpgSourceChannels.channelId })
        .from(schema.catalogEpgSourceChannels)
        .where(and(eq(schema.catalogEpgSourceChannels.sourceId, sourceId), eq(schema.catalogEpgSourceChannels.channelId, choice)));
      if (!known) throw new Error(`« ${choice} » n'est pas une chaîne de cette source`);
    }
    await db
      .insert(t)
      .values({ sourceId, contentKey, channelId: choice })
      .onConflictDoUpdate({ target: [t.sourceId, t.contentKey], set: { channelId: choice, updatedAt: new Date() } });
  }
  await refreshEpgFallbacks();
}

// ---------------------------------------------------------------- links

export type EpgLinkState = { channelId: string; manual: boolean };
export type EpgResolution = {
  /** The visible channels of ours: `guided` when the provider files programmes for one of their variants. */
  contents: { id: number; key: string; title: string; guided: boolean }[];
  /** Per source, per content key: the channel it is linked to. */
  links: Map<number, Map<string, EpgLinkState>>;
  /** Per source, the content keys the admin keeps away from it. */
  refused: Map<number, Set<string>>;
  /** Per content id: the guide id it falls back on (first enabled source whose linked channel has programmes). */
  fallback: Map<number, string>;
};

/**
 * Every link, as the import and the admin see it. A choice of the admin holds whatever the provider
 * files; the link by name only completes a channel the provider leaves without programmes, with the
 * source's channel of that name that has the most of them.
 */
export async function resolveEpgLinks(): Promise<EpgResolution> {
  const v = schema.catalogVariants;
  const [sources, contents, channels, manual] = await Promise.all([
    listEpgSources(),
    db.execute<{ id: number; key: string; title: string; epg: string | null; guided: boolean }>(sql`
      select cc.id, cc.key, cc.title, cc.epg_channel_id as epg,
        exists (
          select 1 from ${v}
          where ${v.contentId} = cc.id and ${visibleItem} and (
            exists (select 1 from ${schema.catalogEpgProgrammes} p where p.channel_id = nullif(${v.raw}->>'epg_channel_id', ''))
            or (${v.epgMismatch} and exists (select 1 from ${schema.catalogEpgProgrammes} p where p.channel_id = ${v.iptvId})))
        ) as guided
      from ${schema.catalogContents} cc
      where cc.kind = 'live' and cc.visible
      order by cc.title, cc.id`),
    db.select().from(schema.catalogEpgSourceChannels),
    db.select().from(schema.curationEpgLinks),
  ]);
  const programmes = new Map(channels.map((c) => [sourceGuideId(c.sourceId, c.channelId), c.programmes]));
  const byName = new Map<number, Map<string, { channelId: string; programmes: number }[]>>();
  for (const c of channels) {
    if (!c.programmes) continue;
    const names = byName.get(c.sourceId) ?? new Map();
    byName.set(c.sourceId, names);
    for (const key of new Set([c.channelId, ...c.names].map(guideNameKey).filter(Boolean)))
      names.set(key, [...(names.get(key) ?? []), { channelId: c.channelId, programmes: c.programmes }]);
  }
  const chosen = new Map<string, string | null>(manual.map((m) => [`${m.sourceId}|${m.contentKey}`, m.channelId]));
  const links = new Map<number, Map<string, EpgLinkState>>();
  const refused = new Map<number, Set<string>>();
  for (const s of sources) {
    const mine = new Map<string, EpgLinkState>();
    const no = new Set<string>();
    const names = byName.get(s.id);
    for (const c of contents) {
      const pick = chosen.get(`${s.id}|${c.key}`);
      if (pick === null) no.add(c.key);
      else if (pick !== undefined) mine.set(c.key, { channelId: pick, manual: true });
      else if (!c.guided && names) {
        const found = [...new Set([c.title, c.epg ?? ""].map(guideNameKey).filter(Boolean))].flatMap((k) => names.get(k) ?? []);
        const best = found.sort((a, b) => b.programmes - a.programmes || a.channelId.localeCompare(b.channelId))[0];
        if (best) mine.set(c.key, { channelId: best.channelId, manual: false });
      }
    }
    links.set(s.id, mine);
    refused.set(s.id, no);
  }
  const fallback = new Map<number, string>();
  for (const c of contents)
    for (const s of sources) {
      if (!s.enabled) continue;
      const link = links.get(s.id)?.get(c.key);
      const id = link && sourceGuideId(s.id, link.channelId);
      if (id && programmes.get(id)) {
        fallback.set(c.id, id);
        break;
      }
    }
  return { contents: contents.map(({ epg: _, ...c }) => c), links, refused, fallback };
}

/** Writes each channel's `epg_fallback_id` from the links; only the rows that change. Returns how many channels have one. */
async function writeFallbacks(fallback: Map<number, string>): Promise<number> {
  const rows = JSON.stringify([...fallback].map(([id, f]) => ({ id, f })));
  await db.execute(sql`
    update ${schema.catalogContents} c set epg_fallback_id = u.f
    from (
      select c2.id, r.f from ${schema.catalogContents} c2
      left join jsonb_to_recordset(${rows}::jsonb) as r(id int, f text) on r.id = c2.id
      where c2.kind = 'live'
    ) u
    where c.id = u.id and c.epg_fallback_id is distinct from u.f`);
  return fallback.size;
}

/** The links again after a change in the admin, without downloading anything. */
export async function refreshEpgFallbacks(): Promise<number> {
  return writeFallbacks((await resolveEpgLinks()).fallback);
}

// ---------------------------------------------------------------- import

/** What one source brought: its channels, and its programmes by channel. */
type Fetched = { names: Map<string, string[]>; programmes: Map<string, ProgrammeRow[]> };

async function fetchSource(s: EpgSource): Promise<Fetched> {
  const names = new Map<string, string[]>();
  const programmes = new Map<string, ProgrammeRow[]>();
  for await (const batch of fetchXmltv(s.url, null, names)) {
    checkCancelled();
    for (const r of batch) {
      const list = programmes.get(r.channelId);
      if (list) list.push(r);
      else programmes.set(r.channelId, [r]);
    }
  }
  if (!programmes.size) throw new Error("aucun programme dans le fichier");
  return { names, programmes };
}

/** A source's channels as of this import, in place of the previous list, and its outcome. */
async function saveSourceChannels(s: EpgSource, f: Fetched) {
  const ids = new Set([...f.names.keys(), ...f.programmes.keys()]);
  const rows = [...ids].map((channelId) => {
    const ps = f.programmes.get(channelId) ?? [];
    return {
      sourceId: s.id,
      channelId,
      names: f.names.get(channelId) ?? [],
      programmes: ps.length,
      lastEndAt: ps.length ? new Date(Math.max(...ps.map((p) => p.endAt.getTime()))) : null,
    };
  });
  await db.transaction(async (tx) => {
    await tx.delete(schema.catalogEpgSourceChannels).where(eq(schema.catalogEpgSourceChannels.sourceId, s.id));
    for (let i = 0; i < rows.length; i += BATCH) await tx.insert(schema.catalogEpgSourceChannels).values(rows.slice(i, i + BATCH));
    await tx
      .update(schema.curationEpgSources)
      .set({ fetchedAt: new Date(), fetchError: null, channelCount: rows.length })
      .where(eq(schema.curationEpgSources.id, s.id));
  });
}

export type SourcesImport = {
  /** The programmes of the linked channels, under their guide id (`@3/…`), times as the file gives them. */
  rows: ProgrammeRow[];
  /** Every fallback guide id in use: their stored programmes stay, even those of a source that failed this time. */
  inUse: Set<string>;
  fallbacks: number;
  errors: string[];
};

/**
 * Downloads every enabled source, refreshes their channel lists, links our channels, and returns
 * the programmes to store. A source that fails keeps its list and its stored programmes; its error
 * shows on the EPG page. Run after the provider's guide is stored: the links by name complete the
 * channels it leaves without programmes.
 */
export async function importEpgSources(): Promise<SourcesImport> {
  const fetched = new Map<number, Fetched>();
  const errors: string[] = [];
  for (const s of await listEpgSources()) {
    if (!s.enabled) continue;
    checkCancelled();
    try {
      const f = await fetchSource(s);
      await saveSourceChannels(s, f);
      fetched.set(s.id, f);
      console.log(`[epg] source « ${s.name} » : ${f.names.size} chaînes déclarées, ${f.programmes.size} avec des programmes`);
    } catch (e) {
      if (isCancelled(e)) throw e;
      const message = describeError(e);
      errors.push(`${s.name} : ${message}`);
      console.warn(`[epg] source « ${s.name} » en échec, liste et programmes précédents gardés :`, message);
      await db.update(schema.curationEpgSources).set({ fetchError: message }).where(eq(schema.curationEpgSources.id, s.id));
    }
  }
  const { fallback } = await resolveEpgLinks();
  const fallbacks = await writeFallbacks(fallback);
  const inUse = new Set(fallback.values());
  const rows = [...inUse].flatMap((guideId) => {
    const ref = parseSourceGuideId(guideId)!;
    return (fetched.get(ref.sourceId)?.programmes.get(ref.channelId) ?? []).map((r) => ({ ...r, channelId: guideId }));
  });
  return { rows, inUse, fallbacks, errors };
}
