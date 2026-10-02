import { describe, it, expect, afterEach, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { db, schema } from "@/db";
import { env } from "@/shared";
import { resetDb, closeDb } from "@/test/db";
import { logoRoute } from "../logos";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

beforeAll(async () => {
  await resetDb();
  await fs.rm(path.join(env.dataDir, "images", "logos"), { recursive: true, force: true });
  await db
    .insert(schema.iptvorgChannels)
    .values([
      { id: "TF1.fr", name: "TF1", country: "FR", logoUrl: "https://example.org/tf1.png", logoPath: "/img/logos/TF1.fr-0123456789.png" },
    ]);
});
afterEach(() => vi.unstubAllGlobals());
afterAll(closeDb);

describe("/img/logos", () => {
  it("downloads the current logo of a known channel once, then serves it from the disk", async () => {
    const fetch = vi.fn(async (_u: unknown) => new Response(PNG));
    vi.stubGlobal("fetch", fetch);
    const res = await logoRoute.request("/TF1.fr-0123456789.png");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("content-length")).toBe(String(PNG.length));
    expect(Buffer.from(await res.arrayBuffer())).toEqual(PNG);
    expect((await logoRoute.request("/TF1.fr-0123456789.png")).status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0][0])).toBe("https://example.org/tf1.png");
  });

  it("is no open proxy: an unknown channel, an old hash, a bad name or a path outside the cache answer 404 without a download", async () => {
    const fetch = vi.fn(async (_u: unknown) => new Response(PNG));
    vi.stubGlobal("fetch", fetch);
    for (const p of [
      "/M6.fr-0123456789.png",
      "/TF1.fr-aaaaaaaaaa.png",
      "/TF1.fr.png",
      "/..%2F..%2Fsecret-0123456789.png",
      "/TF1.fr-0123456789.gif",
    ])
      expect((await logoRoute.request(p)).status, p).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });
});
