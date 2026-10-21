import { Hono } from "hono";
import { getSettings } from "@/config";
import { defaultProfile } from "@/catalog";
import { contextFor, deleteProgress, setFinished } from "@/player";
import { back, intParam, page } from "../http";
import { historyRows, mostPlayedRows } from "./data";
import { HistoryView } from "./view";

/** `/admin/history`: the playback positions as the app stored them; « En cours » and « Vus ». */
export const historyRoutes = new Hono();

historyRoutes.get("/", async (c) => {
  const ctx = await contextFor(c.req.raw, null, await getSettings(), await defaultProfile());
  return page(c, "Historique", <HistoryView {...(await historyRows(ctx))} mostPlayed={await mostPlayedRows(ctx)} />);
});
historyRoutes.post("/:profile{\\d+}/:key/finished", async (c) => {
  await setFinished(intParam(c, "profile"), c.req.param("key"), true);
  return back(c, "/admin/history", { ok: "Marqué vu" });
});
historyRoutes.post("/:profile{\\d+}/:key/unfinished", async (c) => {
  await setFinished(intParam(c, "profile"), c.req.param("key"), false);
  return back(c, "/admin/history", { ok: "Marqué non vu : la position est effacée" });
});
historyRoutes.post("/:profile{\\d+}/:key/delete", async (c) => {
  await deleteProgress(intParam(c, "profile"), c.req.param("key"));
  return back(c, "/admin/history", { ok: "Position effacée" });
});
