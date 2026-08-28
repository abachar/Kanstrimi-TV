import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { env } from "@/lib/env";
import { deriveKey, sha256, safeEqual } from "@/lib/crypto";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

/**
 * In-memory vault. The admin password (also the IPTV client password) is never stored:
 * every request carries it, the first valid one derives the AES key and keeps it in RAM.
 * After a restart the server is "locked" until a valid request arrives.
 */
let key: Buffer | null = null;
let pwFingerprint: Buffer | null = null;

export function isUnlocked() { return key !== null; }
export function getKey(): Buffer {
  if (!key) throw new Error("Serveur verrouillé : connectez-vous pour déverrouiller");
  return key;
}

async function salt(): Promise<Buffer> {
  const [row] = await db.select().from(schema.settings).where(eq(schema.settings.key, "enc_salt"));
  if (row) return Buffer.from(row.value, "base64");
  const s = randomBytes(16);
  await db.insert(schema.settings).values({ key: "enc_salt", value: s.toString("base64") }).onConflictDoNothing();
  return salt();
}

/** Verify a password; on success the vault is unlocked (cheap after the first time). */
export async function verify(password: string): Promise<boolean> {
  if (!password) return false;
  if (key && pwFingerprint) return safeEqual(sha256(password), pwFingerprint);
  if (!(await bcrypt.compare(password, env.adminPasswordHash))) return false;
  key = deriveKey(password, await salt());
  pwFingerprint = sha256(password);
  return true;
}
