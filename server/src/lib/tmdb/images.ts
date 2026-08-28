import fs from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";

const SIZES = new Set(["w92", "w154", "w185", "w300", "w342", "w500", "w780", "w1280", "original"]);

/** Return local cache path for a TMDB image, downloading it if needed. */
export async function ensureImage(size: string, file: string): Promise<{ path: string; contentType: string } | null> {
  if (!SIZES.has(size) || !/^[A-Za-z0-9_-]+\.(jpg|jpeg|png|svg|webp)$/.test(file)) return null;
  const dir = path.join(env.dataDir, "images", size);
  const p = path.join(dir, file);
  const contentType = file.endsWith(".png") ? "image/png" : file.endsWith(".svg") ? "image/svg+xml" : file.endsWith(".webp") ? "image/webp" : "image/jpeg";
  try { await fs.access(p); return { path: p, contentType }; } catch { /* download */ }
  const res = await fetch(`https://image.tmdb.org/t/p/${size}/${file}`, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) return null;
  await fs.mkdir(dir, { recursive: true });
  const tmp = p + ".part";
  await fs.writeFile(tmp, Buffer.from(await res.arrayBuffer()));
  await fs.rename(tmp, p);
  return { path: p, contentType };
}

/** Build the public URL (served by this server) for a TMDB image path like "/abc.jpg". */
export function imageUrl(baseUrl: string, size: string, tmdbPath: string | null | undefined): string {
  if (!tmdbPath) return "";
  return `${baseUrl}/img/${size}${tmdbPath.startsWith("/") ? "" : "/"}${tmdbPath}`;
}

export async function cacheStats() {
  const root = path.join(env.dataDir, "images");
  let files = 0, bytes = 0;
  try {
    for (const size of await fs.readdir(root)) {
      const dir = path.join(root, size);
      for (const f of await fs.readdir(dir)) { const st = await fs.stat(path.join(dir, f)); files++; bytes += st.size; }
    }
  } catch { /* empty */ }
  return { files, bytes };
}
