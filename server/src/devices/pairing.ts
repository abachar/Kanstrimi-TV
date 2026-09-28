import { randomBytes, randomInt } from "node:crypto";
import { db, schema, type Device } from "@/db";
import { isUnlocked, wrapKeyWith, unlockWith } from "@/config";
import { and, desc, eq, gt, lt, sql } from "drizzle-orm";
import { sha256 } from "@/shared";

/** No 0/O/1/I: the code is read aloud from a TV screen as a last resort. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_TTL_MS = 10 * 60 * 1000;
const TOKEN_PREFIX = "dvc_";
/** Pairing is unauthenticated: a few codes per address per ten minutes is plenty for one living room. */
const MAX_PER_IP = 10,
  MAX_PENDING = 50;
const recent = new Map<string, number[]>();

function newCode() {
  return Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
}
export function isCode(s: string) {
  return /^[A-Z2-9]{6}$/.test(s);
}
const hash = (token: string) => sha256(token).toString("hex");

export class TooManyRequests extends Error {
  constructor() {
    super("Trop de demandes d'appairage, réessayez dans quelques minutes");
  }
}

/** `POST /devices`: a pending device with a code valid ten minutes. */
export async function createPairing(ip: string): Promise<{ code: string; expiresAt: Date }> {
  const now = Date.now();
  const mine = (recent.get(ip) ?? []).filter((t) => now - t < CODE_TTL_MS);
  if (mine.length >= MAX_PER_IP) throw new TooManyRequests();
  const [{ n: pending }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.devices)
    .where(and(eq(schema.devices.status, "pending"), gt(schema.devices.expiresAt, new Date())));
  if (pending >= MAX_PENDING) throw new TooManyRequests();
  recent.set(ip, [...mine, now]);
  // Expired, never approved codes are garbage: sweep them here rather than with a timer.
  await db
    .delete(schema.devices)
    .where(and(eq(schema.devices.status, "pending"), lt(schema.devices.expiresAt, new Date(now - CODE_TTL_MS))));
  for (let attempt = 0; ; attempt++) {
    const code = newCode();
    const expiresAt = new Date(now + CODE_TTL_MS);
    const inserted = await db
      .insert(schema.devices)
      .values({ code, expiresAt, createdIp: ip })
      .onConflictDoNothing()
      .returning({ code: schema.devices.code });
    if (inserted.length) return { code, expiresAt };
    if (attempt > 5) throw new Error("Impossible de générer un code d'appairage");
  }
}

export type PollResult = { status: "pending" } | { status: "expired" } | { status: "approved"; token: string; deviceName: string };

/**
 * `GET /devices/{code}`: the token is handed over exactly once, at the first poll after the
 * approval; it is kept in memory until then and never written anywhere but hashed.
 */
const handover = new Map<string, { token: string; at: number }>();

export async function pollPairing(code: string): Promise<PollResult> {
  const [d] = await db.select().from(schema.devices).where(eq(schema.devices.code, code));
  if (!d) return { status: "expired" };
  if (d.status === "approved") {
    const h = handover.get(code);
    if (!h) return { status: "expired" }; // already collected, or approved before a restart
    handover.delete(code);
    return { status: "approved", token: h.token, deviceName: d.name ?? "" };
  }
  if (d.status === "revoked" || d.expiresAt.getTime() < Date.now()) return { status: "expired" };
  return { status: "pending" };
}

/** Admin: name and approve a pending code. The vault must be open (the admin is logged in). */
export async function approvePairing(code: string, name: string): Promise<Device> {
  if (!isUnlocked()) throw new Error("Coffre verrouillé");
  const [d] = await db.select().from(schema.devices).where(eq(schema.devices.code, code));
  if (!d || d.status !== "pending") throw new Error("Code d'appairage inconnu");
  if (d.expiresAt.getTime() < Date.now()) throw new Error("Code d'appairage expiré");
  const token = TOKEN_PREFIX + randomBytes(32).toString("base64url");
  const [row] = await db
    .update(schema.devices)
    .set({
      name: name.trim() || "Appareil",
      status: "approved",
      approvedAt: new Date(),
      tokenHash: hash(token),
      wrappedKey: await wrapKeyWith(token),
    })
    .where(eq(schema.devices.id, d.id))
    .returning();
  handover.set(code, { token, at: Date.now() });
  return row;
}

/** Bearer token → approved device, unlocking the vault on the way when it is locked. Null = 401. */
export async function authenticateToken(token: string, ip?: string): Promise<Device | null> {
  if (!token.startsWith(TOKEN_PREFIX)) return null;
  const [d] = await db
    .select()
    .from(schema.devices)
    .where(eq(schema.devices.tokenHash, hash(token)));
  if (!d || d.status !== "approved") return null;
  if (!isUnlocked() && d.wrappedKey && !(await unlockWith(token, d.wrappedKey))) return null;
  // last_seen is informative: one write per minute per device is enough.
  if (!d.lastSeenAt || Date.now() - d.lastSeenAt.getTime() > 60_000 || (ip && ip !== d.lastIp)) {
    await db
      .update(schema.devices)
      .set({ lastSeenAt: new Date(), lastIp: ip ?? d.lastIp })
      .where(eq(schema.devices.id, d.id));
  }
  return d;
}

/** Revoke: the token stops working and the wrapped vault key is destroyed with it. */
export async function revokeDevice(code: string): Promise<boolean> {
  const rows = await db
    .update(schema.devices)
    .set({ status: "revoked", tokenHash: null, wrappedKey: null })
    .where(and(eq(schema.devices.code, code), eq(schema.devices.status, "approved")))
    .returning({ id: schema.devices.id });
  handover.delete(code);
  return rows.length > 0;
}

export async function forgetDevice(code: string) {
  await db.delete(schema.devices).where(eq(schema.devices.code, code));
}

export async function listDevices(): Promise<Device[]> {
  return db.select().from(schema.devices).orderBy(desc(schema.devices.createdAt));
}

export async function getDevice(code: string): Promise<Device | null> {
  return (await db.select().from(schema.devices).where(eq(schema.devices.code, code)))[0] ?? null;
}

export type PairingState = "pending" | "expired" | "done" | "unknown";

/** What the admin pairing page should show for a code. */
export async function pairingState(code: string): Promise<PairingState> {
  const d = await getDevice(code);
  if (!d) return "unknown";
  if (d.status === "approved") return "done";
  if (d.status === "revoked" || d.expiresAt.getTime() < Date.now()) return "expired";
  return "pending";
}

/** Tests only. */
export function resetPairingState() {
  recent.clear();
  handover.clear();
}
