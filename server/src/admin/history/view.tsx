import { runtimeText } from "@/player";
import { Title, Card, Badge, Empty, Meter, Table } from "../ui";
import { Icon, type IconName } from "../icons";
import { ago, fmt } from "../format";
import type { HistoryRow, MostPlayedRow } from "./data";

const clock = (s: number) => runtimeText(Math.floor(s / 60));

const Action = ({
  row,
  verb,
  label,
  icon,
  variant,
  confirm,
}: {
  row: HistoryRow;
  verb: string;
  label: string;
  icon: IconName;
  variant: string;
  confirm?: string;
}) => (
  <form
    method="post"
    action={`/admin/history/${row.progress.profileId}/${encodeURIComponent(row.key)}/${verb}`}
    {...(confirm
      ? { "hx-post": `/admin/history/${row.progress.profileId}/${encodeURIComponent(row.key)}/${verb}`, "hx-confirm": confirm }
      : {})}
  >
    <button class="btn" data-variant={variant} data-size="sm">
      <Icon name={icon} />
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
          <th>Profil</th>
          <th>Position</th>
          <th class="text-end">%</th>
          <th class="text-end">Lectures</th>
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
            <td class="text-sm">{r.profileName}</td>
            <td class="text-sm tabular-nums">
              <div class="flex min-w-32 flex-col gap-1">
                <span>
                  {clock(r.progress.position)} / {r.progress.duration ? clock(r.progress.duration) : "?"}
                </span>
                <Meter value={r.percent} max={100} label={`${r.percent} %`} />
              </div>
            </td>
            <td class="text-end tabular-nums">{fmt(r.percent)} %</td>
            <td class="text-end tabular-nums">{r.plays ? fmt(r.plays) : "—"}</td>
            <td class="text-sm text-muted-foreground">{ago(r.progress.updatedAt.toISOString())}</td>
            <td>
              <div class="flex justify-end gap-1">
                {finished ? (
                  <Action row={r} verb="unfinished" label="Marquer non vu" icon="eye-off" variant="outline" />
                ) : (
                  <>
                    <Action row={r} verb="finished" label="Marquer vu" icon="eye" variant="secondary" />
                    <Action row={r} verb="delete" label="Effacer" icon="trash" variant="destructive" confirm="Effacer cette position ?" />
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

function MostPlayed({ rows }: { rows: MostPlayedRow[] }) {
  if (!rows.length) return <Empty title="Rien pour l'instant" />;
  return (
    <Table>
      <thead>
        <tr>
          <th>Titre</th>
          <th>Profil</th>
          <th class="text-end">Lectures</th>
          <th>Dernière lecture</th>
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
                {r.content ? (
                  <a class="hover:underline" href={`/admin/content/${r.content.id}`}>
                    {r.content.kind === "series" ? `Série · ${r.content.title}` : r.content.title}
                  </a>
                ) : (
                  <code class="font-mono text-xs">{r.key}</code>
                )}
              </div>
            </td>
            <td class="text-sm">{r.profileName}</td>
            <td class="text-end tabular-nums">{fmt(r.plays)}</td>
            <td class="text-sm text-muted-foreground">{ago(r.lastAt.toISOString())}</td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

export function HistoryView({
  ongoing,
  finished,
  mostPlayed,
}: {
  ongoing: HistoryRow[];
  finished: HistoryRow[];
  mostPlayed: MostPlayedRow[];
}) {
  return (
    <>
      <Title
        t="Historique"
        sub="Les positions de lecture de chaque profil, telles que l'app les envoie ; « vu » à partir de 90 %. Une lecture = des rapports de position à moins de 6 h d'écart."
      />
      <Card
        title="Les plus regardés"
        icon="favorites"
        extra={fmt(mostPlayed.length)}
        hint="La rangée « Vos plus regardés » de l'accueil : un film lu deux fois au moins, une série dont les lectures d'épisodes atteignent cinq"
      >
        <MostPlayed rows={mostPlayed} />
      </Card>
      <Card title="En cours" icon="play" extra={fmt(ongoing.length)}>
        <Rows rows={ongoing} finished={false} />
      </Card>
      <Card
        title="Vus"
        icon="success"
        extra={fmt(finished.length)}
        hint="Marquer non vu efface la position : une reprise à 0 n'a pas de sens"
      >
        <Rows rows={finished} finished={true} />
      </Card>
    </>
  );
}
