import { Hono } from "hono";
import { itemById } from "@/catalog";
import { itemDetail } from "./data";
import { getTmdbClient, explainMatch } from "@/providers/tmdb";
import { describeError } from "@/shared";
import { page } from "../http";
import { ItemView } from "./view";
import { ExplainView } from "./explain";

export const itemRoutes = new Hono();

itemRoutes.get("/:id", async (c) => {
  const detail = await itemDetail(Number(c.req.param("id")));
  if (!detail) return c.notFound();
  return page(c, detail.item.name, <ItemView {...detail} />);
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
