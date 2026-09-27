import type { Category, Item } from "@/db";
import { CATALOG_PAGE } from "./data";
import { isCategoryHidden } from "@/db";
import { fmt } from "../format";
import { Title, Options, Pagination } from "../ui";
import { KIND_TITLES } from "../labels";
import { CategoryRow } from "./category";
import { CatalogHeader, ItemRow } from "./row";
import { catalogLink, type CatalogQuery, type CatalogView as ViewMode } from "./query";

const VIEWS: [ViewMode, string][] = [
  ["grouped", "Par catégorie"],
  ["flat", "Liste"],
  ["groups", "Groupes"],
];

/** Title and view switch shared by the three presentations of a kind; the kind itself is chosen in the top menu. */
export function CatalogShell({ qy, children }: { qy: CatalogQuery; children?: unknown }) {
  return (
    <>
      <Title t={KIND_TITLES[qy.kind]} sub="Parcourir, filtrer et corriger le contenu importé" />
      <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
        <div class="btn-group btn-group-sm ms-md-auto" role="group" aria-label="Présentation">
          {VIEWS.map(([view, label]) => {
            const current = qy.view === view;
            return (
              <a
                class={`btn btn-${current ? "" : "outline-"}secondary`}
                {...(current ? { "aria-current": "true" } : {})}
                href={catalogLink(qy, { view, page: 1 })}
              >
                {label}
              </a>
            );
          })}
        </div>
      </div>
      {children}
    </>
  );
}

/** Filters, then either the accordion of categories (rows loaded on demand) or the flat, paginated list. */
export function CatalogView({
  qy,
  cats,
  rows,
  total,
  catCounts,
}: {
  qy: CatalogQuery;
  cats: Category[];
  rows: Item[];
  total: number;
  catCounts: Map<string, number>;
}) {
  const catName = new Map(cats.map((c) => [c.xtreamId, c.name]));
  const hiddenCats = new Set(cats.filter(isCategoryHidden).map((c) => c.xtreamId));
  const grouped = qy.view === "grouped";
  return (
    <CatalogShell qy={qy}>
      <form method="get" action="/admin/catalog" class="row g-2 mb-3" role="search">
        <input type="hidden" name="kind" value={qy.kind} />
        {/* Searching is a flat-list activity: a hit buried in a collapsed group is a hit nobody sees. */}
        <input type="hidden" name="view" value="flat" />
        <div class="col-12 col-md-3">
          <input
            class="form-control"
            type="search"
            name="q"
            value={qy.q}
            placeholder="Rechercher un titre…"
            aria-label="Rechercher un titre"
            enterkeyhint="search"
          />
        </div>
        <div class="col-12 col-md-3">
          <select class="form-select" name="cat" aria-label="Catégorie">
            <option value="">Toutes catégories</option>
            <Options opts={cats.map((c) => [c.xtreamId, c.name] as const)} cur={qy.cat} />
          </select>
        </div>
        <div class="col-6 col-md-2">
          <select class="form-select" name="vis" aria-label="Visibilité">
            <Options
              opts={[
                ["", "Visibles et masqués"],
                ["visible", "Visibles"],
                ["hidden", "Masqués"],
              ]}
              cur={qy.vis}
            />
          </select>
        </div>
        {qy.kind !== "live" && (
          <div class="col-6 col-md-2">
            <select class="form-select" name="tmdb" aria-label="TMDB">
              <Options
                opts={[
                  ["", "TMDB : tous"],
                  ["matched", "TMDB associé"],
                  ["unmatched", "TMDB introuvable"],
                  ["pending", "TMDB en attente"],
                ]}
                cur={qy.tmdb}
              />
            </select>
          </div>
        )}
        <div class={`col-12 ${qy.kind !== "live" ? "col-md-2" : "col-md-4"} d-grid`}>
          <button class="btn btn-secondary">Filtrer</button>
        </div>
      </form>
      {grouped ? (
        <>
          <p class="text-secondary small">
            {fmt(cats.length)} catégorie(s) · {fmt(total)} élément(s)
          </p>
          <div class="accordion">
            {cats.map((c) => (
              <CategoryRow c={c} qy={qy} count={catCounts.get(c.xtreamId)} />
            ))}
          </div>
          {cats.length === 0 && <p class="text-secondary">Aucune catégorie — lancer l'étape 1.</p>}
        </>
      ) : (
        <>
          <p class="text-secondary small">{fmt(total)} résultat(s)</p>
          <div class="list-group mb-3">
            <CatalogHeader qy={qy} />
            {rows.map((r) => (
              <ItemRow
                r={r}
                qy={qy}
                catLabel={catName.get(r.categoryXtreamId ?? "") ?? r.categoryXtreamId ?? ""}
                catHidden={hiddenCats.has(r.categoryXtreamId ?? "")}
              />
            ))}
            {rows.length === 0 && <div class="list-group-item small text-secondary">Aucun résultat.</div>}
          </div>
          <Pagination page={qy.page} total={total} size={CATALOG_PAGE} link={(page) => catalogLink(qy, { page })} />
        </>
      )}
    </CatalogShell>
  );
}
