import { describe, it, expect, beforeEach, afterAll, afterEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema, type Content, type Variant } from "@/db";
import { ACCOUNT, resetDb, closeDb, seedAccount, seedItems, groupAndFilter } from "@/test/db";
import { runNaming } from "../grouping/group";
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
  await seedItems([{ kind: "series", xtreamId: "300", name: "|FR| Dark (MULTI)", matchStatus: "unmatched", addedAt: new Date() }]);
  await runNaming();
  await groupAndFilter();
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
    await ensureEpisodes(content, variants, "fr-FR");
    expect(fetch).toHaveBeenCalledTimes(1); // the tree is fresh
    await db.update(schema.catalogEpisodes).set({ updatedAt: new Date(0) });
    await ensureEpisodes(content, variants, "fr-FR");
    expect(fetch).toHaveBeenCalledTimes(1); // the tree is stale, but the provider's answer is still fresh
  });

  it("rebuilds a fresh tree when a variant of another provider joined and was never asked", async () => {
    const fetch = vi.fn(async (_u: unknown) => Response.json(info(2, "b")));
    vi.stubGlobal("fetch", fetch);
    await ensureEpisodes(content, variants, "fr-FR");
    expect(fetch).toHaveBeenCalledTimes(1);
    // The same series at a second provider, grouped meanwhile: its episodes come without waiting for the 12 h.
    const backup = await seedAccount();
    await seedItems([
      { accountId: backup.id, kind: "series", xtreamId: "77", name: "|FR| Dark (2017)", matchStatus: "unmatched", addedAt: new Date() },
    ]);
    await runNaming();
    await groupAndFilter();
    const all = await db.select().from(schema.catalogVariants);
    expect(all).toHaveLength(2);
    await ensureEpisodes(content, all, "fr-FR");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(String(fetch.mock.calls[1][0])).toContain("backup.test");
    const sources = await db
      .select({ item: schema.catalogEpisodeVariants.itemId })
      .from(schema.catalogEpisodeVariants)
      .innerJoin(schema.catalogEpisodes, eq(schema.catalogEpisodes.id, schema.catalogEpisodeVariants.episodeId))
      .where(eq(schema.catalogEpisodes.contentId, content.id));
    expect(new Set(sources.map((s) => s.item)).size).toBe(2);
    // Everyone asked, the tree fresh: no more calls.
    await ensureEpisodes(content, all, "fr-FR");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("falls back on the cached answer when the provider is down, and says so when there is none", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("fetch failed");
    });
    await expect(ensureEpisodes(content, variants, "fr-FR")).rejects.toBeInstanceOf(UpstreamUnavailable);
    await db
      .insert(schema.xtreamInfoCache)
      .values({ accountId: ACCOUNT, kind: "series", xtreamId: "300", data: info(3), fetchedAt: new Date(0) });
    await ensureEpisodes(content, variants, "fr-FR");
    expect(await episodes()).toHaveLength(3);
  });

  it("stops asking the provider after the first outage of a rebuild: the other variants read their cache", async () => {
    await seedItems([
      { kind: "series", xtreamId: "301", name: "|FR| Dark (VOSTFR)", matchStatus: "unmatched", addedAt: new Date() },
      { kind: "series", xtreamId: "302", name: "|FR| Dark (VF)", matchStatus: "unmatched", addedAt: new Date() },
    ]);
    await runNaming();
    await groupAndFilter();
    [content] = await db.select().from(schema.catalogContents);
    variants = await db.select().from(schema.catalogVariants);
    expect(variants).toHaveLength(3);
    await db.insert(schema.xtreamInfoCache).values(
      variants.map((v, i) => ({
        accountId: ACCOUNT,
        kind: "series" as const,
        xtreamId: v.xtreamId,
        data: info(2, `v${i}-`),
        fetchedAt: new Date(0),
      })),
    );
    const fetch = vi.fn(async (_u: unknown): Promise<Response> => {
      throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } });
    });
    vi.stubGlobal("fetch", fetch);
    await ensureEpisodes(content, variants, "fr-FR");
    expect(fetch).toHaveBeenCalledTimes(1);
    const sources = await db.select().from(schema.catalogEpisodeVariants);
    expect(sources).toHaveLength(6); // two episodes from the cache of each of the three variants
  });

  it("says the provider is unavailable when it answers 5xx, not that the series has no episodes", async () => {
    vi.stubGlobal("fetch", async () => new Response("", { status: 503 }));
    await expect(ensureEpisodes(content, variants, "fr-FR")).rejects.toBeInstanceOf(UpstreamUnavailable);
  });

  it("runs once per series at a time: two openings at once share one rebuild and one provider call", async () => {
    let answer!: () => void;
    const gate = new Promise<void>((r) => (answer = r));
    const fetch = vi.fn(async (_u: unknown) => {
      await gate;
      return Response.json(info(2));
    });
    vi.stubGlobal("fetch", fetch);
    const both = Promise.all([ensureEpisodes(content, variants, "fr-FR"), ensureEpisodes(content, variants, "fr-FR")]);
    await vi.waitUntil(() => fetch.mock.calls.length > 0);
    answer();
    await both;
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await episodes()).toHaveLength(2);
    const sources = await db.select().from(schema.catalogEpisodeVariants);
    expect(sources).toHaveLength(2);
  });
});
