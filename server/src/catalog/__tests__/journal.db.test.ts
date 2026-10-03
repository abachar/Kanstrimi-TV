import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { checkCancelled } from "@/shared";
import fs from "node:fs";
import path from "node:path";
import { db, schema } from "@/db";
import { resetDb, closeDb } from "@/test/db";

import { startStep, finishStep, closeOrphanLogs, startRun, runById, recentRuns } from "../journal";
import { logDir, readRunLog, withRunLog, withStep } from "../runlog";
import { isTaskRunning, killRun, run, runAll } from "../pipeline";

let channelsFail = false;
/** `channels` turns into a step that lasts until it is told to stop. */
let channelsBlock = false;
vi.mock("../channels", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../channels")>();
  return {
    ...mod,
    runChannels: async () => {
      if (channelsFail) throw new Error("iptv-org injoignable");
      while (channelsBlock) {
        checkCancelled();
        await new Promise((r) => setTimeout(r, 5));
      }
      return mod.runChannels();
    },
  };
});

beforeAll(async () => {
  await resetDb();
});
afterAll(closeDb);

describe("closeOrphanLogs", () => {
  it("closes every running step and run as an error, leaves the others alone", async () => {
    const r = await startRun("pipeline", "cron");
    const a = await startStep("enrich", r.id);
    const b = await startStep("source", r.id);
    await finishStep(b, "success");
    expect(await closeOrphanLogs()).toBe(1);
    const rows = await db.select().from(schema.taskSteps).orderBy(schema.taskSteps.id);
    expect(rows.find((x) => x.id === a)).toMatchObject({ status: "error", message: "Interrompu par un redémarrage du serveur" });
    expect(rows.find((x) => x.id === a)?.finishedAt).not.toBeNull();
    expect(rows.find((x) => x.id === b)?.status).toBe("success");
    expect((await runById(r.id))?.status).toBe("error");
    expect(await closeOrphanLogs()).toBe(0);
  });
});

describe("run log file", () => {
  it("copies what a run prints, stamped, tagged by step, secrets masked", async () => {
    const file = "test-run.log";
    fs.rmSync(path.join(logDir(), file), { force: true });
    await withRunLog(file, () =>
      withStep("source", async () => {
        console.log("GET http://upstream.test/player_api.php?username=u&password=hunter2");
        console.error("boom");
        console.log("[source] already tagged");
      }),
    );
    console.log("after the run: not in the file");
    const text = readRunLog(file)!.text;
    expect(text).toMatch(
      /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.\d{3} info {2}\[source\] GET http:\/\/upstream\.test\/player_api\.php\?username=u&password=\*\*\*$/m,
    );
    expect(text).toContain("error [source] boom");
    expect(text).toContain("info  [source] already tagged");
    expect(text).not.toContain("hunter2");
    expect(text).not.toContain("after the run");
    expect(readRunLog("../../etc/passwd")).toBeNull();
  });

  it("journals a lone step as a run with its step and its file", async () => {
    expect(await run("group")).toBe(true);
    const [r] = (await recentRuns({ limit: 1 })).runs;
    expect(r).toMatchObject({ task: "group", trigger: "manual", status: "success" });
    expect(r.steps.map((s) => [s.step, s.status])).toEqual([["group", "success"]]);
    const text = readRunLog(r.logFile!)!.text;
    expect(text).toContain("── group : terminé");
    expect(text).toContain("Terminé");
  });

  it("goes on without an enrichment step that fails, and ends in error", async () => {
    // iptv-org unreachable: `channels` fails, the catalogue is still filtered and grouped.
    channelsFail = true;
    try {
      expect(await runAll("manual", "channels")).toBe(false);
    } finally {
      channelsFail = false;
    }
    const [r] = (await recentRuns({ limit: 1 })).runs;
    expect(r).toMatchObject({ task: "pipeline", status: "error" });
    expect(r.steps.map((s) => [s.step, s.status])).toEqual([
      ["channels", "error"],
      ["filters", "success"],
      ["group", "success"],
    ]);
  });

  it("stops at a step the others depend on", async () => {
    expect(await runAll("manual")).toBe(false); // no provider configured: `source` fails
    const [r] = (await recentRuns({ limit: 1 })).runs;
    expect(r.steps.map((s) => [s.step, s.status])).toEqual([["source", "error"]]);
  });

  it("runs the pipeline from a given step on, as one pipeline run", async () => {
    expect(await runAll("manual", "filters")).toBe(true); // no TMDB key: filters → group, no network
    const [r] = (await recentRuns({ limit: 1 })).runs;
    expect(r).toMatchObject({ task: "pipeline", status: "success" });
    expect(r.steps.map((s) => s.step)).toEqual(["filters", "group"]);
  });
});

describe("killRun", () => {
  it("stops a run in progress after the work in flight: the run and its step end killed, the next steps never start", async () => {
    channelsBlock = true;
    try {
      const done = runAll("manual", "channels");
      await vi.waitUntil(async () => (await recentRuns({ limit: 1 })).runs[0]?.steps.some((s) => s.step === "channels"));
      const [r] = (await recentRuns({ limit: 1 })).runs;
      expect(r.status).toBe("running");
      expect(await killRun(r.id)).toBe("stopping");
      expect(await done).toBe(false);
    } finally {
      channelsBlock = false;
    }
    expect(isTaskRunning("pipeline")).toBe(false);
    const [r] = (await recentRuns({ limit: 1 })).runs;
    expect(r).toMatchObject({ task: "pipeline", status: "killed", message: "Arrêté depuis l'admin" });
    expect(r.finishedAt).not.toBeNull();
    expect(r.steps.map((s) => [s.step, s.status])).toEqual([["channels", "killed"]]);
    expect(readRunLog(r.logFile!)!.text).toContain("Arrêté depuis l'admin");
    // Over: a second stop changes nothing.
    expect(await killRun(r.id)).toBe("not_running");
  });

  it("closes a run left « running » that nothing runs any more, its running steps with it", async () => {
    const r = await startRun("pipeline", "cron");
    const done = await startStep("source", r.id);
    await finishStep(done, "success");
    const stuck = await startStep("group", r.id);
    expect(await killRun(r.id)).toBe("closed");
    const run = (await runById(r.id))!;
    expect(run).toMatchObject({ status: "killed", message: "Arrêté depuis l'admin" });
    expect(run.steps.find((s) => s.id === stuck)).toMatchObject({ status: "killed" });
    expect(run.steps.find((s) => s.id === done)?.status).toBe("success");
    expect(await killRun(r.id)).toBe("not_running");
  });
});
