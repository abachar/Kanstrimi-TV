import { Busy } from "../ui";
import { isItemHidden, type Variant } from "@/db";
import { TmdbCell } from "./tmdb-cell";
import { VisibilityToggle } from "./visibility";
import { categoryItemsLink, isSearch, type CatalogQuery } from "./query";

/**
 * Items are a list of grid rows, not a `<table>`: a table keeps its five columns on a phone
 * and pushes the switch off-screen. On md+ the grid mimics a table, with the spans below
 * summing to 12; on a phone the same cells reflow on two columns (see `ItemRow`) — name and
 * switch on the first line, category and TMDB underneath. Spans are written whole: Tailwind
 * only generates the classes it reads in the source.
 */
const NAME_SPAN: Record<number, string> = { 9: "md:col-span-9", 7: "md:col-span-7", 6: "md:col-span-6", 4: "md:col-span-4" };
function catalogGrid(qy: CatalogQuery) {
  const flat = isSearch(qy),
    tmdb = qy.kind !== "live";
  return {
    flat,
    tmdb,
    id: "md:col-span-1",
    name: NAME_SPAN[9 - (flat ? 2 : 0) - (tmdb ? 3 : 0)],
    cat: "md:col-span-2",
    tmdbCol: "md:col-span-3",
    vis: "md:col-span-2",
  };
}

/** The row grid: two columns on a phone, twelve on md+. */
const ROW = "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-2 md:grid-cols-12";

/** Column titles, md+ only: a phone shows one item per block and needs no header. */
/** The summary of a foldable list (category, shelf, channel group): one row high, the whole width. */
export const SUMMARY = "flex h-12 w-full min-w-0 items-center gap-2 bg-muted/30 px-4 text-sm hover:bg-muted/50";

/** Continues a list when it scrolls into view or on click: the next page replaces this, where it stands. */
export const More = ({ link }: { link: string }) => (
  <div
    class="flex items-center justify-center gap-2 py-2"
    hx-get={link}
    hx-trigger="intersect once, click"
    hx-target="this"
    hx-swap="outerHTML"
    hx-indicator="this"
  >
    {/* The button is only an affordance: the click bubbles up to the row, which owns the request. */}
    <button type="button" class="btn" data-variant="link" data-size="sm">
      Charger la suite
    </button>
    <Busy label="Chargement" />
  </div>
);

export function CatalogHeader({ qy }: { qy: CatalogQuery }) {
  const g = catalogGrid(qy);
  return (
    <div class={`${ROW} bg-muted/30 text-xs font-medium text-muted-foreground max-md:hidden`}>
      <div class={g.id}>ID</div>
      <div class={g.name}>Nom</div>
      {g.flat && <div class={g.cat}>Catégorie</div>}
      {g.tmdb && <div class={g.tmdbCol}>TMDB</div>}
      <div class={g.vis}>Visibilité</div>
    </div>
  );
}

export function ItemRow({ r, qy, catLabel, catHidden = false }: { r: Variant; qy: CatalogQuery; catLabel: string; catHidden?: boolean }) {
  const hidden = isItemHidden(r) || catHidden;
  const g = catalogGrid(qy);
  return (
    <div class={`${ROW} text-sm ${hidden ? "text-muted-foreground" : ""}`} data-item-row>
      {/* `order-*` puts the switch next to the name on a phone and back in the last column on md+. */}
      <div class={`${g.id} truncate font-mono text-xs text-muted-foreground max-md:hidden`}>{r.xtreamId}</div>
      <div class={`${g.name} order-1 min-w-0`}>
        <a class={`break-words hover:underline ${hidden ? "text-muted-foreground" : "font-medium"}`} href={`/admin/item/${r.id}`}>
          {hidden ? <s>{r.name}</s> : r.name}
        </a>
        {r.cleanTitle && r.cleanTitle !== r.name && (
          <div class="text-xs text-muted-foreground">
            → {r.cleanTitle}
            {r.year ? ` (${r.year})` : ""}
          </div>
        )}
      </div>
      <div class={`${g.vis} order-2 md:order-5`}>
        <VisibilityToggle
          scope="item"
          id={r.id}
          hiddenByRule={r.hiddenByRule}
          hiddenManual={r.hiddenManual}
          catHidden={catHidden}
          qy={qy}
        />
      </div>
      {g.flat && (
        <div class={`col-span-2 ${g.cat} order-3 truncate text-xs text-muted-foreground md:text-sm ${catHidden ? "line-through" : ""}`}>
          {catLabel}
        </div>
      )}
      {g.tmdb && (
        <div class={`col-span-2 ${g.tmdbCol} order-4 min-w-0`}>
          <TmdbCell it={r} />
        </div>
      )}
    </div>
  );
}

/**
 * One page of a category, plus the sentinel that pulls the next one. `outerHTML` replaces
 * the sentinel with the next batch, so the infinite scroll is per-category and never holds
 * more than a page of unseen rows. `intersect`, not `revealed`: htmx only polls `revealed`
 * on scroll, so a fast flick past the sentinel would leave the list silently truncated.
 * `click` is the manual way out if the observer never fires at all.
 */
export function CategoryItems({
  qy,
  cat,
  rows,
  catHidden,
  hasMore,
}: {
  qy: CatalogQuery;
  cat: string;
  rows: Variant[];
  catHidden: boolean;
  hasMore: boolean;
}) {
  return (
    <>
      {rows.map((r) => (
        <ItemRow r={r} qy={qy} catLabel="" catHidden={catHidden} />
      ))}
      {rows.length === 0 && qy.page === 1 && <div class="px-4 py-3 text-sm text-muted-foreground">Aucun élément.</div>}
      {hasMore && <More link={categoryItemsLink(qy, cat, qy.page + 1)} />}
    </>
  );
}
