import fs from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";
import { getSettings, isXtreamConfigured, setSettings } from "@/lib/settings";
import { XtreamClient } from "@/lib/xtream/client";
import { startLog, finishLog } from "@/lib/jobs/log";
import { describeError } from "@/lib/errors";

export const EPG_PATH = path.join(env.dataDir, "epg.xml");

/** Fetch the upstream XMLTV guide and cache it to disk. */
export async function runEpgRebuild(): Promise<{ bytes: number }> {
  const s = await getSettings();
  if (!isXtreamConfigured(s)) throw new Error("Serveur Xtream non configuré");
  const client = new XtreamClient(s.xtream_url, s.xtream_username, s.xtream_password);
  const logId = await startLog("epg");
  try {
    const res = await fetch(client.xmltvUrl(), { redirect: "follow", signal: AbortSignal.timeout(180_000) });
    if (!res.ok || !res.body) throw new Error(`EPG amont indisponible (HTTP ${res.status})`);
    await fs.mkdir(env.dataDir, { recursive: true });
    const tmp = EPG_PATH + ".part";
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 32 || !buf.toString("utf8", 0, 200).includes("<tv")) throw new Error("Réponse EPG invalide (pas du XMLTV)");
    await fs.writeFile(tmp, buf);
    await fs.rename(tmp, EPG_PATH);
    await setSettings({ last_epg_at: new Date().toISOString() });
    await finishLog(logId, "success", undefined, { bytes: buf.length });
    return { bytes: buf.length };
  } catch (e) {
    await finishLog(logId, "error", describeError(e));
    throw e;
  }
}

export async function epgCacheStat(): Promise<{ exists: boolean; bytes: number; mtime: string | null }> {
  try { const st = await fs.stat(EPG_PATH); return { exists: true, bytes: st.size, mtime: st.mtime.toISOString() }; }
  catch { return { exists: false, bytes: 0, mtime: null }; }
}
