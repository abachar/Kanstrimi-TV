import { Hono } from "hono";
import fs from "node:fs";
import { Readable } from "node:stream";
import { ensureImage } from "./images";

/** `/img/{size}/{file}`: TMDB images through the local disk cache; every card URL points here. Mounted by `main.ts`. */
export const imgRoute = new Hono();

imgRoute.get("/:size/:file", async (c) => {
  const { size, file } = c.req.param();
  const img = await ensureImage(size, file).catch(() => null);
  if (!img) return c.text("Not found", 404);
  const body = Readable.toWeb(fs.createReadStream(img.path)) as unknown as ReadableStream;
  return new Response(body, {
    headers: {
      "Content-Type": img.contentType,
      "Content-Length": String(fs.statSync(img.path).size),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
});
