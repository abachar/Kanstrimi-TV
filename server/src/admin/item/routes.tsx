import { Hono } from "hono";
import { itemById, setIptvMatch } from "@/catalog";
import { itemDetail } from "./data";
import { getTmdbClient, explainMatch } from "@/providers/tmdb";
import { describeError } from "@/shared";
import { back, form, page } from "../http";
import { ItemView } from "./view";
import { ExplainView } from "./explain";

export const itemRoutes = new Hono();

itemRoutes.get("/:id", async (c) => {
  const detail = await itemDetail(Number(c.req.param("id")));
  if (!detail) return c.notFound();
  return page(c, detail.item.name, <ItemView {...detail} />);
});
/** Live: pins the variant to an iptv-org channel, to none, or back to the automatic matching. */
itemRoutes.post("/:id/iptv", async (c) => {
  const id = Number(c.req.param("id"));
  const f = await form(c);
  const target = f.action === "auto" ? "auto" : f.action === "none" ? null : f.iptv_id?.trim() || null;
  try {
    await setIptvMatch(id, target);
  } catch (e) {
    return back(c, `/admin/item/${id}`, { err: describeError(e) });
  }
  return back(c, `/admin/item/${id}`, { ok: "Chaîne iptv-org enregistrée" });
});
itemRoutes.get("/:id/explain", async (c) => {
  const it = await itemById(Number(c.req.param("id")));
  if (!it || it.kind === "live") return c.notFound();
  const client = await getTmdbClient();
  if (!client) return c.html(<span class="text-sm text-destructive">Clé TMDB absente.</span>);
  try {
    return c.html(<ExplainView e={await explainMatch(client, it)} kind={it.kind} />);
  } catch (e) {
    return c.html(<span class="text-sm text-destructive">{describeError(e)}</span>);
  }
});
