import { lookup } from "node:dns/promises";
import fsp from "node:fs/promises";
import { BlockList } from "node:net";
import path from "node:path";
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { describeError, env, serveFile, singleFlight } from "@/shared";

const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };
const FILE = /^(.+)-([0-9a-f]{10})\.(png|jpg|webp)$/;

/** Where a logo may not come from: this machine, the home network, the containers' own network. */
const PRIVATE = new BlockList();
for (const [net, bits] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
] as const)
  PRIVATE.addSubnet(net, bits, "ipv4");
for (const [net, bits] of [
  ["::", 127],
  ["fc00::", 7],
  ["fe80::", 10],
] as const)
  PRIVATE.addSubnet(net, bits, "ipv6");

/** A public address; an IPv4 written as IPv6 (`::ffff:10.0.0.1`) is judged as the IPv4 it is. */
export function isPublicAddress(address: string, family: number): boolean {
  const v4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)?.[1];
  if (v4) return !PRIVATE.check(v4, "ipv4");
  return !PRIVATE.check(address, family === 6 ? "ipv6" : "ipv4");
}

/**
 * iptv-org's data is open to anyone: a logo URL is fetched over https only, from a host whose every address is public,
 * and a redirect is followed only to such a place again. Anything else is no logo.
 */
async function fetchPublic(url: string, redirects = 3): Promise<Response | null> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  const addresses = await lookup(u.hostname.replace(/^\[|\]$/g, ""), { all: true }).catch(() => []);
  if (!addresses.length || !addresses.every((a) => isPublicAddress(a.address, a.family))) return null;
  const res = await fetch(u, {
    redirect: "manual",
    signal: AbortSignal.timeout(20_000),
    headers: { "User-Agent": "Kanstrimi (logos iptv-org)" },
  });
  if (res.status < 300 || res.status >= 400) return res;
  const location = res.headers.get("location");
  return location && redirects > 0 ? fetchPublic(new URL(location, u).href, redirects - 1) : null;
}

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
  const res = await fetchPublic(ch.url);
  if (!res?.ok) return null;
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(`${local}.part`, Buffer.from(await res.arrayBuffer()));
  await fsp.rename(`${local}.part`, local);
  return { path: local, contentType: TYPES[ext] };
}

/** One download per logo at a time: two requests would share its `.part`. */
const once = singleFlight<{ path: string; contentType: string } | null>(null, {
  onError: (e, key) => console.error(`[logos] ${key} : ${describeError(e)}`),
});

/** `/img/logos/{id}-{hash}.{ext}`: iptv-org channel logos through the local disk cache. Mounted by `app.ts`. */
export const logoRoute = new Hono();

logoRoute.get("/:file", async (c) => {
  const file = c.req.param("file");
  return serveFile(await once(file, () => ensureLogo(file)));
});
