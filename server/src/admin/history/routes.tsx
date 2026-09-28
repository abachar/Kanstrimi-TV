import { Hono } from "hono";
import { getSettings } from "@/config";
import { contextFor, deleteProgress, setFinished } from "@/player";
import { back, page } from "../http";
import { historyRows } from "./data";
import { HistoryView } from "./view";

/** `/admin/history`: the playback positions as the app stored them; « En cours » and « Vus ». */
export const historyRoutes = new Hono();

historyRoutes.get("/", async (c) => {
  const ctx = contextFor(c.req.raw, null, await getSettings());
  return page(c, "Historique", <HistoryView {...(await historyRows(ctx))} />);
});
historyRoutes.post("/:key/finished", async (c) => {
  await setFinished(c.req.param("key"), true);
  return back(c, "/admin/history", { ok: "Marqué vu" });
});
historyRoutes.post("/:key/unfinished", async (c) => {
  await setFinished(c.req.param("key"), false);
  return back(c, "/admin/history", { ok: "Marqué non vu : la position est effacée" });
});
historyRoutes.post("/:key/delete", async (c) => {
  await deleteProgress(c.req.param("key"));
  return back(c, "/admin/history", { ok: "Position effacée" });
});
