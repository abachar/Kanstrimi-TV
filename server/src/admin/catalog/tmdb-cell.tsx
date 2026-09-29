import type { TmdbCandidate } from "@/catalog";
import { tmdbMediaType, type Variant } from "@/db";
import { MATCH_LABELS } from "../labels";
import { Badge, type Tone } from "../ui";

const MATCH_TONES: Record<string, Tone> = { matched: "ok", manual: "ok", unmatched: "warn" };

/** The TMDB association of an entry, with the search-and-assign form folded under "Corriger". */
export function TmdbCell({ it, results }: { it: Variant; results?: TmdbCandidate[] }) {
  const kind = tmdbMediaType(it.kind);
  const target = `#tmdb-${it.id}`;
  const score = it.matchScore != null && it.matchStatus !== "manual" ? ` ${Math.round(it.matchScore * 100)} %` : "";
  return (
    <details id={`tmdb-${it.id}`} class="text-sm" open={Boolean(results)}>
      {/* The summary is the "Corriger" toggle; the TMDB link beside it stays a link (an interactive child does not toggle). */}
      <summary class="flex flex-wrap items-center gap-2">
        {it.tmdbId ? (
          <a
            class="font-mono text-xs hover:underline"
            href={`https://www.themoviedb.org/${kind}/${it.tmdbId}`}
            target="_blank"
            rel="noreferrer"
            aria-label={`Fiche TMDB ${it.tmdbId} (nouvel onglet)`}
          >
            #{it.tmdbId}
          </a>
        ) : (
          <span class="text-muted-foreground" aria-label="Sans fiche TMDB">
            —
          </span>
        )}
        <Badge tone={MATCH_TONES[it.matchStatus] ?? "plain"}>
          {MATCH_LABELS[it.matchStatus] ?? it.matchStatus}
          {score}
        </Badge>
        <span class="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">Corriger</span>
      </summary>
      <div class="mt-2 flex flex-col gap-2">
        <form hx-post="/admin/catalog/tmdb-search" hx-target={target} hx-swap="outerHTML" hx-indicator="this" class="flex gap-2">
          <input type="hidden" name="id" value={it.id} />
          <input class="input h-8" type="text" name="q" value={it.cleanTitle ?? it.name} aria-label="Titre à chercher sur TMDB" />
          <button class="btn" data-variant="outline" data-size="sm">
            Chercher
          </button>
        </form>
        {results && (
          <ul class="flex flex-col">
            {results.map((r) => (
              <li class="flex items-center gap-2">
                <button
                  type="button"
                  class="btn px-0"
                  data-variant="link"
                  data-size="sm"
                  hx-post="/admin/catalog/tmdb-assign"
                  hx-vals={JSON.stringify({ id: it.id, tmdb_id: r.id })}
                  hx-target={target}
                  hx-swap="outerHTML"
                  aria-label={`Associer à ${r.label}`}
                >
                  Associer
                </button>
                <span class="min-w-0 truncate">
                  {r.label} <span class="text-muted-foreground">#{r.id}</span>
                </span>
              </li>
            ))}
            {!results.length && <li class="text-muted-foreground">Aucun résultat.</li>}
          </ul>
        )}
        <form hx-post="/admin/catalog/tmdb-assign" hx-target={target} hx-swap="outerHTML" class="flex gap-2">
          <input type="hidden" name="id" value={it.id} />
          <input
            class="input h-8"
            type="text"
            name="tmdb_id"
            inputmode="numeric"
            placeholder="ID TMDB (vide = retirer)"
            aria-label="Identifiant TMDB à associer"
          />
          <button class="btn" data-variant="outline" data-size="sm">
            Associer
          </button>
        </form>
      </div>
    </details>
  );
}
