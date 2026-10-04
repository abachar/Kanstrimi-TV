import type { WaitlistCandidate, WaitlistRow, WaitlistStatus } from "@/catalog";
import { runtimeText } from "@/player";
import { signedImagePath } from "@/shared";
import { Badge, Card, Empty, Title, type Tone } from "../ui";
import { Icon } from "../icons";
import { ago, fmt } from "../format";

const STATUS: Record<WaitlistStatus, readonly [label: string, tone: Tone]> = {
  available: ["Disponible", "ok"],
  waiting: ["En attente", "muted"],
  started: ["Entamé", "info"],
};

const day = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

/** A poster, 2:3; `cls` gives its width. */
const Poster = ({ path, size, cls }: { path: string | null; size: "w185" | "w342"; cls: string }) =>
  path ? (
    <img
      src={signedImagePath(size, path)}
      alt=""
      width="185"
      height="278"
      class={`aspect-[2/3] shrink-0 rounded-md bg-muted object-cover ${cls}`}
      loading="lazy"
    />
  ) : (
    <div class={`aspect-[2/3] shrink-0 rounded-md bg-muted ${cls}`} aria-hidden="true"></div>
  );

/** « 2 h 46 », « 58 min ». */
const rating = (r: number) => r.toLocaleString("fr-FR", { maximumFractionDigits: 1 });

const TmdbLink = ({ id, title }: { id: number; title: string }) => (
  <a
    class="btn"
    data-variant="ghost"
    data-size="sm"
    href={`https://www.themoviedb.org/movie/${id}`}
    target="_blank"
    rel="noreferrer"
    title={`${title} sur TMDB`}
  >
    <Icon name="external" />
    <span class="max-sm:hidden">TMDB</span>
  </a>
);

/** An awaited movie as a sheet: poster, titles, facts, people, overview, then its state and actions. */
function Entry({ e }: { e: WaitlistRow }) {
  const s = e.sheet;
  const facts = [
    e.releaseDate ? `Sortie le ${day(e.releaseDate)}` : e.year ? String(e.year) : null,
    s?.genres.length ? s.genres.join(", ") : null,
    s?.runtime ? runtimeText(s.runtime) : null,
  ].filter(Boolean);
  return (
    <li class="flex gap-4 py-4 first:pt-0 last:pb-0 sm:gap-6">
      <Poster path={e.posterPath} size="w342" cls="w-24 sm:w-40" />
      <div class="flex min-w-0 flex-1 flex-col gap-2">
        <div class="flex flex-col">
          <h3 class="text-lg font-semibold leading-tight">
            {e.title}
            {e.year && <span class="font-normal text-muted-foreground"> ({e.year})</span>}
          </h3>
          {s?.originalTitle && <span class="text-sm text-muted-foreground italic">{s.originalTitle}</span>}
        </div>
        <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          {facts.length > 0 && <span>{facts.join(" · ")}</span>}
          {s?.certification && <Badge tone="muted">{s.certification}</Badge>}
          {s?.rating != null && (
            <span class="inline-flex items-center gap-1" title={`${fmt(s.voteCount ?? 0)} votes TMDB`}>
              <Icon name="favorites" cls="size-3.5" />
              {rating(s.rating)}
            </span>
          )}
        </div>
        {(s?.director || s?.cast.length) && (
          <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
            {s?.director && (
              <>
                <dt class="text-muted-foreground">Réalisation</dt>
                <dd>{s.director}</dd>
              </>
            )}
            {s?.cast.length ? (
              <>
                <dt class="text-muted-foreground">Avec</dt>
                <dd>{s.cast.join(", ")}</dd>
              </>
            ) : null}
          </dl>
        )}
        {s?.overview && <p class="line-clamp-4 max-w-3xl text-sm">{s.overview}</p>}
        <div class="mt-auto flex flex-wrap items-center gap-2 pt-1 text-sm text-muted-foreground">
          <Badge tone={STATUS[e.status][1]}>{STATUS[e.status][0]}</Badge>
          <span>{when(e)}</span>
          <div class="ml-auto flex gap-1">
            <TmdbLink id={e.tmdbId} title={e.title} />
            <form
              method="post"
              action={`/admin/waitlist/${e.tmdbId}/remove`}
              hx-post={`/admin/waitlist/${e.tmdbId}/remove`}
              hx-confirm={`Retirer ${e.title} de la liste ?`}
            >
              <button class="btn" data-variant="ghost" data-size="sm" title="Retirer" aria-label={`Retirer ${e.title}`}>
                <Icon name="trash" />
                <span class="max-sm:hidden">Retirer</span>
              </button>
            </form>
          </div>
        </div>
      </div>
    </li>
  );
}

/** What happened to an entry, and when: added, arrived, started. */
function when(e: WaitlistRow) {
  if (e.status === "started") return `entamé ${ago(e.startedAt!.toISOString())}`;
  if (e.status === "available") return `disponible ${ago(e.availableAt!.toISOString())}`;
  return `ajouté ${ago(e.addedAt.toISOString())}`;
}

export function WaitlistView({
  rows,
  q,
  candidates,
  error,
}: {
  rows: WaitlistRow[];
  q: string;
  /** Null: no TMDB key; undefined: no search yet. */
  candidates: WaitlistCandidate[] | null | undefined;
  error: string | null;
}) {
  return (
    <>
      <Title
        t="Liste d'attente"
        sub="Des films que le fournisseur n'a pas encore. Dès qu'une source visible existe, le film passe en tête du carrousel de l'accueil et du Top Shelf, jusqu'à ce qu'il soit entamé. Le traitement complet le vérifie à chaque passage."
      />
      <Card title="Films attendus" extra={fmt(rows.length)}>
        {rows.length === 0 ? (
          <Empty title="Aucun film attendu" sub="Cherchez-en un ci-dessous par son titre." />
        ) : (
          <ul class="flex flex-col divide-y">
            {rows.map((e) => (
              <Entry e={e} />
            ))}
          </ul>
        )}
      </Card>
      <Card title="Ajouter un film" hint="Recherche TMDB : la fiche est mise en cache dès l'ajout, prête le jour où le film arrive.">
        <div class="flex flex-col gap-4">
          <form method="get" action="/admin/waitlist" class="flex gap-2" role="search">
            <input class="input" type="search" name="q" value={q} placeholder="Titre du film" aria-label="Chercher un film sur TMDB" />
            <button class="btn" data-variant="outline">
              Chercher
            </button>
            {q && (
              <a class="btn" data-variant="ghost" href="/admin/waitlist">
                Effacer
              </a>
            )}
          </form>
          <Results q={q} candidates={candidates} error={error} />
        </div>
      </Card>
    </>
  );
}

function Results({ q, candidates, error }: { q: string; candidates: WaitlistCandidate[] | null | undefined; error: string | null }) {
  if (error) return <Empty title="TMDB injoignable" sub={error} />;
  if (candidates === null) return <Empty title="Clé API TMDB non configurée" sub="TMDB_API_KEY manque dans l'environnement." />;
  if (candidates === undefined) return null;
  if (candidates.length === 0) return <Empty title="Aucun résultat" sub={`TMDB ne connaît aucun film pour « ${q} ».`} />;
  return (
    <ul class="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
      {candidates.map((m) => (
        <li class="flex gap-3 rounded-lg border p-3">
          <Poster path={m.posterPath} size="w185" cls="w-20 sm:w-24" />
          <div class="flex min-w-0 flex-1 flex-col gap-1">
            <span class="font-medium leading-tight" title={m.title}>
              {m.title}
            </span>
            <span class="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
              <span>{[m.year ?? "année inconnue", m.originalTitle].filter(Boolean).join(" · ")}</span>
              {m.rating != null && (
                <span class="inline-flex items-center gap-1">
                  <Icon name="favorites" cls="size-3.5" />
                  {rating(m.rating)}
                </span>
              )}
            </span>
            {m.overview && <p class="line-clamp-3 text-sm">{m.overview}</p>}
            <div class="mt-auto flex items-center gap-1 pt-1">
              {m.inCatalog ? (
                <Badge tone="ok">Au catalogue</Badge>
              ) : m.waiting ? (
                <Badge tone="muted">Déjà attendu</Badge>
              ) : (
                <form method="post" action="/admin/waitlist">
                  <input type="hidden" name="tmdb_id" value={m.tmdbId} />
                  <input type="hidden" name="q" value={q} />
                  <button
                    class="btn"
                    data-variant="outline"
                    data-size="sm"
                    title={`Attendre ${m.title}`}
                    aria-label={`Attendre ${m.title}`}
                  >
                    <Icon name="plus" />
                    Attendre
                  </button>
                </form>
              )}
              <div class="ml-auto">
                <TmdbLink id={m.tmdbId} title={m.title} />
              </div>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
