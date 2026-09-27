import { ago } from "../layout";
import { jobLabel } from "../labels";

export type JobsState = { running: { job: string; since: Date }[]; lastError: { job: string; message: string; at: Date } | null };

/** Polled by htmx: quickly while something runs, lazily otherwise. */
export function JobsStatus({ running, lastError }: JobsState) {
  return (
    <div id="jobs-status" class="mt-3" aria-live="polite" hx-get="/admin/jobs/status" hx-trigger={running.length ? "every 3s" : "every 30s"} hx-swap="outerHTML">
      {running.length
        ? running.map((r) => <p class="mb-1"><span class="spinner-border spinner-border-sm me-2"></span>{jobLabel(r.job)} en cours… <small class="text-secondary">(depuis {ago(r.since.toISOString())})</small></p>)
        : <p class="text-secondary mb-1">Aucun job en cours.</p>}
      {lastError && <p class="text-danger small mb-0">Dernière erreur ({jobLabel(lastError.job)} · {ago(lastError.at.toISOString())}) : {lastError.message}</p>}
    </div>
  );
}
