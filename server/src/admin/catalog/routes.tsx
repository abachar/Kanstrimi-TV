import { Hono } from "hono";
import { itemById, setItemHiddenManual, searchCandidates, assignManual } from "@/catalog";
import { page, form, checked, intField, intParam } from "../http";
import { InlineResult } from "../ui";
import { describeError } from "@/shared";
import { KIND_TITLES } from "../labels";
import { getSettings } from "@/config";
import { channelGroups, contextFor } from "@/player";
import { CatalogShell } from "./view";
import { AppLiveView } from "./app-live";
import { searchContents, shelfPage, shelvesOf } from "./app-data";
import { AppCatalogView, FoundRows, FoundView, ShelfRows } from "./app-catalog";
import { SearchBar } from "./search-bar";
import { compileSearch, runSearch } from "./search";
import { kindParam, offsetParam } from "../query";
import { TmdbCell } from "./tmdb-cell";
import { parseCatalogQuery } from "./query";

export const catalogRoutes = new Hono();

/** A kind's screen: what the app shows, or the contents a search finds. */
catalogRoutes.get("/", async (c) => {
  const qy = parseCatalogQuery(c.req.query());
  const title = KIND_TITLES[qy.kind];
  const search = await compileSearch(qy.kind, qy.q);
  if (search.where) {
    const where = search.where;
    const found = await runSearch((ex) => searchContents(ex, qy.kind, where, 0));
    return page(
      c,
      title,
      <CatalogShell qy={qy}>
        {"error" in found ? (
          <SearchBar kind={qy.kind} q={qy.q} error={found.error} />
        ) : (
          <>
            <SearchBar kind={qy.kind} q={qy.q} />
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
      <SearchBar kind={qy.kind} q={qy.q} error={search.error} />
      {qy.kind === "live" ? (
        <AppLiveView groups={await channelGroups(ctx)} />
      ) : (
        <AppCatalogView kind={qy.kind} shelves={await shelvesOf(ctx, qy.kind)} />
      )}
    </CatalogShell>,
  );
});

/** One more page of a « Catalogue » search, as it scrolls. */
catalogRoutes.get("/found", async (c) => {
  const kind = kindParam(c.req.query("kind"));
  const q = c.req.query("q") ?? "";
  const n = offsetParam(c.req.query("n"));
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
  return c.html(<ShelfRows kind={kind} shelf={shelf} page={result} n={offsetParam(c.req.query("n"))} />);
});

/**
 * A variant's switch, on its content's page. It says "Visible", the column stores `hidden_manual`:
 * invert on the way in, then reload the page, whose content follows.
 */
catalogRoutes.post("/item/:id/visible", async (c) => {
  await setItemHiddenManual(intParam(c, "id"), !(await checked(c, "visible")));
  c.header("HX-Refresh", "true");
  return c.body(null, 204);
});

catalogRoutes.post("/tmdb-search", async (c) => {
  const f = await form(c);
  const it = await itemById(intField(f, "id"));
  if (!it) return c.notFound();
  return c.html(<TmdbCell it={it} results={await searchCandidates(it, f.q ?? "")} />);
});
catalogRoutes.post("/tmdb-assign", async (c) => {
  const f = await form(c);
  const id = intField(f, "id");
  try {
    await assignManual(id, Number(f.tmdb_id) || null);
  } catch (e) {
    console.error(`[admin] association TMDB de la variante ${id} : ${describeError(e)}`);
    return c.html(<InlineResult ok={false} text={describeError(e)} />);
  }
  const it = await itemById(id);
  return it ? c.html(<TmdbCell it={it} />) : c.notFound();
});
