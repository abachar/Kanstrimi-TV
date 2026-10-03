import { Hono } from "hono";
import { countItems, pageItems, itemCountByCategory } from "./data";
import { categoriesOfKind, categoryByXtreamId, itemById, setCategoryHiddenManual, setItemHiddenManual } from "@/catalog";
import { isCategoryHidden } from "@/db";
import { searchCandidates, assignManual } from "@/catalog";
import { page, form, checked, intParam } from "../http";
import { KIND_TITLES } from "../labels";
import { getSettings } from "@/config";
import { channelGroups, contextFor } from "@/player";
import { CatalogShell, CatalogView } from "./view";
import { AppLiveView } from "./app-live";
import { searchContents, shelfPage, shelvesOf } from "./app-data";
import { AppCatalogView, FoundRows, FoundView, ShelfRows } from "./app-catalog";
import { SearchBar } from "./search-bar";
import { compileSearch, runSearch } from "./search";
import { CATALOG_PAGE } from "./data";
import { kindParam } from "../query";
import { isSearch } from "./query";
import { CategoryItems, ItemRow } from "./row";
import { TmdbCell } from "./tmdb-cell";
import { parseCatalogQuery } from "./query";

export const catalogRoutes = new Hono();

catalogRoutes.get("/", async (c) => {
  const qy = parseCatalogQuery(c.req.query());
  const title = KIND_TITLES[qy.kind];
  const search = await compileSearch(qy.kind, qy.q);
  if (qy.view === "catalog") {
    if (search.where) {
      const where = search.where;
      const found = await runSearch((ex) => searchContents(ex, qy.kind, where, 0));
      return page(
        c,
        title,
        <CatalogShell qy={qy}>
          {"error" in found ? (
            <SearchBar kind={qy.kind} view="catalog" q={qy.q} error={found.error} />
          ) : (
            <>
              <SearchBar kind={qy.kind} view="catalog" q={qy.q} />
              <FoundView kind={qy.kind} q={qy.q} rows={found.value.rows} total={found.value.total} />
            </>
          )}
        </CatalogShell>,
      );
    }
    // What a device-less app gets: the same functions as `/player`, the adult setting included.
    const ctx = contextFor(c.req.raw, null, await getSettings());
    return page(
      c,
      title,
      <CatalogShell qy={qy}>
        <SearchBar kind={qy.kind} view="catalog" q={qy.q} error={search.error} />
        {qy.kind === "live" ? (
          <AppLiveView groups={await channelGroups(ctx)} />
        ) : (
          <AppCatalogView kind={qy.kind} shelves={await shelvesOf(ctx, qy.kind)} />
        )}
      </CatalogShell>,
    );
  }
  const cats = await categoriesOfKind(qy.kind);
  // The Xtream view lists categories only, the rows arrive later one category at a time; a search lists its hits at once.
  if (isSearch(qy)) {
    const f = { ...qy, match: search.where };
    const found = search.where
      ? await runSearch(async (ex) => ({ total: await countItems(f, ex), rows: (await pageItems(f, qy.page, CATALOG_PAGE, ex)).rows }))
      : { error: search.error ?? "" };
    const error = "error" in found ? found.error : null;
    const { rows, total } = "value" in found ? found.value : { rows: [], total: 0 };
    return page(c, title, <CatalogView qy={qy} cats={cats} rows={rows} total={total} catCounts={new Map()} error={error} />);
  }
  const [total, catCounts] = await Promise.all([countItems(qy), itemCountByCategory(qy)]);
  return page(c, title, <CatalogView qy={qy} cats={cats} rows={[]} total={total} catCounts={catCounts} />);
});

/** One more page of a « Catalogue » search, as it scrolls. */
catalogRoutes.get("/found", async (c) => {
  const kind = kindParam(c.req.query("kind"));
  const q = c.req.query("q") ?? "";
  const n = Math.max(0, Number(c.req.query("n")) || 0);
  const search = await compileSearch(kind, q);
  if (!search.where) return c.body(null, 204);
  const where = search.where;
  const found = await runSearch((ex) => searchContents(ex, kind, where, n));
  if ("error" in found) return c.body(null, 204);
  return c.html(<FoundRows kind={kind} q={q} rows={found.value.rows} total={found.value.total} n={n} />);
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
  const id = intParam(c, "id");
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
