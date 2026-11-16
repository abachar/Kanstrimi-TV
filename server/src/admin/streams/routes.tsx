import { Hono } from "hono";
import { page } from "../http";
import { kindParam, offsetParam } from "../query";
import { compileSearch, runSearch } from "../catalog/search";
import { searchStreams } from "./data";
import { StreamRows, StreamsView } from "./view";

/** `/admin/streams`: the providers' streams, a flat list by kind, searched in the filter language with the streams' words at home. */
export const streamsRoutes = new Hono();

streamsRoutes.get("/", async (c) => {
  const kind = kindParam(c.req.query("kind") ?? "live");
  const q = c.req.query("q")?.trim() ?? "";
  const search = await compileSearch(kind, q, { streams: true });
  if (search.error) return page(c, "Flux", <StreamsView kind={kind} q={q} found={null} error={search.error} />);
  const found = await runSearch((ex) => searchStreams(ex, kind, search.where, 0));
  return page(
    c,
    "Flux",
    "error" in found ? (
      <StreamsView kind={kind} q={q} found={null} error={found.error} />
    ) : (
      <StreamsView kind={kind} q={q} found={found.value} />
    ),
  );
});

/** The next page of the list: a wrong or slow query has no next page. */
streamsRoutes.get("/rows", async (c) => {
  const kind = kindParam(c.req.query("kind") ?? "live");
  const q = c.req.query("q")?.trim() ?? "";
  const n = offsetParam(c.req.query("n"));
  const search = await compileSearch(kind, q, { streams: true });
  if (search.error) return c.body(null, 204);
  const found = await runSearch((ex) => searchStreams(ex, kind, search.where, n));
  if ("error" in found) return c.body(null, 204);
  return c.html(<StreamRows kind={kind} q={q} rows={found.value.rows} total={found.value.total} n={n} />);
});
