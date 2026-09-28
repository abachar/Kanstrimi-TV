import type { CatalogFilter } from "./data";
import { kindParam, pageParam, pickEnum } from "../query";

export type CatalogView = "grouped" | "groups";
/** The catalogue filter plus what only the page cares about: the presentation and the page number. */
export type CatalogQuery = CatalogFilter & { page: number; view: CatalogView };
/** A search leaves the accordion: its hits come as one flat list across categories. */
export const isSearch = (qy: CatalogQuery) => qy.view === "grouped" && qy.q !== "";

export function parseCatalogQuery(q: Record<string, string>): CatalogQuery {
  return {
    kind: kindParam(q.kind),
    q: q.q?.trim() ?? "",
    cat: q.cat ?? "",
    vis: pickEnum(q.vis, ["visible", "hidden", "all"], "visible"),
    tmdb: pickEnum(q.tmdb, ["", "matched", "unmatched", "pending"], ""),
    page: pageParam(q.page),
    view: pickEnum(q.view, ["grouped", "groups"], "grouped"),
  };
}

/** The current filters as a query string, `over` overriding some of them. */
export function catalogQs(qy: CatalogQuery, over: Partial<CatalogQuery> = {}) {
  const v = { ...qy, ...over };
  return new URLSearchParams({ kind: v.kind, q: v.q, cat: v.cat, vis: v.vis, tmdb: v.tmdb, view: v.view, page: String(v.page) }).toString();
}
/** Link back to the catalogue, keeping the current filters. */
export const catalogLink = (qy: CatalogQuery, over: Partial<CatalogQuery> = {}) => `/admin/catalog?${catalogQs(qy, over)}`;
/** `/admin/catalog/items`: one page of a category in the grouped view. */
export const categoryItemsLink = (qy: CatalogQuery, cat: string, page: number) =>
  `/admin/catalog/items?${catalogQs(qy, { cat, q: "", view: "grouped", page })}`;
