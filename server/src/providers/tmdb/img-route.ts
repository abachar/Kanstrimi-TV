import { Hono, type Context } from "hono";
import fs from "node:fs";
import { Readable } from "node:stream";
import { ensureImage, ensureShelfImage, SHELF_SCALES, type ShelfScale } from "./images";

/** `/img/{size}/{file}`: TMDB images through the local disk cache; every card URL points here. Mounted by `main.ts`. */
export const imgRoute = new Hono();

/** `/img/shelf/{1x|2x}/{backdrop}/{logo}`: a Top Shelf image, the title logo drawn on the backdrop. */
imgRoute.get("/shelf/:scale/:backdrop/:logo", async (c) => {
  const { scale, backdrop, logo } = c.req.param();
  if (!(scale in SHELF_SCALES)) return c.text("Not found", 404);
  return serve(c, await ensureShelfImage(scale as ShelfScale, backdrop, logo).catch(() => null));
});

imgRoute.get("/:size/:file", async (c) => {
  const { size, file } = c.req.param();
  return serve(c, await ensureImage(size, file).catch(() => null));
});

function serve(c: Context, img: { path: string; contentType: string } | null) {
  if (!img) return c.text("Not found", 404);
  const body = Readable.toWeb(fs.createReadStream(img.path)) as unknown as ReadableStream;
  return new Response(body, {
    headers: {
      "Content-Type": img.contentType,
      "Content-Length": String(fs.statSync(img.path).size),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
