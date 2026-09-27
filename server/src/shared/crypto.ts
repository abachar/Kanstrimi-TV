import { createCipheriv, createDecipheriv, randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto";

const PREFIX = "enc:v1:";

/** Derive a 32-byte AES key from a password and a salt (scrypt). */
export function deriveKey(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}

export function isEncrypted(value: string) { return value.startsWith(PREFIX); }

/** AES-256-GCM → "enc:v1:<iv>:<tag>:<ciphertext>" (base64). */
export function encrypt(key: Buffer, plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return PREFIX + [iv, cipher.getAuthTag(), ct].map((b) => b.toString("base64")).join(":");
}

/** Throws if the key is wrong or the value was tampered with. */
export function decrypt(key: Buffer, value: string): string {
  if (!isEncrypted(value)) throw new Error("Valeur non chiffrée");
  const [iv, tag, ct] = value.slice(PREFIX.length).split(":").map((s) => Buffer.from(s, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

export function sha256(s: string) { return createHash("sha256").update(s).digest(); }
export function safeEqual(a: Buffer, b: Buffer) { return a.length === b.length && timingSafeEqual(a, b); }
