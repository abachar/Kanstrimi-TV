import type { StudioRow, StudioSuggestion } from "@/catalog";
import { Badge, Card, Empty, Table, Title } from "../ui";
import { Icon } from "../icons";
import { fmt } from "../format";

const KIND = { company: "Studio", network: "Chaîne" } as const;

/** TMDB logos are transparent PNGs drawn for a light background. */
const Logo = ({ path, name }: { path: string | null; name: string }) =>
  path ? (
    <img
      src={`/img/w92${path}`}
      alt={name}
      width="92"
      height="32"
      class="h-8 w-[92px] rounded bg-white object-contain p-1"
      loading="lazy"
    />
  ) : (
    <div class="h-8 w-[92px] rounded bg-muted" aria-hidden="true"></div>
  );

export function StudiosView({ studios, suggestions }: { studios: StudioRow[]; suggestions: StudioSuggestion[] }) {
  return (
    <>
      <Title
        t="Studios"
        sub="Les hubs de l'app : une rangée « Studios » dans Films et dans Séries, dans cet ordre. Un studio sans titre visible du type n'y apparaît pas."
      />
      <Card title="Affichés dans l'app" extra={fmt(studios.length)}>
        {studios.length === 0 ? (
          <Empty title="Aucun studio" sub="Ajoutez-en depuis les suggestions ci-dessous." />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Logo</th>
                <th>Nom</th>
                <th>Type</th>
                <th class="text-right">Films</th>
                <th class="text-right">Séries</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {studios.map((s, i) => (
                <tr>
                  <td>
                    <Logo path={s.logoPath} name={s.name} />
                  </td>
                  <td class="font-medium">{s.name}</td>
                  <td>
                    <Badge tone="plain">{KIND[s.kind]}</Badge>
                  </td>
                  <td class="text-right tabular-nums">{fmt(s.movies)}</td>
                  <td class="text-right tabular-nums">{fmt(s.series)}</td>
                  <td>
                    <div class="flex justify-end gap-1">
                      <form method="post" action={`/admin/studios/${s.id}/up`}>
                        <button class="btn" data-variant="ghost" data-size="icon-sm" title="Monter" disabled={i === 0}>
                          <Icon name="arrow-up" />
                        </button>
                      </form>
                      <form method="post" action={`/admin/studios/${s.id}/down`}>
                        <button class="btn" data-variant="ghost" data-size="icon-sm" title="Descendre" disabled={i === studios.length - 1}>
                          <Icon name="arrow-down" />
                        </button>
                      </form>
                      <form
                        method="post"
                        action={`/admin/studios/${s.id}/remove`}
                        onsubmit={`return confirm('Retirer ${s.name.replace(/'/g, "")} ?')`}
                      >
                        <button class="btn" data-variant="ghost" data-size="icon-sm" title="Retirer">
                          <Icon name="trash" />
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <Card
        title="Suggestions"
        hint="Les studios et chaînes les plus présents parmi les contenus visibles, pas encore affichés."
        extra={fmt(suggestions.length)}
      >
        {suggestions.length === 0 ? (
          <Empty title="Aucune suggestion" sub="Lancez l'enrichissement TMDB puis le groupement." />
        ) : (
          <ul class="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {suggestions.map((s) => (
              <li class="flex items-center gap-3 rounded-lg border p-2">
                <Logo path={s.logoPath} name={s.name} />
                <div class="flex min-w-0 flex-1 flex-col">
                  <span class="truncate font-medium">{s.name}</span>
                  <span class="text-sm text-muted-foreground">
                    {KIND[s.kind]} · {fmt(s.count)} titres
                  </span>
                </div>
                <form method="post" action="/admin/studios">
                  <input type="hidden" name="kind" value={s.kind} />
                  <input type="hidden" name="tmdb_id" value={s.tmdbId} />
                  <button class="btn" data-variant="outline" data-size="sm">
                    <Icon name="plus" />
                    Ajouter
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
