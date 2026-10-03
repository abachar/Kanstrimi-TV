import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resetDb, closeDb } from "@/test/db";

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
  });
  afterAll(closeDb);

  it("issues a 6-character code valid ten minutes", async () => {
    const p = await createPairing("10.0.0.1");
    expect(isCode(p.code)).toBe(true);
    expect(p.expiresAt.getTime() - Date.now()).toBeGreaterThan(9 * 60 * 1000);
    expect(await pollPairing(p.code)).toEqual({ status: "pending" });
    expect(await pollPairing("ZZZZZZ")).toEqual({ status: "expired" });
  });

  it("issues the token with the code; it authenticates once the code is approved", async () => {
    const { code, token } = await createPairing("10.0.0.1");
    expect(token).toMatch(/^dvc_[A-Za-z0-9_-]{40,}$/);
    expect(await authenticateToken(token)).toBeNull(); // pending: nothing yet
    const d = await approvePairing(code, "  Salon ");
    expect(d.status).toBe("approved");
    expect(d.name).toBe("Salon");
    // The poll says so, again and again, without the token.
    expect(await pollPairing(code)).toEqual({ status: "approved", deviceName: "Salon" });
    expect(await pollPairing(code)).toEqual({ status: "approved", deviceName: "Salon" });
    // The token is stored hashed only.
    const [row] = await db.select().from(schema.appDevices).where(eq(schema.appDevices.code, code));
    expect(row.tokenHash).not.toContain(token.slice(4, 20));

    expect((await authenticateToken(token, "10.0.0.2"))?.code).toBe(code);
    expect(await authenticateToken("dvc_nope")).toBeNull();
    expect(await authenticateToken("")).toBeNull();

    // Revoked: 401 from now on.
    expect(await revokeDevice(code)).toBe(true);
    expect(await authenticateToken(token)).toBeNull();
    const [after] = await db.select().from(schema.appDevices).where(eq(schema.appDevices.code, code));
    expect(after.tokenHash).toBeNull();
    expect(await revokeDevice(code)).toBe(false);
    expect((await listDevices()).map((x) => x.status)).toContain("revoked");
  });

  it("refuses to approve an expired or unknown code", async () => {
    const { code } = await createPairing("10.0.0.1");
    await db
      .update(schema.appDevices)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.appDevices.code, code));
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
