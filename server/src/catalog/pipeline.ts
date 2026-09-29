import { Cron } from "croner";
import { getSettings, isUnlocked, isXtreamConfigured, type Settings } from "@/config";
import { describeError } from "@/shared";
import { runSync, runEpgRebuild } from "@/providers/xtream";
import { runEnrich, runTrending } from "@/providers/tmdb";
import { applyRules } from "./rules/apply";
import { runGrouping, runNaming } from "./grouping/group";
import { runChannels } from "./channels";
import { startLog, finishLog, startRun, finishRun, purgeRuns, type Trigger } from "./journal";
import { withRunLog, withStep, note, purgeRunLogs } from "./runlog";

/**
 * The catalogue pipeline. Six steps, each a plain function of its own module:
 *   source  — import the upstream catalogue (providers/xtream), then parse the names
 *   channels — live variants matched to the iptv-org database: logo, theme, adult (providers/iptv)
 *   enrich  — TMDB matching of every pending entry, hidden ones included (providers/tmdb)
 *   filters — recompute hidden_by_rule from the rules (no network)
 *   group   — variants → contents, aggregates over the visible variants (no network)
 *   trending — TMDB's weekly trending lists, for the « Top 10 » rows
 *   epg     — download the XMLTV guide
 * Matching comes before the filters so that unhiding something never shows it unmatched;
 * grouping comes after them because its aggregates only count visible variants.
 *
 * Two tasks run them, by cron or from the admin: `pipeline` (the five catalogue steps) and
 * `epg`. A run is journalled twice: a `sync_runs` row with a `sync_logs` row per step (the
 * summary the admin lists), and a text file of everything printed meanwhile (the detail).
 */
export type Step = "source" | "channels" | "filters" | "enrich" | "group" | "trending" | "epg";
export type Task = "pipeline" | "epg";
export const TASKS: readonly Task[] = ["pipeline", "epg"];
/**
 * Steps that only enrich (iptv-org, TMDB): when they fail (a service or the DNS down), the run
 * goes on without them and ends in error. The imported catalogue still gets filtered and grouped.
 */
const SKIPPABLE: ReadonlySet<Step> = new Set(["channels", "enrich", "trending"]);
/** Runs and their files are kept this long. */
export const RETENTION_DAYS = 90;

const RUNNERS: Record<Step, () => Promise<unknown>> = {
  source: async () => ({ ...(await runSync()), ...(await runNaming()) }),
  channels: runChannels,
  enrich: runEnrich,
  filters: applyRules,
  group: runGrouping,
  trending: runTrending,
  epg: runEpgRebuild,
};

const running = new Map<Step, Date>();
const runningTasks = new Set<string>();
let lastError: { step: Step; message: string; at: Date } | null = null;

export const runningSteps = () => [...running.entries()].map(([step, since]) => ({ step, since }));
export const isTaskRunning = (task: string) => runningTasks.has(task);
export const getLastError = () => lastError;

/** One step under the journal. Null when it went well, else what went wrong. */
async function runStep(step: Step, runId: number): Promise<string | null> {
  if (running.has(step)) return "déjà en cours";
  running.set(step, new Date());
  const started = Date.now();
  note(`── ${step}`);
  let logId: number | null = null;
  try {
    logId = await startLog(step, runId);
    const result = await withStep(step, RUNNERS[step]);
    const stats = result && typeof result === "object" ? (result as Record<string, unknown>) : undefined;
    await finishLog(logId, "success", undefined, stats);
    note(`── ${step} : terminé en ${Math.round((Date.now() - started) / 1000)} s${stats ? ` · ${JSON.stringify(stats)}` : ""}`);
    return null;
  } catch (e) {
    const message = describeError(e);
    lastError = { step, message, at: new Date() };
    console.error(`[pipeline] ${step} :`, message);
    if (e instanceof Error && e.stack) note(e.stack);
    if (logId !== null) await finishLog(logId, "error", message).catch(() => {});
    return message;
  } finally {
    running.delete(step);
  }
}

/**
 * One run of a task: its row, its file, its steps in order until the first failure (a TMDB
 * step's failure is noted and skipped).
 * False when it could not start (already running, vault locked, database down) or failed.
 */
async function runTask(task: string, trigger: Trigger, steps: Step[]): Promise<boolean> {
  if (runningTasks.has(task) || !isUnlocked()) return false;
  runningTasks.add(task);
  try {
    let run: { id: number; logFile: string };
    try {
      run = await startRun(task, trigger);
    } catch (e) {
      console.error(`[pipeline] ${task} : journal inaccessible,`, describeError(e));
      return false;
    }
    return await withRunLog(run.logFile, async () => {
      note(`Passage n° ${run.id} · ${task} · ${trigger === "cron" ? "planifié" : "manuel"} · étapes ${steps.join(" → ")}`);
      let error: string | null = null;
      for (const step of steps) {
        const failed = await runStep(step, run.id);
        if (!failed) continue;
        error ??= failed;
        if (!SKIPPABLE.has(step)) break;
        note(`${step} en échec : le passage continue sans lui`);
      }
      note(error ? `Échec : ${error}` : "Terminé");
      await finishRun(run.id, error ? "error" : "success", error ?? undefined).catch((e) =>
        console.error(`[pipeline] ${task} : fin du passage non enregistrée,`, describeError(e)),
      );
      return !error;
    });
  } finally {
    runningTasks.delete(task);
    purge();
  }
}

function purge() {
  purgeRunLogs(RETENTION_DAYS);
  purgeRuns(RETENTION_DAYS).catch(() => {});
}

/** The steps of the full pipeline: the TMDB ones only with a key. */
async function pipelineSteps(): Promise<Step[]> {
  const tmdb = Boolean((await getSettings()).tmdb_api_key);
  return tmdb ? ["source", "channels", "enrich", "filters", "group", "trending"] : ["source", "channels", "filters", "group"];
}

/** The whole chain: source → channels → enrich → filters → group → trending. */
export const runAll = async (trigger: Trigger = "manual") => runTask("pipeline", trigger, await pipelineSteps());
export const runEpg = (trigger: Trigger = "manual") => runTask("epg", trigger, ["epg"]);
/** A lone step, as a run of its own (tests, tooling). */
export const run = (step: Step, trigger: Trigger = "manual") => runTask(step, trigger, [step]);

/** Start a task in the background from the admin. False if it is already running or the vault is locked. */
export function launch(task: Task): boolean {
  if (runningTasks.has(task) || !isUnlocked()) return false;
  void (task === "pipeline" ? runAll("manual") : runEpg("manual"));
  return true;
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
  add(s.sync_cron, "traitement complet", () => runAll("cron"));
  add(s.epg_cron, "EPG", () => runEpg("cron"));
}

/** Tests only. */
export function stopSchedule() {
  for (const j of jobs) j.stop();
  jobs = [];
}
