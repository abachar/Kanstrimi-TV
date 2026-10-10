import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { resetDb, closeDb } from "@/test/db";
import { db, schema } from "@/db";
import { approvePairing, createPairing, registerPush, resetPairingState, setPushPreference } from "@/devices";
import { configureApnsForTests, notifyArrivals, notifyRunFinished, recentNotifications, sendTestNotification } from "..";
import type { ApnsResult } from "../apns";

const pem = generateKeyPairSync("ec", { namedCurve: "prime256v1" }).privateKey.export({ type: "pkcs8", format: "pem" }) as string;
const sent: { env: string; token: string; body: string }[] = [];
let answers: Record<string, ApnsResult> = {};

describe("notify", () => {
  let phone = { id: 0, code: "" };
  let tablet = { id: 0, code: "" };
  beforeAll(async () => {
    await resetDb();
    resetPairingState();
    phone = await approvePairing((await createPairing("10.0.0.1")).code, "iPhone");
    tablet = await approvePairing((await createPairing("10.0.0.1")).code, "iPad");
    await registerPush(phone.id, { platform: "ios", token: "a".repeat(64), environment: "sandbox" });
    await registerPush(tablet.id, { platform: "ios", token: "b".repeat(64), environment: "production" });
    await setPushPreference(tablet.code, "runs", false);
    configureApnsForTests({ key: pem, keyId: "KEY", teamId: "TEAM" }, async (env, token, _headers, body) => {
      sent.push({ env, token, body });
      return answers[token] ?? { ok: true };
    });
  });
  afterAll(async () => {
    configureApnsForTests(null);
    await closeDb();
  });

  it("an arrival goes to every device with the switch on, journalled", async () => {
    await notifyArrivals([{ contentKey: "tmdb:movie:1100", title: "Dune : Troisième partie", year: 2026 }]);
    expect(sent.map((s) => [s.env, s.token[0]])).toEqual([
      ["sandbox", "a"],
      ["production", "b"],
    ]);
    expect(JSON.parse(sent[0].body).link).toBe("kanstrimi://open/tmdb:movie:1100");
    const log = await recentNotifications();
    expect(log.map((n) => [n.deviceName, n.kind, n.status])).toEqual([
      ["iPad", "waitlist", "sent"],
      ["iPhone", "waitlist", "sent"],
    ]);
  });

  it("a run summary respects the switch; a dead token drops the registration", async () => {
    sent.length = 0;
    answers = { ["a".repeat(64)]: { ok: false, status: 410, reason: "Unregistered" } };
    await notifyRunFinished({ status: "success", message: null, startedAt: new Date(), finishedAt: new Date(), steps: [] });
    expect(sent.map((s) => s.token[0])).toEqual(["a"]); // the tablet turned runs off
    const [latest] = await recentNotifications(1);
    expect(latest).toMatchObject({ kind: "runs", status: "unregistered", detail: "Unregistered", deviceName: "iPhone" });
    expect(await db.select().from(schema.devicePush)).toHaveLength(1);
    answers = {};
  });

  it("a test alert from the admin, and none without a registration or without APNs", async () => {
    expect(await sendTestNotification(phone.code)).toBeNull(); // dropped above
    const n = await sendTestNotification(tablet.code);
    expect(n).toMatchObject({ kind: "test", status: "sent", body: "Les alertes arrivent bien sur iPad." });
    configureApnsForTests(null);
    expect(await sendTestNotification(tablet.code)).toMatchObject({ status: "failed", detail: "APNs non configuré" });
  });
});
