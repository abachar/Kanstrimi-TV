import { SaxesParser } from "saxes";
import { and, eq, isNotNull, lt, ne, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { getSettings, setSettings } from "@/config";
import { xtreamFromSettings } from "./client";

/**
 * The XMLTV guide of the provider, imported into `epg_programmes` for the channels the app can
 * see, and nothing else: 100 MB upstream, a few tens of thousands of rows here. Parsed as a
 * stream (saxes), the file never sits in memory nor on disk.
 */

export type ProgrammeRow = { channelId: string; startAt: Date; endAt: Date; title: string; overview: string | null };

const BATCH = 1000;
/** Rows whose programme ended longer ago than this are dropped after an import. */
const KEEP_PAST_MS = 6 * 3600 * 1000;

/** `20260928143000 +0200` → Date. Null when the field is not XMLTV. */
export function parseXmltvTime(s: string): Date | null {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*(?:([+-])(\d{2})(\d{2}))?$/.exec(s.trim());
  if (!m) return null;
  const utc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
  const offset = m[7] ? (m[7] === "-" ? -1 : 1) * (+m[8] * 60 + +m[9]) * 60_000 : 0;
  return new Date(utc - offset);
}

/**
 * The programmes of `wanted` channels, in batches, from a stream of XML text chunks. The first
 * `<title>` and `<desc>` of a programme are kept whatever their language; a programme with an
 * unreadable time is skipped.
 */
export async function* parseXmltv(chunks: AsyncIterable<string>, wanted: Set<string>): AsyncGenerator<ProgrammeRow[]> {
  const parser = new SaxesParser();
  let out: ProgrammeRow[] = [];
  let current: { channel: string; start: string; stop: string; title: string; desc: string } | null = null;
  let field: "title" | "desc" | null = null;
  parser.on("opentag", (tag) => {
    if (tag.name === "programme") {
      const channel = String(tag.attributes.channel ?? "");
      current = wanted.has(channel)
        ? { channel, start: String(tag.attributes.start ?? ""), stop: String(tag.attributes.stop ?? ""), title: "", desc: "" }
        : null;
    } else if (current && (tag.name === "title" || tag.name === "desc") && !current[tag.name]) field = tag.name;
  });
  parser.on("text", (t) => {
    if (current && field) current[field] += t;
  });
  parser.on("closetag", (tag) => {
    if (tag.name === "title" || tag.name === "desc") field = null;
    if (tag.name !== "programme" || !current) return;
    const startAt = parseXmltvTime(current.start),
      endAt = parseXmltvTime(current.stop);
    const title = current.title.trim();
    if (startAt && endAt && endAt > startAt && title) {
      out.push({ channelId: current.channel, startAt, endAt, title, overview: current.desc.trim() || null });
    }
    current = null;
  });
  parser.on("error", (e) => {
    throw e;
  });
  for await (const chunk of chunks) {
    parser.write(chunk);
    if (out.length >= BATCH) {
      yield out;
      out = [];
    }
  }
  parser.close();
  if (out.length) yield out;
}

/** The EPG ids of the channels the app can see: the only ones worth storing. */
async function wantedChannelIds(): Promise<Set<string>> {
  const rows = await db
    .selectDistinct({ id: schema.contents.epgChannelId })
    .from(schema.contents)
    .where(
      and(
        eq(schema.contents.kind, "live"),
        eq(schema.contents.visible, true),
        isNotNull(schema.contents.epgChannelId),
        ne(schema.contents.epgChannelId, ""),
      ),
    );
  return new Set(rows.map((r) => r.id!));
}

/**
 * Download the upstream XMLTV and replace the guide of our channels. The previous rows go only
 * once the new ones are in: an upstream failure, or a guide empty for our channels, keeps the
 * old guide (the cron runs every three days, the provider gives six).
 */
export async function runEpgRebuild(): Promise<{ channels: number; programmes: number }> {
  const client = xtreamFromSettings(await getSettings());
  if (!client) throw new Error("Serveur Xtream non configuré");
  const wanted = await wantedChannelIds();
  if (!wanted.size) return { channels: 0, programmes: 0 };
  const res = await fetch(client.xmltvUrl(), { redirect: "follow", signal: AbortSignal.timeout(600_000) });
  if (!res.ok || !res.body) throw new Error(`EPG amont indisponible (HTTP ${res.status})`);
  const importedAt = new Date();
  const seen = new Set<string>();
  let programmes = 0;
  for await (const batch of parseXmltv(res.body.pipeThrough(new TextDecoderStream()), wanted)) {
    await db.insert(schema.epgProgrammes).values(batch.map((r) => ({ ...r, importedAt })));
    for (const r of batch) seen.add(r.channelId);
    programmes += batch.length;
  }
  if (!programmes) throw new Error("EPG amont sans aucun programme pour nos chaînes : guide précédent conservé");
  await db.delete(schema.epgProgrammes).where(lt(schema.epgProgrammes.importedAt, importedAt));
  await db.delete(schema.epgProgrammes).where(lt(schema.epgProgrammes.endAt, new Date(Date.now() - KEEP_PAST_MS)));
  await setSettings({ last_epg_at: importedAt.toISOString() });
  return { channels: seen.size, programmes };
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
    from epg_programmes`);
  return { programmes: r.programmes, channels: r.channels, from: r.from, to: r.to, importedAt: r.imported_at };
}
