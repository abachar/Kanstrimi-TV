import { describe, it, expect, afterEach, beforeAll, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { env } from "@/shared";
import { imgRoute } from "../img-route";

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

beforeAll(() => fs.rm(path.join(env.dataDir, "images"), { recursive: true, force: true }));
afterEach(() => vi.unstubAllGlobals());

describe("/img", () => {
  it("downloads a TMDB image once, then serves it from the disk with its type, size and a year of cache", async () => {
    const fetch = vi.fn(async (_u: unknown) => new Response(JPEG));
    vi.stubGlobal("fetch", fetch);
    const res = await imgRoute.request("/w500/poster.jpg");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("content-length")).toBe(String(JPEG.length));
    expect(res.headers.get("cache-control")).toContain("immutable");
    expect(Buffer.from(await res.arrayBuffer())).toEqual(JPEG);
    expect(String(fetch.mock.calls[0][0])).toBe("https://image.tmdb.org/t/p/w500/poster.jpg");
    expect((await imgRoute.request("/w500/poster.jpg")).status).toBe(200);
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
    expect((await imgRoute.request("/w185/missing.jpg")).status).toBe(404);
  });

  it("downloads an image asked twice at once only once, and serves both", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const fetch = vi.fn(async () => {
      await gate;
      return new Response(JPEG);
    });
    vi.stubGlobal("fetch", fetch);
    const both = Promise.all([imgRoute.request("/w342/twice.jpg"), imgRoute.request("/w342/twice.jpg")]);
    await vi.waitUntil(() => fetch.mock.calls.length > 0);
    release();
    expect((await both).map((r) => r.status)).toEqual([200, 200]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
