import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { env } from "@/shared";

const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };
const FILE = /^(.+)-([0-9a-f]{10})\.(png|jpg|webp)$/;

/** Local copy of a channel logo, downloaded from iptv-org's URL on first request. */
async function ensureLogo(file: string): Promise<{ path: string; type: string } | null> {
  const m = FILE.exec(file);
  if (!m) return null;
  const [, id, , ext] = m;
  const dir = path.join(env.dataDir, "images", "logos");
  const local = path.join(dir, file.replace(/[^\w.-]/g, "_"));
  if (fs.existsSync(local)) return { path: local, type: TYPES[ext] };
  const [ch] = await db
    .select({ url: schema.iptvChannels.logoUrl, path: schema.iptvChannels.logoPath })
    .from(schema.iptvChannels)
    .where(eq(schema.iptvChannels.id, decodeURIComponent(id)));
  // Only the current logo of a known channel: the route is not an open proxy.
  if (!ch?.url || ch.path !== `/img/logos/${file}`) return null;
  const res = await fetch(ch.url, { signal: AbortSignal.timeout(20_000), headers: { "User-Agent": "Kanstrimi (logos iptv-org)" } });
  if (!res.ok) return null;
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(`${local}.part`, Buffer.from(await res.arrayBuffer()));
  await fsp.rename(`${local}.part`, local);
  return { path: local, type: TYPES[ext] };
}

/** `/img/logos/{id}-{hash}.{ext}`: iptv-org channel logos through the local disk cache. Mounted by `main.ts`. */
export const logoRoute = new Hono();

logoRoute.get("/:file", async (c) => {
  const img = await ensureLogo(c.req.param("file")).catch(() => null);
  if (!img) return c.text("Not found", 404);
  const body = Readable.toWeb(fs.createReadStream(img.path)) as unknown as ReadableStream;
  return new Response(body, {
    headers: {
      "Content-Type": img.type,
      "Content-Length": String(fs.statSync(img.path).size),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
});
