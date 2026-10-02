import { describe, it, expect, beforeEach, afterAll, afterEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema, type Content, type Variant } from "@/db";
import { resetDb, closeDb, seedItems } from "@/test/db";
import { setSettings, verify } from "@/config";
import { runGrouping, runNaming } from "../grouping/group";
import { ensureEpisodes, UpstreamUnavailable } from "../episodes";

/** get_series_info of one variant: season 1, `n` episodes. */
const info = (n: number, prefix = "e") => ({
  seasons: [],
  info: {},
  episodes: {
    "1": Array.from({ length: n }, (_, i) => ({
      id: `${prefix}${i + 1}`,
      episode_num: i + 1,
      season: 1,
      title: `|FR| Dark 1x0${i + 1} - Épisode ${i + 1} (MULTI)`,
      container_extension: "mkv",
      info: { duration_secs: 3000 },
    })),
  },
});

let content: Content;
let variants: Variant[];
const episodes = async () =>
  (await db.select().from(schema.catalogEpisodes).where(eq(schema.catalogEpisodes.contentId, content.id))).map((e) => e.key).sort();

beforeEach(async () => {
  await resetDb();
  expect(await verify("test")).toBe(true);
  await setSettings({ xtream_url: "http://provider.test", xtream_username: "u", xtream_password: "p" });
  await seedItems([{ kind: "series", xtreamId: "300", name: "|FR| Dark (MULTI)", matchStatus: "unmatched", addedAt: new Date() }]);
  await runNaming();
  await runGrouping();
  [content] = await db.select().from(schema.catalogContents);
  variants = await db.select().from(schema.catalogVariants);
});
afterEach(() => vi.unstubAllGlobals());
afterAll(closeDb);

describe("ensureEpisodes", () => {
  it("builds the episodes from the provider, then keeps them from its 12 h cache", async () => {
    const fetch = vi.fn(async (_u: unknown) => Response.json(info(2)));
    vi.stubGlobal("fetch", fetch);
    await ensureEpisodes(content, variants, "fr-FR");
    expect(await episodes()).toEqual(["fallback:series:dark:-:s01e01", "fallback:series:dark:-:s01e02"]);
    await ensureEpisodes(content, variants, "fr-FR", true);
    expect(fetch).toHaveBeenCalledTimes(1); // forced, but the provider's answer is still fresh
  });

  it("falls back on the cached answer when the provider is down, and says so when there is none", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("fetch failed");
    });
    await expect(ensureEpisodes(content, variants, "fr-FR")).rejects.toBeInstanceOf(UpstreamUnavailable);
    await db.insert(schema.xtreamInfoCache).values({ kind: "series", xtreamId: "300", data: info(3), fetchedAt: new Date(0) });
    await ensureEpisodes(content, variants, "fr-FR");
    expect(await episodes()).toHaveLength(3);
  });

  it("runs once per series at a time: two openings at once share one rebuild and one provider call", async () => {
    let answer!: () => void;
    const gate = new Promise<void>((r) => (answer = r));
    const fetch = vi.fn(async (_u: unknown) => {
      await gate;
      return Response.json(info(2));
    });
    vi.stubGlobal("fetch", fetch);
    const both = Promise.all([ensureEpisodes(content, variants, "fr-FR"), ensureEpisodes(content, variants, "fr-FR", true)]);
    await vi.waitUntil(() => fetch.mock.calls.length > 0);
    answer();
    await both;
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await episodes()).toHaveLength(2);
    const sources = await db.select().from(schema.catalogEpisodeVariants);
    expect(sources).toHaveLength(2);
  });

  it("asks the provider with a short timeout, not the minute of the catalogue lists", async () => {
    const { SERIES_INFO_TIMEOUT_MS } = await import("@/providers/xtream");
    expect(SERIES_INFO_TIMEOUT_MS).toBeLessThanOrEqual(15_000);
  });
});
