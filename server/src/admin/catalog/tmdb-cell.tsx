import type { Item } from "@/db";
import type { TmdbCandidate } from "@/admin/tmdb-correction";
import { MATCH_LABELS } from "../labels";

/** The TMDB association of an entry, with the search-and-assign form folded under "Corriger". */
export function TmdbCell({ it, results }: { it: Item; results?: TmdbCandidate[] }) {
  const kind = it.kind === "vod" ? "movie" : "tv";
  const cls = it.matchStatus === "matched" || it.matchStatus === "manual" ? "success" : it.matchStatus === "unmatched" ? "danger" : "secondary";
  const target = `#tmdb-${it.id}`;
  const score = it.matchScore != null && it.matchStatus !== "manual" ? ` ${Math.round(it.matchScore * 100)} %` : "";
  return (
    <div id={`tmdb-${it.id}`}>
      <div class="d-flex align-items-center gap-2 small">
        {it.tmdbId
          ? <a href={`https://www.themoviedb.org/${kind}/${it.tmdbId}`} target="_blank" rel="noreferrer" aria-label={`Fiche TMDB ${it.tmdbId} (nouvel onglet)`}>#{it.tmdbId}</a>
          : <span class="text-secondary" aria-label="Sans fiche TMDB">—</span>}
        <span class={`badge text-bg-${cls}`}>{MATCH_LABELS[it.matchStatus] ?? it.matchStatus}{score}</span>
        <button type="button" class="btn btn-link btn-sm px-0 py-1" data-bs-toggle="collapse" data-bs-target={`#fix-${it.id}`} aria-expanded={Boolean(results)} aria-controls={`fix-${it.id}`}>Corriger</button>
      </div>
      <div class={`collapse${results ? " show" : ""} mt-2`} id={`fix-${it.id}`}>
        <form hx-post="/admin/catalog/tmdb-search" hx-target={target} hx-swap="outerHTML" hx-indicator="this" class="input-group input-group-sm mb-2">
          <input type="hidden" name="id" value={it.id} />
          <input class="form-control" name="q" value={it.cleanTitle ?? it.name} aria-label="Titre à chercher sur TMDB" />
          <button class="btn btn-outline-secondary">Chercher</button>
        </form>
        {results && (
          <ul class="list-unstyled small mb-2">
            {results.map((r) => <li><button type="button" class="btn btn-link btn-sm px-0 py-1" hx-post="/admin/catalog/tmdb-assign" hx-vals={JSON.stringify({ id: it.id, tmdb_id: r.id })} hx-target={target} hx-swap="outerHTML" aria-label={`Associer à ${r.label}`}>Associer</button> {r.label} <span class="text-secondary">#{r.id}</span></li>)}
            {!results.length && <li class="text-secondary">Aucun résultat.</li>}
          </ul>
        )}
        <form hx-post="/admin/catalog/tmdb-assign" hx-target={target} hx-swap="outerHTML" class="input-group input-group-sm">
          <input type="hidden" name="id" value={it.id} />
          <input class="form-control" name="tmdb_id" inputmode="numeric" placeholder="ID TMDB (vide = retirer)" aria-label="Identifiant TMDB à associer" />
          <button class="btn btn-outline-secondary">Associer</button>
        </form>
      </div>
    </div>
  );
}
