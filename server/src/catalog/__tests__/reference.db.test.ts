import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db, schema, variants as vr } from "@/db";
import { env } from "@/shared";
import { suggestChannels } from "@/providers/claude";
import { PROFILE, resetDb, closeDb, seedCategories, seedItems, groupAndFilter } from "@/test/db";
import { runChannels } from "../channels";
import { runNaming } from "../grouping/group";
import {
  attachName,
  ChannelError,
  contentChannel,
  createChannel,
  deleteChannel,
  listChannels,
  liveSummary,
  nameCandidates,
  unmatchedNames,
  updateChannel,
} from "../reference";

/** Claude answers only where a test makes it: without a key it answers null, as here. */
vi.mock("@/providers/claude", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/providers/claude")>()),
  suggestChannels: vi.fn(async () => null),
}));

const CHANNELS = [
  { id: "beINSports1.qa", name: "beIN Sports 1", alt_names: [], country: "QA", categories: ["sports"], is_nsfw: false },
  { id: "2M.ma", name: "2M", alt_names: ["2M National"], country: "MA", categories: ["general"], is_nsfw: false },
  { id: "AlAoula.ma", name: "Al Aoula", alt_names: [], country: "MA", categories: ["general"], is_nsfw: false },
  { id: "TamazightTV.ma", name: "Tamazight TV", alt_names: [], country: "MA", categories: ["general"], is_nsfw: false },
  { id: "TVTamazight.dz", name: "TV Tamazight", alt_names: [], country: "DZ", categories: ["general"], is_nsfw: false },
  { id: "Automotolachaine.fr", name: "Automoto la chaine", alt_names: [], country: "FR", categories: ["auto"], is_nsfw: false },
];

function serve() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const body = String(url).endsWith("/channels.json") ? CHANNELS : String(url).endsWith("/logos.json") ? [] : null;
      return body ? new Response(JSON.stringify(body), { headers: { etag: '"v1"' } }) : new Response("", { status: 404 });
    }),
  );
}

const variants = async () => db.select().from(vr).orderBy(vr.xtreamId);
const by = async (xtreamId: string) => (await variants()).find((v) => v.xtreamId === xtreamId)!;
const keysOf = async (xtreamIds: string[]) => (await variants()).filter((v) => xtreamIds.includes(v.xtreamId)).map((v) => v.contentKey);

beforeAll(async () => {
  await resetDb();
  fs.rmSync(path.join(env.dataDir, "iptv-org"), { recursive: true, force: true });
  await seedCategories([
    { kind: "live", xtreamId: "30", name: "|AR| BEIN SPORTS 4K" },
    { kind: "live", xtreamId: "31", name: "|AR| MOROCCO" },
    { kind: "live", xtreamId: "32", name: "|AR| CHEF OMAR" },
    { kind: "live", xtreamId: "33", name: "TV ║ MAGHREB" },
    { kind: "live", xtreamId: "34", name: "TV ║ RADIOS" },
    { kind: "live", xtreamId: "35", name: "|EU| FRANCE SPORTS" },
  ]);
  await seedItems([
    // One channel, four spellings of two providers, in two markets.
    { kind: "live", xtreamId: "1", name: "AR - BEIN SPORTS 1 HD", cat: "30" },
    { kind: "live", xtreamId: "2", name: "AR - BEIN SPORTS 1 LQ", cat: "30" },
    { kind: "live", xtreamId: "3", name: "BEIN SPORTS 1 Gᵁᴴᴰ", cat: "30" },
    { kind: "live", xtreamId: "4", name: "FR - BEIN SPORTS 1 FHD+", cat: "35" },
    // Morocco, as three providers write it.
    { kind: "live", xtreamId: "5", name: "|MA| 2M MAROC FHD", cat: "33" },
    { kind: "live", xtreamId: "6", name: "MA - TAMAZIGHT HD", cat: "31" },
    { kind: "live", xtreamId: "7", name: "MA - TNT AL OULA FHD", cat: "31" },
    // A sub-prefix that is no country, a radio named like a channel, an event feed, a channel iptv-org spells otherwise.
    { kind: "live", xtreamId: "8", name: "CH - CHEF OMAR 1", cat: "32" },
    { kind: "live", xtreamId: "9", name: "|MA| 2M MAROC", cat: "34" },
    { kind: "live", xtreamId: "10", name: "FR - CANAL+ LIVE 3", cat: "35" },
    { kind: "live", xtreamId: "11", name: "FR - AUTOMOTO FHD", cat: "35" },
  ]);
  await runNaming();
  serve();
  await runChannels();
  await groupAndFilter();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(suggestChannels).mockClear();
});
afterAll(closeDb);

describe("the reference gives a channel its identity", () => {
  it("lists a region's channels under it, with the country their prefix names", async () => {
    expect([await by("5"), await by("6"), await by("8")].map((v) => [v.market, v.nameCountry])).toEqual([
      ["ar", "MA"],
      ["ar", "MA"],
      ["ar", null],
    ]);
    // « TAMAZIGHT » is two channels of the region: the prefix says which.
    expect(await by("6")).toMatchObject({ iptvId: "TamazightTV.ma", channelName: "Tamazight TV", country: "MA" });
    expect(await by("5")).toMatchObject({ iptvId: "2M.ma", channelName: "2M", country: "MA", theme: "Généralistes" });
  });

  it("gathers every spelling of a channel in one content per market, under its reference name", async () => {
    expect(await keysOf(["1", "2"])).toEqual(["live:ar-bein-sports-1", "live:ar-bein-sports-1"]);
    expect(await keysOf(["4"])).toEqual(["live:fr-bein-sports-1"]); // the same channel, as France lists it
    const [ar] = await db.select().from(schema.catalogContents).where(eq(schema.catalogContents.key, "live:ar-bein-sports-1"));
    expect(ar).toMatchObject({ title: "beIN Sports 1", variantCount: 2, themes: ["Sport"], country: null }); // filed under a theme: pan-Arab
  });

  it("leaves what it does not know to itself: an event feed, a radio, a name of the provider's own", async () => {
    expect(await by("10")).toMatchObject({ channelName: null, theme: "Événements", contentKey: "live:x:fr-canal-live-3" });
    expect(await by("9")).toMatchObject({ channelName: null, iptvId: null, theme: "Non reconnus" }); // the radio of 2M is not 2M
    expect(await by("3")).toMatchObject({ channelName: null, theme: "Non reconnus", contentKey: "live:x:ar-bein-sports-1-g" });
    expect(await by("11")).toMatchObject({ channelName: null, theme: "Non reconnus" });
  });
});

describe("the live catalogue at a glance", () => {
  it("counts per market the channels, the names left and the event feeds, and what the profile is shown", async () => {
    const { markets, shown } = await liveSummary(PROFILE);
    expect(markets.map((m) => [m.market, m.channels, m.unknown, m.events, m.watched])).toEqual([
      ["ar", 3, 4, 0, true], // beIN Sports 1, 2M, Tamazight TV; four names wait, the radio of 2M among them
      ["fr", 1, 1, 1, true],
    ]);
    expect(shown).toBe(10); // a filter-less profile gets everything, the unknown ones included
  });

  it("lists a market's channels, and says of a content what it is in the reference", async () => {
    const { rows, total } = await listChannels({ market: "ar", page: 1, size: 10 });
    expect(total).toBe(3);
    expect(rows.map((c) => [c.title, c.country, c.themes, c.versions, c.visible])).toEqual([
      ["2M", "MA", ["Généralistes"], 1, true],
      ["beIN Sports 1", null, ["Sport"], 2, true],
      ["Tamazight TV", "MA", ["Généralistes"], 1, true],
    ]);
    const bein = rows.find((c) => c.title === "beIN Sports 1")!;
    expect(await contentChannel(bein.id)).toMatchObject({ market: "ar", name: "beIN Sports 1", iptv: { id: "beINSports1.qa" }, own: null });
    const unknown = (await by("3")).contentId!;
    expect(await contentChannel(unknown)).toMatchObject({
      name: null,
      iptv: null,
      own: null,
      title: "BEIN SPORTS 1 G",
      variantId: (await by("3")).id,
    });
  });
});

describe("names left to attach", () => {
  it("lists them by market with the closest channels of the reference", async () => {
    const { rows, total } = await unmatchedNames({ market: "fr", events: false, page: 1, size: 10 });
    expect(total).toBe(1);
    expect(rows[0]).toMatchObject({ title: "AUTOMOTO", variants: 1, category: "|EU| FRANCE SPORTS" });
    expect(rows[0].suggestions.map((c) => c.ref)).toEqual(["iptv:Automotolachaine.fr"]);
    expect((await unmatchedNames({ market: "fr", events: true, page: 1, size: 10 })).rows.map((r) => r.title)).toEqual(["CANAL+ LIVE 3"]);
    // A search reaches the whole reference, whatever the country.
    expect((await nameCandidates("fr", "AUTOMOTO", "bein")).map((c) => c.ref)).toEqual(["iptv:beINSports1.qa"]);
  });

  it("attaches a name once for every provider, and the profile's marks follow the channel", async () => {
    const old = "live:x:ar-bein-sports-1-g";
    await db.insert(schema.appFavorites).values({ profileId: PROFILE, contentKey: old });
    // Time watched the same day under both keys adds up; a guide linked by hand follows too.
    await db.insert(schema.appLiveWatch).values([
      { profileId: PROFILE, contentKey: old, day: "2026-11-10", seconds: 60 },
      { profileId: PROFILE, contentKey: "live:ar-bein-sports-1", day: "2026-11-10", seconds: 30 },
      { profileId: PROFILE, contentKey: old, day: "2026-11-11", seconds: 40 },
    ]);
    const [source] = await db.insert(schema.settingsEpgSources).values({ name: "s", url: "https://epg.test/s.xml" }).returning();
    await db.insert(schema.curationEpgLinks).values({ sourceId: source.id, contentKey: old, channelId: "bein1" });
    expect(await attachName("ar", "BEIN SPORTS 1 G", "iptv:beINSports1.qa")).toBe("beIN Sports 1");
    expect(
      (await db.select().from(schema.appLiveWatch).orderBy(schema.appLiveWatch.day)).map((w) => [w.contentKey, w.day, w.seconds]),
    ).toEqual([
      ["live:ar-bein-sports-1", "2026-11-10", 90],
      ["live:ar-bein-sports-1", "2026-11-11", 40],
    ]);
    expect((await db.select().from(schema.curationEpgLinks)).map((l) => l.contentKey)).toEqual(["live:ar-bein-sports-1"]);
    expect(await by("3")).toMatchObject({
      channelName: "beIN Sports 1",
      iptvMatch: "alias",
      contentKey: "live:ar-bein-sports-1",
      theme: "Sport",
    });
    const [ours] = await db.select().from(schema.curationChannels);
    expect(ours).toMatchObject({
      name: "beIN Sports 1",
      market: "ar",
      iptvId: "beINSports1.qa",
      aliases: ["BEIN SPORTS 1 G"],
      country: null,
      theme: null,
    });
    expect((await variants()).filter((v) => v.channelId === ours.id).map((v) => v.xtreamId)).toEqual(["1", "2", "3"]);
    expect((await db.select().from(schema.appFavorites)).map((f) => f.contentKey)).toEqual(["live:ar-bein-sports-1"]);
    // The next run keeps it, and nothing of the market is left to attach.
    serve();
    await runChannels();
    expect((await by("3")).iptvMatch).toBe("alias");
    expect((await unmatchedNames({ market: "ar", events: false, q: "BEIN", page: 1, size: 10 })).total).toBe(0);
  });

  it("takes a channel of ours for what iptv-org does not know, and what we say of it", async () => {
    const id = await createChannel({ name: "Automoto", market: "fr", country: null, theme: "Sport", aliases: ["AUTOMOTO"], iptvId: null });
    expect(await by("11")).toMatchObject({
      channelName: "Automoto",
      channelId: id,
      iptvMatch: "alias",
      theme: "Sport",
      contentKey: "live:fr-automoto",
    });
    // Ours completes an iptv-org channel: its theme and its country are what we say.
    const [bein] = await db.select().from(schema.curationChannels).where(eq(schema.curationChannels.market, "ar"));
    await updateChannel(bein.id, { ...bein, theme: "Cinéma", country: "QA" });
    expect(await by("1")).toMatchObject({ channelId: bein.id, theme: "Cinéma", country: "QA", contentKey: "live:ar-bein-sports-1" });
    await updateChannel(bein.id, { ...bein, theme: null, country: "" });
    expect(await by("1")).toMatchObject({ theme: "Sport", country: null });
    await deleteChannel(id);
    expect(await by("11")).toMatchObject({ channelName: null, channelId: null, theme: "Non reconnus" });
  });

  it("refuses a name that would designate two channels, an unknown iptv-org channel, a country outside the region", async () => {
    const input = { name: "Chef Omar", market: "ar", country: null, theme: null, aliases: [], iptvId: null };
    await expect(createChannel({ ...input, name: "beIN SPORTS 1" })).rejects.toThrow(ChannelError);
    await expect(createChannel({ ...input, aliases: ["BEIN SPORTS 1 G"] })).rejects.toThrow(/déjà un nom de « beIN Sports 1 »/);
    await expect(createChannel({ ...input, iptvId: "Nope.xx" })).rejects.toThrow(/inconnue/);
    await expect(createChannel({ ...input, country: "FR" })).rejects.toThrow(/pays de ce marché/);
    await expect(createChannel({ ...input, market: "fr", country: "MA" })).rejects.toThrow(/marché régional/);
    await expect(attachName("ar", "X", "own:999")).rejects.toThrow(/introuvable/);
  });
});

describe("Claude reads what is left", () => {
  it("asks once per name of a watched market, and takes its answer only when the reference holds that channel", async () => {
    vi.mocked(suggestChannels).mockImplementation(async (queries) =>
      queries.map((q) =>
        q.name.includes("AL OULA")
          ? { id: q.id, kind: "channel" as const, name: "Al Aoula" }
          : q.name.includes("CHEF")
            ? { id: q.id, kind: "channel" as const, name: "Chef Omar TV" }
            : { id: q.id, kind: "event" as const, name: null },
      ),
    );
    serve();
    const stats = await runChannels();
    const asked = vi.mocked(suggestChannels).mock.calls;
    // The radio and the event feed are not asked about; « ar » and « fr » each get their reference list.
    expect(asked.map(([queries]) => queries.map((q) => q.name)).sort()).toEqual(
      [["FR - AUTOMOTO FHD"], ["MA - TNT AL OULA FHD", "CH - CHEF OMAR 1"]].sort(),
    );
    expect(asked.find(([queries]) => queries[0].market === "ar")![1]).toEqual(expect.arrayContaining(["beIN Sports 1", "Al Aoula", "2M"]));
    expect(stats).toMatchObject({ ai_asked: 3, ai_channels: 2, ai_events: 1, iptv_by_ai: 1 });
    expect(await by("7")).toMatchObject({
      channelName: "Al Aoula",
      iptvId: "AlAoula.ma",
      iptvMatch: "ai",
      country: "MA",
      aiKind: "channel",
    });
    expect(await by("8")).toMatchObject({ channelName: null, aiTitle: "Chef Omar TV", theme: "Non reconnus" }); // named, but not in the reference
    expect(await by("11")).toMatchObject({ channelName: null, aiKind: "event", theme: "Événements" });
    // Each name is asked once.
    vi.mocked(suggestChannels).mockClear();
    serve();
    await runChannels();
    expect(suggestChannels).not.toHaveBeenCalled();
    expect((await by("7")).iptvMatch).toBe("ai");
  });
});
