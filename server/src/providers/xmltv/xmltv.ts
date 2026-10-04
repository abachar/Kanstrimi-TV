import { SaxesParser } from "saxes";

/**
 * XMLTV, the guide format of the provider and of the fallback sources: read as a stream (saxes), the
 * file never sits in memory nor on disk. Knows nothing of the catalogue: the caller says which
 * channels it wants.
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
 * The programmes of the `wanted` channels (every channel when null), in batches, from a stream of
 * XML text chunks. The first `<title>` and `<desc>` of a programme are kept whatever their language;
 * a programme with an unreadable time is skipped. `channels`, when given, receives the declared
 * channels and their display names.
 */
export async function* parseXmltv(
  chunks: AsyncIterable<string>,
  wanted: Set<string> | null,
  channels?: Map<string, string[]>,
): AsyncGenerator<ProgrammeRow[]> {
  const parser = new SaxesParser();
  let out: ProgrammeRow[] = [];
  let current: { channel: string; start: string; stop: string; title: string; desc: string } | null = null;
  let field: "title" | "desc" | "display-name" | null = null;
  let declared: { id: string; names: string[]; name: string } | null = null;
  parser.on("opentag", (tag) => {
    if (tag.name === "programme") {
      const channel = String(tag.attributes.channel ?? "");
      current =
        !wanted || wanted.has(channel)
          ? { channel, start: String(tag.attributes.start ?? ""), stop: String(tag.attributes.stop ?? ""), title: "", desc: "" }
          : null;
    } else if (current && (tag.name === "title" || tag.name === "desc") && !current[tag.name]) field = tag.name;
    else if (channels && tag.name === "channel") declared = { id: String(tag.attributes.id ?? ""), names: [], name: "" };
    else if (declared && tag.name === "display-name") field = "display-name";
  });
  parser.on("text", (t) => {
    if (field === "display-name" && declared) declared.name += t;
    else if (current && field && field !== "display-name") current[field] += t;
  });
  parser.on("closetag", (tag) => {
    if (tag.name === "title" || tag.name === "desc") field = null;
    if (tag.name === "display-name" && declared) {
      field = null;
      const name = declared.name.trim();
      if (name && !declared.names.includes(name)) declared.names.push(name);
      declared.name = "";
    }
    if (tag.name === "channel" && declared) {
      if (declared.id) channels?.set(declared.id, declared.names);
      declared = null;
    }
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

/** Ten minutes: the provider's guide weighs 100 MB. */
const TIMEOUT_MS = 600_000;

/**
 * Downloads a guide and yields its programmes (see `parseXmltv`). A gzipped file (`.gz`, or the
 * gzip magic bytes) is inflated on the way. The error never carries the URL: it may hold a password.
 */
export async function* fetchXmltv(
  url: string,
  wanted: Set<string> | null,
  channels?: Map<string, string[]>,
): AsyncGenerator<ProgrammeRow[]> {
  const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok || !res.body) throw new Error(`EPG amont indisponible (HTTP ${res.status})`);
  const bytes = await gunzipIfNeeded(res.body);
  yield* parseXmltv(bytes.pipeThrough(new TextDecoderStream()), wanted, channels);
}

/** The body as is, or inflated when its first two bytes are gzip's (1f 8b). */
async function gunzipIfNeeded(body: ReadableStream<Uint8Array>): Promise<ReadableStream<Uint8Array>> {
  const reader = body.getReader();
  const first = await reader.read();
  const head = first.value ?? new Uint8Array();
  const rest = new ReadableStream<Uint8Array>({
    start(c) {
      if (head.length) c.enqueue(head);
      if (first.done) c.close();
    },
    async pull(c) {
      if (first.done) return;
      const { done, value } = await reader.read();
      if (done) c.close();
      else c.enqueue(value);
    },
    cancel: (why) => reader.cancel(why),
  });
  return head[0] === 0x1f && head[1] === 0x8b ? rest.pipeThrough(new DecompressionStream("gzip") as never) : rest;
}
