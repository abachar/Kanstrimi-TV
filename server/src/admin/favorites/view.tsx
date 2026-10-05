import { Badge, Card, Empty, Title } from "../ui";
import { Icon } from "../icons";
import { fmt } from "../format";
import type { FavoriteRow } from "./data";

const KIND: Record<string, string> = { live: "Chaîne", vod: "Film", series: "Série" };

export function FavoritesView({ rows }: { rows: FavoriteRow[] }) {
  return (
    <>
      <Title t="Favoris" sub={`« Ma liste » telle que l'app l'a enregistrée · ${fmt(rows.length)} entrées`} />
      <Card title="Ma liste" icon="favorites" extra={fmt(rows.length)}>
        {rows.length === 0 ? (
          <Empty title="Aucun favori" sub="L'app n'a encore rien ajouté à « Ma liste »." />
        ) : (
          <ul class="flex flex-col divide-y">
            {rows.map((r) => (
              <li class="flex items-center gap-3 py-3">
                {r.card?.poster ? (
                  <img
                    src={r.card.poster}
                    alt=""
                    width="46"
                    height="69"
                    class="h-[69px] w-[46px] shrink-0 rounded-md object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div class="h-[69px] w-[46px] shrink-0 rounded-md bg-muted" aria-hidden="true"></div>
                )}
                <div class="flex min-w-0 flex-1 flex-col gap-1">
                  <div class="truncate font-medium">{r.content?.title ?? <code class="font-mono text-xs">{r.key}</code>}</div>
                  <div class="text-sm text-muted-foreground">
                    {r.content
                      ? `${KIND[r.content.kind] ?? r.content.kind}${r.content.year ? ` · ${r.content.year}` : ""}`
                      : "clé sans contenu"}{" "}
                    · ajouté le {r.addedAt.toLocaleDateString("fr-FR")}
                  </div>
                  {r.hidden && (
                    <div>
                      <Badge tone="warn" title="L'app ne voit pas ce favori">
                        invisible pour l'app · {r.hidden}
                      </Badge>
                    </div>
                  )}
                </div>
                <form
                  method="post"
                  action={`/admin/favorites/${encodeURIComponent(r.key)}/remove`}
                  hx-post={`/admin/favorites/${encodeURIComponent(r.key)}/remove`}
                  hx-confirm="Retirer ce favori ?"
                >
                  <button class="btn" data-variant="destructive" data-size="sm">
                    <Icon name="trash" />
                    Retirer
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
