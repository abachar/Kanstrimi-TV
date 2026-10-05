import { db, schema } from "@/db";
import { sql } from "drizzle-orm";
import { env } from "@/shared";

/** The provider account and the TMDB key: from the environment (podman secrets in production), never stored. */
export const ENV_KEYS = ["xtream_url", "xtream_username", "xtream_password", "tmdb_api_key"] as const;
export type EnvKey = (typeof ENV_KEYS)[number];

/** What the database stores, editable in Paramètres. */
export const SETTING_KEYS = [
  "tmdb_language",
  "sync_cron", // cron expr for catalog sync
  "epg_cron", // cron expr for EPG rebuild
  "trending_cron", // cron expr for TMDB's trending lists
  "markers_cron", // cron expr for the import of SkipDB's intros and end credits
  "public_base_url", // optional, e.g. http://192.168.1.10:3000
  "serve_adult", // "1" = adult-flagged contents are served to the apps; off by default
  "last_sync_at",
  "last_epg_at",
  "filters_pending", // not empty: a filter changed since the last `filters` step, the catalogue does not follow it yet
  "session_generation", // bumped by « Déconnecter toutes les sessions »: every admin cookie issued before is refused
] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];

export const DEFAULTS = {
  tmdb_language: "fr-FR",
  sync_cron: "0 */6 * * *",
  epg_cron: "0 3,15 * * *",
  trending_cron: "30 4 * * *",
  markers_cron: "45 4 * * *",
  serve_adult: "0",
} satisfies Partial<Record<SettingKey, string>>;

export type Settings = Record<SettingKey | EnvKey, string>;

let secrets: Record<EnvKey, string> = { ...env.secrets };
/** Tests only: what the environment would hold. */
export function setSecretsForTests(values: Partial<Record<EnvKey, string>>) {
  secrets = { ...secrets, ...values };
  invalidateSettings();
}

/** One process, one reader: the settings are cached in memory and dropped on every write. */
let cache: Settings | null = null;
const listeners: ((s: Settings) => void)[] = [];

/** Called after every `setSettings` with the fresh values (the pipeline re-reads its schedule from them). */
export function onSettingsChange(fn: (s: Settings) => void) {
  listeners.push(fn);
}
export function invalidateSettings() {
  cache = null;
}

export async function getSettings(): Promise<Settings> {
  if (cache) return { ...cache };
  const rows = await db.select().from(schema.settings);
  const out = {} as Record<string, string>;
  for (const k of SETTING_KEYS) out[k] = "";
  for (const r of rows) if ((SETTING_KEYS as readonly string[]).includes(r.key)) out[r.key] = r.value;
  // A missing or emptied value means "the default", so no caller needs its own fallback.
  for (const [k, v] of Object.entries(DEFAULTS)) if (!out[k] && v) out[k] = v;
  cache = { ...(out as Record<SettingKey, string>), ...secrets };
  return { ...cache };
}

export async function setSettings(values: Partial<Record<SettingKey, string>>) {
  const entries = Object.entries(values).filter(([, v]) => v !== undefined) as [SettingKey, string][];
  if (!entries.length) return;
  await db
    .insert(schema.settings)
    .values(entries.map(([key, value]) => ({ key, value })))
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: sql`excluded.value`, updatedAt: new Date() } });
  invalidateSettings();
  const fresh = await getSettings();
  for (const fn of listeners) fn(fresh);
}

export function isXtreamConfigured(s: Settings) {
  return Boolean(s.xtream_url && s.xtream_username && s.xtream_password);
}
