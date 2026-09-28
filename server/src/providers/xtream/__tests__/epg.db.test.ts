import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { sql } from "drizzle-orm";
import { resetDb, closeDb, seedCategories, seedItems } from "@/test/db";
import { db, schema } from "@/db";
import { setSettings, verify } from "@/config";
import { run } from "@/catalog";
import { epgStat, runEpgRebuild } from "../epg";

/** A guide with programmes for our channel, one for a channel we do not serve, in a fixed window. */
const guide = (title: string) => `<?xml version="1.0" encoding="utf-8" ?><tv>
<programme start="20260928200000 +0200" stop="20260928213000 +0200" channel="TF1.fr"><title>${title}</title></programme>
<programme start="20260928213000 +0200" stop="20260928230000 +0200" channel="TF1.fr"><title>Suite</title></programme>
<programme start="20260928200000 +0200" stop="20260928210000 +0200" channel="Rai1.it"><title>Telegiornale</title></programme>
</tv>`;
const serve = (body: string, status = 200) => vi.stubGlobal("fetch", async () => new Response(status === 200 ? body : null, { status }));
const rows = async () =>
  (
    await db
      .select({ title: schema.epgProgrammes.title, channel: schema.epgProgrammes.channelId })
      .from(schema.epgProgrammes)
      .orderBy(schema.epgProgrammes.startAt)
  ).map((r) => `${r.channel}:${r.title}`);

beforeAll(async () => {
  await resetDb();
  expect(await verify("test")).toBe(true);
  await setSettings({ xtream_url: "http://x", xtream_username: "u", xtream_password: "p" });
  await seedCategories([{ kind: "live", xtreamId: "20", name: "FRANCE | TV" }]);
  await seedItems([
    { kind: "live", xtreamId: "100", name: "|FR| TF1 HD", cat: "20", raw: { epg_channel_id: "TF1.fr" } },
    { kind: "live", xtreamId: "101", name: "|FR| SECRET", cat: "20", hiddenManual: true, raw: { epg_channel_id: "Secret.fr" } },
  ]);
  expect(await run("group")).toBe(true);
  // Rows the pruning must drop: a programme long over, from an older import.
  await db.execute(sql`insert into epg_programmes (channel_id, start_at, end_at, title, imported_at)
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
    expect(stat.to).toContain("2026-09-28");
  });

  it("keeps the previous guide when upstream fails or serves nothing for our channels", async () => {
    serve("", 503);
    await expect(runEpgRebuild()).rejects.toThrow("HTTP 503");
    serve(`<tv><programme start="20260928200000 +0200" stop="20260928210000 +0200" channel="Rai1.it"><title>x</title></programme></tv>`);
    await expect(runEpgRebuild()).rejects.toThrow("guide précédent conservé");
    expect(await rows()).toEqual(["TF1.fr:Journal", "TF1.fr:Suite"]);
  });

  it("replaces the guide on the next successful import", async () => {
    serve(guide("Journal du soir"));
    expect(await runEpgRebuild()).toEqual({ channels: 1, programmes: 2 });
    expect(await rows()).toEqual(["TF1.fr:Journal du soir", "TF1.fr:Suite"]);
  });
});
