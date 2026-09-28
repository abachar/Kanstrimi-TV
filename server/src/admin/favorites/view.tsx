import { Title } from "../ui";
import { fmt } from "../format";
import type { FavoriteRow } from "./data";

const KIND: Record<string, string> = { live: "Chaîne", vod: "Film", series: "Série" };

export function FavoritesView({ rows }: { rows: FavoriteRow[] }) {
  return (
    <>
      <Title t="Favoris" sub={`« Ma liste » telle que l'app l'a enregistrée · ${fmt(rows.length)} entrées`} />
      {rows.length === 0 && <p class="text-secondary">Aucun favori : l'app n'a encore rien ajouté à « Ma liste ».</p>}
      <div class="list-group">
        {rows.map((r) => (
          <div class="list-group-item d-flex align-items-center gap-3">
            {r.card?.poster ? (
              <img src={r.card.poster} alt="" width="46" height="69" class="rounded object-fit-cover flex-shrink-0" loading="lazy" />
            ) : (
              <div class="bg-secondary-subtle rounded flex-shrink-0 p-4" aria-hidden="true"></div>
            )}
            <div class="flex-grow-1 overflow-hidden">
              <div class="fw-semibold text-truncate">{r.content?.title ?? <code>{r.key}</code>}</div>
              <div class="small text-secondary">
                {r.content
                  ? `${KIND[r.content.kind] ?? r.content.kind}${r.content.year ? ` · ${r.content.year}` : ""}`
                  : "clé sans contenu"}{" "}
                · ajouté le {r.addedAt.toLocaleDateString("fr-FR")}
              </div>
            </div>
            {r.hidden && (
              <span class="badge text-bg-warning" title="L'app ne voit pas ce favori">
                invisible pour l'app · {r.hidden}
              </span>
            )}
            <form
              method="post"
              action={`/admin/favorites/${encodeURIComponent(r.key)}/remove`}
              onsubmit="return confirm('Retirer ce favori ?')"
            >
              <button class="btn btn-outline-danger btn-sm">Retirer</button>
            </form>
          </div>
        ))}
      </div>
    </>
  );
}
