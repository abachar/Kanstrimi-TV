import { timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { describeError, imageKey, serveFile, singleFlight } from "@/shared";
import { ensureImage, ensureShelfImage, SHELF_SCALES, type ShelfScale } from "./images";

/** `/img/{size}/{file}`: TMDB images through the local disk cache; every card URL points here. Mounted by `app.ts`. */
export const imgRoute = new Hono();

/**
 * TMDB serves some logos as SVG, which may carry a script: opened as a page on this origin, it would reach the admin.
 * Sandboxed, it runs none; drawn by an `<img>`, it is unchanged.
 */
imgRoute.use(async (c, next) => {
  await next();
  c.header("Content-Security-Policy", "sandbox");
});

/** One download (or composition) per file at a time: two requests would share its `.part`. */
const once = singleFlight<{ path: string; contentType: string } | null>(null, {
  onError: (e, key) => console.error(`[img] ${key} : ${describeError(e)}`),
});

/** `/img/shelf/{1x|2x}/{backdrop}/{logo}`: a Top Shelf image, the title logo drawn on the backdrop. */
imgRoute.get("/shelf/:scale/:backdrop/:logo", async (c) => {
  const { scale, backdrop, logo } = c.req.param();
  if (!(scale in SHELF_SCALES)) return c.text("Not found", 404);
  return serveFile(await once(`shelf/${scale}/${backdrop}/${logo}`, () => ensureShelfImage(scale as ShelfScale, backdrop, logo)));
});

const sameKey = (a: string, b: string) => {
  const [x, y] = [Buffer.from(a), Buffer.from(b)];
  return x.length === y.length && timingSafeEqual(x, y);
};

imgRoute.get("/:size/:file", async (c) => {
  const { size, file } = c.req.param();
  // A cached file is served to anyone; only the URLs this server writes (`?k=`) may make it download one.
  const k = c.req.query("k");
  const mayDownload = k !== undefined && sameKey(k, imageKey(size, file));
  // An unsigned request never downloads: it must not share (and spoil) a signed one's flight.
  return serveFile(await once(`${mayDownload ? "" : "cached:"}${size}/${file}`, () => ensureImage(size, file, mayDownload)));
});
