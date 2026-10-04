import { describe, it, expect, afterEach, beforeAll, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { env, signedImagePath } from "@/shared";
import sharp from "sharp";
import { imgRoute } from "../img-route";

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

beforeAll(() => fs.rm(path.join(env.dataDir, "images"), { recursive: true, force: true }));
afterEach(() => vi.unstubAllGlobals());

describe("/img", () => {
  it("downloads a TMDB image once, then serves it from the disk with its type, size and a year of cache", async () => {
    const fetch = vi.fn(async (_u: unknown) => new Response(JPEG));
    vi.stubGlobal("fetch", fetch);
    const res = await imgRoute.request(signedImagePath("w500", "/poster.jpg").slice(4));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("content-length")).toBe(String(JPEG.length));
    expect(res.headers.get("cache-control")).toContain("immutable");
    expect(res.headers.get("content-security-policy")).toBe("sandbox"); // an SVG opened as a page runs no script
    expect(Buffer.from(await res.arrayBuffer())).toEqual(JPEG);
    expect(String(fetch.mock.calls[0][0])).toBe("https://image.tmdb.org/t/p/w500/poster.jpg");
    expect((await imgRoute.request(signedImagePath("w500", "/poster.jpg").slice(4))).status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("refuses an unknown size, a file name that is not one, and a path outside the cache, without asking TMDB", async () => {
    const fetch = vi.fn(async (_u: unknown) => new Response(JPEG));
    vi.stubGlobal("fetch", fetch);
    for (const p of ["/w999/poster.jpg", "/w500/poster.exe", "/w500/..%2F..%2Fetc%2Fpasswd", "/w500/a.b.jpg", "/w500/%2E%2E.jpg"])
      expect((await imgRoute.request(p)).status, p).toBe(404);
    expect((await imgRoute.request("/shelf/3x/backdrop.jpg/logo.png")).status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("answers 404 when TMDB has no such image", async () => {
    vi.stubGlobal("fetch", async () => new Response("", { status: 404 }));
    expect((await imgRoute.request(signedImagePath("w185", "/missing.jpg").slice(4))).status).toBe(404);
  });

  it("downloads an image asked twice at once only once, and serves both", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const fetch = vi.fn(async () => {
      await gate;
      return new Response(JPEG);
    });
    vi.stubGlobal("fetch", fetch);
    const twice = signedImagePath("w342", "/twice.jpg").slice(4);
    const both = Promise.all([imgRoute.request(twice), imgRoute.request(twice)]);
    await vi.waitUntil(() => fetch.mock.calls.length > 0);
    release();
    expect((await both).map((r) => r.status)).toEqual([200, 200]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("downloads nothing without the server's signature, but serves what is already cached", async () => {
    const fetch = vi.fn(async (_u: unknown) => new Response(JPEG));
    vi.stubGlobal("fetch", fetch);
    expect((await imgRoute.request("/w500/unsigned.jpg")).status).toBe(404);
    expect((await imgRoute.request("/w500/unsigned.jpg?k=0000000000000000")).status).toBe(404);
    // As many characters as a key but more bytes: refused, not a 500 from the comparison.
    expect((await imgRoute.request(`/w500/unsigned.jpg?k=${encodeURIComponent("é".repeat(16))}`)).status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
    const signed = signedImagePath("w500", "/unsigned.jpg");
    expect(signed).toMatch(/^\/img\/w500\/unsigned\.jpg\?k=[A-Za-z0-9_-]{16}$/);
    expect((await imgRoute.request(signed.slice(4))).status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(1);
    // Cached: served to anyone, without a key.
    expect((await imgRoute.request("/w500/unsigned.jpg")).status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("composes the Top Shelf image: the logo over the backdrop, 1920x1080 at 1x, then served from the disk", async () => {
    const backdrop = await sharp({ create: { width: 640, height: 360, channels: 3, background: "#336699" } })
      .jpeg()
      .toBuffer();
    const logo = await sharp({ create: { width: 200, height: 80, channels: 4, background: "#ffffff" } })
      .png()
      .toBuffer();
    const fetch = vi.fn(async (u: unknown) => new Response(String(u).endsWith("/shelfbg.jpg") ? backdrop : logo));
    vi.stubGlobal("fetch", fetch);
    const res = await imgRoute.request("/shelf/1x/shelfbg.jpg/shelflogo.png");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["jpeg", 1920, 1080]);
    expect(fetch).toHaveBeenCalledTimes(2); // the backdrop and the logo
    fetch.mockClear();
    expect((await imgRoute.request("/shelf/1x/shelfbg.jpg/shelflogo.png")).status).toBe(200);
    expect(fetch).not.toHaveBeenCalled();
  });
});
