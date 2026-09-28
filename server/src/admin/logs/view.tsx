import type { SyncLog } from "@/db";
import { fmt, duration } from "../format";
import { Badge, Card, Empty, Status, Table, Title } from "../ui";
import { STAT_LABELS, jobLabel } from "../labels";

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

export function LogsTable({ logs }: { logs: SyncLog[] }) {
  if (!logs.length) return <Empty title="Aucun job pour l'instant" />;
  const when = (l: SyncLog) => l.startedAt.toLocaleString("fr-FR");
  const took = (l: SyncLog) => (l.finishedAt ? duration(l.startedAt, l.finishedAt) : "…");
  return (
    <>
      {/* Table on md+, stacked rows on phones: a 5-column table would scroll the details off-screen. */}
      <div class="max-md:hidden">
        <Table>
          <thead>
            <tr>
              <th>Job</th>
              <th>Statut</th>
              <th>Début</th>
              <th>Durée</th>
              <th class="w-1/2">Détails</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr>
                <td class="font-medium">{jobLabel(l.job)}</td>
                <td>
                  <Status status={l.status} />
                </td>
                <td class="text-muted-foreground tabular-nums">{when(l)}</td>
                <td class="tabular-nums">{took(l)}</td>
                <td class="whitespace-normal">
                  <div class="flex flex-col gap-1">
                    {l.message && <div class="break-words text-destructive">{l.message}</div>}
                    <StatChips stats={l.stats} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>

      <ul class="flex flex-col divide-y md:hidden">
        {logs.map((l) => (
          <li class="flex flex-col gap-2 py-3">
            <div class="flex items-center justify-between gap-2">
              <span class="font-medium">{jobLabel(l.job)}</span>
              <Status status={l.status} />
            </div>
            <div class="text-xs text-muted-foreground">
              {when(l)} · {took(l)}
            </div>
            {l.message && <div class="break-words text-sm text-destructive">{l.message}</div>}
            <StatChips stats={l.stats} />
          </li>
        ))}
      </ul>
    </>
  );
}

export function LogsView({ logs }: { logs: SyncLog[] }) {
  return (
    <>
      <Title t="Journaux" sub="Historique des traitements" />
      <Card title="Traitements">
        <LogsTable logs={logs} />
      </Card>
    </>
  );
}
