import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { sql } from "drizzle-orm";
import { resetDb, closeDb, seedCategories, seedItems } from "@/test/db";
import { db, schema } from "@/db";
import { setSecretsForTests } from "@/config";
import { run } from "@/catalog";
import { epgStat, runEpgRebuild } from "../epg";
import { compile, offsetOf, setOffset } from "../epg-offsets";

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
const serve = (body: string, status = 200) => vi.stubGlobal("fetch", async () => new Response(status === 200 ? body : null, { status }));
const rows = async () =>
  (
    await db
      .select({ title: schema.catalogEpgProgrammes.title, channel: schema.catalogEpgProgrammes.channelId })
      .from(schema.catalogEpgProgrammes)
      .orderBy(schema.catalogEpgProgrammes.startAt)
  ).map((r) => `${r.channel}:${r.title}`);

beforeAll(async () => {
  await resetDb();
  setSecretsForTests({ xtream_url: "http://x", xtream_username: "u", xtream_password: "p" });
  await seedCategories([{ kind: "live", xtreamId: "20", name: "FRANCE | TV" }]);
  await seedItems([
    { kind: "live", xtreamId: "100", name: "|FR| TF1 HD", cat: "20", raw: { epg_channel_id: "TF1.fr" } },
    { kind: "live", xtreamId: "101", name: "|FR| SECRET", cat: "20", hiddenManual: true, raw: { epg_channel_id: "Secret.fr" } },
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
  it("stores the programmes of the visible channels only, and drops the previous import", async () => {
    serve(guide("Journal"));
    expect(await runEpgRebuild()).toEqual({ channels: 1, programmes: 2 });
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

  it("replaces the guide on the next successful import", async () => {
    serve(guide("Journal du soir"));
    expect(await runEpgRebuild()).toEqual({ channels: 1, programmes: 2 });
    expect(await rows()).toEqual(["TF1.fr:Journal du soir", "TF1.fr:Suite"]);
  });
});

describe("EPG time corrections", () => {
  it("prefers the channel's own rule to its suffix's, the longest suffix first", () => {
    const rules = compile([
      { pattern: "*.qa", minutes: -180 },
      { pattern: "beINSports3.qa", minutes: -120 },
    ]);
    expect(offsetOf(rules, "beinsports3.QA")).toBe(-120);
    expect(offsetOf(rules, "beINSports1.qa")).toBe(-180);
    expect(offsetOf(rules, "TF1.fr")).toBe(0);
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
    expect(await runEpgRebuild()).toEqual({ channels: 1, programmes: 2 });
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
