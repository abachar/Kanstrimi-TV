import { db, schema } from "@/db";
import { inArray, sql } from "drizzle-orm";
import { encrypt, decrypt, isEncrypted } from "@/shared";
import { getKey, isUnlocked } from "./vault";

export const SETTING_KEYS = [
  "xtream_url",
  "xtream_username",
  "xtream_password",
  "tmdb_api_key",
  "tmdb_language",
  "sync_cron", // cron expr for catalog sync
  "epg_cron", // cron expr for EPG rebuild
  "public_base_url", // optional, e.g. http://192.168.1.10:3000
  "serve_adult", // "1" = adult-flagged contents are served to the apps; off by default
  "last_sync_at",
  "last_epg_at",
] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];

/** Stored AES-256-GCM encrypted with the key derived from the admin password. */
export const SECRET_KEYS: SettingKey[] = ["xtream_username", "xtream_password", "tmdb_api_key"];

export const DEFAULTS: Partial<Record<SettingKey, string>> = {
  tmdb_language: "fr-FR",
  sync_cron: "0 */6 * * *",
  epg_cron: "0 3 */3 * *",
  serve_adult: "0",
};

export type Settings = Record<SettingKey, string>;

/**
 * One process, one reader: the settings are cached in memory and dropped on every write.
 * Secrets read while the vault is locked come back empty, so the cache is keyed on that state.
 */
let cache: { unlocked: boolean; value: Settings } | null = null;
const listeners: ((s: Settings) => void)[] = [];

/** Called after every `setSettings` with the fresh values (the pipeline re-reads its schedule from them). */
export function onSettingsChange(fn: (s: Settings) => void) {
  listeners.push(fn);
}
export function invalidateSettings() {
  cache = null;
}

export async function getSettings(): Promise<Settings> {
  if (cache && cache.unlocked === isUnlocked()) return { ...cache.value };
  const rows = await db.select().from(schema.settings);
  const out = {} as Record<string, string>;
  for (const k of SETTING_KEYS) out[k] = "";
  for (const r of rows) {
    if (!(SETTING_KEYS as readonly string[]).includes(r.key)) continue;
    const k = r.key as SettingKey;
    if (!SECRET_KEYS.includes(k)) out[k] = r.value;
    else if (!isEncrypted(r.value)) out[k] = r.value;
    else out[k] = isUnlocked() ? decrypt(getKey(), r.value) : "";
  }
  // A missing or emptied value means "the default", so no caller needs its own fallback.
  for (const [k, v] of Object.entries(DEFAULTS)) if (!out[k] && v) out[k] = v;
  cache = { unlocked: isUnlocked(), value: out as Settings };
  return { ...cache.value };
}

export async function getSetting(key: SettingKey): Promise<string> {
  return (await getSettings())[key];
}

export async function setSettings(values: Partial<Record<SettingKey, string>>) {
  const entries = Object.entries(values).filter(([, v]) => v !== undefined) as [SettingKey, string][];
  if (!entries.length) return;
  const rows = entries.map(([key, value]) => ({ key, value: SECRET_KEYS.includes(key) && value ? encrypt(getKey(), value) : value }));
  await db
    .insert(schema.settings)
    .values(rows)
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: sql`excluded.value`, updatedAt: new Date() } });
  invalidateSettings();
  const fresh = await getSettings();
  for (const fn of listeners) fn(fresh);
}

export async function deleteSettings(keys: string[]) {
  if (keys.length) await db.delete(schema.settings).where(inArray(schema.settings.key, keys));
  invalidateSettings();
}

export function isXtreamConfigured(s: Settings) {
  return Boolean(s.xtream_url && s.xtream_username && s.xtream_password);
}
