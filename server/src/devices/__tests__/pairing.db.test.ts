import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resetDb, closeDb } from "@/test/db";
import { verify, isUnlocked, lockForTests } from "@/config";
import {
  createPairing,
  pollPairing,
  approvePairing,
  authenticateToken,
  revokeDevice,
  listDevices,
  resetPairingState,
  TooManyRequests,
  isCode,
} from "../pairing";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

describe("device pairing", () => {
  beforeAll(async () => {
    await resetDb();
    resetPairingState();
    expect(await verify("test")).toBe(true);
  });
  afterAll(closeDb);

  it("issues a 6-character code valid ten minutes", async () => {
    const p = await createPairing("10.0.0.1");
    expect(isCode(p.code)).toBe(true);
    expect(p.expiresAt.getTime() - Date.now()).toBeGreaterThan(9 * 60 * 1000);
    expect(await pollPairing(p.code)).toEqual({ status: "pending" });
    expect(await pollPairing("ZZZZZZ")).toEqual({ status: "expired" });
  });

  it("hands the token over once, then the token authenticates and unlocks the vault", async () => {
    const { code } = await createPairing("10.0.0.1");
    const d = await approvePairing(code, "  Salon ");
    expect(d.status).toBe("approved");
    expect(d.name).toBe("Salon");
    const r = await pollPairing(code);
    expect(r.status).toBe("approved");
    if (r.status !== "approved") return;
    expect(r.token).toMatch(/^dvc_[A-Za-z0-9_-]{40,}$/);
    expect(r.deviceName).toBe("Salon");
    // A second poll must not leak the token again.
    expect(await pollPairing(code)).toEqual({ status: "expired" });
    // The token is stored hashed only.
    const [row] = await db.select().from(schema.devices).where(eq(schema.devices.code, code));
    expect(row.tokenHash).not.toContain(r.token.slice(4, 20));
    expect(row.wrappedKey).toMatch(/^enc:v1:/);

    expect((await authenticateToken(r.token, "10.0.0.2"))?.code).toBe(code);
    expect(await authenticateToken("dvc_nope")).toBeNull();
    expect(await authenticateToken("")).toBeNull();

    // After a "restart" the first authenticated call opens the vault without the password.
    lockForTests();
    expect(isUnlocked()).toBe(false);
    expect((await authenticateToken(r.token))?.code).toBe(code);
    expect(isUnlocked()).toBe(true);

    // Revoked: 401 from now on, and the wrap is gone.
    expect(await revokeDevice(code)).toBe(true);
    expect(await authenticateToken(r.token)).toBeNull();
    const [after] = await db.select().from(schema.devices).where(eq(schema.devices.code, code));
    expect(after.wrappedKey).toBeNull();
    expect(after.tokenHash).toBeNull();
    expect(await revokeDevice(code)).toBe(false);
    expect((await listDevices()).map((x) => x.status)).toContain("revoked");
  });

  it("refuses to approve an expired or unknown code", async () => {
    const { code } = await createPairing("10.0.0.1");
    await db
      .update(schema.devices)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.devices.code, code));
    await expect(approvePairing(code, "x")).rejects.toThrow(/expiré/);
    expect(await pollPairing(code)).toEqual({ status: "expired" });
    await expect(approvePairing("ZZZZZZ", "x")).rejects.toThrow(/inconnu/);
  });

  it("rate-limits pairing requests per address", async () => {
    for (let i = 0; i < 10; i++) await createPairing("10.0.0.9");
    await expect(createPairing("10.0.0.9")).rejects.toThrow(TooManyRequests);
    await expect(createPairing("10.0.0.10")).resolves.toBeDefined();
  });
});
