import { describe, it, expect, afterEach, vi } from "vitest";
import { isUnreachable } from "@/shared";
import { TMDB_PER_SECOND, TmdbClient } from "../client";

afterEach(() => vi.unstubAllGlobals());

describe("TmdbClient", () => {
  it("sends a v3 key as api_key and a v4 token as a Bearer, with the language", async () => {
    const calls: { url: URL; auth: string | null }[] = [];
    vi.stubGlobal("fetch", async (u: URL, init: RequestInit) => {
      calls.push({ url: new URL(String(u)), auth: new Headers(init.headers).get("authorization") });
      return Response.json({ results: [] });
    });
    await new TmdbClient("k3", "fr-FR").searchMovie("Dune", 2021);
    await new TmdbClient("x".repeat(60), "en-US").searchTv("Dark");
    expect(calls[0].url.searchParams.get("api_key")).toBe("k3");
    expect(calls[0].url.searchParams.get("year")).toBe("2021");
    expect(calls[0].url.searchParams.get("language")).toBe("fr-FR");
    expect(calls[0].auth).toBeNull();
    expect(calls[1].url.searchParams.has("api_key")).toBe(false);
    expect(calls[1].auth).toBe(`Bearer ${"x".repeat(60)}`);
  });

  it("waits as long as a 429 says, then asks again", async () => {
    let n = 0;
    vi.stubGlobal("fetch", async () =>
      ++n === 1 ? new Response("", { status: 429, headers: { "retry-after": "0" } }) : Response.json({ id: 603, title: "Matrix" }),
    );
    expect((await new TmdbClient("k").movie(603)).title).toBe("Matrix");
    expect(n).toBe(2);
  });

  it("fails with the path and the status on an HTTP error, and on a body that is not JSON", async () => {
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 404 }));
    await expect(new TmdbClient("k").tv(1)).rejects.toThrow("TMDB /tv/1: HTTP 404");
    vi.stubGlobal("fetch", async () => new Response("<html>oops</html>"));
    await expect(new TmdbClient("k").tv(1)).rejects.toThrow();
  });

  it("a 429 that lasts is an outage of the way to TMDB, not a failure of the title asked", async () => {
    vi.stubGlobal("fetch", async () => new Response("", { status: 429, headers: { "retry-after": "0" } }));
    const e = await new TmdbClient("k").searchMovie("Dune").catch((x) => x);
    expect(e.message).toContain("HTTP 429");
    expect(isUnreachable(e)).toBe(true);
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 404 }));
    expect(isUnreachable(await new TmdbClient("k").movie(1).catch((x) => x))).toBe(false);
  });

  it("spaces its requests: never more than TMDB_PER_SECOND a second, all clients together", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ results: [] }));
    const n = 8;
    const started = performance.now();
    await Promise.all(Array.from({ length: n }, (_, i) => new TmdbClient(`k${i}`).searchMovie("x")));
    expect(performance.now() - started).toBeGreaterThanOrEqual(((n - 1) * 1000) / TMDB_PER_SECOND - 5);
  });
});
