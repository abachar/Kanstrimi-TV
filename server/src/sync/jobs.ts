import { getSettings, isXtreamConfigured, isUnlocked } from "@/db";
import { describeError } from "@/shared";
import { runSync } from "./reader/import";
import { runEpgRebuild } from "./reader/epg";
import { applyRules } from "./filters/apply";
import { runGrouping } from "./grouping/group";
import { runEnrich } from "./enrich/tmdb/enrich";
import { cronDue } from "./cron";

/**
 * Five independent jobs:
 *   source  — read the upstream catalog into the DB (then applies filters)
 *   filters — recompute hidden_by_rule from the rule set (no network)
 *   enrich  — TMDB matching of pending items
 *   group   — variants → contents (no network); also run by source and enrich when they end
 *   epg     — download the XMLTV guide
 * Each can be run alone from the admin; the cron runs source → enrich.
 */
export type Job = "source" | "filters" | "enrich" | "group" | "epg";

const running = new Map<Job, Date>();
let lastError: { job: Job; message: string; at: Date } | null = null;

export function runningJobs() { return [...running.entries()].map(([job, since]) => ({ job, since })); }
export function isRunning(job: Job) { return running.has(job); }
export function getLastError() { return lastError; }

const RUNNERS: Record<Job, () => Promise<unknown>> = {
  source: runSync,
  filters: applyRules,
  // Enrichment changes the TMDB ids the grouping keys depend on: regroup right after.
  enrich: async () => { await runEnrich(); await runGrouping(); },
  group: runGrouping,
  epg: runEpgRebuild,
};

const canStart = (job: Job) => !running.has(job) && isUnlocked();

/** Start a job in the background. Returns false if it is already running (or the vault is locked). */
export function startJob(job: Job): boolean {
  if (!canStart(job)) return false;
  void run(job);
  return true;
}

/** Run a job and wait for it (used by the pipeline). */
async function run(job: Job): Promise<boolean> {
  if (!canStart(job)) return false;
  running.set(job, new Date());
  try { await RUNNERS[job](); return true; }
  catch (e) { lastError = { job, message: describeError(e), at: new Date() }; console.error(`[jobs] ${job} failed:`, lastError.message); return false; }
  finally { running.delete(job); }
}

/** source (+ filters) then enrich, sequentially. */
export async function runPipeline() {
  if (!(await run("source"))) return;
  const s = await getSettings();
  if (s.tmdb_api_key) await run("enrich");
}

/** Evaluates cron schedules every minute. Call once at boot. */
export function startScheduler() {
  const tick = async () => {
    try {
      if (!isUnlocked()) return; // locked since restart: wait for the first authenticated request
      const s = await getSettings();
      if (!isXtreamConfigured(s)) return;
      const now = new Date();
      if (cronDue(s.sync_cron, s.last_sync_at, now)) { console.log("[jobs] scheduled pipeline"); void runPipeline(); }
      if (cronDue(s.epg_cron, s.last_epg_at, now)) { console.log("[jobs] scheduled EPG"); startJob("epg"); }
    } catch (e) { console.error("[jobs] scheduler tick:", describeError(e)); }
  };
  setInterval(tick, 60_000).unref();
  setTimeout(tick, 5_000).unref();
  console.log("[jobs] scheduler started");
}
