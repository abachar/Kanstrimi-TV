import type { StudioDetail, StudioKind, StudioRow, StudioSuggestion, StudioTitle } from "@/catalog";
import { Badge, Card, Empty, Title } from "../ui";
import { Icon } from "../icons";
import { fmt } from "../format";

/** A TMDB « network » is who airs a series (Netflix, HBO, Arte), not a channel of the live TV. */
const KIND = { company: "Studio", network: "Diffuseur" } as const;

/** TMDB logos are transparent PNGs drawn for a light background. */
const Logo = ({ path, name }: { path: string | null; name: string }) =>
  path ? (
    <img
      src={`/img/w92${path}`}
      alt={name}
      width="92"
      height="32"
      class="h-8 w-16 shrink-0 rounded bg-white object-contain p-1 sm:w-[92px]"
      loading="lazy"
    />
  ) : (
    <div class="h-8 w-16 shrink-0 rounded bg-muted sm:w-[92px]" aria-hidden="true"></div>
  );

/** « Studio · FR »: the kind, and the country when TMDB has one. */
const kindOf = (s: { kind: StudioKind; country: string | null }) => `${KIND[s.kind]}${s.country ? ` · ${s.country}` : ""}`;

/** One count for the titles of a studio, split by type on hover: a company rarely has series, a network never has films. */
function Titles({ movies, series }: { movies: number; series: number }) {
  return (
    <span title={`${fmt(movies)} films · ${fmt(series)} séries`}>
      {fmt(movies + series)} titre{movies + series > 1 ? "s" : ""}
    </span>
  );
}

const studioHref = (kind: StudioKind, tmdbId: number) => `/admin/studios/${kind}:${tmdbId}`;

/** A studio or a suggestion: logo, name (whole on hover), what it is, and its actions. Logo and name open its titles. */
function StudioLine({
  href,
  logo,
  name,
  meta,
  children,
}: {
  href: string;
  logo: string | null;
  name: string;
  meta: unknown;
  children?: unknown;
}) {
  return (
    <div class="flex min-w-0 flex-1 items-center gap-3">
      <a href={href} class="shrink-0" tabindex={-1} aria-hidden="true">
        <Logo path={logo} name={name} />
      </a>
      <div class="flex min-w-0 flex-1 flex-col">
        <a href={href} class="truncate font-medium hover:underline" title={name}>
          {name}
        </a>
        <span class="truncate text-sm text-muted-foreground">{meta}</span>
      </div>
      {children}
    </div>
  );
}

export function StudiosView({ studios, suggestions, q }: { studios: StudioRow[]; suggestions: StudioSuggestion[]; q: string }) {
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
          <ol class="flex flex-col divide-y">
            {studios.map((s, i) => (
              <li class="py-2 first:pt-0 last:pb-0">
                <StudioLine
                  href={studioHref(s.kind, s.tmdbId)}
                  logo={s.logoPath}
                  name={s.name}
                  meta={
                    <>
                      {kindOf(s)} · <Titles movies={s.movies} series={s.series} />
                    </>
                  }
                >
                  <div class="flex shrink-0 gap-1">
                    <form method="post" action={`/admin/studios/${s.id}/up`}>
                      <button class="btn" data-variant="ghost" data-size="icon-sm" title="Monter" aria-label="Monter" disabled={i === 0}>
                        <Icon name="arrow-up" />
                      </button>
                    </form>
                    <form method="post" action={`/admin/studios/${s.id}/down`}>
                      <button
                        class="btn"
                        data-variant="ghost"
                        data-size="icon-sm"
                        title="Descendre"
                        aria-label="Descendre"
                        disabled={i === studios.length - 1}
                      >
                        <Icon name="arrow-down" />
                      </button>
                    </form>
                    <form
                      method="post"
                      action={`/admin/studios/${s.id}/remove`}
                      onsubmit={`return confirm('Retirer ${s.name.replace(/'/g, "")} ?')`}
                    >
                      <button class="btn" data-variant="ghost" data-size="icon-sm" title="Retirer" aria-label="Retirer">
                        <Icon name="trash" />
                      </button>
                    </form>
                  </div>
                </StudioLine>
              </li>
            ))}
          </ol>
        )}
      </Card>
      <Card
        title="Suggestions"
        hint={
          q
            ? `Studios et diffuseurs du catalogue visible dont le nom contient « ${q} », pas encore affichés.`
            : "Les studios et diffuseurs les plus présents parmi les contenus visibles, pas encore affichés ; cherchez-en un autre par son nom."
        }
        extra={fmt(suggestions.length)}
      >
        <div class="flex flex-col gap-4">
          <form method="get" action="/admin/studios" class="flex gap-2" role="search">
            <input class="input" type="search" name="q" value={q} placeholder="Pixar, Netflix…" aria-label="Chercher un studio" />
            <button class="btn" data-variant="outline">
              Chercher
            </button>
            {q && (
              <a class="btn" data-variant="ghost" href="/admin/studios">
                Effacer
              </a>
            )}
          </form>
          {suggestions.length === 0 ? (
            q ? (
              <Empty title="Aucun résultat" sub="Seuls les studios des contenus visibles et associés à TMDB sont connus." />
            ) : (
              <Empty title="Aucune suggestion" sub="Lancez l'enrichissement TMDB puis le groupement." />
            )
          ) : (
            <ul class="grid grid-cols-1 gap-2 md:grid-cols-2 2xl:grid-cols-3">
              {suggestions.map((s) => (
                <li class="rounded-lg border p-2">
                  <StudioLine
                    href={studioHref(s.kind, s.tmdbId)}
                    logo={s.logoPath}
                    name={s.name}
                    meta={`${kindOf(s)} · ${fmt(s.count)} titre${s.count > 1 ? "s" : ""}`}
                  >
                    <form method="post" action="/admin/studios" class="shrink-0">
                      <input type="hidden" name="kind" value={s.kind} />
                      <input type="hidden" name="tmdb_id" value={s.tmdbId} />
                      <button
                        class="btn"
                        data-variant="outline"
                        data-size="sm"
                        title={`Ajouter ${s.name}`}
                        aria-label={`Ajouter ${s.name}`}
                      >
                        <Icon name="plus" />
                        <span class="max-sm:hidden">Ajouter</span>
                      </button>
                    </form>
                  </StudioLine>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </>
  );
}

/** A poster, its title and year, opening the variant it plays. */
function Poster({ t }: { t: StudioTitle }) {
  const body = (
    <>
      {t.posterPath ? (
        <img
          src={`/img/w154${t.posterPath}`}
          alt=""
          width="154"
          height="231"
          class="aspect-[2/3] w-full rounded-md bg-muted object-cover"
          loading="lazy"
        />
      ) : (
        <div class="aspect-[2/3] w-full rounded-md bg-muted" aria-hidden="true"></div>
      )}
      <span class="line-clamp-2 text-sm font-medium">{t.title}</span>
      <span class="text-xs text-muted-foreground">{t.year ?? "—"}</span>
    </>
  );
  return t.itemId ? (
    <a href={`/admin/item/${t.itemId}`} class="flex flex-col gap-1 hover:opacity-80">
      {body}
    </a>
  ) : (
    <div class="flex flex-col gap-1">{body}</div>
  );
}

/** `/admin/studios/company:3`: a studio, whether the app shows it, and its visible titles as posters. */
export function StudioDetailView({ d }: { d: StudioDetail }) {
  const groups = [
    ["Films", d.titles.filter((t) => t.kind === "vod")],
    ["Séries", d.titles.filter((t) => t.kind === "series")],
  ] as const;
  return (
    <>
      <div class="flex flex-col gap-3">
        <a class="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground" href="/admin/studios">
          <Icon name="chevron-left" cls="size-4" />
          Studios
        </a>
        <div class="flex flex-wrap items-center gap-4">
          <Logo path={d.logoPath} name={d.name} />
          <div class="flex min-w-0 flex-1 flex-col gap-1">
            <h1 class="text-2xl font-semibold tracking-tight break-words">{d.name}</h1>
            <p class="text-sm text-muted-foreground">
              {kindOf(d)} · TMDB <code class="font-mono">{`${d.kind}:${d.tmdbId}`}</code> · {fmt(d.titles.length)} titre
              {d.titles.length > 1 ? "s" : ""} visible{d.titles.length > 1 ? "s" : ""}
            </p>
          </div>
          {d.chosenId ? (
            <Badge tone="ok">Affiché dans l'app</Badge>
          ) : (
            <form method="post" action="/admin/studios">
              <input type="hidden" name="kind" value={d.kind} />
              <input type="hidden" name="tmdb_id" value={d.tmdbId} />
              <button class="btn" data-variant="outline" data-size="sm">
                <Icon name="plus" />
                Ajouter à l'app
              </button>
            </form>
          )}
        </div>
      </div>
      {groups.map(([label, titles]) =>
        titles.length ? (
          <Card title={label} extra={fmt(titles.length)}>
            <ul class="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8">
              {titles.map((t) => (
                <li>
                  <Poster t={t} />
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          ""
        ),
      )}
    </>
  );
}
