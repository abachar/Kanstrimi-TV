import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { addStudio, listStudios, moveStudio, parseStudioRef, removeStudio, studioDetail, studioSuggestions } from "@/catalog";
import { back, page, zerr } from "../http";
import { StudiosView, StudioDetailView } from "./view";

/** `/admin/studios`: the studio hubs of the app, chosen among the companies and networks of the catalogue. */
export const studiosRoutes = new Hono();

const addSchema = z.object({ kind: z.enum(["company", "network"]), tmdb_id: z.coerce.number().int().positive() });

studiosRoutes.get("/", async (c) => {
  const q = (c.req.query("q") ?? "").trim();
  const [studios, suggestions] = await Promise.all([listStudios(), studioSuggestions(40, q)]);
  return page(c, "Studios", <StudiosView studios={studios} suggestions={suggestions} q={q} />);
});
/** `/admin/studios/company:3`: what a studio holds among the visible contents, as the app would list it. */
studiosRoutes.get("/:ref{(?:company|network):\\d+}", async (c) => {
  const ref = parseStudioRef(c.req.param("ref"));
  const detail = ref && (await studioDetail(ref.kind, ref.tmdbId));
  if (!detail) return c.notFound();
  return page(c, detail.name, <StudioDetailView d={detail} />);
});
studiosRoutes.post(
  "/",
  zValidator("form", addSchema, (r, c) => {
    if (!r.success) return back(c, "/admin/studios", { err: zerr(r.error) });
  }),
  async (c) => {
    const { kind, tmdb_id } = c.req.valid("form");
    if (!(await addStudio(kind, tmdb_id)))
      return back(c, "/admin/studios", { err: "Aucun contenu visible du catalogue ne porte cet identifiant TMDB" });
    return back(c, "/admin/studios", { ok: "Studio ajouté" });
  },
);
studiosRoutes.post("/:id/up", async (c) => {
  await moveStudio(Number(c.req.param("id")), "up");
  return back(c, "/admin/studios", {});
});
studiosRoutes.post("/:id/down", async (c) => {
  await moveStudio(Number(c.req.param("id")), "down");
  return back(c, "/admin/studios", {});
});
studiosRoutes.post("/:id/remove", async (c) => {
  await removeStudio(Number(c.req.param("id")));
  return back(c, "/admin/studios", { ok: "Studio retiré" });
});
