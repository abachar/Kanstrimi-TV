import { Title, Card } from "../ui";
import { ago, fmt } from "../format";
import type { HistoryRow } from "./data";

const clock = (s: number) => {
  const h = Math.floor(s / 3600),
    m = Math.floor((s % 3600) / 60);
  return h ? `${h} h ${String(m).padStart(2, "0")}` : `${m} min`;
};

const Action = ({ row, verb, label, cls, confirm }: { row: HistoryRow; verb: string; label: string; cls: string; confirm?: string }) => (
  <form
    method="post"
    action={`/admin/history/${encodeURIComponent(row.key)}/${verb}`}
    onsubmit={confirm ? `return confirm('${confirm}')` : undefined}
  >
    <button class={`btn btn-sm ${cls}`}>{label}</button>
  </form>
);

function Table({ rows, finished }: { rows: HistoryRow[]; finished: boolean }) {
  if (!rows.length) return <p class="text-secondary mb-0">Rien pour l'instant.</p>;
  return (
    <div class="table-responsive">
      <table class="table table-sm table-hover align-middle mb-0">
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
                <div class="d-flex align-items-center gap-2">
                  {r.card?.poster && (
                    <img src={r.card.poster} alt="" width="28" height="42" class="rounded object-fit-cover" loading="lazy" />
                  )}
                  <span>
                    {r.content ? r.label : <code>{r.key}</code>}
                    {!r.content && (
                      <span class="badge text-bg-warning ms-2" title="La clé ne pointe plus sur aucun contenu">
                        orphelin
                      </span>
                    )}
                  </span>
                </div>
              </td>
              <td class="small">
                {clock(r.progress.position)} / {r.progress.duration ? clock(r.progress.duration) : "?"}
                <progress class="w-100 d-block" value={r.percent} max={100} aria-label={`${r.percent} %`}></progress>
              </td>
              <td class="text-end">{fmt(r.percent)} %</td>
              <td class="small text-secondary">{ago(r.progress.updatedAt.toISOString())}</td>
              <td>
                <div class="d-flex gap-1 justify-content-end">
                  {finished ? (
                    <Action row={r} verb="unfinished" label="Marquer non vu" cls="btn-outline-secondary" />
                  ) : (
                    <>
                      <Action row={r} verb="finished" label="Marquer vu" cls="btn-outline-success" />
                      <Action row={r} verb="delete" label="Effacer" cls="btn-outline-danger" confirm="Effacer cette position ?" />
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function HistoryView({ ongoing, finished }: { ongoing: HistoryRow[]; finished: HistoryRow[] }) {
  return (
    <>
      <Title t="Historique" sub="Les positions de lecture telles que l'app les envoie ; « vu » à partir de 90 %" />
      <Card title="En cours" extra={fmt(ongoing.length)}>
        <Table rows={ongoing} finished={false} />
      </Card>
      <Card title="Vus" extra={fmt(finished.length)} hint="Marquer non vu efface la position : une reprise à 0 n'a pas de sens">
        <Table rows={finished} finished={true} />
      </Card>
    </>
  );
}
