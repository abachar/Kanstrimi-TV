import { Badge, Card, Empty, Table, Title } from "../ui";
import { Icon } from "../icons";
import { ago, fmt } from "../format";
import type { FavoriteRow } from "./data";

const KIND: Record<string, string> = { live: "Chaîne", vod: "Film", series: "Série" };

function Rows({ rows }: { rows: FavoriteRow[] }) {
  return (
    <Table>
      <thead>
        <tr>
          <th>Titre</th>
          <th>Type</th>
          <th>Profil</th>
          <th>Ajouté</th>
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
                <span class="flex flex-wrap items-center gap-2">
                  {r.content ? (
                    <a class="hover:underline" href={`/admin/content/${r.content.id}`}>
                      {r.content.title}
                    </a>
                  ) : (
                    <code class="font-mono text-xs">{r.key}</code>
                  )}
                  {r.hidden && (
                    <Badge tone="warn" title="L'app ne voit pas ce favori">
                      invisible pour l'app · {r.hidden}
                    </Badge>
                  )}
                </span>
              </div>
            </td>
            <td class="text-sm text-muted-foreground">
              {r.content ? `${KIND[r.content.kind] ?? r.content.kind}${r.content.year ? ` · ${r.content.year}` : ""}` : "clé sans contenu"}
            </td>
            <td class="text-sm">{r.profile.name}</td>
            <td class="text-sm text-muted-foreground">{ago(r.addedAt.toISOString())}</td>
            <td>
              <div class="flex justify-end">
                <form
                  method="post"
                  action={`/admin/favorites/${r.profile.id}/${encodeURIComponent(r.key)}/remove`}
                  hx-post={`/admin/favorites/${r.profile.id}/${encodeURIComponent(r.key)}/remove`}
                  hx-confirm="Retirer ce favori ?"
                >
                  <button class="btn" data-variant="destructive" data-size="sm">
                    <Icon name="trash" />
                    Retirer
                  </button>
                </form>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

export function FavoritesView({ rows }: { rows: FavoriteRow[] }) {
  return (
    <>
      <Title t="Favoris" sub={`« Ma liste » de chaque profil, telle que l'app l'a enregistrée · ${fmt(rows.length)} entrées`} />
      <Card title="Ma liste" icon="favorites" extra={fmt(rows.length)}>
        {rows.length === 0 ? (
          <Empty title="Aucun favori" sub="Rien dans « Ma liste » : l'app ou la fiche d'un contenu y ajoute un titre." />
        ) : (
          <Rows rows={rows} />
        )}
      </Card>
    </>
  );
}
