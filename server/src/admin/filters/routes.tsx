import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { filtersPending, isTaskRunning, listFilters, previewFilter, saveFilter } from "@/catalog";
import { KINDS, type Kind } from "@/db";
import { page, back, zerr } from "../http";
import { FiltersView, FilterPreview, type Draft } from "./view";

const schema = z.object({ kind: z.enum(KINDS as unknown as [Kind, ...Kind[]]), query: z.string().default("") });

/**
 * `/admin/filters`: the filter of each kind on one page. Saving only marks the catalogue behind; a pass
 * from « Filtres » applies them.
 */
export const filtersRoutes = new Hono();

const view = async (draft?: Draft) => {
  const [filters, pending] = await Promise.all([listFilters(), filtersPending()]);
  return <FiltersView filters={filters} pending={pending} busy={isTaskRunning("pipeline")} draft={draft} />;
};

filtersRoutes.get("/", async (c) => page(c, "Filtres", await view()));
filtersRoutes.post(
  "/",
  zValidator("form", schema, (r, c) => {
    if (!r.success) return back(c, "/admin/filters", { err: zerr(r.error) });
  }),
  async (c) => {
    const { kind, query } = c.req.valid("form");
    const error = await saveFilter(kind, query);
    // Refused: the page again, the query as typed, the mistake under it.
    if (error) return page(c, "Filtres", await view({ kind, query, error: `Requête invalide : ${error}` }));
    return back(c, "/admin/filters", { ok: "Filtre enregistré — à appliquer par un passage du traitement" });
  },
);
filtersRoutes.post("/preview", zValidator("form", schema), async (c) => {
  const { kind, query } = c.req.valid("form");
  return c.html(<FilterPreview preview={await previewFilter(kind, query)} />);
});
