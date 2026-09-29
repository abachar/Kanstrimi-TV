import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { db, schema } from "@/db";
import { resetDb, closeDb } from "@/test/db";
import { verify } from "@/config";
import { startLog, finishLog, closeOrphanLogs, startRun, runById, recentRuns } from "../journal";
import { logDir, readRunLog, withRunLog, withStep } from "../runlog";
import { run } from "../pipeline";

beforeAll(async () => {
  await resetDb();
  expect(await verify("test")).toBe(true); // a run needs the vault open
});
afterAll(closeDb);

describe("closeOrphanLogs", () => {
  it("closes every running step and run as an error, leaves the others alone", async () => {
    const r = await startRun("pipeline", "cron");
    const a = await startLog("enrich", r.id);
    const b = await startLog("source", r.id);
    await finishLog(b, "success");
    expect(await closeOrphanLogs()).toBe(1);
    const rows = await db.select().from(schema.syncLogs).orderBy(schema.syncLogs.id);
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
      /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.\d{3} info  \[source\] GET http:\/\/upstream\.test\/player_api\.php\?username=u&password=\*\*\*$/m,
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
    expect(r.steps.map((s) => [s.job, s.status])).toEqual([["group", "success"]]);
    const text = readRunLog(r.logFile!)!.text;
    expect(text).toContain("── group : terminé");
    expect(text).toContain("Terminé");
  });
});
