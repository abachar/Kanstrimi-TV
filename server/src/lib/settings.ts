import { db, schema } from "@/db";
import { inArray, sql } from "drizzle-orm";
import { encrypt, decrypt, isEncrypted } from "@/lib/crypto";
import { getKey, isUnlocked } from "@/lib/auth/vault";

export const SETTING_KEYS = [
  "xtream_url", "xtream_username", "xtream_password",
  "proxy_username",       // IPTV client username (password = admin password)
  "tmdb_api_key", "tmdb_language",
  "sync_cron",            // cron expr for catalog sync
  "epg_cron",             // cron expr for EPG rebuild
  "public_base_url",      // optional, e.g. http://192.168.1.10:3000
  "last_sync_at",
  "last_epg_at",
] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];

/** Stored AES-256-GCM encrypted with the key derived from the admin password. */
export const SECRET_KEYS: SettingKey[] = ["xtream_username", "xtream_password", "tmdb_api_key"];

export const DEFAULTS: Partial<Record<SettingKey, string>> = {
  proxy_username: "admin",
  tmdb_language: "fr-FR",
  sync_cron: "0 */6 * * *",
  epg_cron: "0 3 * * *",
};

export type Settings = Record<SettingKey, string>;

export async function getSettings(): Promise<Settings> {
  const rows = await db.select().from(schema.settings);
  const out = { ...DEFAULTS } as Record<string, string>;
  for (const k of SETTING_KEYS) out[k] ??= "";
  const toMigrate: Partial<Record<SettingKey, string>> = {};
  for (const r of rows) {
    if (!(SETTING_KEYS as readonly string[]).includes(r.key)) continue;
    const k = r.key as SettingKey;
    if (!SECRET_KEYS.includes(k)) { out[k] = r.value; continue; }
    if (isEncrypted(r.value)) out[k] = isUnlocked() ? decrypt(getKey(), r.value) : "";
    else { out[k] = r.value; if (isUnlocked() && r.value) toMigrate[k] = r.value; } // legacy plaintext → encrypt
  }
  if (Object.keys(toMigrate).length) await setSettings(toMigrate);
  return out as Settings;
}

export async function getSetting(key: SettingKey): Promise<string> {
  return (await getSettings())[key];
}

export async function setSettings(values: Partial<Record<SettingKey, string>>) {
  const entries = Object.entries(values).filter(([, v]) => v !== undefined) as [SettingKey, string][];
  if (!entries.length) return;
  const rows = entries.map(([key, value]) => ({ key, value: SECRET_KEYS.includes(key) && value ? encrypt(getKey(), value) : value }));
  await db.insert(schema.settings).values(rows)
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: sql`excluded.value`, updatedAt: new Date() } });
}

export async function deleteSettings(keys: string[]) {
  if (keys.length) await db.delete(schema.settings).where(inArray(schema.settings.key, keys));
}

export function isXtreamConfigured(s: Settings) {
  return Boolean(s.xtream_url && s.xtream_username && s.xtream_password);
}
