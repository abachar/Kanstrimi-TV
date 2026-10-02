import fs from "node:fs";
import fsp from "node:fs/promises";
import { Readable } from "node:stream";

/**
 * A file of the disk cache, streamed with its type and size, kept a year by the client: its name
 * changes with its content. 404 when there is none.
 */
export async function serveFile(file: { path: string; contentType: string } | null): Promise<Response> {
  const stat = file ? await fsp.stat(file.path).catch(() => null) : null;
  if (!file || !stat?.isFile()) return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=UTF-8" } });
  const body = Readable.toWeb(fs.createReadStream(file.path)) as unknown as ReadableStream;
  return new Response(body, {
    headers: {
      "Content-Type": file.contentType,
      "Content-Length": String(stat.size),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
