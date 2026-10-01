import fs from "node:fs/promises";
import path from "node:path";
import { env } from "@/shared";

const SIZES = new Set(["w92", "w154", "w185", "w300", "w342", "w500", "w780", "w1280", "original"]);
const FILE = /^[A-Za-z0-9_-]+\.(jpg|jpeg|png|svg|webp)$/;

/** Return local cache path for a TMDB image, downloading it if needed. */
export async function ensureImage(size: string, file: string): Promise<{ path: string; contentType: string } | null> {
  if (!SIZES.has(size) || !FILE.test(file)) return null;
  const dir = path.join(env.dataDir, "images", size);
  const p = path.join(dir, file);
  const contentType = file.endsWith(".png")
    ? "image/png"
    : file.endsWith(".svg")
      ? "image/svg+xml"
      : file.endsWith(".webp")
        ? "image/webp"
        : "image/jpeg";
  try {
    await fs.access(p);
    return { path: p, contentType };
  } catch {
    /* download */
  }
  const res = await fetch(`https://image.tmdb.org/t/p/${size}/${file}`, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) return null;
  await fs.mkdir(dir, { recursive: true });
  const tmp = p + ".part";
  await fs.writeFile(tmp, Buffer.from(await res.arrayBuffer()));
  await fs.rename(tmp, p);
  return { path: p, contentType };
}

export async function cacheStats() {
  const root = path.join(env.dataDir, "images");
  let files = 0,
    bytes = 0;
  // `images/<size>/<file>`, and `images/shelf/<scale>/<file>` for the Top Shelf.
  const walk = async (dir: string): Promise<void> => {
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else {
        files++;
        bytes += (await fs.stat(p)).size;
      }
    }
  };
  await walk(root).catch(() => {});
  return { files, bytes };
}

/** A Top Shelf image: 1920×1080 (`1x`) or 3840×2160 (`2x`). */
export const SHELF_SCALES = { "1x": 1, "2x": 2 } as const;
export type ShelfScale = keyof typeof SHELF_SCALES;

/**
 * The Apple TV carousel shows no title of its own: the title is drawn in the image, as Apple's own apps
 * do. The backdrop filled to 16:9, darkened in its top left corner, the TMDB title logo there, where
 * Apple's TV app puts its own and clear of the carousel's arrows and buttons. Composed once, then served
 * from the disk cache like any other image; `SHELF_LAYOUT` names the layout, a new one composes anew.
 */
/** Bumped with the layout, together with `?layout=` in `player/top-shelf.ts`: tvOS caches the images by URL. */
const SHELF_LAYOUT = 2;

export async function ensureShelfImage(
  scale: ShelfScale,
  backdrop: string,
  logo: string,
): Promise<{ path: string; contentType: string } | null> {
  const s = SHELF_SCALES[scale];
  if (!s || !FILE.test(backdrop) || !FILE.test(logo)) return null;
  const dir = path.join(env.dataDir, "images", "shelf", scale);
  const p = path.join(dir, `${path.parse(backdrop).name}_${path.parse(logo).name}_${SHELF_LAYOUT}.jpg`);
  try {
    await fs.access(p);
    return { path: p, contentType: "image/jpeg" };
  } catch {
    /* compose */
  }
  const [bg, lg] = await Promise.all([ensureImage("original", backdrop), ensureImage(s === 2 ? "original" : "w500", logo)]);
  if (!bg || !lg) return null;
  const { default: sharp } = await import("sharp");
  const width = 1920 * s,
    height = 1080 * s;
  // As in Apple's TV app: 6 % from the left, 8 % from the top, a third of the width at most, a sixth of the height.
  const box = { left: 112 * s, top: 86 * s, width: 620 * s, height: 180 * s };
  const shade = Buffer.from(
    `<svg width="${width}" height="${height}"><defs><radialGradient id="g" cx="0" cy="0" r="0.75">` +
      `<stop offset="0" stop-color="#000" stop-opacity="0.55"/><stop offset="1" stop-color="#000" stop-opacity="0"/>` +
      `</radialGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`,
  );
  const mark = await sharp(lg.path, { density: 300 })
    .resize({ width: box.width, height: box.height, fit: "inside" })
    .png()
    .toBuffer({ resolveWithObject: true });
  const out = await sharp(bg.path)
    .resize(width, height, { fit: "cover" })
    .composite([
      { input: shade, left: 0, top: 0 },
      { input: mark.data, left: box.left, top: box.top },
    ])
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer();
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(p + ".part", out);
  await fs.rename(p + ".part", p);
  return { path: p, contentType: "image/jpeg" };
}
