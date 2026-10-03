import { randomBytes, randomInt } from "node:crypto";
import { db, schema, type Device } from "@/db";
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

/**
 * `POST /devices`: a pending device with a code valid ten minutes, and its token at once. The token is
 * stored hashed only and authenticates nothing until the admin approves the code.
 */
export async function createPairing(ip: string): Promise<{ code: string; expiresAt: Date; token: string }> {
  const now = Date.now();
  const mine = (recent.get(ip) ?? []).filter((t) => now - t < CODE_TTL_MS);
  if (mine.length >= MAX_PER_IP) throw new TooManyRequests();
  const [{ n: pending }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.appDevices)
    .where(and(eq(schema.appDevices.status, "pending"), gt(schema.appDevices.expiresAt, new Date())));
  if (pending >= MAX_PENDING) throw new TooManyRequests();
  recent.set(ip, [...mine, now]);
  // Expired, never approved codes are garbage: sweep them here rather than with a timer.
  await db
    .delete(schema.appDevices)
    .where(and(eq(schema.appDevices.status, "pending"), lt(schema.appDevices.expiresAt, new Date(now - CODE_TTL_MS))));
  const token = TOKEN_PREFIX + randomBytes(32).toString("base64url");
  for (let attempt = 0; ; attempt++) {
    const code = newCode();
    const expiresAt = new Date(now + CODE_TTL_MS);
    const inserted = await db
      .insert(schema.appDevices)
      .values({ code, expiresAt, createdIp: ip, tokenHash: hash(token) })
      .onConflictDoNothing()
      .returning({ code: schema.appDevices.code });
    if (inserted.length) return { code, expiresAt, token };
    if (attempt > 5) throw new Error("Impossible de générer un code d'appairage");
  }
}

export type PollResult = { status: "pending" } | { status: "expired" } | { status: "approved"; deviceName: string };

/** `GET /devices/{code}`: where the code stands; approved, the token the device holds since `POST /devices` works. */
export async function pollPairing(code: string): Promise<PollResult> {
  const [d] = await db.select().from(schema.appDevices).where(eq(schema.appDevices.code, code));
  if (!d) return { status: "expired" };
  if (d.status === "approved") return { status: "approved", deviceName: d.name ?? "" };
  if (d.status === "revoked" || d.expiresAt.getTime() < Date.now()) return { status: "expired" };
  return { status: "pending" };
}

/** Admin: name and approve a pending code. */
export async function approvePairing(code: string, name: string): Promise<Device> {
  const [d] = await db.select().from(schema.appDevices).where(eq(schema.appDevices.code, code));
  if (d?.status !== "pending") throw new Error("Code d'appairage inconnu");
  if (d.expiresAt.getTime() < Date.now()) throw new Error("Code d'appairage expiré");
  const [row] = await db
    .update(schema.appDevices)
    .set({ name: name.trim() || "Appareil", status: "approved", approvedAt: new Date() })
    .where(eq(schema.appDevices.id, d.id))
    .returning();
  return row;
}

/** Bearer token → approved device. Null = 401. */
export async function authenticateToken(token: string, ip?: string): Promise<Device | null> {
  if (!token.startsWith(TOKEN_PREFIX)) return null;
  const [d] = await db
    .select()
    .from(schema.appDevices)
    .where(eq(schema.appDevices.tokenHash, hash(token)));
  if (d?.status !== "approved") return null;
  // last_seen is informative: one write per minute per device is enough.
  if (!d.lastSeenAt || Date.now() - d.lastSeenAt.getTime() > 60_000 || (ip && ip !== d.lastIp)) {
    await db
      .update(schema.appDevices)
      .set({ lastSeenAt: new Date(), lastIp: ip ?? d.lastIp })
      .where(eq(schema.appDevices.id, d.id));
  }
  return d;
}

/** Revoke: the token stops working. */
export async function revokeDevice(code: string): Promise<boolean> {
  const rows = await db
    .update(schema.appDevices)
    .set({ status: "revoked", tokenHash: null })
    .where(and(eq(schema.appDevices.code, code), eq(schema.appDevices.status, "approved")))
    .returning({ id: schema.appDevices.id });
  return rows.length > 0;
}

export async function forgetDevice(code: string) {
  await db.delete(schema.appDevices).where(eq(schema.appDevices.code, code));
}

export async function listDevices(): Promise<Device[]> {
  return db.select().from(schema.appDevices).orderBy(desc(schema.appDevices.createdAt));
}

export async function getDevice(code: string): Promise<Device | null> {
  return (await db.select().from(schema.appDevices).where(eq(schema.appDevices.code, code)))[0] ?? null;
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
}
