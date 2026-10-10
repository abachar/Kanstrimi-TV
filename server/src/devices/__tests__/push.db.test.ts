import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resetDb, closeDb } from "@/test/db";
import { db, schema } from "@/db";
import { approvePairing, createPairing, forgetDevice, resetPairingState, revokeDevice } from "../pairing";
import { dropPushToken, pushByDevice, pushTarget, pushTargets, registerPush, setPushPreference, unregisterPush } from "../push";

const TOKEN_A = "a".repeat(64);
const TOKEN_B = "b".repeat(64);

describe("push registration", () => {
  let phone = { id: 0, code: "" };
  let tv = { id: 0, code: "" };
  beforeAll(async () => {
    await resetDb();
    resetPairingState();
    const a = await createPairing("10.0.0.1");
    phone = await approvePairing(a.code, "iPhone");
    const b = await createPairing("10.0.0.1");
    tv = await approvePairing(b.code, "Salon");
  });
  afterAll(closeDb);

  it("registers a token, replaces it at the next launch and keeps the admin's switches", async () => {
    const first = await registerPush(phone.id, { platform: "ios", token: TOKEN_A, environment: "sandbox" });
    expect(first).toMatchObject({ deviceId: phone.id, token: TOKEN_A, environment: "sandbox", waitlist: true, runs: true });
    expect(await setPushPreference(phone.code, "runs", false)).toBe(true);
    const again = await registerPush(phone.id, { platform: "ios", token: TOKEN_B, environment: "production" });
    expect(again).toMatchObject({ token: TOKEN_B, environment: "production", waitlist: true, runs: false });
    expect((await pushByDevice([phone.id, tv.id])).get(tv.id)).toBeUndefined();
    expect(await setPushPreference(tv.code, "runs", true)).toBe(false); // no registration
    expect(await setPushPreference("ZZZZZZ", "runs", true)).toBe(false);
  });

  it("targets: the approved devices registered with the switch on", async () => {
    expect((await pushTargets("waitlist")).map((t) => t.device.id)).toEqual([phone.id]);
    expect(await pushTargets("runs")).toEqual([]);
    await setPushPreference(phone.code, "runs", true);
    expect((await pushTargets("runs")).map((t) => t.push.token)).toEqual([TOKEN_B]);
    expect((await pushTarget(phone.code))?.device.name).toBe("iPhone");
    expect(await pushTarget(tv.code)).toBeNull();
    await revokeDevice(phone.code);
    expect(await pushTargets("waitlist")).toEqual([]);
  });

  it("a dead token, an unregistration or a forgotten device remove the registration", async () => {
    const c = await createPairing("10.0.0.1");
    const other = await approvePairing(c.code, "iPhone 2");
    await registerPush(other.id, { platform: "ios", token: TOKEN_A, environment: "sandbox" });
    expect(await dropPushToken(TOKEN_A)).toBe(1);
    expect(await dropPushToken(TOKEN_A)).toBe(0);
    await registerPush(other.id, { platform: "ios", token: TOKEN_A, environment: "sandbox" });
    await unregisterPush(other.id);
    expect((await pushByDevice([other.id])).size).toBe(0);
    await registerPush(other.id, { platform: "ios", token: TOKEN_A, environment: "sandbox" });
    await revokeDevice(other.code);
    await forgetDevice(other.code);
    expect(await db.select().from(schema.devicePush)).toHaveLength(1); // the revoked phone's row, until it is forgotten
  });
});
