import { Hono, type Context } from "hono";
import type { Content } from "@/db";
import { itemById } from "@/admin/catalog/data";
import { groupVariants, splitVariant, resetVariant, mergeVariantInto, mergeCandidates } from "@/admin/groups/actions";
import { form } from "../http";
import { GroupRow, GroupVariants, MergeForm } from "./view";

/** HTMX endpoints of the "Groupes" view: variants of a content, and the manual split / merge. */
export const groupsRoutes = new Hono();

/** The whole row again after an action: the content may have changed, or vanished. */
const rowResponse = (c: Context, content: Content | null) => c.html(content ? <GroupRow c={content} /> : <></>);

groupsRoutes.get("/catalog/groups/:id", async (c) => {
  const g = await groupVariants(Number(c.req.param("id")));
  if (!g) return c.notFound();
  return c.html(<GroupVariants c={g.content} items={g.items} cats={g.categories} />);
});
groupsRoutes.post("/catalog/groups/split/:id", async (c) => {
  const it = await itemById(Number(c.req.param("id")));
  if (!it) return c.notFound();
  return rowResponse(c, await splitVariant(it));
});
groupsRoutes.post("/catalog/groups/reset/:id", async (c) => {
  const it = await itemById(Number(c.req.param("id")));
  if (!it) return c.notFound();
  return rowResponse(c, await resetVariant(it));
});
groupsRoutes.get("/catalog/groups/merge-form/:id", (c) => c.html(<MergeForm itemId={Number(c.req.param("id"))} />));
groupsRoutes.post("/catalog/groups/merge-search", async (c) => {
  const f = await form(c);
  const it = await itemById(Number(f.id));
  if (!it) return c.notFound();
  return c.html(<MergeForm itemId={it.id} results={await mergeCandidates(it, (f.q ?? "").trim())} />);
});
groupsRoutes.post("/catalog/groups/merge", async (c) => {
  const f = await form(c);
  const it = await itemById(Number(f.id));
  if (!it || !f.key) return c.notFound();
  return rowResponse(c, await mergeVariantInto(it, f.key));
});
