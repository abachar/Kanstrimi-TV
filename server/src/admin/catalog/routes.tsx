import { Hono } from "hono";
import { categoriesOfKind, categoryByXtreamId, countItems, pageItems, itemCountByCategory, itemById } from "@/admin/catalog/data";
import { isCategoryHidden, setItemHiddenManual, setCategoryHiddenManual } from "@/db";
import { pageGroups } from "@/admin/groups/data";
import { searchCandidates, assignManual } from "@/admin/tmdb-correction";
import { page, form, checked } from "../http";
import { KIND_TITLES } from "../labels";
import { GroupsView } from "../groups/view";
import { parseGroupsQuery } from "../groups/query";
import { CatalogShell, CatalogView } from "./view";
import { CategoryItems, ItemRow } from "./row";
import { TmdbCell } from "./tmdb-cell";
import { parseCatalogQuery } from "./query";

export const catalogRoutes = new Hono();

catalogRoutes.get("/catalog", async (c) => {
  const qy = parseCatalogQuery(c.req.query());
  const title = KIND_TITLES[qy.kind];
  if (qy.view === "groups") {
    const gq = parseGroupsQuery(c.req.query());
    const { rows, total } = await pageGroups(gq, gq.page);
    return page(c, title, <CatalogShell qy={qy}><GroupsView qy={gq} rows={rows} total={total} /></CatalogShell>);
  }
  const cats = await categoriesOfKind(qy.kind);
  const total = await countItems(qy);
  // The grouped view lists categories only; the rows arrive later, one category at a time.
  const rows = qy.view === "grouped" ? [] : (await pageItems(qy, qy.page)).rows;
  const catCounts = qy.view === "grouped" ? await itemCountByCategory(qy.kind) : new Map<string, number>();
  return page(c, title, <CatalogView qy={qy} cats={cats} rows={rows} total={total} catCounts={catCounts} />);
});

/** One page of a category, for the grouped view's lazy loading and its infinite scroll. */
catalogRoutes.get("/catalog/items", async (c) => {
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
catalogRoutes.post("/catalog/:scope{item|category}/:id/visible", async (c) => {
  const id = Number(c.req.param("id"));
  const hiddenManual = !(await checked(c, "visible"));
  if (c.req.param("scope") === "category") {
    await setCategoryHiddenManual(id, hiddenManual);
    c.header("HX-Refresh", "true");
    return c.body(null, 204);
  }
  await setItemHiddenManual(id, hiddenManual);
  const r = await itemById(id);
  if (!r) return c.notFound();
  const cat = await categoryByXtreamId(r.kind, r.categoryXtreamId);
  return c.html(<ItemRow r={r} qy={parseCatalogQuery(c.req.query())} catLabel={cat?.name ?? r.categoryXtreamId ?? ""} catHidden={isCategoryHidden(cat)} />);
});

catalogRoutes.post("/catalog/tmdb-search", async (c) => {
  const f = await form(c);
  const it = await itemById(Number(f.id));
  if (!it) return c.notFound();
  return c.html(<TmdbCell it={it} results={await searchCandidates(it, f.q ?? "")} />);
});
catalogRoutes.post("/catalog/tmdb-assign", async (c) => {
  const f = await form(c);
  const id = Number(f.id);
  try { await assignManual(id, Number(f.tmdb_id) || null); } catch (e) { return c.html(<span class="text-danger">{(e as Error).message}</span>); }
  const it = await itemById(id);
  return it ? c.html(<TmdbCell it={it} />) : c.notFound();
});
