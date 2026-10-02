import type { CatalogFilter } from "./data";
import { kindParam, pageParam, pickEnum } from "../query";

/** `catalog`: what the app shows, built by its own functions; `xtream`: the provider's categories and streams. */
export type CatalogView = "catalog" | "xtream";
/** The catalogue filter plus what only the page cares about: the presentation and the page number. */
export type CatalogQuery = CatalogFilter & { page: number; view: CatalogView };
/** A search leaves the accordion: its hits come as one flat list across categories. */
export const isSearch = (qy: CatalogQuery) => qy.view === "xtream" && qy.q !== "";

export function parseCatalogQuery(q: Record<string, string>): CatalogQuery {
  const kind = kindParam(q.kind);
  // « grouped » was the name of the Xtream view: old links keep working.
  const view = q.view === "grouped" ? "xtream" : pickEnum(q.view, ["catalog", "xtream"], "catalog");
  return {
    kind,
    q: q.q?.trim() ?? "",
    cat: q.cat ?? "",
    page: pageParam(q.page),
    view,
  };
}

/** The current filters as a query string, `over` overriding some of them. */
export function catalogQs(qy: CatalogQuery, over: Partial<CatalogQuery> = {}) {
  const v = { ...qy, ...over };
  return new URLSearchParams({ kind: v.kind, q: v.q, cat: v.cat, view: v.view, page: String(v.page) }).toString();
}
/** Link back to the catalogue, keeping the current filters. */
export const catalogLink = (qy: CatalogQuery, over: Partial<CatalogQuery> = {}) => `/admin/catalog?${catalogQs(qy, over)}`;
/** `/admin/catalog/items`: one page of a category in the Xtream view. */
export const categoryItemsLink = (qy: CatalogQuery, cat: string, page: number) =>
  `/admin/catalog/items?${catalogQs(qy, { cat, q: "", view: "xtream", page })}`;
