import { Title, Card, Badge, Empty, Meter, Table } from "../ui";
import { ago, fmt } from "../format";
import type { HistoryRow } from "./data";

const clock = (s: number) => {
  const h = Math.floor(s / 3600),
    m = Math.floor((s % 3600) / 60);
  return h ? `${h} h ${String(m).padStart(2, "0")}` : `${m} min`;
};

const Action = ({
  row,
  verb,
  label,
  variant,
  confirm,
}: {
  row: HistoryRow;
  verb: string;
  label: string;
  variant: string;
  confirm?: string;
}) => (
  <form
    method="post"
    action={`/admin/history/${encodeURIComponent(row.key)}/${verb}`}
    onsubmit={confirm ? `return confirm('${confirm}')` : undefined}
  >
    <button class="btn" data-variant={variant} data-size="sm">
      {label}
    </button>
  </form>
);

function Rows({ rows, finished }: { rows: HistoryRow[]; finished: boolean }) {
  if (!rows.length) return <Empty title="Rien pour l'instant" />;
  return (
    <Table>
      <thead>
        <tr>
          <th>Titre</th>
          <th>Position</th>
          <th class="text-end">%</th>
          <th>Dernière lecture</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr>
            <td>
              <div class="flex items-center gap-2">
                {r.card?.poster && (
                  <img src={r.card.poster} alt="" width="28" height="42" class="h-[42px] w-7 rounded object-cover" loading="lazy" />
                )}
                <span class="flex items-center gap-2">
                  {r.content ? r.label : <code class="font-mono text-xs">{r.key}</code>}
                  {!r.content && (
                    <Badge tone="warn" title="La clé ne pointe plus sur aucun contenu">
                      orphelin
                    </Badge>
                  )}
                </span>
              </div>
            </td>
            <td class="text-sm tabular-nums">
              <div class="flex min-w-32 flex-col gap-1">
                <span>
                  {clock(r.progress.position)} / {r.progress.duration ? clock(r.progress.duration) : "?"}
                </span>
                <Meter value={r.percent} max={100} label={`${r.percent} %`} />
              </div>
            </td>
            <td class="text-end tabular-nums">{fmt(r.percent)} %</td>
            <td class="text-sm text-muted-foreground">{ago(r.progress.updatedAt.toISOString())}</td>
            <td>
              <div class="flex justify-end gap-1">
                {finished ? (
                  <Action row={r} verb="unfinished" label="Marquer non vu" variant="outline" />
                ) : (
                  <>
                    <Action row={r} verb="finished" label="Marquer vu" variant="secondary" />
                    <Action row={r} verb="delete" label="Effacer" variant="destructive" confirm="Effacer cette position ?" />
                  </>
                )}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

export function HistoryView({ ongoing, finished }: { ongoing: HistoryRow[]; finished: HistoryRow[] }) {
  return (
    <>
      <Title t="Historique" sub="Les positions de lecture telles que l'app les envoie ; « vu » à partir de 90 %" />
      <Card title="En cours" extra={fmt(ongoing.length)}>
        <Rows rows={ongoing} finished={false} />
      </Card>
      <Card title="Vus" extra={fmt(finished.length)} hint="Marquer non vu efface la position : une reprise à 0 n'a pas de sens">
        <Rows rows={finished} finished={true} />
      </Card>
    </>
  );
}
