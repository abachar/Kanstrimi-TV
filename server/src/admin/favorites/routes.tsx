import { Hono } from "hono";
import { getSettings } from "@/config";
import { defaultProfile } from "@/catalog";
import { contextFor, setFavorite } from "@/player";
import { back, intParam, page } from "../http";
import { favoriteRows } from "./data";
import { FavoritesView } from "./view";

/** `/admin/favorites`: « Ma liste » as the app stores it; a line can be removed, a content's page adds one. */
export const favoritesRoutes = new Hono();

favoritesRoutes.get("/", async (c) => {
  const ctx = await contextFor(c.req.raw, null, await getSettings(), await defaultProfile());
  return page(c, "Favoris", <FavoritesView rows={await favoriteRows(ctx)} />);
});
favoritesRoutes.post("/:profile{\\d+}/:key/remove", async (c) => {
  await setFavorite(intParam(c, "profile"), c.req.param("key"), false);
  return back(c, "/admin/favorites", { ok: "Favori retiré" });
});
