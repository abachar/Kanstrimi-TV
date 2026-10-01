import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { checkCancelled, env } from "@/shared";

/**
 * The iptv-org database (github.com/iptv-org/database), through its published API files. Two
 * are read: `channels.json` (≈ 31 000 channels, 8 Mo) and `logos.json` (≈ 35 000 logos, 6 Mo).
 * Both are kept under DATA_DIR/iptv-org and fetched again at most once a day, conditionally
 * (ETag): the table is rebuilt only when one of them changed.
 */
const API = "https://iptv-org.github.io/api";
const FILES = ["channels", "logos"] as const;
const MAX_AGE_MS = 20 * 3600 * 1000;

export type IptvApiChannel = {
  id: string;
  name: string;
  alt_names?: string[];
  network?: string | null;
  owners?: string[];
  country: string;
  categories?: string[];
  is_nsfw?: boolean;
  launched?: string | null;
  closed?: string | null;
  replaced_by?: string | null;
  website?: string | null;
};
export type IptvApiLogo = {
  channel: string;
  feed: string | null;
  in_use?: boolean;
  tags?: string[];
  width?: number;
  height?: number;
  format: string | null;
  url: string;
};

const dir = () => path.join(env.dataDir, "iptv-org");

/** Downloads a file when older than a day and changed upstream. True when a new copy landed. */
async function refresh(name: string): Promise<boolean> {
  const file = path.join(dir(), `${name}.json`);
  const etagFile = `${file}.etag`;
  const stat = await fs.stat(file).catch(() => null);
  if (stat && Date.now() - stat.mtimeMs < MAX_AGE_MS) return false;
  const etag = stat ? await fs.readFile(etagFile, "utf8").catch(() => "") : "";
  const res = await fetch(`${API}/${name}.json`, {
    headers: etag ? { "If-None-Match": etag } : {},
    signal: AbortSignal.timeout(120_000),
  });
  if (res.status === 304 && stat) {
    const now = new Date();
    await fs.utimes(file, now, now);
    return false;
  }
  if (!res.ok) throw new Error(`iptv-org ${name}.json : HTTP ${res.status}`);
  await fs.mkdir(dir(), { recursive: true });
  await fs.writeFile(`${file}.part`, Buffer.from(await res.arrayBuffer()));
  await fs.rename(`${file}.part`, file);
  await fs.writeFile(etagFile, res.headers.get("etag") ?? "");
  return true;
}

const read = async <T>(name: string): Promise<T> => JSON.parse(await fs.readFile(path.join(dir(), `${name}.json`), "utf8")) as T;

/** The formats the Apple app draws; SVG is not one of them. */
const DRAWABLE: Record<string, string> = { PNG: "png", JPEG: "jpg", WebP: "webp" };

/**
 * The logo of a channel for a TV tile: the channel's own (no feed) before a feed's, in use before
 * retired, drawable formats only, then the widest. Tags stay out of it: 98 % of logos have none.
 */
export function pickLogo(logos: IptvApiLogo[]): IptvApiLogo | null {
  const ok = logos.filter((l) => l.format && DRAWABLE[l.format] && /^https?:\/\//.test(l.url));
  ok.sort(
    (a, b) =>
      Number(a.feed !== null) - Number(b.feed !== null) ||
      Number(a.in_use === false) - Number(b.in_use === false) ||
      (b.width ?? 0) - (a.width ?? 0),
  );
  return ok[0] ?? null;
}

/** Where this server serves a logo: the hash changes with the upstream URL, so caches never go stale. */
export function logoPath(channelId: string, logo: IptvApiLogo): string {
  const hash = createHash("sha1").update(logo.url).digest("hex").slice(0, 10);
  return `/img/logos/${encodeURIComponent(channelId)}-${hash}.${DRAWABLE[logo.format!]}`;
}

const CHUNK = 2000;

/**
 * Refreshes the files and, when one changed or the table is empty, rebuilds `iptv_channels`.
 * An unreachable iptv-org keeps the previous copy: the error is thrown only without any.
 */
export async function syncIptv(): Promise<{ iptv_channels: number; iptv_logos: number; iptv_updated: number }> {
  let changed = false;
  try {
    for (const f of FILES) changed = (await refresh(f)) || changed;
  } catch (e) {
    const have = await fs.stat(path.join(dir(), "channels.json")).catch(() => null);
    if (!have) throw e;
    console.warn("[channels] iptv-org injoignable, copie précédente gardée :", (e as Error).message);
  }
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.iptvorgChannels);
  if (!changed && n > 0) {
    const [{ logos }] = await db.select({ logos: sql<number>`count(logo_path)::int` }).from(schema.iptvorgChannels);
    return { iptv_channels: n, iptv_logos: logos, iptv_updated: 0 };
  }

  const [channels, logos] = await Promise.all([read<IptvApiChannel[]>("channels"), read<IptvApiLogo[]>("logos")]);
  const logosBy = new Map<string, IptvApiLogo[]>();
  for (const l of logos) logosBy.set(l.channel, [...(logosBy.get(l.channel) ?? []), l]);
  let withLogo = 0;
  await db.transaction(async (tx) => {
    await tx.delete(schema.iptvorgChannels);
    for (let i = 0; i < channels.length; i += CHUNK) {
      checkCancelled();
      const rows = channels.slice(i, i + CHUNK).map((c) => {
        const logo = pickLogo(logosBy.get(c.id) ?? []);
        if (logo) withLogo++;
        return {
          id: c.id,
          name: c.name,
          altNames: c.alt_names ?? [],
          network: c.network ?? null,
          owners: c.owners ?? [],
          country: c.country,
          categories: c.categories ?? [],
          isNsfw: Boolean(c.is_nsfw),
          launched: c.launched ?? null,
          closed: c.closed ?? null,
          replacedBy: c.replaced_by ?? null,
          website: c.website ?? null,
          logoUrl: logo?.url ?? null,
          logoPath: logo ? logoPath(c.id, logo) : null,
        };
      });
      await tx.insert(schema.iptvorgChannels).values(rows).onConflictDoNothing();
    }
  });
  console.log(`[channels] iptv-org : ${channels.length} chaînes, ${withLogo} avec un logo dessinable`);
  return { iptv_channels: channels.length, iptv_logos: withLogo, iptv_updated: 1 };
}
