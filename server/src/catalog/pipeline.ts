import { Cron } from "croner";
import { getSettings, isXtreamConfigured, type Settings } from "@/config";
import { checkCancelled, describeError, isCancelled, withCancel } from "@/shared";
import { runSync } from "@/providers/xtream";
import { getTmdbClient, runTrending } from "@/providers/tmdb";
import { runEnrich } from "./matching";
import { runEpgRebuild } from "./epg";
import { variantCountsByKind } from "./queries";
import { applyRules } from "./rules/apply";
import { runGrouping } from "./grouping/group";
import { runMerge } from "./merge";
import { runChannels } from "./channels";
import { startStep, finishStep, startRun, finishRun, purgeRuns, closeStaleRun, type Trigger } from "./journal";
import { withRunLog, withStep, note, purgeRunLogs } from "./runlog";

/**
 * The catalogue pipeline. Four steps, each a plain function of its own modules:
 *   source  — the provider's lists into their raw copy, checked against the catalogue (providers/xtream),
 *             then raw copy → catalogue by difference and the names parsed (merge.ts, no network)
 *   enrich  — TMDB matching of every pending film and series, hidden ones included, and a share of the
 *             stale cache (matching.ts); live variants matched to iptv-org: logo, theme, country (channels.ts)
 *   group   — variants → contents in the served languages, aggregates over the visible variants (no network)
 *   filters — the rules judge the contents (`hidden_by_rule`), then `visible` and the waitlist (no network)
 * Matching comes first so that a title shown never waits for its TMDB sheet. The rules come last: they
 * read the content as the app shows it. A content the grouping just made is hidden until they judge it.
 *
 * Three tasks run them, by cron or from the admin: `pipeline` (the four steps), `epg` (download the
 * XMLTV guide, keep the programmes of the visible channels, epg.ts) and `trending` (TMDB's weekly
 * trending lists, for the « Top 10 » rows). A run is journalled twice: a `task_runs` row with a
 * `task_steps` row per step (the summary the admin lists), and a text file of everything printed
 * meanwhile, each part of a step included (the detail).
 */
export type Step = "source" | "enrich" | "filters" | "group" | "trending" | "epg";
export type Task = "pipeline" | "epg" | "trending";
export const TASKS: readonly Task[] = ["pipeline", "epg", "trending"];
/** The steps of the pipeline, in order. */
export const PIPELINE_STEPS: readonly Step[] = ["source", "enrich", "group", "filters"];
/**
 * A step that only enriches (iptv-org, TMDB): when it fails (a service or the DNS down), the run
 * goes on without it and ends in error. The imported catalogue still gets filtered and grouped.
 */
const SKIPPABLE: ReadonlySet<Step> = new Set(["enrich"]);
/** Runs and their files are kept this long. */
export const RETENTION_DAYS = 90;

/** What a run passes its steps: the steps it holds, and whether a shrinking catalogue is accepted (a manual run's choice). */
export type RunOptions = { acceptShrink?: boolean };
type StepContext = RunOptions & { steps: Step[] };

const RUNNERS: Record<Step, (ctx: StepContext) => Promise<unknown>> = {
  source: async (ctx) => {
    const read = await runSync({ acceptShrink: ctx.acceptShrink, currentCounts: await variantCountsByKind() });
    checkCancelled();
    return { ...read, ...(await runMerge(ctx)) };
  },
  enrich: runEnrichment,
  group: runGrouping,
  filters: () => applyRules(),
  trending: runTrending,
  epg: runEpgRebuild,
};

/**
 * TMDB (with a key) then iptv-org, one after the other: one of them down does not keep the other from
 * running. The step fails afterwards with what went wrong, and the run goes on (`SKIPPABLE`).
 */
async function runEnrichment(): Promise<Record<string, number>> {
  const parts: [name: string, fn: () => Promise<Record<string, number>>][] = [["iptv-org", runChannels]];
  if (await getTmdbClient()) parts.unshift(["TMDB", () => runEnrich()]);
  const stats: Record<string, number> = {};
  const failed: string[] = [];
  for (const [name, fn] of parts) {
    checkCancelled();
    try {
      Object.assign(stats, await fn());
    } catch (e) {
      if (isCancelled(e)) throw e;
      failed.push(`${name} : ${describeError(e)}`);
      note(`${name} en échec : ${describeError(e)}`);
    }
  }
  if (failed.length) throw new Error(failed.join(" ; "));
  return stats;
}

const running = new Map<Step, Date>();
const runningTasks = new Set<string>();
/** The run each task is on, and the switch that stops it. */
const current = new Map<string, { runId: number; stop: AbortController }>();
const KILLED = "Arrêté depuis l'admin";
let lastError: { step: Step; message: string; at: Date } | null = null;

export const runningSteps = () => [...running.entries()].map(([step, since]) => ({ step, since }));
export const isTaskRunning = (task: string) => runningTasks.has(task);
export const getLastError = () => lastError;

const unrecorded = (step: Step) => (e: unknown) => console.error(`[pipeline] ${step} : fin de l'étape non enregistrée,`, describeError(e));

/** One step under the journal. Null when it went well, else what went wrong. */
async function runStep(step: Step, runId: number, ctx: StepContext): Promise<string | null> {
  if (running.has(step)) return "déjà en cours";
  running.set(step, new Date());
  const started = Date.now();
  note(`── ${step}`);
  let stepId: number | null = null;
  try {
    stepId = await startStep(step, runId);
    const result = await withStep(step, () => RUNNERS[step](ctx));
    const stats = result && typeof result === "object" ? (result as Record<string, unknown>) : undefined;
    await finishStep(stepId, "success", undefined, stats);
    note(`── ${step} : terminé en ${Math.round((Date.now() - started) / 1000)} s${stats ? ` · ${JSON.stringify(stats)}` : ""}`);
    return null;
  } catch (e) {
    if (isCancelled(e)) {
      note(`── ${step} : arrêté après ${Math.round((Date.now() - started) / 1000)} s`);
      if (stepId !== null) await finishStep(stepId, "killed", KILLED).catch(unrecorded(step));
      return KILLED;
    }
    const message = describeError(e);
    lastError = { step, message, at: new Date() };
    console.error(`[pipeline] ${step} :`, message);
    if (e instanceof Error && e.stack) note(e.stack);
    if (stepId !== null) await finishStep(stepId, "error", message).catch(unrecorded(step));
    return message;
  } finally {
    running.delete(step);
  }
}

/**
 * One run of a task: its row, its file, its steps in order until the first failure (a failure
 * of an enrichment step, `SKIPPABLE`, is noted and skipped).
 * False when it could not start (already running, database down) or failed.
 */
async function runTask(task: string, trigger: Trigger, steps: Step[], opts: RunOptions = {}): Promise<boolean> {
  if (runningTasks.has(task)) return false;
  runningTasks.add(task);
  try {
    let run: { id: number; logFile: string };
    try {
      run = await startRun(task, trigger);
    } catch (e) {
      console.error(`[pipeline] ${task} : journal inaccessible,`, describeError(e));
      return false;
    }
    const stop = new AbortController();
    current.set(task, { runId: run.id, stop });
    return await withRunLog(run.logFile, () =>
      withCancel(stop.signal, async () => {
        note(
          `Passage n° ${run.id} · ${task} · ${trigger === "cron" ? "planifié" : "manuel"} · étapes ${steps.join(" → ")}${opts.acceptShrink ? " · baisse du catalogue acceptée" : ""}`,
        );
        let error: string | null = null;
        for (const step of steps) {
          if (stop.signal.aborted) break;
          const failed = await runStep(step, run.id, { ...opts, steps });
          if (!failed) continue;
          if (stop.signal.aborted) break;
          error ??= failed;
          if (!SKIPPABLE.has(step)) break;
          note(`${step} en échec : le passage continue sans lui`);
        }
        const killed = stop.signal.aborted;
        note(killed ? "Arrêté depuis l'admin" : error ? `Échec : ${error}` : "Terminé");
        await finishRun(run.id, killed ? "killed" : error ? "error" : "success", killed ? KILLED : (error ?? undefined)).catch((e) =>
          console.error(`[pipeline] ${task} : fin du passage non enregistrée,`, describeError(e)),
        );
        return !error && !killed;
      }),
    );
  } finally {
    current.delete(task);
    runningTasks.delete(task);
    purge();
  }
}

function purge() {
  purgeRunLogs(RETENTION_DAYS);
  purgeRuns(RETENTION_DAYS).catch((e) => console.error("[pipeline] purge du journal échouée :", describeError(e)));
}

/** The whole chain: source → enrich → group → filters; from `from` on when given (a step it does not hold runs it all). */
export function runAll(trigger: Trigger = "manual", from?: Step, opts: RunOptions = {}) {
  return runTask("pipeline", trigger, PIPELINE_STEPS.slice(Math.max(0, from ? PIPELINE_STEPS.indexOf(from) : 0)), opts);
}
export const runEpg = (trigger: Trigger = "manual") => runTask("epg", trigger, ["epg"]);
export const runTrendingTask = (trigger: Trigger = "manual") => runTask("trending", trigger, ["trending"]);
/** A lone step, as a run of its own (tests, tooling). */
export const run = (step: Step, trigger: Trigger = "manual") => runTask(step, trigger, [step]);

/**
 * Start a task in the background from the admin, the pipeline from `from` on when given.
 * False if it is already running.
 */
export function launch(task: Task, from?: Step, opts: RunOptions = {}): boolean {
  if (runningTasks.has(task)) return false;
  void (task === "pipeline" ? runAll("manual", from, opts) : task === "epg" ? runEpg("manual") : runTrendingTask("manual"));
  return true;
}

/**
 * Stops a run from the admin. Running in this process: asked to stop, it ends as `killed` once the
 * work in flight is done (`stopping`). Shown as running though nothing runs it (a run whose end
 * could not be written): closed as `killed` at once (`closed`). Already over: `not_running`.
 */
export async function killRun(runId: number): Promise<"stopping" | "closed" | "not_running"> {
  for (const c of current.values())
    if (c.runId === runId) {
      c.stop.abort();
      return "stopping";
    }
  return (await closeStaleRun(runId, KILLED)) ? "closed" : "not_running";
}

// ---------------------------------------------------------------- schedule

let jobs: Cron[] = [];

/**
 * (Re)create the three cron jobs from the settings; called at boot and whenever the settings
 * change. `protect` skips a tick while the previous run is still going. An unconfigured
 * provider is checked at fire time.
 */
export function schedule(s: Settings) {
  for (const j of jobs) j.stop();
  jobs = [];
  const guarded = (name: string, fn: () => Promise<unknown>) => async () => {
    if (!isXtreamConfigured(await getSettings())) return;
    console.log(`[pipeline] ${name} planifié`);
    await fn();
  };
  const add = (expr: string, name: string, fn: () => Promise<unknown>) => {
    try {
      jobs.push(
        new Cron(
          expr,
          { name, protect: true, unref: true, catch: (e) => console.error(`[pipeline] ${name} :`, describeError(e)) },
          guarded(name, fn),
        ),
      );
    } catch (e) {
      console.error(`[pipeline] cron « ${expr} » ignoré :`, describeError(e));
    }
  };
  add(s.sync_cron, "traitement complet", () => runAll("cron"));
  add(s.epg_cron, "EPG", () => runEpg("cron"));
  // Without a TMDB key there is nothing to read: the tick passes.
  add(s.trending_cron, "tendances TMDB", async () => (await getTmdbClient()) && runTrendingTask("cron"));
}

/** The planned jobs and their next tick. */
export const scheduledJobs = () => jobs.map((j) => ({ name: j.name ?? "", next: j.nextRun() }));

/** Tests only. */
export function stopSchedule() {
  for (const j of jobs) j.stop();
  jobs = [];
}
