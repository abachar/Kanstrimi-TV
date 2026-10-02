import fsp from "node:fs/promises";
import path from "node:path";
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { describeError, env, serveFile, singleFlight } from "@/shared";

const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };
const FILE = /^(.+)-([0-9a-f]{10})\.(png|jpg|webp)$/;

/** Local copy of a channel logo, downloaded from iptv-org's URL on first request. */
async function ensureLogo(file: string): Promise<{ path: string; contentType: string } | null> {
  const m = FILE.exec(file);
  if (!m) return null;
  const [, id, , ext] = m;
  const dir = path.join(env.dataDir, "images", "logos");
  const local = path.join(dir, file.replace(/[^\w.-]/g, "_"));
  const cached = await fsp.access(local).then(
    () => true,
    () => false,
  );
  if (cached) return { path: local, contentType: TYPES[ext] };
  const [ch] = await db
    .select({ url: schema.iptvorgChannels.logoUrl, path: schema.iptvorgChannels.logoPath })
    .from(schema.iptvorgChannels)
    .where(eq(schema.iptvorgChannels.id, decodeURIComponent(id)));
  // Only the current logo of a known channel: the route is not an open proxy.
  if (!ch?.url || ch.path !== `/img/logos/${file}`) return null;
  const res = await fetch(ch.url, { signal: AbortSignal.timeout(20_000), headers: { "User-Agent": "Kanstrimi (logos iptv-org)" } });
  if (!res.ok) return null;
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(`${local}.part`, Buffer.from(await res.arrayBuffer()));
  await fsp.rename(`${local}.part`, local);
  return { path: local, contentType: TYPES[ext] };
}

/** One download per logo at a time: two requests would share its `.part`. */
const once = singleFlight<{ path: string; contentType: string } | null>(null, {
  onError: (e, key) => console.error(`[logos] ${key} : ${describeError(e)}`),
});

/** `/img/logos/{id}-{hash}.{ext}`: iptv-org channel logos through the local disk cache. Mounted by `main.ts`. */
export const logoRoute = new Hono();

logoRoute.get("/:file", async (c) => {
  const file = c.req.param("file");
  return serveFile(await once(file, () => ensureLogo(file)));
});
