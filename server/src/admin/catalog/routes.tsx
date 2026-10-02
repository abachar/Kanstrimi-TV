import { Hono } from "hono";
import { countItems, pageItems, itemCountByCategory } from "./data";
import { categoriesOfKind, categoryByXtreamId, itemById } from "@/catalog";
import { isCategoryHidden, setItemHiddenManual, setCategoryHiddenManual } from "@/db";
import { searchCandidates, assignManual } from "@/catalog";
import { page, form, checked } from "../http";
import { KIND_TITLES } from "../labels";
import { getSettings } from "@/config";
import { channelGroups, contextFor } from "@/player";
import { CatalogShell, CatalogView } from "./view";
import { AppLiveView } from "./app-live";
import { AppCatalogView, ShelfRows } from "./app-catalog";
import { shelfPage, shelvesOf } from "./app-data";
import { kindParam } from "../query";
import { isSearch } from "./query";
import { CategoryItems, ItemRow } from "./row";
import { TmdbCell } from "./tmdb-cell";
import { parseCatalogQuery } from "./query";

export const catalogRoutes = new Hono();

catalogRoutes.get("/", async (c) => {
  const qy = parseCatalogQuery(c.req.query());
  const title = KIND_TITLES[qy.kind];
  if (qy.view === "catalog") {
    // What a device-less app gets: the same functions as `/player`, the adult setting included.
    const ctx = contextFor(c.req.raw, null, await getSettings());
    if (qy.kind === "live")
      return page(
        c,
        title,
        <CatalogShell qy={qy}>
          <AppLiveView groups={await channelGroups(ctx)} />
        </CatalogShell>,
      );
    return page(
      c,
      title,
      <CatalogShell qy={qy}>
        <AppCatalogView kind={qy.kind} shelves={await shelvesOf(ctx, qy.kind)} />
      </CatalogShell>,
    );
  }
  const cats = await categoriesOfKind(qy.kind);
  const total = await countItems(qy);
  // The grouped view lists categories only, the rows arrive later one category at a time; a search lists its hits at once.
  const searching = isSearch(qy);
  const rows = searching ? (await pageItems(qy, qy.page)).rows : [];
  const catCounts = searching ? new Map<string, number>() : await itemCountByCategory(qy);
  return page(c, title, <CatalogView qy={qy} cats={cats} rows={rows} total={total} catCounts={catCounts} />);
});

/** One page of a shelf of the « Catalogue » view, at its first opening and as it scrolls. */
catalogRoutes.get("/shelf", async (c) => {
  const kind = kindParam(c.req.query("kind"));
  const shelf = c.req.query("shelf") ?? "";
  if (kind === "live") return c.notFound();
  const ctx = contextFor(c.req.raw, null, await getSettings());
  const result = await shelfPage(ctx, kind, shelf, c.req.query("cursor") || undefined);
  if (!result) return c.notFound();
  return c.html(<ShelfRows kind={kind} shelf={shelf} page={result} n={Number(c.req.query("n")) || 0} />);
});

/** One page of a category, for the Xtream view's lazy loading and its infinite scroll. */
catalogRoutes.get("/items", async (c) => {
  const qy = parseCatalogQuery(c.req.query());
  if (!qy.cat) return c.body(null, 204);
  const [cat, { rows, hasMore }] = await Promise.all([categoryByXtreamId(qy.kind, qy.cat), pageItems(qy, qy.page)]);
  return c.html(<CategoryItems qy={qy} cat={qy.cat} rows={rows} catHidden={isCategoryHidden(cat)} hasMore={hasMore} />);
});

/**
 * The switch says "Visible", the column stores `hidden_manual`: invert on the way in.
 * An item answers with its whole row so the struck-through name follows the switch; the
 * current filters travel in the query string because the row links back to the catalogue.
 * A category carries every row under it: reload rather than patch each one back into shape.
 */
catalogRoutes.post("/:scope{item|category}/:id/visible", async (c) => {
  const id = Number(c.req.param("id"));
  const hiddenManual = !(await checked(c, "visible"));
  if (c.req.param("scope") === "category" || c.req.query("reload")) {
    await setCategoryHiddenManual(id, hiddenManual);
    c.header("HX-Refresh", "true");
    return c.body(null, 204);
  }
  await setItemHiddenManual(id, hiddenManual);
  const r = await itemById(id);
  if (!r) return c.notFound();
  const cat = await categoryByXtreamId(r.kind, r.categoryXtreamId);
  return c.html(
    <ItemRow
      r={r}
      qy={parseCatalogQuery(c.req.query())}
      catLabel={cat?.name ?? r.categoryXtreamId ?? "Sans catégorie"}
      catHidden={isCategoryHidden(cat)}
    />,
  );
});

catalogRoutes.post("/tmdb-search", async (c) => {
  const f = await form(c);
  const it = await itemById(Number(f.id));
  if (!it) return c.notFound();
  return c.html(<TmdbCell it={it} results={await searchCandidates(it, f.q ?? "")} />);
});
catalogRoutes.post("/tmdb-assign", async (c) => {
  const f = await form(c);
  const id = Number(f.id);
  try {
    await assignManual(id, Number(f.tmdb_id) || null);
  } catch (e) {
    return c.html(<span class="text-sm text-destructive">{(e as Error).message}</span>);
  }
  const it = await itemById(id);
  return it ? c.html(<TmdbCell it={it} />) : c.notFound();
});
