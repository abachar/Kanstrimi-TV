import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db, schema, variants as vr, channelContent } from "@/db";
import { env } from "@/shared";
import { resetDb, closeDb, seedItems, groupAndFilter } from "@/test/db";
import { pickLogo, syncIptv } from "@/providers/iptv";
import {
  channelKey,
  countriesOf,
  iptvTheme,
  isEventFeed,
  mergedTheme,
  nameKeys,
  regionCountry,
  runChannels,
  setIptvMatch,
} from "../channels";
import { runNaming } from "../grouping/group";

const CHANNELS = [
  { id: "TF1.fr", name: "TF1", alt_names: [], country: "FR", categories: ["general"], is_nsfw: false },
  { id: "BFMTV.fr", name: "BFM TV", alt_names: ["BFM"], country: "FR", categories: ["news"], is_nsfw: false },
  { id: "France3.fr", name: "France 3", alt_names: [], country: "FR", categories: ["general"], is_nsfw: false },
  { id: "MBC3.ae", name: "MBC 3", alt_names: [], country: "AE", categories: ["kids"], is_nsfw: false },
  { id: "Canal1.fr", name: "Canal Un", alt_names: [], country: "FR", categories: ["general"], is_nsfw: false },
  { id: "Canal1.be", name: "Canal Un", alt_names: [], country: "BE", categories: ["general"], is_nsfw: false },
  { id: "ERTU1.eg", name: "ERTU 1", alt_names: ["Al Oula"], country: "EG", categories: ["general"], is_nsfw: false },
  { id: "BBCParliament.uk", name: "BBC Parliament", alt_names: [], country: "UK", categories: ["legislative"], is_nsfw: false },
  { id: "AlResalah.sa", name: "Al Resalah", alt_names: [], country: "SA", categories: ["religious"], is_nsfw: false },
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
    // The provider's EPG id names a Dubai channel; the name says ERTU 1.
    { kind: "live", xtreamId: "7", name: "|AR| AL OULA HD (ERTU 1) EGY", raw: { epg_channel_id: "DubaiAlOula.ae" } },
    // An EPG id iptv-org gives to another channel, and no channel by name: no match, the guide stays.
    { kind: "live", xtreamId: "8", name: "|UK| CNBC", raw: { epg_channel_id: "BBCParliament.uk" } },
    // Another spelling of the same name: the EPG id is kept.
    { kind: "live", xtreamId: "9", name: "|AR| AL RESALA", raw: { epg_channel_id: "AlResalah.sa" } },
  ]);
  await runNaming();
});
afterEach(() => vi.unstubAllGlobals());
afterAll(closeDb);

describe("iptv-org helpers", () => {
  it("keys names without the noise, maps markets to countries", () => {
    expect(channelKey("BFM TV HD")).toBe(channelKey("bfm"));
    expect(channelKey("ARRYADIA 1 HD")).toBe(channelKey("Arryadia HD1"));
    expect(channelKey("HD1")).toBe("1");
    expect(nameKeys("AL OULA (ERTU 1) EGY")).toEqual(expect.arrayContaining([channelKey("AL OULA"), channelKey("ERTU 1")]));
    expect(nameKeys("2M MAROC")).toContain(channelKey("2M")); // a country closing the name is a tag
    expect(nameKeys("TLC FRANCE")).toContain(channelKey("TLC"));
    expect(countriesOf("ar")).toContain("AE");
    expect(countriesOf("uk")).toContain("GB");
  });
  it("shows a region's channel under its country: iptv-org's in the region, else the section's, none for a theme", () => {
    expect(regionCountry("ar", "NoorDubai.ae", ["|AR| JORDANIE |AR|"])).toBe("AE"); // the provider misfiles it
    expect(regionCountry("ar", "2M.ma", ["|AR| MAROC |AR|"])).toBe("MA");
    expect(regionCountry("ar", "ArabicaTV.nl", ["|AR| MAROC |AR|"])).toBe("MA"); // iptv-org outside the region
    expect(regionCountry("ar", null, ["|AR| AR. SAOUDI |AR|"])).toBe("SA");
    expect(regionCountry("ar", "SharjahTV.ae", ["|AR| ROYAUME-UNI |AR|"])).toBe("AE");
    expect(regionCountry("ar", null, ["|AR| INDEFINI |AR|", null])).toBeNull();
    expect(regionCountry("ar", "beINSports1.qa", ["|AR| SPORTS AR. |AR|"])).toBeNull(); // pan-Arab
    expect(regionCountry("ar", "OSNMovies.ae", ["|AR| OSN MOVIES |AR|", "|AR| QATAR |AR|"])).toBe("AE");
    expect(regionCountry("fr", "TF1.fr", ["|FR| FRANCE FHD |FR|"])).toBeNull(); // not a region
  });
  it("reads the other providers' ways of naming a country: the name's own prefix, a bare section, a category", () => {
    expect(regionCountry("ar", "MBC5.ae", [null], { nameCountry: "MA" })).toBe("MA"); // « MA - MBC 5 »
    expect(regionCountry("ar", null, ["| LIBAN |"])).toBe("LB");
    expect(regionCountry("ar", null, ["|AR| SAUDI ARABIA |AR|"])).toBe("SA");
    expect(regionCountry("ar", null, [null], { category: "|AR| MOROCCO" })).toBe("MA");
    expect(regionCountry("ar", "beINSports1.qa", [null], { category: "|AR| BEIN SPORTS 4K" })).toBeNull(); // a theme: pan-Arab
    expect(regionCountry("ar", "AlAoula.ma", [null], { category: "|AR| ARABIC FULL SD" })).toBe("MA"); // tells nothing: iptv-org's
    expect(regionCountry("ar", "AlAoula.ma", ["|AR| SPORTS AR. |AR|"], { category: "|AR| MOROCCO" })).toBeNull(); // a section wins over the category
  });
  it("tells an event feed by its category, its section or its own name", () => {
    const feed = (name: string, category: string | null = null, section: string | null = null) => isEventFeed({ name, category, section });
    expect(feed("FR - DAZN 3", "|EU| FRANCE DAZN PPV")).toBe(true);
    expect(feed("|FR| RMC SPORT 1", null, "|FR| SPORT EVENT |FR|")).toBe(true);
    expect(feed("|FR| CANAL+ LIVE 7 FHD")).toBe(true);
    expect(feed("LIGUE1+ FHD ( Dimanche 2eme Match )")).toBe(true);
    expect(feed("AU (STAN 03) | West Ham United v Charlton Athletic (2026-11-16 00:50:50)")).toBe(true);
    expect(feed("|FR| MTV LIVE", "FRANCE MUSIQUE")).toBe(false);
    expect(feed("|FR| AUTOMOTO FHD", "SPORTS FR")).toBe(false);
  });
  it("takes the most telling category, and keeps a specific provider theme over « general »", () => {
    expect(iptvTheme(["general", "news"])).toBe("Infos");
    expect(iptvTheme(["xxx"])).toBeNull();
    expect(mergedTheme("Généralistes", "Régionales")).toBe("Régionales");
    expect(mergedTheme("Infos", "Sport")).toBe("Infos");
    expect(mergedTheme(null, "Sport")).toBe("Sport");
    expect(mergedTheme("Généralistes", "Tf1+")).toBe("Généralistes"); // a provider label is no theme
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
    expect(stats).toMatchObject({
      iptv_channels: 9,
      iptv_logos: 2,
      live_items: 9,
      live_recognised: 5,
      live_events: 1,
      iptv_matched: 5,
      iptv_by_epg: 2,
      iptv_by_name: 3,
      epg_mismatch: 1,
      ai_asked: 0, // no key: Claude is not asked
    });
    const items = await db.select().from(vr).orderBy(vr.xtreamId);
    const by = (x: string) => items.find((i) => i.xtreamId === x)!;
    expect(by("1")).toMatchObject({ iptvId: "TF1.fr", how: "epg", channelName: "TF1" });
    expect(by("2")).toMatchObject({ iptvId: "BFMTV.fr", how: "name", channelName: "BFM TV", theme: "Infos" }); // iptv-org first
    expect(by("4")).toMatchObject({ iptvId: "MBC3.ae", how: "name", theme: "Jeunesse" }); // « ar » = the Arab world
    // A regional feed: no channel of its own name. Without a reference channel, no theme of the provider's either.
    expect(by("3")).toMatchObject({ iptvId: null, channelName: null, theme: "Non reconnus" });
    expect(by("5")).toMatchObject({ iptvId: null, channelName: null, theme: "Événements" }); // a numbered feed of a platform
    expect(by("6")).toMatchObject({ iptvId: null, theme: "Non reconnus" }); // « Canal Un » is two channels, none in Italy
    expect(by("7")).toMatchObject({ iptvId: "ERTU1.eg", how: "name", channelName: "ERTU 1", epgMismatch: true });
    expect(by("8")).toMatchObject({ iptvId: null, epgMismatch: false });
    expect(by("9")).toMatchObject({ iptvId: "AlResalah.sa", how: "epg", theme: "Religion" });
    // In the Arab world, iptv-org's country; outside a region, none.
    expect([by("4").country, by("7").country, by("9").country, by("1").country]).toEqual(["AE", "EG", "SA", null]);
  });

  it("gives the content iptv-org's logo through this server, the provider's otherwise", async () => {
    await groupAndFilter();
    const [tf1] = await db.select(channelContent).from(schema.catalogChannels).where(eq(schema.catalogChannels.iptvId, "TF1.fr"));
    expect(tf1.logoUrl).toMatch(/^\/img\/logos\/TF1\.fr-[0-9a-f]{10}\.png$/);
    // A contradicted EPG id gives way to the iptv-org id for the guide.
    const [ertu] = await db.select(channelContent).from(schema.catalogChannels).where(eq(schema.catalogChannels.iptvId, "ERTU1.eg"));
    expect(ertu.epgChannelId).toBe("ERTU1.eg");
    expect(ertu.country).toBe("EG"); // the app's « Égypte · … »
    // …unless the provider files programmes under its own id: then its guide stays.
    await db.insert(schema.cacheEpgProgrammes).values({
      channelId: "DubaiAlOula.ae",
      startAt: new Date(),
      endAt: new Date(Date.now() + 3600_000),
      title: "x",
      importedAt: new Date(),
    });
    await groupAndFilter();
    const [again] = await db.select(channelContent).from(schema.catalogChannels).where(eq(schema.catalogChannels.id, ertu.id));
    expect(again.epgChannelId).toBe("DubaiAlOula.ae");
  });

  it("keeps a manual pin across runs, and goes back to automatic on demand", async () => {
    const [ligue] = await db.select().from(vr).where(eq(vr.xtreamId, "5"));
    await setIptvMatch(ligue.id, "Canal1.fr");
    serve();
    await runChannels();
    expect((await db.select().from(vr).where(eq(vr.id, ligue.id)))[0]).toMatchObject({
      iptvId: "Canal1.fr",
      how: "manual",
    });
    await setIptvMatch(ligue.id, "auto");
    expect((await db.select().from(vr).where(eq(vr.id, ligue.id)))[0]).toMatchObject({
      iptvId: null,
      how: null,
    });
    await expect(setIptvMatch(ligue.id, "Nope.xx")).rejects.toThrow(/inconnue/);
  });
});

describe("syncIptv", () => {
  const age = async () => {
    const old = new Date(Date.now() - 48 * 3600 * 1000);
    for (const f of ["channels", "logos"]) await fs.promises.utimes(path.join(env.dataDir, "iptv-org", `${f}.json`), old, old);
  };
  const count = async () => (await db.select().from(schema.cacheIptvorgChannels)).length;

  it("rebuilds the table only when a file changed", async () => {
    serve();
    await expect(syncIptv()).resolves.toMatchObject({ iptv_updated: 0 }); // fresh copy, nothing asked
    await age();
    await expect(syncIptv()).resolves.toMatchObject({ iptv_channels: 9, iptv_updated: 1 });
  });

  it("keeps the previous copy when iptv-org is unreachable: no error, nothing rebuilt", async () => {
    await age();
    const down = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    vi.stubGlobal("fetch", down);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await expect(syncIptv()).resolves.toMatchObject({ iptv_channels: 9, iptv_updated: 0 });
    } finally {
      warn.mockRestore();
    }
    expect(down).toHaveBeenCalled();
    expect(await count()).toBe(9);
  });

  it("a 304 renews the copy without rebuilding the table", async () => {
    await age();
    const notModified = vi.fn(async () => new Response(null, { status: 304 }));
    vi.stubGlobal("fetch", notModified);
    await expect(syncIptv()).resolves.toMatchObject({ iptv_channels: 9, iptv_updated: 0 });
    expect(notModified).toHaveBeenCalledTimes(2); // one conditional request per file
    expect(await count()).toBe(9);
    // The copy is fresh again: the next run does not even ask.
    notModified.mockClear();
    await syncIptv();
    expect(notModified).not.toHaveBeenCalled();
  });
});
