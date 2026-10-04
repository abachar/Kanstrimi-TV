import { and, eq, sql } from "drizzle-orm";
import { db, schema, visibleItem } from "@/db";
import { checkCancelled, describeError, isCancelled } from "@/shared";
import { setSettings } from "@/config";
import { fetchProgrammes } from "@/providers/xtream";
import type { ProgrammeRow } from "@/providers/xmltv";
import { offsetOf, offsetRules, type OffsetRules } from "./epg-offsets";
import { importEpgSources } from "./epg-sources";

/**
 * The XMLTV guide of the provider, completed by the fallback sources (epg-sources.ts), stored in
 * `catalog_epg_programmes` for the channels the app can see, and nothing else: a few tens of
 * thousands of rows. The providers download and parse; this file chooses the channels and keeps the rows.
 */

const BATCH = 1000;
/** Rows whose programme ended longer ago than this are dropped after an import. */
const KEEP_PAST_MS = 6 * 3600 * 1000;

/**
 * The EPG ids of the channels the app can see: the only ones worth storing. Every visible variant
 * brings its own, so each quality keeps its guide (« M6 4K » may differ from « M6 »); one whose
 * provider id names another channel (`epg_mismatch`) brings iptv-org's too. The app then shows,
 * per quality, whichever has programmes (`player/guides.ts`).
 */
async function wantedChannelIds(): Promise<Set<string>> {
  const v = schema.catalogVariants;
  const rows = await db
    .select({ own: sql<string | null>`nullif(${v.raw}->>'epg_channel_id', '')`, iptv: v.iptvId, mismatch: v.epgMismatch })
    .from(v)
    .innerJoin(schema.catalogContents, eq(schema.catalogContents.id, v.contentId))
    .where(and(eq(v.kind, "live"), eq(schema.catalogContents.visible, true), visibleItem));
  return new Set(rows.flatMap((r) => [r.own, r.mismatch ? r.iptv : null]).filter((x): x is string => Boolean(x)));
}

type Row = typeof schema.catalogEpgProgrammes.$inferInsert;

/**
 * Programmes as rows: times shifted by the corrections, each programme once per channel and start
 * (the provider lists some twice, beIN MAX).
 */
function toRows(programmes: ProgrammeRow[], rules: OffsetRules, importedAt: Date): Row[] {
  const keys = new Set<string>();
  const rows: Row[] = [];
  for (const r of programmes) {
    const key = `${r.channelId}|${r.startAt.getTime()}`;
    if (keys.has(key)) continue;
    keys.add(key);
    const offsetMinutes = offsetOf(rules, r.channelId);
    const shift = (d: Date) => new Date(d.getTime() + offsetMinutes * 60_000);
    rows.push({ ...r, startAt: shift(r.startAt), endAt: shift(r.endAt), offsetMinutes, importedAt });
  }
  if (programmes.length > rows.length) console.log(`[epg] ${programmes.length - rows.length} programmes en double ignorés`);
  return rows;
}

/**
 * Stores an import channel by channel, in one short transaction: a channel it brings loses its stored
 * programmes from the first new one on (what came before stays, already aired), a channel it does not
 * bring keeps its own until they are over. The app reads the old guide until the new one is whole.
 */
async function mergeProgrammes(rows: Row[]) {
  if (!rows.length) return;
  const firstStart = new Map<string, number>();
  for (const r of rows) firstStart.set(r.channelId, Math.min(firstStart.get(r.channelId) ?? Infinity, r.startAt.getTime()));
  const from = JSON.stringify([...firstStart].map(([id, t]) => ({ id, t: new Date(t).toISOString() })));
  await db.transaction(async (tx) => {
    await tx.execute(sql`
      delete from ${schema.catalogEpgProgrammes} p
      using jsonb_to_recordset(${from}::jsonb) as u(id text, t timestamptz)
      where p.channel_id = u.id and p.end_at > u.t`);
    for (let i = 0; i < rows.length; i += BATCH) await tx.insert(schema.catalogEpgProgrammes).values(rows.slice(i, i + BATCH));
  });
}

/** Drops the programmes over for good, and those of channels no longer served (hidden, unlinked). */
async function prune(inUse: Set<string>) {
  const ids = JSON.stringify([...inUse]);
  await db.execute(sql`
    delete from ${schema.catalogEpgProgrammes}
    where end_at < ${new Date(Date.now() - KEEP_PAST_MS).toISOString()}::timestamptz
       or channel_id not in (select jsonb_array_elements_text(${ids}::jsonb))`);
}

/**
 * Downloads the provider's guide, then the fallback sources, and stores both channel by channel. The
 * downloads (minutes) happen outside any transaction. The provider failing, midway or entirely, or
 * filing nothing for our channels, stores none of its programmes: the stored ones stay until they
 * are over, the sources still run, and the step ends in error. The provider's guide covers about a
 * day and a half: the cron runs twice a day.
 */
export async function runEpgRebuild(): Promise<{ channels: number; programmes: number; fallbacks: number; sourceErrors: number }> {
  const wanted = await wantedChannelIds();
  const importedAt = new Date();
  const rules = await offsetRules();
  let providerError: string | null = null;
  const provider: ProgrammeRow[] = [];
  if (wanted.size)
    try {
      for await (const batch of fetchProgrammes(wanted)) {
        checkCancelled();
        provider.push(...batch);
      }
      if (!provider.length) providerError = "EPG amont sans aucun programme pour nos chaînes";
    } catch (e) {
      if (isCancelled(e)) throw e;
      providerError = describeError(e);
      provider.length = 0;
    }
  const own = providerError ? [] : toRows(provider, rules, importedAt);
  await mergeProgrammes(own);
  const sources = await importEpgSources();
  const fallback = toRows(sources.rows, rules, importedAt);
  await mergeProgrammes(fallback);
  await prune(new Set([...wanted, ...sources.inUse]));
  if (own.length) await setSettings({ last_epg_at: importedAt.toISOString() });
  if (providerError) throw new Error(`${providerError} : guide précédent conservé`);
  const rows = [...own, ...fallback];
  return {
    channels: new Set(rows.map((r) => r.channelId)).size,
    programmes: rows.length,
    fallbacks: sources.fallbacks,
    sourceErrors: sources.errors.length,
  };
}

export type EpgStat = { programmes: number; channels: number; from: string | null; to: string | null; importedAt: string | null };
/** What the guide holds now, for the dashboard. */
export async function epgStat(): Promise<EpgStat> {
  const [r] = await db.execute<{
    programmes: number;
    channels: number;
    from: string | null;
    to: string | null;
    imported_at: string | null;
  }>(sql`
    select count(*)::int as programmes, count(distinct channel_id)::int as channels,
           min(start_at)::text as "from", max(end_at)::text as "to", max(imported_at)::text as imported_at
    from catalog_epg_programmes`);
  return { programmes: r.programmes, channels: r.channels, from: r.from, to: r.to, importedAt: r.imported_at };
}
