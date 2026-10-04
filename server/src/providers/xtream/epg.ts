import { SaxesParser } from "saxes";
import { getSettings } from "@/config";
import { xtreamFromSettings } from "./client";

/**
 * The XMLTV guide of the provider: 100 MB upstream, of which we keep the channels asked for. Parsed
 * as a stream (saxes), the file never sits in memory nor on disk.
 */

export type ProgrammeRow = { channelId: string; startAt: Date; endAt: Date; title: string; overview: string | null };

const BATCH = 1000;

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

/** Downloads the guide and yields the programmes of `wanted` channels, in batches. */
export async function* fetchProgrammes(wanted: Set<string>): AsyncGenerator<ProgrammeRow[]> {
  const client = xtreamFromSettings(await getSettings());
  if (!client) throw new Error("Serveur Xtream non configuré");
  const res = await fetch(client.xmltvUrl(), { redirect: "follow", signal: AbortSignal.timeout(600_000) });
  if (!res.ok || !res.body) throw new Error(`EPG amont indisponible (HTTP ${res.status})`);
  yield* parseXmltv(res.body.pipeThrough(new TextDecoderStream()), wanted);
}
