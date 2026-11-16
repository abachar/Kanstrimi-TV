import { KINDS, type Kind } from "@/db";
import { Badge, Empty, Title } from "../ui";
import { fmt } from "../format";
import { Icon } from "../icons";
import { KIND_ICONS, KIND_TITLES } from "../labels";
import { More } from "../catalog/list-parts";
import { QuerySearchBar } from "../catalog/search-bar";
import { STREAMS_PAGE, type StreamRow } from "./data";

export const streamsLink = (kind: Kind, q = "") => `/admin/streams?${new URLSearchParams(q ? { kind, q } : { kind })}`;
const rowsLink = (kind: Kind, q: string, n: number) => `/admin/streams/rows?${new URLSearchParams({ kind, q, n: String(n) })}`;

/** How a stream came to its entry, in a few words. */
const HOW: Record<string, string> = {
  epg: "identifiant EPG",
  name: "nom, dans le pays",
  "name-global": "nom, unique au monde",
  alias: "nom que nous lui connaissons",
  ai: "nom lu par Claude",
  manual: "à la main",
  provided: "identifiant TMDB fourni",
  title: "titre déjà connu",
  search: "recherche TMDB",
};

const ROW = "grid grid-cols-1 items-center gap-x-3 gap-y-1 px-4 py-2 text-sm md:grid-cols-12";

const Header = () => (
  <div class={`${ROW} bg-muted/30 text-xs font-medium text-muted-foreground max-md:hidden`}>
    <div class="md:col-span-4">Nom chez le fournisseur</div>
    <div class="md:col-span-2">Fournisseur · catégorie</div>
    <div class="md:col-span-1">Lu</div>
    <div class="md:col-span-3">Rangé sous</div>
    <div class="md:col-span-1">Dans l'app</div>
    <div class="md:col-span-1" />
  </div>
);

/** The app's side of a stream: hidden by hand, left out by every filter, kept, or not judged yet. */
const State = ({ s }: { s: StreamRow }) =>
  s.hidden ? (
    <Badge tone="muted">masqué</Badge>
  ) : s.filtered === null ? (
    <Badge tone="warn">à juger</Badge>
  ) : s.filtered ? (
    <Badge tone="muted">écarté</Badge>
  ) : (
    <Badge tone="ok">gardé</Badge>
  );

/**
 * A stream: what the provider calls it and where he files it, what we read in its name, the entry of
 * ours it sits under and how it got there. « Ranger ailleurs » searches our entries and moves it; the
 * name opens it on its entry's page, where every other action is.
 */
function StreamLine({ s, kind }: { s: StreamRow; kind: Kind }) {
  return (
    <div>
      <div class={ROW}>
        <div class="min-w-0 md:col-span-4">
          <a class="font-medium break-words hover:underline" href={`/admin/item/${s.id}`}>
            {s.name}
          </a>
        </div>
        <div class="min-w-0 text-muted-foreground md:col-span-2">
          <div class="truncate">{s.account ?? "?"}</div>
          {s.category && <div class="truncate text-xs">{s.category}</div>}
        </div>
        <div class="flex flex-wrap gap-1 md:col-span-1">
          {[s.quality, s.lang].filter(Boolean).map((x) => (
            <Badge tone="muted">{x}</Badge>
          ))}
        </div>
        <div class="min-w-0 md:col-span-3">
          {s.contentId ? (
            <a class={`break-words hover:underline ${s.known ? "" : "text-muted-foreground"}`} href={`/admin/content/${s.contentId}`}>
              {s.entry}
            </a>
          ) : (
            <span class="text-muted-foreground">rien encore</span>
          )}
          <div class="truncate text-xs text-muted-foreground">
            {[s.known ? null : kind === "live" ? "nom non reconnu" : "sans fiche TMDB", s.how ? HOW[s.how] : null]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
        <div class="md:col-span-1">
          <State s={s} />
        </div>
        <div class="flex justify-end gap-1 md:col-span-1">
          <button
            class="btn"
            data-variant="ghost"
            data-size="icon-sm"
            title="Ranger ailleurs…"
            aria-label="Ranger ailleurs"
            hx-get={`/admin/item/${s.id}/merge-form`}
            hx-target={`#merge-slot-${s.id}`}
            hx-swap="innerHTML"
          >
            <Icon name="merge" cls="size-4" />
          </button>
          {s.manual ? (
            <button
              class="btn"
              data-variant="ghost"
              data-size="icon-sm"
              title="Rendre au rangement automatique"
              aria-label="Rendre au rangement automatique"
              hx-post={`/admin/item/${s.id}/reset`}
            >
              <Icon name="auto" cls="size-4" />
            </button>
          ) : (
            <button
              class="btn"
              data-variant="ghost"
              data-size="icon-sm"
              title="Détacher : il forme une fiche à part"
              aria-label="Détacher"
              hx-post={`/admin/item/${s.id}/split`}
            >
              <Icon name="split" cls="size-4" />
            </button>
          )}
        </div>
      </div>
      <div id={`merge-slot-${s.id}`} />
    </div>
  );
}

/** One page of the streams found, from rank `n + 1`. */
export function StreamRows({ kind, q, rows, total, n }: { kind: Kind; q: string; rows: StreamRow[]; total: number; n: number }) {
  return (
    <>
      {n === 0 && <Header />}
      {rows.map((s) => (
        <StreamLine s={s} kind={kind} />
      ))}
      {n + rows.length < total && rows.length === STREAMS_PAGE && <More link={rowsLink(kind, q, n + rows.length)} />}
    </>
  );
}

/** The kinds, as tabs: a stream is a live one, a film or a series, and each kind has its own words. */
const KindTabs = ({ kind, q }: { kind: Kind; q: string }) => (
  <nav class="flex flex-wrap gap-2" aria-label="Type de flux">
    {KINDS.map((k) => (
      <a
        class="btn"
        data-variant={k === kind ? "secondary" : "outline"}
        aria-current={k === kind ? "page" : undefined}
        href={streamsLink(k, k === kind ? q : "")}
      >
        <Icon name={KIND_ICONS[k]} />
        {KIND_TITLES[k]}
      </a>
    ))}
  </nav>
);

export function StreamsView({
  kind,
  q,
  found,
  error,
}: {
  kind: Kind;
  q: string;
  found: { rows: StreamRow[]; total: number } | null;
  error?: string | null;
}) {
  return (
    <>
      <Title t="Flux" sub="Ce que les fournisseurs envoient, flux par flux : où chacun est rangé chez nous, et le ranger ailleurs" />
      <KindTabs kind={kind} q={q} />
      <QuerySearchBar kind={kind} action="/admin/streams" hidden={{ kind }} q={q} error={error} place="streams" />
      {found && (
        <>
          <p class="text-sm text-muted-foreground">
            {fmt(found.total)} flux{q ? ` pour « ${q} »` : ""}, par nom
          </p>
          {found.total > 0 ? (
            <div class="flex flex-col divide-y overflow-hidden rounded-xl border" id="streams">
              <StreamRows kind={kind} q={q} rows={found.rows} total={found.total} n={0} />
            </div>
          ) : (
            <Empty title="Aucun flux" sub="Aucun flux de ce type ne correspond à la recherche." />
          )}
        </>
      )}
    </>
  );
}
