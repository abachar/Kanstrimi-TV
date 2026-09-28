import { ago } from "../format";
import { jobLabel } from "../labels";
import { Spinner } from "../ui";

export type JobsState = { running: { step: string; since: Date }[]; lastError: { step: string; message: string; at: Date } | null };

/** Polled by htmx: quickly while something runs, lazily otherwise. */
export function JobsStatus({ running, lastError }: JobsState) {
  return (
    <div
      id="jobs-status"
      class="flex flex-col gap-2 text-sm"
      aria-live="polite"
      hx-get="/admin/jobs/status"
      hx-trigger={running.length ? "every 3s" : "every 30s"}
      hx-swap="outerHTML"
    >
      {running.length ? (
        running.map((r) => (
          <p class="flex items-center gap-2 text-sky-400">
            <Spinner />
            {jobLabel(r.step)} en cours… <span class="text-muted-foreground">(depuis {ago(r.since.toISOString())})</span>
          </p>
        ))
      ) : (
        <p class="text-muted-foreground">Aucun job en cours.</p>
      )}
      {lastError && (
        <p class="text-destructive">
          Dernière erreur ({jobLabel(lastError.step)} · {ago(lastError.at.toISOString())}) : {lastError.message}
        </p>
      )}
    </div>
  );
}
