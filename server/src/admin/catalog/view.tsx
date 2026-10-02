import type { Category, Variant } from "@/db";
import { CATALOG_PAGE, NO_CATEGORY } from "./data";
import { isCategoryHidden } from "@/db";
import { fmt } from "../format";
import { Title, Pagination, Empty } from "../ui";
import { KIND_TITLES } from "../labels";
import { CategoryRow, NoCategoryRow } from "./category";
import { SearchBar } from "./search-bar";
import { CatalogHeader, ItemRow } from "./row";
import { catalogLink, isSearch, type CatalogQuery, type CatalogView as ViewMode } from "./query";

/** « Catalogue »: what the app shows; « Xtream »: the provider's categories and streams as they come. */
const VIEWS: [ViewMode, string][] = [
  ["catalog", "Catalogue"],
  ["xtream", "Xtream"],
];

/** Title and view switch shared by the two presentations of a kind; the kind itself is chosen in the side menu. */
export function CatalogShell({ qy, children }: { qy: CatalogQuery; children?: unknown }) {
  return (
    <>
      <Title
        t={KIND_TITLES[qy.kind]}
        sub={
          qy.view === "catalog"
            ? "Ce que l'app affiche, organisé selon nos règles"
            : "Les catégories et les flux du fournisseur, tels qu'ils arrivent"
        }
        actions={
          <div class="button-group" role="group" aria-label="Présentation">
            {VIEWS.map(([view, label]) => {
              const current = qy.view === view;
              return (
                <a
                  class="btn"
                  data-variant={current ? "secondary" : "outline"}
                  data-size="sm"
                  {...(current ? { "aria-current": "true" } : {})}
                  href={catalogLink(qy, { view, page: 1 })}
                >
                  {label}
                </a>
              );
            })}
          </div>
        }
      />
      {children}
    </>
  );
}

/** Filters, then the foldable categories (rows loaded on demand), or the flat, paginated hits of a search. */
export function CatalogView({
  qy,
  cats,
  rows,
  total,
  catCounts,
  error = null,
}: {
  qy: CatalogQuery;
  cats: Category[];
  rows: Variant[];
  total: number;
  catCounts: Map<string, number>;
  /** A query that could not run, said in a sentence. */
  error?: string | null;
}) {
  const catName = new Map(cats.map((c) => [c.xtreamId, c.name]));
  const hiddenCats = new Set(cats.filter(isCategoryHidden).map((c) => c.xtreamId));
  const searching = isSearch(qy);
  const uncategorised = catCounts.get(NO_CATEGORY) ?? 0;
  return (
    <CatalogShell qy={qy}>
      <SearchBar kind={qy.kind} view="xtream" q={qy.q} error={error} />
      {!searching ? (
        <>
          <p class="text-sm text-muted-foreground">
            {fmt(cats.length)} catégorie(s) · {fmt(total)} élément(s)
            {uncategorised ? ` · ${fmt(uncategorised)} sans catégorie` : ""}
          </p>
          <div class="flex flex-col divide-y overflow-hidden rounded-xl border">
            {uncategorised > 0 && <NoCategoryRow qy={qy} count={uncategorised} />}
            {cats.map((c) => (
              <CategoryRow c={c} qy={qy} count={catCounts.get(c.xtreamId) ?? 0} />
            ))}
          </div>
          {cats.length === 0 && <Empty title="Aucune catégorie" sub="Lancer l'étape 1 depuis le tableau de bord." />}
        </>
      ) : (
        <>
          <p class="text-sm text-muted-foreground">
            {fmt(total)} résultat(s) pour « {qy.q} » ·{" "}
            <a class="underline underline-offset-4 hover:text-foreground" href={catalogLink(qy, { q: "", page: 1 })}>
              toutes les catégories
            </a>
          </p>
          <div class="flex flex-col divide-y overflow-hidden rounded-xl border">
            <CatalogHeader qy={qy} />
            {rows.map((r) => (
              <ItemRow
                r={r}
                qy={qy}
                catLabel={r.categoryXtreamId === null ? "Sans catégorie" : (catName.get(r.categoryXtreamId) ?? r.categoryXtreamId)}
                catHidden={hiddenCats.has(r.categoryXtreamId ?? "")}
              />
            ))}
            {rows.length === 0 && <div class="px-4 py-3 text-sm text-muted-foreground">Aucun résultat.</div>}
          </div>
          <Pagination page={qy.page} total={total} size={CATALOG_PAGE} link={(page) => catalogLink(qy, { page })} />
        </>
      )}
    </CatalogShell>
  );
}
