import { Hono } from "hono";
import { page } from "../http";
import { cacheRows } from "./data";
import { CachesView } from "./view";

/** `/admin/caches`: counters and sizes of every cache, nothing to click. */
export const cachesRoutes = new Hono();

cachesRoutes.get("/", async (c) => page(c, "Caches", <CachesView rows={await cacheRows()} />));
