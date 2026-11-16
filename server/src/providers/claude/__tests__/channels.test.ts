import { describe, it, expect, afterEach, vi } from "vitest";
import { CLAUDE_MODEL } from "../read";
import { suggestChannels } from "../channels";

let key = "a";
vi.mock("@/config", () => ({ getSettings: async () => ({ anthropic_api_key: key }) }));

afterEach(() => {
  vi.unstubAllGlobals();
  key = "a";
});

const message = (entries: unknown[]) =>
  Response.json({
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: CLAUDE_MODEL,
    content: [{ type: "text", text: JSON.stringify({ entries }) }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 10 },
  });

describe("suggestChannels", () => {
  it("asks nothing without a key", async () => {
    key = "";
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(await suggestChannels([{ id: 1, name: "MA - TNT AL OULA", category: null, market: "ar" }], ["Al Aoula"])).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends the names with the market's reference list, and keeps a name only for a channel", async () => {
    const bodies: { system: string; messages: { content: string }[] }[] = [];
    vi.stubGlobal("fetch", async (_u: URL, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return message([
        { id: 1, kind: "channel", name: " Al Aoula " },
        { id: 2, kind: "event", name: "DAZN" },
        { id: 3, kind: "other", name: null },
        { id: 4, kind: "channel", name: null },
        { id: 99, kind: "channel", name: "Not asked" },
      ]);
    });
    const out = await suggestChannels(
      [
        { id: 1, name: "MA - TNT AL OULA FHD", category: "|AR| MOROCCO", market: "ar" },
        { id: 2, name: "AR - DAZN PPV 12", category: "|AR| DAZN PPV", market: "ar" },
        { id: 3, name: "|MA| HIT RADIO", category: "RADIOS", market: "ar" },
        { id: 4, name: "MA - AMOUDDOU", category: null, market: "ar" },
      ],
      ["2M", "Al Aoula"],
    );
    expect(out).toEqual([
      { id: 1, kind: "channel", name: "Al Aoula" },
      { id: 2, kind: "event", name: null },
      { id: 3, kind: "other", name: null },
      { id: 4, kind: "channel", name: null },
    ]);
    expect(bodies).toHaveLength(1);
    expect(bodies[0].system).toMatch(/Reference list of this market, one channel per line:\n2M\nAl Aoula$/);
    expect(bodies[0].messages[0].content).toContain("#1 · market ar · category « |AR| MOROCCO »\nMA - TNT AL OULA FHD");
  });
});
