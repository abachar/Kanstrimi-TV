import { describe, it, expect, afterEach, vi } from "vitest";
import { SERIES_INFO_TIMEOUT_MS, XtreamClient, XtreamError } from "../client";

afterEach(() => vi.unstubAllGlobals());

describe("XtreamClient", () => {
  it("calls player_api.php with the credentials, the action and its parameters; a URL without a scheme is http", async () => {
    const fetch = vi.fn(async (_u: unknown) => Response.json({ episodes: {} }));
    vi.stubGlobal("fetch", fetch);
    const x = new XtreamClient("provider.test:8080/", "us er", "p&ss");
    expect(x.base).toBe("http://provider.test:8080");
    await x.seriesInfo(42);
    const u = new URL(String(fetch.mock.calls[0][0]));
    expect(u.pathname).toBe("/player_api.php");
    expect(Object.fromEntries(u.searchParams)).toEqual({ username: "us er", password: "p&ss", action: "get_series_info", series_id: "42" });
  });

  it("says which call failed and how: an HTTP error keeps its status, a body that is not JSON is refused", async () => {
    vi.stubGlobal("fetch", async () => new Response("Bad gateway", { status: 502 }));
    const x = new XtreamClient("http://provider.test", "u", "p");
    const http = await x.vodStreams().catch((e) => e);
    expect(http).toBeInstanceOf(XtreamError);
    expect(http.status).toBe(502);
    expect(http.message).toContain("get_vod_streams");
    vi.stubGlobal("fetch", async () => new Response("<html>Maintenance</html>"));
    const json = await x.liveCategories().catch((e) => e);
    expect(json).toBeInstanceOf(XtreamError);
    expect(json.message).toMatch(/get_live_categories .*JSON/);
  });

  it("escapes the credentials in the stream and guide URLs", () => {
    const x = new XtreamClient("http://provider.test", "us/er", "p@ss");
    expect(x.streamUrl("movie", 7, "mkv")).toBe("http://provider.test/movie/us%2Fer/p%40ss/7.mkv");
    expect(x.xmltvUrl()).toBe("http://provider.test/xmltv.php?username=us%2Fer&password=p%40ss");
  });

  it("asks for a series' info with a short timeout, not the minute of the catalogue lists", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ episodes: {} }));
    const timeout = vi.spyOn(AbortSignal, "timeout");
    try {
      await new XtreamClient("http://provider.test", "u", "p").seriesInfo(42);
      expect(timeout).toHaveBeenCalledWith(SERIES_INFO_TIMEOUT_MS);
      expect(SERIES_INFO_TIMEOUT_MS).toBeLessThanOrEqual(15_000);
    } finally {
      timeout.mockRestore();
    }
  });
});
