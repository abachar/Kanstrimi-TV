import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { sql } from "drizzle-orm";
import { resetDb, closeDb, seedCategories, seedItems } from "@/test/db";
import { db, schema } from "@/db";
import { setSecretsForTests } from "@/config";
import { run } from "@/catalog";
import { epgStat, runEpgRebuild } from "../epg";
import { compile, offsetOf, setOffset } from "../epg-offsets";
import { guideNameKey } from "../epg-ids";
import { addEpgSource, deleteEpgSource, resolveEpgLinks, setEpgLink, updateEpgSource } from "../epg-sources";

/**
 * XMLTV time of tomorrow at `hh:mm` UTC: the import drops what is already over, so a fixed date
 * would turn these tests red the day after it.
 */
const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
const at = (hhmm: string) => `${tomorrow.replace(/-/g, "")}${hhmm}00 +0000`;
/** A guide with programmes for our channel, one for a channel we do not serve, tomorrow evening. */
const guide = (title: string) => `<?xml version="1.0" encoding="utf-8" ?><tv>
<programme start="${at("1800")}" stop="${at("1930")}" channel="TF1.fr"><title>${title}</title></programme>
<programme start="${at("1930")}" stop="${at("2100")}" channel="TF1.fr"><title>Suite</title></programme>
<programme start="${at("1800")}" stop="${at("1900")}" channel="Rai1.it"><title>Telegiornale</title></programme>
</tv>`;
/** The provider's guide, and the fallback sources' files by URL. */
const files = new Map<string, string | number>();
const serve = (body: string, status = 200) => {
  files.set("provider", status === 200 ? body : status);
  vi.stubGlobal("fetch", async (url: string) => {
    const f = files.get(String(url).startsWith("http://x/") ? "provider" : String(url)) ?? 404;
    return typeof f === "number" ? new Response(null, { status: f }) : new Response(f, { status: 200 });
  });
};
const stats = (channels: number, programmes: number, more: { fallbacks?: number; sourceErrors?: number } = {}) => ({
  channels,
  programmes,
  fallbacks: 0,
  sourceErrors: 0,
  ...more,
});
const rows = async () =>
  (
    await db
      .select({ title: schema.catalogEpgProgrammes.title, channel: schema.catalogEpgProgrammes.channelId })
      .from(schema.catalogEpgProgrammes)
      .orderBy(schema.catalogEpgProgrammes.startAt, schema.catalogEpgProgrammes.channelId)
  ).map((r) => `${r.channel}:${r.title}`);

beforeAll(async () => {
  await resetDb();
  setSecretsForTests({ xtream_url: "http://x", xtream_username: "u", xtream_password: "p" });
  await seedCategories([{ kind: "live", xtreamId: "20", name: "FRANCE | TV" }]);
  await seedItems([
    { kind: "live", xtreamId: "100", name: "|FR| TF1 HD", cat: "20", raw: { epg_channel_id: "TF1.fr" } },
    { kind: "live", xtreamId: "101", name: "|FR| SECRET", cat: "20", hiddenManual: true, raw: { epg_channel_id: "Secret.fr" } },
    { kind: "live", xtreamId: "102", name: "|FR| M6 HD", cat: "20", raw: { epg_channel_id: "M6.fr" } },
    // The provider names a guide for them but files no programme: the fallback sources complete them.
    { kind: "live", xtreamId: "103", name: "BEIN SPORTS 1", cat: "20", raw: { epg_channel_id: "beINSports1Fr.qa" } },
    { kind: "live", xtreamId: "104", name: "AL AOULA", cat: "20" },
  ]);
  expect(await run("group")).toBe(true);
  // Rows the pruning must drop: a programme long over, from an older import.
  await db.execute(sql`insert into catalog_epg_programmes (channel_id, start_at, end_at, title, imported_at)
    values ('TF1.fr', now() - interval '2 days', now() - interval '47 hours', 'Vieux', now() - interval '3 days')`);
});
afterAll(async () => {
  vi.unstubAllGlobals();
  await closeDb();
});

describe("EPG import", () => {
  it("stores the programmes of the visible channels only, and drops those over", async () => {
    serve(guide("Journal"));
    expect(await runEpgRebuild()).toEqual(stats(1, 2));
    expect(await rows()).toEqual(["TF1.fr:Journal", "TF1.fr:Suite"]);
    const stat = await epgStat();
    expect(stat).toMatchObject({ programmes: 2, channels: 1 });
    expect(stat.to).toContain(tomorrow);
  });

  it("keeps the previous guide when upstream fails or serves nothing for our channels", async () => {
    serve("", 503);
    await expect(runEpgRebuild()).rejects.toThrow("HTTP 503");
    serve(`<tv><programme start="${at("1800")}" stop="${at("1900")}" channel="Rai1.it"><title>x</title></programme></tv>`);
    await expect(runEpgRebuild()).rejects.toThrow("guide précédent conservé");
    expect(await rows()).toEqual(["TF1.fr:Journal", "TF1.fr:Suite"]);
  });

  it("keeps the previous guide whole when the download breaks midway", async () => {
    // More than one batch of programmes lands before the cut: none of them may stay.
    const many = Array.from({ length: 1500 }, (_, i) => {
      const t = (m: number) => new Date(Date.now() + 86_400_000 + m * 60_000).toISOString().replace(/[-:T]/g, "").slice(0, 14);
      return `<programme start="${t(i)} +0000" stop="${t(i + 1)} +0000" channel="TF1.fr"><title>Flash ${i}</title></programme>`;
    }).join("");
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode(`<?xml version="1.0"?><tv>${many}`));
        c.error(new Error("connexion coupée"));
      },
    });
    vi.stubGlobal("fetch", async () => new Response(body, { status: 200 }));
    await expect(runEpgRebuild()).rejects.toThrow("connexion coupée");
    expect(await rows()).toEqual(["TF1.fr:Journal", "TF1.fr:Suite"]);
  });

  it("replaces, channel by channel, what the next import brings", async () => {
    serve(guide("Journal du soir"));
    expect(await runEpgRebuild()).toEqual(stats(1, 2));
    expect(await rows()).toEqual(["TF1.fr:Journal du soir", "TF1.fr:Suite"]);
  });
});

describe("EPG time corrections", () => {
  it("prefers the channel's own rule to its suffix's, the longest suffix first; a source's channel takes its source's", () => {
    const rules = compile(
      [
        { pattern: "*.qa", minutes: -180 },
        { pattern: "beINSports3.qa", minutes: -120 },
        { pattern: "@3/beIN SPORTS 3.qa", minutes: 30 },
      ],
      [{ id: 3, offsetMinutes: 60 }],
    );
    expect(offsetOf(rules, "beinsports3.QA")).toBe(-120);
    expect(offsetOf(rules, "beINSports1.qa")).toBe(-180);
    expect(offsetOf(rules, "TF1.fr")).toBe(0);
    expect(offsetOf(rules, "@3/beIN SPORTS 1.qa")).toBe(60);
    expect(offsetOf(rules, "@3/beIN SPORTS 3.qa")).toBe(30);
    expect(offsetOf(rules, "@4/beIN SPORTS 1.qa")).toBe(0);
  });

  it("shifts the stored guide at once, then at every import; a duplicate programme is kept once", async () => {
    const times = async () =>
      (await db.select().from(schema.catalogEpgProgrammes).orderBy(schema.catalogEpgProgrammes.startAt)).map((r) => [
        r.startAt.toISOString().slice(11, 16),
        r.offsetMinutes,
      ]);
    expect(await times()).toEqual([
      ["18:00", 0],
      ["19:30", 0],
    ]);
    expect(await setOffset("*.fr", -180)).toBe(2);
    expect(await times()).toEqual([
      ["15:00", -180],
      ["16:30", -180],
    ]);
    // The provider lists the first programme twice.
    serve(
      guide("Journal").replace(
        "</tv>",
        `<programme start="${at("1800")}" stop="${at("1930")}" channel="TF1.fr"><title>Journal</title></programme></tv>`,
      ),
    );
    expect(await runEpgRebuild()).toEqual(stats(1, 2));
    expect(await times()).toEqual([
      ["15:00", -180],
      ["16:30", -180],
    ]);
    await setOffset("*.fr", 0);
    expect((await times())[0]).toEqual(["18:00", 0]);
    await expect(setOffset("*.fr", 7)).rejects.toThrow("Décalage invalide");
    await expect(setOffset("pas un id", 60)).rejects.toThrow("Règle invalide");
  });
});

describe("EPG merge", () => {
  it("keeps the programmes of a channel the next import leaves out, until they are over", async () => {
    const m6 = `<programme start="${at("1800")}" stop="${at("1900")}" channel="M6.fr"><title>Le 1945</title></programme></tv>`;
    serve(guide("Journal").replace("</tv>", m6));
    expect(await runEpgRebuild()).toEqual(stats(2, 3));
    serve(guide("Journal de 20 h"));
    expect(await runEpgRebuild()).toEqual(stats(1, 2));
    expect(await rows()).toEqual(["M6.fr:Le 1945", "TF1.fr:Journal de 20 h", "TF1.fr:Suite"]);
  });
});

describe("EPG fallback sources", () => {
  const URL = "https://epg.test/files/qatar1.xml";
  const qatar = `<tv>
<channel id="beIN SPORTS 1.qa"><display-name>beIN SPORTS 1</display-name></channel>
<channel id="beIN SPORTS1 DIGITAL.qa"><display-name>beIN SPORTS1 DIGITAL</display-name></channel>
<channel id="Al Aoula.ma"><display-name>Al Aoula</display-name></channel>
<channel id="TF1.qa"><display-name>TF1</display-name></channel>
<channel id="Vide.qa"><display-name>Vide</display-name></channel>
<programme start="${at("1800")}" stop="${at("2000")}" channel="beIN SPORTS 1.qa"><title>Ligue des champions</title></programme>
<programme start="${at("2000")}" stop="${at("2200")}" channel="beIN SPORTS 1.qa"><title>Studio</title></programme>
<programme start="${at("1800")}" stop="${at("2000")}" channel="beIN SPORTS1 DIGITAL.qa"><title>Doublon numérique</title></programme>
<programme start="${at("1800")}" stop="${at("1900")}" channel="Al Aoula.ma"><title>Akhbar</title></programme>
<programme start="${at("1800")}" stop="${at("1900")}" channel="TF1.qa"><title>Autre TF1</title></programme>
</tv>`;
  let id = 0;
  const keyOf = async (title: string) => (await resolveEpgLinks()).contents.find((c) => c.title.includes(title))!.key;
  const fallbacks = async () =>
    Object.fromEntries(
      (
        await db
          .select({ title: schema.catalogContents.title, f: schema.catalogContents.epgFallbackId })
          .from(schema.catalogContents)
          .where(sql`${schema.catalogContents.epgFallbackId} is not null`)
      ).map((r) => [r.title, r.f]),
    );
  const sourceRows = async () => (await rows()).filter((r) => r.startsWith("@"));

  it("finds a channel by its name or id without accents, country, quality or parentheses", () => {
    for (const n of ["BEIN SPORTS MAX 1 (A)", "beIN SPORTS MAX 1.qa", "beINSportsMax1.qa", "|AR| beIN SPORTS MAX 1 HD"])
      expect(guideNameKey(n), n).toBe("beinsportsmax1");
    expect(guideNameKey("Laâyoune.ma")).toBe(guideNameKey("LAAYOUNE"));
    expect(guideNameKey("FR - TF1 FHD")).toBe("tf1");
    expect(guideNameKey("beIN SPORTS1 ENGLISH Digital.qa")).toBe("beinsports1en");
  });

  it("completes, by name, the visible channels the provider leaves without programmes", async () => {
    const s = await addEpgSource({ url: URL });
    id = s.id;
    expect(s).toMatchObject({ name: "qatar1", enabled: true, position: 0 });
    await expect(addEpgSource({ url: URL })).rejects.toThrow("déjà une source");
    await expect(addEpgSource({ url: "ftp://epg.test/x.xml" })).rejects.toThrow("http ou https");
    files.set(URL, qatar);
    serve(guide("Journal"));
    expect(await runEpgRebuild()).toEqual(stats(3, 5, { fallbacks: 2 }));
    // TF1 has the provider's guide: « TF1.qa » is not taken. beIN takes the channel of its name with the most programmes.
    expect(await fallbacks()).toEqual({ "BEIN SPORTS 1": `@${id}/beIN SPORTS 1.qa`, "AL AOULA": `@${id}/Al Aoula.ma` });
    expect(await sourceRows()).toEqual([
      `@${id}/Al Aoula.ma:Akhbar`,
      `@${id}/beIN SPORTS 1.qa:Ligue des champions`,
      `@${id}/beIN SPORTS 1.qa:Studio`,
    ]);
    const [src] = await db.select().from(schema.curationEpgSources);
    expect(src).toMatchObject({ channelCount: 5, fetchError: null });
    expect(src.fetchedAt).not.toBeNull();
  });

  it("holds the admin's choices: a channel of the file, none, back to the name", async () => {
    const bein = await keyOf("BEIN SPORTS 1");
    const aoula = await keyOf("AL AOULA");
    const tf1 = await keyOf("TF1");
    await expect(setEpgLink(id, bein, "Inconnue.qa")).rejects.toThrow("n'est pas une chaîne de cette source");
    // A channel without programmes gives no guide; a choice holds even where the provider has one.
    await setEpgLink(id, bein, "Vide.qa");
    await setEpgLink(id, aoula, null);
    await setEpgLink(id, tf1, "TF1.qa");
    const res = await resolveEpgLinks();
    expect(res.links.get(id)?.get(bein)).toEqual({ channelId: "Vide.qa", manual: true });
    expect(res.refused.get(id)?.has(aoula)).toBe(true);
    expect(Object.values(await fallbacks())).toEqual([`@${id}/TF1.qa`]);
    await setEpgLink(id, bein, "auto");
    await setEpgLink(id, aoula, "auto");
    await setEpgLink(id, tf1, "auto");
    expect(Object.keys(await fallbacks()).sort()).toEqual(["AL AOULA", "BEIN SPORTS 1"]);
  });

  it("shifts a whole source, keeps its guide when it fails, and drops it once disabled or deleted", async () => {
    const start = async () =>
      (
        await db
          .select()
          .from(schema.catalogEpgProgrammes)
          .where(sql`channel_id = ${`@${id}/Al Aoula.ma`}`)
      )[0]?.startAt
        .toISOString()
        .slice(11, 16);
    expect(await start()).toBe("18:00");
    await updateEpgSource(id, { name: "Qatar", url: URL, enabled: true, offsetMinutes: -180 });
    expect(await start()).toBe("15:00");
    // A provider's suffix rule leaves a source's guide alone.
    expect(offsetOf(compile([{ pattern: "*.ma", minutes: 60 }], [{ id, offsetMinutes: -180 }]), `@${id}/Al Aoula.ma`)).toBe(-180);
    files.set(URL, 500);
    expect(await runEpgRebuild()).toEqual(stats(1, 2, { fallbacks: 2, sourceErrors: 1 }));
    expect(await sourceRows()).toHaveLength(3);
    expect((await db.select().from(schema.curationEpgSources))[0].fetchError).toContain("HTTP 500");
    await updateEpgSource(id, { name: "Qatar", url: URL, enabled: false, offsetMinutes: -180 });
    expect(await fallbacks()).toEqual({});
    await runEpgRebuild();
    expect(await sourceRows()).toEqual([]);
    await deleteEpgSource(id);
    expect(await db.select().from(schema.catalogEpgSourceChannels)).toEqual([]);
  });
});
