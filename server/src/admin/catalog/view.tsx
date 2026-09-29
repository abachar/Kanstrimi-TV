import type { Category, Variant } from "@/db";
import { CATALOG_PAGE, NO_CATEGORY } from "./data";
import { isCategoryHidden } from "@/db";
import { fmt } from "../format";
import { Title, Options, Pagination, Empty } from "../ui";
import { KIND_TITLES } from "../labels";
import { CategoryRow, NoCategoryRow } from "./category";
import { CatalogHeader, ItemRow } from "./row";
import { catalogLink, isSearch, type CatalogQuery, type CatalogView as ViewMode } from "./query";

const viewsOf = (kind: CatalogQuery["kind"]): [ViewMode, string][] => [
  ["grouped", "Par catégorie"],
  kind === "live" ? ["app", "Application"] : ["groups", "Groupes"],
];

/** Title and view switch shared by the three presentations of a kind; the kind itself is chosen in the top menu. */
export function CatalogShell({ qy, children }: { qy: CatalogQuery; children?: unknown }) {
  return (
    <>
      <Title
        t={KIND_TITLES[qy.kind]}
        sub="Parcourir, filtrer et corriger le contenu importé"
        actions={
          <div class="button-group" role="group" aria-label="Présentation">
            {viewsOf(qy.kind).map(([view, label]) => {
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
}: {
  qy: CatalogQuery;
  cats: Category[];
  rows: Variant[];
  total: number;
  catCounts: Map<string, number>;
}) {
  const catName = new Map(cats.map((c) => [c.xtreamId, c.name]));
  const hiddenCats = new Set(cats.filter(isCategoryHidden).map((c) => c.xtreamId));
  const searching = isSearch(qy);
  // « Visibles » (the default) or a TMDB filter narrows the list: a category with nothing to show under it is noise.
  const narrowing = qy.vis !== "all" || qy.tmdb !== "";
  const shownCats = narrowing ? cats.filter((c) => (catCounts.get(c.xtreamId) ?? 0) > 0) : cats;
  const uncategorised = catCounts.get(NO_CATEGORY) ?? 0;
  return (
    <CatalogShell qy={qy}>
      <form method="get" action="/admin/catalog" class="grid grid-cols-2 gap-2 md:grid-cols-12" role="search">
        <input type="hidden" name="kind" value={qy.kind} />
        <div class="col-span-2 md:col-span-5">
          <input
            class="input"
            type="search"
            name="q"
            value={qy.q}
            placeholder="Rechercher un titre…"
            aria-label="Rechercher un titre"
            enterkeyhint="search"
          />
        </div>
        <div class={qy.kind !== "live" ? "md:col-span-2" : "col-span-2 md:col-span-4"}>
          <select class="select w-full" name="vis" aria-label="Visibilité">
            <Options
              opts={[
                ["visible", "Visibles"],
                ["hidden", "Masqués"],
                ["all", "Visibles et masqués"],
              ]}
              cur={qy.vis}
            />
          </select>
        </div>
        {qy.kind !== "live" && (
          <div class="md:col-span-2">
            <select class="select w-full" name="tmdb" aria-label="TMDB">
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
        <div class="col-span-2 grid md:col-span-3">
          <button class="btn" data-variant="secondary">
            Filtrer
          </button>
        </div>
      </form>
      {!searching ? (
        <>
          <p class="text-sm text-muted-foreground">
            {fmt(shownCats.length)} catégorie(s) · {fmt(total)} élément(s)
            {uncategorised ? ` · ${fmt(uncategorised)} sans catégorie` : ""}
            {narrowing && shownCats.length < cats.length
              ? ` · ${fmt(cats.length - shownCats.length)} sans élément correspondant, voir « Visibles et masqués »`
              : ""}
          </p>
          <div class="flex flex-col divide-y overflow-hidden rounded-xl border">
            {uncategorised > 0 && <NoCategoryRow qy={qy} count={uncategorised} />}
            {shownCats.map((c) => (
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
