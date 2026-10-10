import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resetDb, closeDb } from "@/test/db";
import { db, schema } from "@/db";
import { approvePairing, createPairing, resetPairingState } from "@/devices";
import { player as api } from "..";

let token = "";
const call = (method: string, path: string, body?: unknown) =>
  api.request(path, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body !== undefined ? { "content-type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

describe("PUT /devices/me/push", () => {
  beforeAll(async () => {
    await resetDb();
    resetPairingState();
    const p = await createPairing("10.0.0.1");
    token = p.token;
    await approvePairing(p.code, "iPhone");
  });
  afterAll(closeDb);

  it("registers the phone's token, refuses a malformed one, and forgets it on DELETE", async () => {
    expect((await call("PUT", "/devices/me/push", { platform: "ios", token: "AB".repeat(32), environment: "sandbox" })).status).toBe(204);
    const [row] = await db.select().from(schema.devicePush);
    expect(row).toMatchObject({ platform: "ios", token: "ab".repeat(32), environment: "sandbox" });
    expect((await call("PUT", "/devices/me/push", { platform: "android", token: "ab".repeat(32), environment: "sandbox" })).status).toBe(
      400,
    );
    expect((await call("PUT", "/devices/me/push", { platform: "ios", token: "short", environment: "sandbox" })).status).toBe(400);
    expect((await call("PUT", "/devices/me/push")).status).toBe(400);
    expect((await api.request("/devices/me/push", { method: "PUT" })).status).toBe(401);
    expect((await call("DELETE", "/devices/me/push")).status).toBe(204);
    expect(await db.select().from(schema.devicePush)).toHaveLength(0);
  });
});
