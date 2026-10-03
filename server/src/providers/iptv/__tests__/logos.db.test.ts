import { describe, it, expect, afterEach, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { db, schema } from "@/db";
import { env } from "@/shared";
import { resetDb, closeDb } from "@/test/db";
import { isPublicAddress, logoRoute } from "../logos";

// No network: example.org is public, the other hosts point at the home network or this machine.
vi.mock("node:dns/promises", () => ({
  lookup: async (host: string) =>
    host === "example.org"
      ? [{ address: "93.184.215.14", family: 4 }]
      : host === "nas.test"
        ? [{ address: "192.168.1.10", family: 4 }]
        : [{ address: "::1", family: 6 }],
}));

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

beforeAll(async () => {
  await resetDb();
  await fs.rm(path.join(env.dataDir, "images", "logos"), { recursive: true, force: true });
  await db.insert(schema.iptvorgChannels).values([
    { id: "TF1.fr", name: "TF1", country: "FR", logoUrl: "https://example.org/tf1.png", logoPath: "/img/logos/TF1.fr-0123456789.png" },
    { id: "M6.fr", name: "M6", country: "FR", logoUrl: "http://example.org/m6.png", logoPath: "/img/logos/M6.fr-0123456789.png" },
    { id: "W9.fr", name: "W9", country: "FR", logoUrl: "https://nas.test/w9.png", logoPath: "/img/logos/W9.fr-0123456789.png" },
    { id: "C8.fr", name: "C8", country: "FR", logoUrl: "https://example.org/c8.png", logoPath: "/img/logos/C8.fr-0123456789.png" },
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
      "/TMC.fr-0123456789.png",
      "/TF1.fr-aaaaaaaaaa.png",
      "/TF1.fr.png",
      "/..%2F..%2Fsecret-0123456789.png",
      "/TF1.fr-0123456789.gif",
    ])
      expect((await logoRoute.request(p)).status, p).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fetches over https only, from a public address, and follows no redirect to the home network", async () => {
    const fetch = vi.fn(async (u: unknown) =>
      String(u).endsWith("/c8.png")
        ? new Response(null, { status: 302, headers: { location: "https://nas.test/c8.png" } })
        : new Response(PNG),
    );
    vi.stubGlobal("fetch", fetch);
    expect((await logoRoute.request("/M6.fr-0123456789.png")).status).toBe(404); // http
    expect((await logoRoute.request("/W9.fr-0123456789.png")).status).toBe(404); // 192.168.1.10
    expect((await logoRoute.request("/C8.fr-0123456789.png")).status).toBe(404); // public, then redirected home
    expect(fetch.mock.calls.map((c) => String(c[0]))).toEqual(["https://example.org/c8.png"]);
  });

  it("tells a public address from a private one, an IPv4 written as IPv6 included", () => {
    for (const [a, f] of [
      ["93.184.215.14", 4],
      ["2606:4700::1", 6],
    ] as const)
      expect(isPublicAddress(a, f), a).toBe(true);
    for (const [a, f] of [
      ["127.0.0.1", 4],
      ["10.0.0.2", 4],
      ["172.20.0.5", 4],
      ["192.168.1.10", 4],
      ["169.254.169.254", 4],
      ["::1", 6],
      ["fd00::1", 6],
      ["::ffff:192.168.1.10", 6],
    ] as const)
      expect(isPublicAddress(a, f), a).toBe(false);
  });
});
