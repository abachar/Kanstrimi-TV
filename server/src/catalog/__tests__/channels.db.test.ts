import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { env } from "@/shared";
import { resetDb, closeDb, seedItems } from "@/test/db";
import { pickLogo } from "@/providers/iptv";
import { channelKey, countriesOf, iptvTheme, mergedTheme, runChannels, setIptvMatch } from "../channels";
import { runNaming, runGrouping } from "../grouping/group";

const CHANNELS = [
  { id: "TF1.fr", name: "TF1", alt_names: [], country: "FR", categories: ["general"], is_nsfw: false },
  { id: "BFMTV.fr", name: "BFM TV", alt_names: ["BFM"], country: "FR", categories: ["news"], is_nsfw: false },
  { id: "France3.fr", name: "France 3", alt_names: [], country: "FR", categories: ["general"], is_nsfw: false },
  { id: "MBC3.ae", name: "MBC 3", alt_names: [], country: "AE", categories: ["kids"], is_nsfw: false },
  { id: "Canal1.fr", name: "Canal Un", alt_names: [], country: "FR", categories: ["general"], is_nsfw: false },
  { id: "Canal1.be", name: "Canal Un", alt_names: [], country: "BE", categories: ["general"], is_nsfw: false },
];
const LOGOS = [
  { channel: "TF1.fr", feed: null, in_use: true, tags: [], width: 512, height: 512, format: "PNG", url: "https://logos.test/tf1.png" },
  { channel: "TF1.fr", feed: null, in_use: true, tags: [], width: 2000, height: 800, format: "SVG", url: "https://logos.test/tf1.svg" },
  { channel: "BFMTV.fr", feed: "HD", in_use: true, tags: [], width: 300, height: 300, format: "JPEG", url: "https://logos.test/bfm.jpg" },
];

function serve() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const body = String(url).endsWith("/channels.json") ? CHANNELS : String(url).endsWith("/logos.json") ? LOGOS : null;
      return body ? new Response(JSON.stringify(body), { headers: { etag: '"v1"' } }) : new Response("", { status: 404 });
    }),
  );
}

beforeAll(async () => {
  await resetDb();
  fs.rmSync(path.join(env.dataDir, "iptv-org"), { recursive: true, force: true });
  await seedItems([
    { kind: "live", xtreamId: "1", name: "|FR| TF1 FHD", raw: { epg_channel_id: "TF1.fr" } },
    { kind: "live", xtreamId: "2", name: "|FR| BFM TV HD", section: "|FR| SPORT |FR|" },
    { kind: "live", xtreamId: "3", name: "|FR| FRANCE 3 BRETAGNE", section: "|FR| RÉGIONALES |FR|" },
    { kind: "live", xtreamId: "4", name: "|AR| MBC 3" },
    { kind: "live", xtreamId: "5", name: "|FR| LIGUE1+ 9" },
    { kind: "live", xtreamId: "6", name: "|IT| CANAL UN" },
  ]);
  await runNaming();
});
afterEach(() => vi.unstubAllGlobals());
afterAll(closeDb);

describe("iptv-org helpers", () => {
  it("keys names without the noise, maps markets to countries", () => {
    expect(channelKey("BFM TV HD")).toBe(channelKey("bfm"));
    expect(countriesOf("ar")).toContain("AE");
    expect(countriesOf("uk")).toContain("GB");
  });
  it("takes the most telling category, and keeps a specific provider theme over « general »", () => {
    expect(iptvTheme(["general", "news"])).toBe("Infos");
    expect(iptvTheme(["xxx"])).toBeNull();
    expect(mergedTheme("Généralistes", "Régionales")).toBe("Régionales");
    expect(mergedTheme("Infos", "Sport")).toBe("Infos");
    expect(mergedTheme(null, "Sport")).toBe("Sport");
  });
  it("picks a drawable logo, the channel's own before a feed's, the widest", () => {
    expect(pickLogo(LOGOS.filter((l) => l.channel === "TF1.fr"))?.url).toBe("https://logos.test/tf1.png");
    expect(pickLogo([])).toBeNull();
  });
});

describe("runChannels", () => {
  it("matches by EPG id, then by name in the market, then worldwide when unique", async () => {
    serve();
    const stats = await runChannels();
    expect(stats).toMatchObject({ iptv_channels: 6, iptv_logos: 2, live_items: 6, iptv_matched: 3, iptv_by_epg: 1, iptv_by_name: 2 });
    const items = await db.select().from(schema.items).orderBy(schema.items.xtreamId);
    const by = (x: string) => items.find((i) => i.xtreamId === x)!;
    expect(by("1")).toMatchObject({ iptvId: "TF1.fr", iptvMatch: "epg" });
    expect(by("2")).toMatchObject({ iptvId: "BFMTV.fr", iptvMatch: "name", theme: "Infos" }); // iptv-org first
    expect(by("4")).toMatchObject({ iptvId: "MBC3.ae", iptvMatch: "name", theme: "Jeunesse" }); // « ar » = the Arab world
    expect(by("3")).toMatchObject({ iptvId: null, theme: "Régionales" }); // a regional feed: no channel of its own name
    expect(by("5").iptvId).toBeNull(); // an event channel iptv-org does not know
    expect(by("6").iptvId).toBeNull(); // « Canal Un » is two channels, none in Italy
  });

  it("gives the content iptv-org's logo through this server, the provider's otherwise", async () => {
    await runGrouping();
    const [tf1] = await db.select().from(schema.contents).where(eq(schema.contents.iptvId, "TF1.fr"));
    expect(tf1.logoUrl).toMatch(/^\/img\/logos\/TF1\.fr-[0-9a-f]{10}\.png$/);
  });

  it("keeps a manual pin across runs, and goes back to automatic on demand", async () => {
    const [ligue] = await db.select().from(schema.items).where(eq(schema.items.xtreamId, "5"));
    await setIptvMatch(ligue.id, "Canal1.fr");
    serve();
    await runChannels();
    expect((await db.select().from(schema.items).where(eq(schema.items.id, ligue.id)))[0]).toMatchObject({
      iptvId: "Canal1.fr",
      iptvMatch: "manual",
    });
    await setIptvMatch(ligue.id, "auto");
    expect((await db.select().from(schema.items).where(eq(schema.items.id, ligue.id)))[0]).toMatchObject({ iptvId: null, iptvMatch: null });
    await expect(setIptvMatch(ligue.id, "Nope.xx")).rejects.toThrow(/inconnue/);
  });
});
