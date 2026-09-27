import type { SyncLog } from "@/db";
import { fmt, duration, Status, Title } from "../layout";
import { STAT_LABELS, jobLabel } from "../labels";

/** Stats as readable chips; zeros and unknown keys stay, but the raw JSON never shows. */
function StatChips({ stats }: { stats: Record<string, unknown> | null }) {
  const entries = Object.entries(stats ?? {}).filter(([, v]) => typeof v === "number" || typeof v === "string");
  if (!entries.length) return <></>;
  return (
    <span class="d-inline-flex flex-wrap gap-1">
      {entries.map(([k, v]) => {
        const num = typeof v === "number";
        const value = k === "bytes" && num ? `${((v as number) / 1e6).toFixed(1)} Mo` : num ? fmt(v as number) : String(v);
        const zero = num && v === 0;
        const alert = num && (v as number) > 0 && (k === "errors" || k.startsWith("removed"));
        return (
          <span class={`badge text-bg-${alert ? "warning" : zero ? "secondary" : "light"} fw-normal`}>
            {value} <span class="opacity-75">{STAT_LABELS[k] ?? k.replace(/_/g, " ")}</span>
          </span>
        );
      })}
    </span>
  );
}

export function LogsTable({ logs }: { logs: SyncLog[] }) {
  if (!logs.length) return <p class="text-secondary mb-0">Aucun job pour l'instant.</p>;
  const when = (l: SyncLog) => l.startedAt.toLocaleString("fr-FR");
  const took = (l: SyncLog) => (l.finishedAt ? duration(l.startedAt, l.finishedAt) : "…");
  return (
    <>
      {/* Table on md+, stacked cards on phones: a 5-column table would scroll the details off-screen. */}
      <div class="table-responsive d-none d-md-block"><table class="table table-sm align-middle mb-0">
        <thead><tr><th>Job</th><th>Statut</th><th class="text-nowrap">Début</th><th>Durée</th><th class="w-50">Détails</th></tr></thead>
        <tbody>{logs.map((l) => (
          <tr>
            <td class="text-nowrap">{jobLabel(l.job)}</td>
            <td><Status status={l.status} /></td>
            <td class="text-nowrap small">{when(l)}</td>
            <td class="text-nowrap">{took(l)}</td>
            <td>
              {l.message && <div class="text-danger small text-break">{l.message}</div>}
              <StatChips stats={l.stats} />
            </td>
          </tr>
        ))}</tbody>
      </table></div>

      <div class="list-group d-md-none">{logs.map((l) => (
        <div class="list-group-item">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <span class="fw-semibold">{jobLabel(l.job)}</span>
            <Status status={l.status} />
          </div>
          <div class="text-secondary small mb-2">{when(l)} · {took(l)}</div>
          {l.message && <div class="text-danger small text-break mb-2">{l.message}</div>}
          <StatChips stats={l.stats} />
        </div>
      ))}</div>
    </>
  );
}

export function LogsView({ logs }: { logs: SyncLog[] }) {
  return <><Title t="Journaux" sub="Historique des traitements" /><LogsTable logs={logs} /></>;
}
