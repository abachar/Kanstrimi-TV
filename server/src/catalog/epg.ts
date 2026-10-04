import { and, eq, lt, sql } from "drizzle-orm";
import { db, schema, visibleItem } from "@/db";
import { checkCancelled } from "@/shared";
import { setSettings } from "@/config";
import { fetchProgrammes } from "@/providers/xtream";
import { offsetOf, offsetRules } from "./epg-offsets";

/**
 * The XMLTV guide of the provider, stored in `catalog_epg_programmes` for the channels the app can
 * see, and nothing else: a few tens of thousands of rows. The provider downloads and parses
 * (providers/xtream/epg.ts); this file chooses the channels and keeps the rows.
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

/**
 * Download the upstream XMLTV, then replace the guide of our channels in one short transaction: the
 * app reads the old guide until the new one is whole, then the new one only. The download (minutes)
 * happens before, outside it: no connection held, nothing locked meanwhile. An upstream failure
 * midway, or a guide empty for our channels, keeps the old guide (the cron runs every three days,
 * the provider gives six).
 */
export async function runEpgRebuild(): Promise<{ channels: number; programmes: number }> {
  const wanted = await wantedChannelIds();
  if (!wanted.size) return { channels: 0, programmes: 0 };
  const importedAt = new Date();
  const rules = await offsetRules();
  // The provider lists some programmes twice (beIN MAX): one row per channel and start.
  const keys = new Set<string>();
  const rows: (typeof schema.catalogEpgProgrammes.$inferInsert)[] = [];
  let duplicates = 0;
  for await (const batch of fetchProgrammes(wanted)) {
    checkCancelled();
    for (const r of batch) {
      const key = `${r.channelId}|${r.startAt.getTime()}`;
      if (keys.has(key)) {
        duplicates++;
        continue;
      }
      keys.add(key);
      const offsetMinutes = offsetOf(rules, r.channelId);
      const shift = (d: Date) => new Date(d.getTime() + offsetMinutes * 60_000);
      rows.push({ ...r, startAt: shift(r.startAt), endAt: shift(r.endAt), offsetMinutes, importedAt });
    }
  }
  if (duplicates) console.log(`[epg] ${duplicates} programmes en double ignorés`);
  if (!rows.length) throw new Error("EPG amont sans aucun programme pour nos chaînes : guide précédent conservé");
  await db.transaction(async (tx) => {
    for (let i = 0; i < rows.length; i += BATCH) await tx.insert(schema.catalogEpgProgrammes).values(rows.slice(i, i + BATCH));
    await tx.delete(schema.catalogEpgProgrammes).where(lt(schema.catalogEpgProgrammes.importedAt, importedAt));
    await tx.delete(schema.catalogEpgProgrammes).where(lt(schema.catalogEpgProgrammes.endAt, new Date(Date.now() - KEEP_PAST_MS)));
  });
  await setSettings({ last_epg_at: importedAt.toISOString() });
  return { channels: new Set(rows.map((r) => r.channelId)).size, programmes: rows.length };
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
