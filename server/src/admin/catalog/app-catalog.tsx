import type { Content } from "@/db";
import { qualityOfRank } from "@/catalog";
import type { SagaWire, StudioWire } from "@/player";
import { PAGE, type Shelf, type ShelfPage } from "./app-data";
import { fmt } from "../format";
import { Badge, Empty } from "../ui";
import { contentKeyLink } from "../content/links";
import { More, SUMMARY } from "./list-parts";

/**
 * « Catalogue » view of films and series: the shelves of the app's screen, in its order, one
 * `<details>` each, its rows loaded the first time it opens and continued as it scrolls, as the
 * Xtream view's categories are. Studios and sagas open on their studios and sagas, each one
 * opening on its titles.
 */

const domId = (shelf: string) => `shelf-${shelf.replace(/[^a-z0-9]+/gi, "-")}`;
export const shelfLink = (kind: string, shelf: string, opts: { cursor?: string | null; n?: number } = {}) =>
  `/admin/catalog/shelf?${new URLSearchParams({ kind, shelf, ...(opts.cursor ? { cursor: opts.cursor } : {}), n: String(opts.n ?? 0) })}`;

/** A foldable shelf; `nested` for a studio or a saga inside its shelf. */
function ShelfFold({
  kind,
  shelf,
  name,
  total,
  nested = false,
}: {
  kind: string;
  shelf: string;
  name: string;
  total?: number;
  nested?: boolean;
}) {
  const id = domId(shelf);
  return (
    <details hx-get={shelfLink(kind, shelf)} hx-target={`#${id}`} hx-swap="beforeend" hx-trigger="toggle once">
      <summary class={nested ? `${SUMMARY} ps-8` : SUMMARY}>
        <span class="truncate font-medium">{name}</span>
        {total !== undefined && <Badge tone="plain">{fmt(total)}</Badge>}
      </summary>
      <div id={id} class="flex flex-col divide-y border-t"></div>
    </details>
  );
}

export function AppCatalogView({ kind, shelves }: { kind: "vod" | "series"; shelves: Shelf[] }) {
  if (!shelves.length) return <Empty title="Rien à montrer" sub="Aucun contenu visible pour l'app." />;
  return (
    <>
      <p class="text-sm text-muted-foreground">
        Lecture seule : les rangées que l'app affiche, dans son ordre, chacune avec tous ses titres (contenus visibles, adultes selon le
        réglage). Cliquer un titre ouvre sa fiche et ses variantes.
      </p>
      <div class="flex flex-col divide-y overflow-hidden rounded-xl border">
        {shelves.map((s) => (
          <ShelfFold kind={kind} shelf={s.id} name={s.name} total={s.total} />
        ))}
      </div>
    </>
  );
}

/** The grid of a title row: twelve columns on md+, the title alone on its line on a phone. */
const ROW = "grid grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1 px-4 py-2 text-sm md:grid-cols-12";
const CELL = "max-md:col-start-2";

const TitleHeader = () => (
  <div class={`${ROW} bg-muted/30 text-xs font-medium text-muted-foreground max-md:hidden`}>
    <div class="text-end md:col-span-1">#</div>
    <div class="md:col-span-4">Titre</div>
    <div class="md:col-span-1">Année</div>
    <div class="md:col-span-2">Qualité</div>
    <div class="md:col-span-2">Langues</div>
    <div class="md:col-span-1">Variantes</div>
    <div class="md:col-span-1">Ajouté</div>
  </div>
);

function TitleRow({ c, rank }: { c: Content; rank: number }) {
  const quality = [qualityOfRank(c.maxQualityRank), c.dynamicRange].filter(Boolean).join(" · ");
  return (
    <div class={ROW}>
      <div class="text-end text-muted-foreground tabular-nums md:col-span-1">{rank}</div>
      <div class="min-w-0 md:col-span-4">
        <a
          class={`break-words hover:underline ${c.visible ? "font-medium" : "text-muted-foreground line-through"}`}
          href={contentKeyLink(c.key)}
        >
          {c.title}
        </a>
      </div>
      <div class={`${CELL} text-muted-foreground tabular-nums md:col-span-1`}>
        {c.endYear ? `${c.year ?? "?"}–${c.endYear}` : (c.year ?? "")}
      </div>
      <div class={`${CELL} md:col-span-2`}>{quality && <Badge tone="muted">{quality}</Badge>}</div>
      <div class={`${CELL} flex flex-wrap gap-1 md:col-span-2`}>
        {c.languages.map((l) => (
          <Badge tone="muted">{l}</Badge>
        ))}
      </div>
      <div class={`${CELL} tabular-nums md:col-span-1`}>{c.variantCount}</div>
      <div class={`${CELL} text-muted-foreground tabular-nums md:col-span-1`}>{c.addedAt.toLocaleDateString("fr-FR")}</div>
    </div>
  );
}

const StudioFolds = ({ kind, studios }: { kind: string; studios: StudioWire[] }) => (
  <>
    {studios.map((s) => (
      <ShelfFold kind={kind} shelf={`studio:${s.id}`} name={s.name} total={s.count} nested />
    ))}
  </>
);
const SagaFolds = ({ sagas }: { sagas: SagaWire[] }) => (
  <>
    {sagas.map((s) => (
      <ShelfFold kind="vod" shelf={s.id} name={s.name} total={s.count} nested />
    ))}
  </>
);

/** One page of a shelf, appended to it: titles from rank `n + 1`, or studios, or sagas. */
export function ShelfRows({ kind, shelf, page, n }: { kind: string; shelf: string; page: ShelfPage; n: number }) {
  if (page.type === "studios") return <StudioFolds kind={kind} studios={page.studios} />;
  if (page.type === "sagas")
    return (
      <>
        <SagaFolds sagas={page.sagas} />
        {page.next && <More link={shelfLink(kind, shelf, { cursor: page.next })} />}
      </>
    );
  return (
    <>
      {n === 0 && <TitleHeader />}
      {page.rows.map((c, i) => (
        <TitleRow c={c} rank={n + i + 1} />
      ))}
      {page.rows.length === 0 && n === 0 && <div class="px-4 py-3 text-sm text-muted-foreground">Aucun titre.</div>}
      {page.next && <More link={shelfLink(kind, shelf, { cursor: page.next, n: n + page.rows.length })} />}
    </>
  );
}

export const foundLink = (kind: string, q: string, n: number) => `/admin/catalog/found?${new URLSearchParams({ kind, q, n: String(n) })}`;

/** One page of the contents a « Catalogue » search found, from rank `n + 1`. */
export function FoundRows({ kind, q, rows, total, n }: { kind: string; q: string; rows: Content[]; total: number; n: number }) {
  return (
    <>
      {n === 0 && <TitleHeader />}
      {rows.map((c, i) => (
        <TitleRow c={c} rank={n + i + 1} />
      ))}
      {n + rows.length < total && rows.length === PAGE && <More link={foundLink(kind, q, n + rows.length)} />}
    </>
  );
}

/** The results of a « Catalogue » search: the contents, latest first, hidden ones struck through. */
export const FoundView = ({ kind, q, rows, total }: { kind: string; q: string; rows: Content[]; total: number }) => (
  <>
    <p class="text-sm text-muted-foreground">
      {fmt(total)} contenu{total > 1 ? "s" : ""} pour « {q} », du plus récent au plus ancien ·{" "}
      <a class="underline underline-offset-4 hover:text-foreground" href={`/admin/catalog?kind=${kind}`}>
        revenir aux rangées
      </a>
    </p>
    {total > 0 ? (
      <div class="flex flex-col divide-y overflow-hidden rounded-xl border">
        <FoundRows kind={kind} q={q} rows={rows} total={total} n={0} />
      </div>
    ) : (
      <Empty title="Aucun contenu" sub="Aucune variante ne correspond à la recherche." />
    )}
  </>
);
