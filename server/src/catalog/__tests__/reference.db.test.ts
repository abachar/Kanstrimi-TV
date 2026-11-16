import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { inArray } from "drizzle-orm";
import { db, schema, variants as vr } from "@/db";
import { env } from "@/shared";
import { suggestChannels } from "@/providers/claude";
import { PROFILE, resetDb, closeDb, seedCategories, seedItems, groupAndFilter, contentOfKey } from "@/test/db";
import { isOurs, referenceOf, runChannels } from "../channels";
import { runNaming } from "../grouping/group";
import {
  attachName,
  ChannelError,
  contentChannel,
  createChannel,
  deleteChannel,
  nameCandidates,
  updateChannel,
  watchedMarkets,
  watchedPlaces,
} from "../reference";
import { countLiveChannels, liveChannels, liveTree } from "../live-tree";
import { compileQuery } from "../query";

/** A search of the Live screen, as the tree takes it. */
const search = (q: string) => compileQuery(q, { kind: "live", lang: "fr-FR" });

/** The channels the admin said something of, as it edits them. */
const ourChannels = async () => (await db.select().from(schema.catalogChannels).where(isOurs)).map(referenceOf);

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

const variants = async () => db.select().from(vr).orderBy(vr.upstreamId);
const by = async (xtreamId: string) => (await variants()).find((v) => v.upstreamId === xtreamId)!;
const keysOf = async (xtreamIds: string[]) => (await variants()).filter((v) => xtreamIds.includes(v.upstreamId)).map((v) => v.contentKey);

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
    { kind: "live", upstreamId: "1", name: "AR - BEIN SPORTS 1 HD", cat: "30" },
    { kind: "live", upstreamId: "2", name: "AR - BEIN SPORTS 1 LQ", cat: "30" },
    { kind: "live", upstreamId: "3", name: "BEIN SPORTS 1 Gᵁᴴᴰ", cat: "30" },
    { kind: "live", upstreamId: "4", name: "FR - BEIN SPORTS 1 FHD+", cat: "35" },
    // Morocco, as three providers write it.
    { kind: "live", upstreamId: "5", name: "|MA| 2M MAROC FHD", cat: "33" },
    { kind: "live", upstreamId: "6", name: "MA - TAMAZIGHT HD", cat: "31" },
    { kind: "live", upstreamId: "7", name: "MA - TNT AL OULA FHD", cat: "31" },
    // A sub-prefix that is no country, a radio named like a channel, an event feed, a channel iptv-org spells otherwise.
    { kind: "live", upstreamId: "8", name: "CH - CHEF OMAR 1", cat: "32" },
    { kind: "live", upstreamId: "9", name: "|MA| 2M MAROC", cat: "34" },
    { kind: "live", upstreamId: "10", name: "FR - CANAL+ LIVE 3", cat: "35" },
    { kind: "live", upstreamId: "11", name: "FR - AUTOMOTO FHD", cat: "35" },
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
    const ar = await contentOfKey("live:ar-bein-sports-1");
    expect(ar).toMatchObject({ title: "beIN Sports 1", sourceCount: 2, themes: ["Sport"], country: null }); // filed under a theme: pan-Arab
  });

  it("leaves what it does not know to itself: an event feed, a radio, a name of the provider's own", async () => {
    expect(await by("10")).toMatchObject({ channelName: null, theme: "Événements", contentKey: "live:x:fr-canal-live-3" });
    expect(await by("9")).toMatchObject({ channelName: null, iptvId: null, theme: "Non reconnus" }); // the radio of 2M is not 2M
    expect(await by("3")).toMatchObject({ channelName: null, theme: "Non reconnus", contentKey: "live:x:ar-bein-sports-1-g" });
    expect(await by("11")).toMatchObject({ channelName: null, theme: "Non reconnus" });
  });
});

describe("the live catalogue is one tree", () => {
  it("country or region, then theme, with what each branch counts; and what the household watches", async () => {
    const tree = await liveTree(null);
    expect(tree.map((m) => [m.place, m.channels, m.visible, m.themes.map((t) => [t.theme, t.channels])])).toEqual([
      // Morocco: 2M, Tamazight TV; two names wait there, the radio of 2M among them.
      [
        "MA",
        4,
        4,
        [
          ["Généralistes", 2],
          ["Non reconnus", 2],
        ],
      ], // a filter-less profile gets everything
      // The region's own: beIN Sports 1 is pan-Arab, two names wait.
      [
        "~ar",
        3,
        3,
        [
          ["Sport", 1],
          ["Non reconnus", 2],
        ],
      ],
      // A French list whose only known channel is Qatar's: the reference cannot call it France.
      [
        "~fr",
        3,
        3,
        [
          ["Sport", 1],
          ["Événements", 1],
          ["Non reconnus", 1],
        ],
      ],
    ]);
    expect(await watchedMarkets()).toEqual(["ar", "fr"]);
    expect(await watchedPlaces()).toEqual({ countries: [], regions: ["ar", "fr"] }); // « ar » is a region whatever its channels' countries
    expect(await countLiveChannels(search('région:"ar"'))).toBe(7); // Morocco is in it
    expect(await countLiveChannels(search('région:"ar" && pays:aucun'))).toBe(3);
    expect(await countLiveChannels(search("pays:maroc"))).toBe(4);
    // A search prunes it: the branches that hold nothing of it are gone.
    const sport = await liveTree(search("thème:sport"));
    expect(sport.map((m) => [m.place, m.themes.map((t) => t.theme)])).toEqual([
      ["~ar", ["Sport"]],
      ["~fr", ["Sport"]],
    ]);
    expect(await countLiveChannels(search("thème:sport"))).toBe(2);
    expect(await countLiveChannels(search("profil:hakim"))).toBe(10);
    expect(await countLiveChannels(search("profil:aucun"))).toBe(0);
  });

  it("lists a branch's channels, and says of a content what it is in the reference", async () => {
    const rows = await liveChannels(search('région:"ar" && -thème:"non reconnus"'), { offset: 0, limit: 10 });
    expect(rows.map((c) => [c.name, c.country, c.theme, c.streams, c.visible, c.status])).toEqual([
      ["2M", "MA", "Généralistes", 1, true, "known"],
      ["beIN Sports 1", null, "Sport", 2, true, "known"],
      ["Tamazight TV", "MA", "Généralistes", 1, true, "known"],
    ]);
    expect((await liveChannels(null, { place: "~ar", theme: "Sport", offset: 0, limit: 10 })).map((c) => c.name)).toEqual([
      "beIN Sports 1",
    ]);
    expect(await liveChannels(null, { place: "~ar", theme: "Sport", offset: 1, limit: 10 })).toEqual([]);
    const bein = rows.find((c) => c.name === "beIN Sports 1")!;
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
  it("are channels of the tree under « Non reconnus » and « Événements », with the closest channels of the reference", async () => {
    const left = await liveChannels(null, { place: "~fr", theme: "Non reconnus", offset: 0, limit: 10 });
    expect(left).toHaveLength(1);
    expect(left[0]).toMatchObject({
      name: "AUTOMOTO",
      status: "unknown",
      streams: 1,
      sample: "FR - AUTOMOTO FHD",
      category: "|EU| FRANCE SPORTS",
    });
    expect(left[0].suggestions.map((c) => c.ref)).toEqual(["iptv:Automotolachaine.fr"]);
    expect((await liveChannels(null, { place: "~fr", theme: "Événements", offset: 0, limit: 10 })).map((r) => r.name)).toEqual([
      "CANAL+ LIVE 3",
    ]);
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
    await db.insert(schema.catalogChannelGuides).values({ sourceId: source.id, channelId: (await contentOfKey(old)).id, guideId: "bein1" });
    expect(await attachName("ar", "BEIN SPORTS 1 G", "iptv:beINSports1.qa")).toBe("beIN Sports 1");
    expect(
      (await db.select().from(schema.appLiveWatch).orderBy(schema.appLiveWatch.day)).map((w) => [w.contentKey, w.day, w.seconds]),
    ).toEqual([
      ["live:ar-bein-sports-1", "2026-11-10", 90],
      ["live:ar-bein-sports-1", "2026-11-11", 40],
    ]);
    expect((await db.select().from(schema.catalogChannelGuides)).map((l) => [l.channelId, l.guideId])).toEqual([
      [(await contentOfKey("live:ar-bein-sports-1")).id, "bein1"],
    ]);
    expect(await by("3")).toMatchObject({
      channelName: "beIN Sports 1",
      how: "alias",
      contentKey: "live:ar-bein-sports-1",
      theme: "Sport",
    });
    const [ours] = await ourChannels();
    expect(ours).toMatchObject({
      name: "beIN Sports 1",
      market: "ar",
      iptvId: "beINSports1.qa",
      aliases: ["BEIN SPORTS 1 G"],
      country: null,
      theme: null,
    });
    expect((await variants()).filter((v) => v.channelId === ours.id).map((v) => v.upstreamId)).toEqual(["1", "2", "3"]);
    expect((await db.select().from(schema.appFavorites)).map((f) => f.contentKey)).toEqual(["live:ar-bein-sports-1"]);
    // The next run keeps it, and nothing of the market is left to attach.
    serve();
    await runChannels();
    expect((await by("3")).how).toBe("alias");
    expect(await countLiveChannels(search('bein && thème:"non reconnus" && région:"ar"'))).toBe(0);
  });

  it("takes a channel of ours for what iptv-org does not know, and what we say of it", async () => {
    const id = await createChannel({ name: "Automoto", market: "fr", country: null, theme: "Sport", aliases: ["AUTOMOTO"], iptvId: null });
    expect(await by("11")).toMatchObject({
      channelName: "Automoto",
      channelId: id,
      how: "alias",
      theme: "Sport",
      contentKey: "live:fr-automoto",
    });
    // Ours completes an iptv-org channel: its theme and its country are what we say.
    const bein = (await ourChannels()).find((c) => c.market === "ar")!;
    await updateChannel(bein.id, { ...bein, theme: "Cinéma", country: "QA" });
    expect(await by("1")).toMatchObject({ channelId: bein.id, theme: "Cinéma", country: "QA", contentKey: "live:ar-bein-sports-1" });
    await updateChannel(bein.id, { ...bein, theme: null, country: "" });
    expect(await by("1")).toMatchObject({ theme: "Sport", country: null });
    await deleteChannel(id);
    expect(await by("11")).toMatchObject({ channelName: null, theme: "Non reconnus" });
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
      how: "ai",
      country: "MA",
    });
    // What Claude read stays on the name it read it in: the same name is not asked again.
    const [read] = await db
      .select()
      .from(schema.catalogChannels)
      .where(inArray(schema.catalogChannels.aiName, ["Al Aoula"]));
    expect(read).toMatchObject({ aiKind: "channel", status: "unknown", key: "live:x:ar-tnt-al-oula" });
    expect(await by("8")).toMatchObject({ channelName: null, aiTitle: "Chef Omar TV", theme: "Non reconnus" }); // named, but not in the reference
    expect(await by("11")).toMatchObject({ channelName: null, aiKind: "event", theme: "Événements" });
    // Each name is asked once.
    vi.mocked(suggestChannels).mockClear();
    serve();
    await runChannels();
    expect(suggestChannels).not.toHaveBeenCalled();
    expect((await by("7")).how).toBe("ai");
  });
});

describe("a channel of ours is a channel", () => {
  it("is renamed in place, what the profile recorded following its key", async () => {
    const bein = (await ourChannels()).find((c) => c.market === "ar")!;
    const before = await contentOfKey("live:ar-bein-sports-1");
    await updateChannel(bein.id, { ...bein, name: "beIN Sports One" });
    expect(await contentOfKey("live:ar-bein-sports-one")).toMatchObject({ id: before.id, title: "beIN Sports One", sourceCount: 3 });
    expect(await contentOfKey("live:ar-bein-sports-1")).toBeUndefined();
    expect((await db.select().from(schema.appFavorites)).map((f) => f.contentKey)).toEqual(["live:ar-bein-sports-one"]);
  });

  it("stays when no provider lists it any more, with nothing to play; a channel nobody said anything of goes", async () => {
    const bein = (await ourChannels()).find((c) => c.market === "ar")!;
    const chef = (await by("8")).contentKey!; // a name Claude has read
    const radio = (await by("9")).contentKey!; // a name nobody said or read anything of
    expect(await contentOfKey(radio)).toBeDefined();
    await db.delete(schema.xtreamStreams).where(inArray(schema.xtreamStreams.upstreamId, ["1", "2", "3", "8", "9"]));
    await groupAndFilter();
    expect(await contentOfKey("live:ar-bein-sports-one")).toMatchObject({ id: bein.id, sourceCount: 0, visible: false });
    expect((await ourChannels()).find((c) => c.id === bein.id)?.aliases).toEqual(["BEIN SPORTS 1 G"]);
    expect(await contentOfKey(radio)).toBeUndefined();
    expect(await contentOfKey(chef)).toMatchObject({ sourceCount: 0, visible: false }); // kept: its name is not asked again
    // Its streams back: the same channel plays again.
    await seedItems([{ kind: "live", upstreamId: "3", name: "BEIN SPORTS 1 Gᵁᴴᴰ", cat: "30" }]);
    await runNaming();
    serve();
    await runChannels();
    await groupAndFilter();
    expect(await contentOfKey("live:ar-bein-sports-one")).toMatchObject({ id: bein.id, sourceCount: 1, visible: true });
  });
});
