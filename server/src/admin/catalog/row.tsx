import type { Item } from "@/db";
import { Busy } from "../layout";
import { TmdbCell } from "./tmdb-cell";
import { VisibilityToggle } from "./visibility";
import { categoryItemsLink, type CatalogQuery } from "./query";

/**
 * Items are a list of grid rows, not a `<table>`: a table keeps its five columns on a phone
 * and pushes the switch off-screen. On md+ the grid mimics a table, with the widths below
 * summing to 12; on a phone the same cells reflow (see `ItemRow`) — name and switch on the
 * first line, category and TMDB underneath.
 */
function catalogGrid(qy: CatalogQuery) {
  const flat = qy.view === "flat", tmdb = qy.kind !== "live";
  return { flat, tmdb, id: "col-md-1", name: `col-md-${9 - (flat ? 2 : 0) - (tmdb ? 3 : 0)}`, cat: "col-md-2", tmdbCol: "col-md-3", vis: "col-md-2" };
}

/** Column titles, md+ only: a phone shows one item per block and needs no header. */
export function CatalogHeader({ qy }: { qy: CatalogQuery }) {
  const g = catalogGrid(qy);
  return (
    <div class="list-group-item d-none d-md-block small text-secondary"><div class="row g-2">
      <div class={g.id}>ID</div><div class={g.name}>Nom</div>
      {g.flat && <div class={g.cat}>Catégorie</div>}
      {g.tmdb && <div class={g.tmdbCol}>TMDB</div>}
      <div class={g.vis}>Visibilité</div>
    </div></div>
  );
}

export function ItemRow({ r, qy, catLabel, catHidden = false }: { r: Item; qy: CatalogQuery; catLabel: string; catHidden?: boolean }) {
  const hidden = r.hiddenByRule || r.hiddenManual || catHidden;
  const g = catalogGrid(qy);
  return (
    <div class={`list-group-item ${hidden ? "text-secondary" : ""}`}>
      {/* `order-*` puts the switch next to the name on a phone and back in the last column on md+. */}
      <div class="row g-2 align-items-center">
        <div class={`${g.id} d-none d-md-block font-monospace small text-secondary`}>{r.xtreamId}</div>
        <div class={`col ${g.name} order-1`}>
          <a class={`link-body-emphasis text-decoration-none${hidden ? " text-secondary" : ""}`} href={`/admin/item/${r.id}`}>{hidden ? <s>{r.name}</s> : r.name}</a>
          {r.cleanTitle && r.cleanTitle !== r.name && <div class="small text-secondary">→ {r.cleanTitle}{r.year ? ` (${r.year})` : ""}</div>}
        </div>
        <div class={`col-auto ${g.vis} order-2 order-md-5`}>
          <VisibilityToggle scope="item" id={r.id} hiddenByRule={r.hiddenByRule} hiddenManual={r.hiddenManual} catHidden={catHidden} qy={qy} />
        </div>
        {g.flat && <div class={`col-12 ${g.cat} order-3 small ${catHidden ? "text-decoration-line-through" : ""}`}>{catLabel}</div>}
        {g.tmdb && <div class={`col-12 ${g.tmdbCol} order-4`}><TmdbCell it={r} /></div>}
      </div>
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
export function CategoryItems({ qy, cat, rows, catHidden, hasMore }: { qy: CatalogQuery; cat: string; rows: Item[]; catHidden: boolean; hasMore: boolean }) {
  return (
    <>
      {rows.map((r) => <ItemRow r={r} qy={qy} catLabel="" catHidden={catHidden} />)}
      {rows.length === 0 && qy.page === 1 && <div class="list-group-item small text-secondary">Aucun élément.</div>}
      {hasMore && (
        <div class="list-group-item text-center py-2" hx-get={categoryItemsLink(qy, cat, qy.page + 1)} hx-trigger="intersect once, click" hx-target="this" hx-swap="outerHTML" hx-indicator="this">
          {/* The button is only an affordance: the click bubbles up to the row, which owns the request. */}
          <button type="button" class="btn btn-link btn-sm">Charger la suite</button>
          <Busy label="Chargement" />
        </div>
      )}
    </>
  );
}
