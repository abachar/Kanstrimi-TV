import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { resetDb, closeDb, seedItems } from "@/test/db";
import { setSettings, verify } from "@/config";
import { runGrouping, runNaming } from "@/catalog";
import { home } from "../home";
import { shelfPicks } from "../top-shelf";

/** Turns `ensureEpisodes` into a failure that is not the provider's (a bug, the database). */
let brokenEpisodes = false;
vi.mock("@/catalog", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/catalog")>();
  return {
    ...mod,
    ensureEpisodes: (...args: Parameters<typeof mod.ensureEpisodes>) =>
      brokenEpisodes ? Promise.reject(new Error("panne de la base")) : mod.ensureEpisodes(...args),
  };
});

const ctx = { baseUrl: "http://x", device: null, tmdbLang: "fr-FR", providerName: "provider.test", serveAdult: false };

beforeAll(async () => {
  await resetDb();
  expect(await verify("test")).toBe(true);
  await setSettings({ xtream_url: "http://provider.test", xtream_username: "u", xtream_password: "p" });
  await seedItems([{ kind: "series", xtreamId: "300", name: "|FR| Dark (MULTI)", matchStatus: "unmatched", addedAt: new Date() }]);
  await runNaming();
  await runGrouping();
  // A series in progress that received something since: the carousel looks for its next episode.
  const [content] = await db.select().from(schema.catalogContents);
  await db
    .update(schema.catalogContents)
    .set({ backdropPath: "/b.jpg", titleLogoPath: "/l.png" })
    .where(eq(schema.catalogContents.id, content.id));
  await db.insert(schema.appWatchProgress).values({
    contentKey: `${content.key}:s01e01`,
    position: 2900,
    duration: 3000,
    finished: true,
    updatedAt: new Date(Date.now() - 86_400_000),
  });
});
afterEach(() => vi.unstubAllGlobals());
afterAll(closeDb);

describe("/home with a blocked provider", () => {
  it("answers within three seconds: the series' episodes are looked for in the background", async () => {
    vi.stubGlobal("fetch", () => new Promise(() => {})); // the provider never answers
    const started = Date.now();
    const h = await home(ctx);
    expect(Date.now() - started).toBeLessThan(3000);
    expect(h.heroes).toBeDefined();
  });

  it("an error other than the provider's is not swallowed", async () => {
    brokenEpisodes = true;
    try {
      await expect(shelfPicks(ctx, { resume: false })).rejects.toThrow("panne de la base");
    } finally {
      brokenEpisodes = false;
    }
  });
});
