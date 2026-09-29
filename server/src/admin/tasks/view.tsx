import type { SyncLog } from "@/db";
import type { RunWithSteps, Step, Task } from "@/catalog";
import { fmt, duration, ago, describeCron, nextCronRun } from "../format";
import { Badge, Card, Empty, Options, Pagination, Status, Table, Title } from "../ui";
import { STAT_LABELS, TRIGGER_LABELS, jobLabel, taskLabel } from "../labels";
import { JobsStatus, type JobsState } from "../dashboard/jobs";

/** Stats as readable chips; zeros and unknown keys stay, but the raw JSON never shows. */
function StatChips({ stats }: { stats: Record<string, unknown> | null }) {
  const entries = Object.entries(stats ?? {}).filter(([, v]) => typeof v === "number" || typeof v === "string");
  if (!entries.length) return <></>;
  return (
    <span class="inline-flex flex-wrap gap-1">
      {entries.map(([k, v]) => {
        const num = typeof v === "number";
        const value = k === "bytes" && num ? `${((v as number) / 1e6).toFixed(1)} Mo` : num ? fmt(v as number) : String(v);
        const zero = num && v === 0;
        const alert = num && (v as number) > 0 && (k === "errors" || k.startsWith("removed"));
        return (
          <Badge tone={alert ? "warn" : zero ? "muted" : "plain"}>
            <span class="tabular-nums">{value}</span> <span class="font-normal opacity-75">{STAT_LABELS[k] ?? k.replace(/_/g, " ")}</span>
          </Badge>
        );
      })}
    </span>
  );
}

const when = (d: Date) => d.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "medium" });
const took = (r: { startedAt: Date; finishedAt: Date | null }) => (r.finishedAt ? duration(r.startedAt, r.finishedAt) : "…");
const trigger = (t: string) => TRIGGER_LABELS[t] ?? "—";

/** One dot per run, oldest on the left: the recent history of a task at a glance. */
const DOT: Record<string, string> = {
  success: "bg-emerald-500",
  error: "bg-destructive",
  running: "bg-sky-500 animate-pulse",
};
function Dots({ runs }: { runs: RunWithSteps[] }) {
  return (
    <div class="flex items-center gap-1.5" aria-label="Derniers passages">
      {[...runs].reverse().map((r) => (
        <a
          href={`/admin/tasks/${r.id}`}
          class={`size-3 rounded-full ${DOT[r.status] ?? "bg-muted"}`}
          title={`${when(r.startedAt)} · ${r.status === "success" ? "succès" : r.status === "error" ? "erreur" : "en cours"}`}
        />
      ))}
    </div>
  );
}

/** The step badges of a run: its path through the pipeline, the failed one in red. */
function StepBadges({ steps }: { steps: SyncLog[] }) {
  return (
    <span class="inline-flex flex-wrap gap-1">
      {steps.map((s) => (
        <Badge tone={s.status === "error" ? "bad" : s.status === "running" ? "info" : "muted"}>
          {jobLabel(s.job)} <span class="font-normal tabular-nums opacity-75">{took(s)}</span>
        </Badge>
      ))}
    </span>
  );
}

/** `steps`: those a run may start from, the first being the whole task. */
type TaskState = { task: Task; cron: string; runs: RunWithSteps[]; busy: boolean; steps: readonly Step[] };

/** A scheduled task: its schedule, its last run, its recent history, and a way to run it now. */
export function TaskCard({ task, cron, runs, busy, steps }: TaskState) {
  const last = runs[0];
  const next = nextCronRun(cron);
  return (
    <Card title={taskLabel(task)} hint={`${describeCron(cron)}${next ? ` · prochain passage ${when(next)}` : ""}`}>
      <div class="flex flex-col gap-3">
        {last ? (
          <a href={`/admin/tasks/${last.id}`} class="flex flex-col gap-2 rounded-lg border p-3 hover:bg-muted">
            <div class="flex items-center justify-between gap-2 text-sm">
              <span>
                Dernier passage {ago(last.startedAt.toISOString())} · {trigger(last.trigger)}
              </span>
              <Status status={last.status} />
            </div>
            <div class="text-xs text-muted-foreground tabular-nums">
              {when(last.startedAt)} · {took(last)}
            </div>
            {last.message && <div class="break-words text-sm text-destructive">{last.message}</div>}
            <StepBadges steps={last.steps} />
          </a>
        ) : (
          <Empty title="Jamais lancé" />
        )}
        <div class="flex items-center justify-between gap-2">
          <Dots runs={runs} />
          <form method="post" action={`/admin/jobs/${task}`} class="flex items-center gap-2">
            {steps.length > 1 && (
              <select name="from" class="select w-auto" data-size="sm" aria-label="Lancer à partir de l'étape" disabled={busy}>
                <Options
                  opts={steps.map((s, i) => [i ? s : "", i ? `À partir de : ${jobLabel(s)}` : "Toutes les étapes"] as const)}
                  cur=""
                />
              </select>
            )}
            <button class="btn" data-variant="outline" data-size="sm" disabled={busy}>
              {busy ? "En cours…" : "Lancer maintenant"}
            </button>
          </form>
        </div>
      </div>
    </Card>
  );
}

/** Runs, most recent first: one row each, its steps as badges, the detail one click away. */
export function RunsTable({ runs }: { runs: RunWithSteps[] }) {
  if (!runs.length) return <Empty title="Aucun passage" />;
  return (
    <>
      <div class="max-md:hidden">
        <Table>
          <thead>
            <tr>
              <th>Tâche</th>
              <th>Statut</th>
              <th>Début</th>
              <th>Durée</th>
              <th class="w-1/2">Étapes</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr>
                <td>
                  <div class="font-medium">{taskLabel(r.task)}</div>
                  <div class="text-xs text-muted-foreground">{trigger(r.trigger)}</div>
                </td>
                <td>
                  <Status status={r.status} />
                </td>
                <td class="text-muted-foreground tabular-nums">{when(r.startedAt)}</td>
                <td class="tabular-nums">{took(r)}</td>
                <td class="whitespace-normal">
                  <div class="flex flex-col gap-1">
                    {r.message && <div class="break-words text-destructive">{r.message}</div>}
                    <StepBadges steps={r.steps} />
                  </div>
                </td>
                <td>
                  <a class="btn" data-variant="ghost" data-size="sm" href={`/admin/tasks/${r.id}`}>
                    Voir le log
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>

      <ul class="flex flex-col divide-y md:hidden">
        {runs.map((r) => (
          <li>
            <a href={`/admin/tasks/${r.id}`} class="flex flex-col gap-2 py-3">
              <div class="flex items-center justify-between gap-2">
                <span class="font-medium">{taskLabel(r.task)}</span>
                <Status status={r.status} />
              </div>
              <div class="text-xs text-muted-foreground">
                {when(r.startedAt)} · {took(r)} · {trigger(r.trigger)}
              </div>
              {r.message && <div class="break-words text-sm text-destructive">{r.message}</div>}
              <StepBadges steps={r.steps} />
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}

export type TasksFilter = { task: string; errors: boolean; page: number };
export const RUNS_PER_PAGE = 30;

export function TasksView(p: {
  tasks: TaskState[];
  runs: RunWithSteps[];
  total: number;
  filter: TasksFilter;
  jobs: JobsState;
  retentionDays: number;
}) {
  const f = p.filter;
  const link = (page: number) =>
    `/admin/tasks?${new URLSearchParams({ ...(f.task && { task: f.task }), ...(f.errors && { errors: "1" }), page: String(page) })}`;
  return (
    <>
      <Title t="Tâches" sub={`Tâches planifiées, leurs passages et leurs logs, gardés ${p.retentionDays} jours`} />
      <JobsStatus {...p.jobs} />
      <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
        {p.tasks.map((t) => (
          <TaskCard {...t} />
        ))}
      </div>
      <Card title="Passages">
        <div class="flex flex-col gap-4">
          <form method="get" action="/admin/tasks" class="flex flex-wrap items-center gap-3" role="search">
            <select name="task" class="select w-auto" aria-label="Tâche">
              <Options
                opts={[
                  ["", "Toutes les tâches"],
                  ["pipeline", taskLabel("pipeline")],
                  ["epg", taskLabel("epg")],
                ]}
                cur={f.task}
              />
            </select>
            <label class="label gap-2 font-normal">
              <input type="checkbox" class="input" name="errors" value="1" checked={f.errors} />
              Erreurs seulement
            </label>
            <button class="btn" data-variant="outline" data-size="sm">
              Filtrer
            </button>
          </form>
          <RunsTable runs={p.runs} />
          <Pagination page={f.page} total={p.total} size={RUNS_PER_PAGE} link={link} />
        </div>
      </Card>
    </>
  );
}

/** The log of a run; polled while the run goes on. */
export function RunLog({ run, log }: { run: RunWithSteps; log: { text: string; truncated: boolean; size: number } | null }) {
  const live = run.status === "running";
  return (
    <div
      id="run-log"
      class="flex flex-col gap-2"
      {...(live ? { "hx-get": `/admin/tasks/${run.id}/log`, "hx-trigger": "every 2s", "hx-swap": "outerHTML" } : {})}
    >
      {log ? (
        <>
          {log.truncated && (
            <p class="text-xs text-muted-foreground">
              Fin du fichier seulement ({(log.size / 1e6).toFixed(1)} Mo) : le fichier complet se télécharge.
            </p>
          )}
          <pre class="max-h-[70vh] overflow-auto whitespace-pre-wrap break-words rounded-lg border bg-muted/40 p-3 font-mono text-xs leading-relaxed">
            {log.text || "(vide)"}
          </pre>
        </>
      ) : (
        <Empty title="Fichier de log introuvable" sub="Passage antérieur aux fichiers de log, ou fichier purgé." />
      )}
    </div>
  );
}

export function RunView({ run, log }: { run: RunWithSteps; log: { text: string; truncated: boolean; size: number } | null }) {
  return (
    <>
      <Title
        t={`${taskLabel(run.task)} · passage n° ${run.id}`}
        sub={`${when(run.startedAt)} · ${took(run)} · ${trigger(run.trigger)}`}
        actions={
          <>
            <a class="btn" data-variant="outline" href="/admin/tasks">
              Tâches
            </a>
            {log && (
              <a class="btn" data-variant="outline" href={`/admin/tasks/${run.id}/raw`}>
                Télécharger le log
              </a>
            )}
          </>
        }
      />
      <Card title="Étapes" extra={<Status status={run.status} />}>
        {run.message && <p class="mb-3 break-words text-sm text-destructive">{run.message}</p>}
        {run.steps.length ? (
          <Table>
            <thead>
              <tr>
                <th>Étape</th>
                <th>Statut</th>
                <th>Durée</th>
                <th class="w-1/2">Résultat</th>
              </tr>
            </thead>
            <tbody>
              {run.steps.map((s) => (
                <tr>
                  <td class="font-medium">{jobLabel(s.job)}</td>
                  <td>
                    <Status status={s.status} />
                  </td>
                  <td class="tabular-nums">{took(s)}</td>
                  <td class="whitespace-normal">
                    <div class="flex flex-col gap-1">
                      {s.message && <div class="break-words text-destructive">{s.message}</div>}
                      <StatChips stats={s.stats} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <Empty title="Aucune étape enregistrée" />
        )}
      </Card>
      <Card title="Log">
        <RunLog run={run} log={log} />
      </Card>
    </>
  );
}
