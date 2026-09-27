import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { env, deriveKey, sha256, safeEqual, encrypt, decrypt } from "@/shared";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

/**
 * In-memory vault. The admin password (also the IPTV client password) is never stored:
 * every request carries it, the first valid one derives the AES key and keeps it in RAM.
 * After a restart the server is "locked" until a valid request arrives.
 */
let key: Buffer | null = null;
let pwFingerprint: Buffer | null = null;

export function isUnlocked() {
  return key !== null;
}
export function getKey(): Buffer {
  if (!key) throw new Error("Serveur verrouillé : connectez-vous pour déverrouiller");
  return key;
}

async function salt(): Promise<Buffer> {
  const [row] = await db.select().from(schema.settings).where(eq(schema.settings.key, "enc_salt"));
  if (row) return Buffer.from(row.value, "base64");
  const s = randomBytes(16);
  await db
    .insert(schema.settings)
    .values({ key: "enc_salt", value: s.toString("base64") })
    .onConflictDoNothing();
  return salt();
}

/**
 * Device tokens (block 3): the vault key is wrapped with a key derived from the token and
 * stored beside the device. The first call of a paired TV after a restart unwraps it, so
 * the cron resumes without anyone typing the password. Revoking the device drops the wrap.
 */
export async function wrapKeyWith(secret: string): Promise<string> {
  return encrypt(deriveKey(secret, await salt()), getKey().toString("base64"));
}
export async function unlockWith(secret: string, wrapped: string): Promise<boolean> {
  if (key) return true;
  try {
    const k = Buffer.from(decrypt(deriveKey(secret, await salt()), wrapped), "base64");
    if (k.length !== 32) return false;
    key = k;
    return true;
  } catch {
    return false;
  }
}
/** Tests only: back to the state after a restart. */
export function lockForTests() {
  key = null;
  pwFingerprint = null;
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
