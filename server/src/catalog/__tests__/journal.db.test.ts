import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db, schema } from "@/db";
import { resetDb, closeDb } from "@/test/db";
import { startLog, finishLog, closeOrphanLogs } from "../journal";

describe("closeOrphanLogs", () => {
  beforeAll(resetDb);
  afterAll(closeDb);
  it("closes every running row as an error, leaves the others alone", async () => {
    const a = await startLog("enrich");
    const b = await startLog("source");
    await finishLog(b, "success");
    expect(await closeOrphanLogs()).toBe(1);
    const rows = await db.select().from(schema.syncLogs).orderBy(schema.syncLogs.id);
    expect(rows.find((r) => r.id === a)).toMatchObject({ status: "error", message: "Interrompu par un redémarrage du serveur" });
    expect(rows.find((r) => r.id === a)?.finishedAt).not.toBeNull();
    expect(rows.find((r) => r.id === b)?.status).toBe("success");
    expect(await closeOrphanLogs()).toBe(0);
  });
});
