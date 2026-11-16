import { describe, it, expect, afterEach, vi } from "vitest";
import { CLAUDE_MODEL } from "../read";
import { suggestTitles, type TitleQuery } from "../titles";

let key = "a";
vi.mock("@/config", () => ({ getSettings: async () => ({ anthropic_api_key: key }) }));

afterEach(() => {
  vi.unstubAllGlobals();
  key = "a";
});

const message = (entries: unknown[], extra: Record<string, unknown> = {}) =>
  Response.json({
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: CLAUDE_MODEL,
    content: [{ type: "text", text: JSON.stringify({ entries }) }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 10 },
    ...extra,
  });
const q = (id: number, name: string, over: Partial<TitleQuery> = {}): TitleQuery => ({
  id,
  kind: "vod",
  name,
  category: "|AR| VOD ARABIC",
  year: null,
  ...over,
});

describe("suggestTitles", () => {
  it("asks nothing without a key", async () => {
    key = "";
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(await suggestTitles([q(1, "|AR| Al Jamra")])).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends the names with their category and year to Sonnet, in structured output, and maps what comes back", async () => {
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", async (_u: URL, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return message([
        { id: 1, kind: "movie", title: "The Ember", original_title: "الجمرة", year: 2017 },
        { id: 2, kind: "other", title: null, original_title: null, year: null },
        { id: 3, kind: "series", title: "  ", original_title: null, year: null },
        { id: 99, kind: "movie", title: "Not asked", original_title: null, year: null },
        { id: 1, kind: "movie", title: "Twice", original_title: null, year: null },
      ]);
    });
    const out = await suggestTitles([
      q(1, "|AR| Al Jamra | 2017 | الجمرة", { year: 2017 }),
      q(2, "|FR| Hellfest - Jour 2 (2025)", { category: "|FR| CONCERTS" }),
      q(3, "|VO|STFR| Delusion (2026)", { kind: "series" }),
    ]);
    expect(out).toEqual([
      { id: 1, kind: "movie", title: "The Ember", originalTitle: "الجمرة", year: 2017 },
      { id: 2, kind: "other", title: null, originalTitle: null, year: null },
      { id: 3, kind: "series", title: null, originalTitle: null, year: null },
    ]);
    expect(bodies).toHaveLength(1);
    const body = bodies[0] as {
      model: string;
      system: string;
      output_config: { format: { type: string }; effort: string };
      messages: { content: string }[];
    };
    expect(body.model).toBe(CLAUDE_MODEL);
    expect(body.output_config.format.type).toBe("json_schema");
    expect(body.output_config.effort).toBe("medium");
    expect(body.system).toMatch(/TMDB/);
    expect(body.messages[0].content).toContain(
      "#1 · movie entry · category « |AR| VOD ARABIC » · year read: 2017\n|AR| Al Jamra | 2017 | الجمرة",
    );
    expect(body.messages[0].content).toContain("#3 · series entry");
  });

  it("splits a long list into requests of 25 and keeps what the failed ones leave out for next time", async () => {
    let n = 0;
    vi.stubGlobal("fetch", async (_u: URL, init: RequestInit) => {
      const ids = [...String(init.body).matchAll(/#(\d+) ·/g)].map((m) => Number(m[1]));
      // The second request is refused by the API itself (a 400 is not retried); the others answer.
      if (++n === 2) return Response.json({ type: "error", error: { type: "invalid_request_error", message: "nope" } }, { status: 400 });
      return message(ids.map((id) => ({ id, kind: "movie", title: `T${id}`, original_title: null, year: null })));
    });
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const out = await suggestTitles(Array.from({ length: 60 }, (_, i) => q(i + 1, `Film ${i + 1}`)));
    logged.mockRestore();
    expect(n).toBe(3);
    expect(out).toHaveLength(35);
  });

  it("answers nothing for a refusal or an unreadable answer, without throwing", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", async () =>
      message([], { stop_reason: "refusal", stop_details: { type: "refusal", category: "general_harms", explanation: null } }),
    );
    expect(await suggestTitles([q(1, "x")])).toEqual([]);
    vi.stubGlobal("fetch", async () =>
      Response.json({
        id: "msg_2",
        type: "message",
        role: "assistant",
        model: CLAUDE_MODEL,
        content: [{ type: "text", text: "{not json" }],
        stop_reason: "max_tokens",
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    );
    expect(await suggestTitles([q(1, "x")])).toEqual([]);
    logged.mockRestore();
  });

  it("stops at the first sign the service is unreachable and says so", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", async () =>
      Response.json({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }, { status: 401 }),
    );
    await expect(suggestTitles([q(1, "x")])).rejects.toThrow(/Claude injoignable/);
    logged.mockRestore();
  });
});
