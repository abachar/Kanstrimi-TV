import { Cron } from "croner";
import { getSettings, isUnlocked, isXtreamConfigured, type Settings } from "@/config";
import { describeError } from "@/shared";
import { runSync, runEpgRebuild } from "@/providers/xtream";
import { runEnrich, runTrending } from "@/providers/tmdb";
import { applyRules } from "./rules/apply";
import { runGrouping } from "./grouping/group";
import { startLog, finishLog } from "./journal";

/**
 * The catalogue pipeline. Six steps, each a plain function of its own module, run one at a
 * time under the journal:
 *   source  — import the upstream catalogue (providers/xtream)
 *   filters — recompute hidden_by_rule from the rules (no network)
 *   enrich  — TMDB matching of pending entries (providers/tmdb)
 *   group   — variants → contents (no network)
 *   trending — TMDB's weekly trending lists, for the « Top 10 » rows
 *   epg     — download the XMLTV guide
 * `runAll` chains them; `start` runs one with its natural follow-ups; two croner jobs fire
 * them on the schedules kept in the settings.
 */
export type Step = "source" | "filters" | "enrich" | "group" | "trending" | "epg";
export const STEPS: readonly Step[] = ["source", "filters", "enrich", "group", "trending", "epg"];

const RUNNERS: Record<Step, () => Promise<unknown>> = {
  source: runSync,
  filters: applyRules,
  enrich: runEnrich,
  group: runGrouping,
  trending: runTrending,
  epg: runEpgRebuild,
};
/** An import or an enrichment changes the groups: started by hand, they regroup too. */
const FOLLOW_UPS: Record<Step, Step[]> = { source: ["filters", "group"], filters: [], enrich: ["group"], group: [], trending: [], epg: [] };

const running = new Map<Step, Date>();
let lastError: { step: Step; message: string; at: Date } | null = null;

export const runningSteps = () => [...running.entries()].map(([step, since]) => ({ step, since }));
export const isRunning = (step: Step) => running.has(step);
export const getLastError = () => lastError;
const canStart = (step: Step) => !running.has(step) && isUnlocked();

/** Run one step to completion under the journal. False when it could not start or failed. */
export async function run(step: Step): Promise<boolean> {
  if (!canStart(step)) return false;
  running.set(step, new Date());
  const logId = await startLog(step);
  try {
    const result = await RUNNERS[step]();
    await finishLog(logId, "success", undefined, result && typeof result === "object" ? (result as Record<string, unknown>) : undefined);
    return true;
  } catch (e) {
    lastError = { step, message: describeError(e), at: new Date() };
    console.error(`[pipeline] ${step} :`, lastError.message);
    await finishLog(logId, "error", lastError.message).catch(() => {});
    return false;
  } finally {
    running.delete(step);
  }
}

/** Start a step and its follow-ups in the background. False if it is already running or the vault is locked. */
export function start(step: Step): boolean {
  if (!canStart(step)) return false;
  void (async () => {
    if (!(await run(step))) return;
    for (const next of FOLLOW_UPS[step]) if (!(await run(next))) return;
  })();
  return true;
}

/** The whole chain: source → filters → group, then enrich → group → trending when a TMDB key exists. Stops at the first failure. */
export async function runAll(): Promise<void> {
  for (const step of ["source", "filters", "group"] as const) if (!(await run(step))) return;
  if (!(await getSettings()).tmdb_api_key) return;
  if ((await run("enrich")) && (await run("group"))) await run("trending");
}

// ---------------------------------------------------------------- schedule

let jobs: Cron[] = [];

/**
 * (Re)create the two cron jobs from the settings; called at boot and whenever the settings
 * change. `protect` skips a tick while the previous run is still going. Locked vault or
 * unconfigured provider are checked at fire time, not here: at boot the vault is always locked.
 */
export function schedule(s: Settings) {
  for (const j of jobs) j.stop();
  jobs = [];
  const guarded = (name: string, fn: () => Promise<unknown>) => async () => {
    if (!isUnlocked() || !isXtreamConfigured(await getSettings())) return;
    console.log(`[pipeline] ${name} planifié`);
    await fn();
  };
  const add = (expr: string, name: string, fn: () => Promise<unknown>) => {
    try {
      jobs.push(
        new Cron(
          expr,
          { protect: true, unref: true, catch: (e) => console.error(`[pipeline] ${name} :`, describeError(e)) },
          guarded(name, fn),
        ),
      );
    } catch (e) {
      console.error(`[pipeline] cron « ${expr} » ignoré :`, describeError(e));
    }
  };
  add(s.sync_cron, "traitement complet", runAll);
  add(s.epg_cron, "EPG", () => run("epg"));
}

/** Tests only. */
export function stopSchedule() {
  for (const j of jobs) j.stop();
  jobs = [];
}
