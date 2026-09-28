import { Hono } from "hono";
import { getSettings } from "@/config";
import { contextFor, setFavorite } from "@/player";
import { back, page } from "../http";
import { favoriteRows } from "./data";
import { FavoritesView } from "./view";

/** `/admin/favorites`: « Ma liste » as the app stores it; a line can be removed, nothing else. */
export const favoritesRoutes = new Hono();

favoritesRoutes.get("/", async (c) => {
  const ctx = contextFor(c.req.raw, null, await getSettings());
  return page(c, "Favoris", <FavoritesView rows={await favoriteRows(ctx)} />);
});
favoritesRoutes.post("/:key/remove", async (c) => {
  await setFavorite(c.req.param("key"), false);
  return back(c, "/admin/favorites", { ok: "Favori retiré" });
});
