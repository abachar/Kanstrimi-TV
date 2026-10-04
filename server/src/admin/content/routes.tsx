import { Hono, type Context } from "hono";
import {
  contentIdByKey,
  explainMatch,
  itemById,
  setIptvMatch,
  splitVariant,
  resetVariant,
  mergeVariantInto,
  mergeCandidates,
} from "@/catalog";
import { getTmdbClient } from "@/providers/tmdb";
import { describeError } from "@/shared";
import { back, form, page, intField, intParam } from "../http";
import { InlineResult } from "../ui";
import { contentDetail, orphanDetail } from "./data";
import { ContentView, MergeForm } from "./view";
import { ExplainView } from "./explain";
import { contentLink } from "./links";

/** `/admin/content/:id`: a content and every provider entry under it. */
export const contentRoutes = new Hono();

contentRoutes.get("/k/:key", async (c) => {
  const id = await contentIdByKey(c.req.param("key"));
  return id ? c.redirect(`/admin/content/${id}`, 302) : c.notFound();
});

contentRoutes.get("/:id", async (c) => {
  const detail = await contentDetail(intParam(c, "id"));
  if (!detail?.content) return c.notFound();
  return page(c, detail.content.title, <ContentView {...detail} open={Number(c.req.query("v")) || null} />);
});

/** `/admin/item/:id`: a provider entry, shown on its content's page; the actions on one entry. */
export const itemRoutes = new Hono();

itemRoutes.get("/:id", async (c) => {
  const it = await itemById(intParam(c, "id"));
  if (!it) return c.notFound();
  if (it.contentId) return c.redirect(contentLink(it.contentId, it.id), 302);
  const detail = (await orphanDetail(it.id))!;
  return page(c, it.name, <ContentView {...detail} open={it.id} />);
});

/** Live: pins the variant to an iptv-org channel, to none, or back to the automatic matching. */
itemRoutes.post("/:id/iptv", async (c) => {
  const id = intParam(c, "id");
  const f = await form(c);
  const target = f.action === "auto" ? "auto" : f.action === "none" ? null : f.iptv_id?.trim() || null;
  const to = async () => contentLink((await itemById(id))?.contentId ?? null, id);
  try {
    await setIptvMatch(id, target);
  } catch (e) {
    return back(c, await to(), { err: describeError(e) });
  }
  return back(c, await to(), { ok: "Chaîne iptv-org enregistrée" });
});

itemRoutes.get("/:id/explain", async (c) => {
  const it = await itemById(intParam(c, "id"));
  if (!it || it.kind === "live") return c.notFound();
  const client = await getTmdbClient();
  if (!client) return c.html(<InlineResult ok={false} text="Clé TMDB absente." />);
  try {
    return c.html(<ExplainView e={await explainMatch(client, it)} kind={it.kind} />);
  } catch (e) {
    return c.html(<InlineResult ok={false} text={describeError(e)} />);
  }
});

/** After a split, a merge or a reset, the page follows the variant to the content it now belongs to. */
async function followVariant(c: Context, id: number, ok: string) {
  const u = new URL(contentLink((await itemById(id))?.contentId ?? null, id), "http://x");
  u.searchParams.set("ok", ok);
  c.header("HX-Redirect", u.pathname + u.search + u.hash);
  return c.body(null, 204);
}

itemRoutes.post("/:id/split", async (c) => {
  const it = await itemById(intParam(c, "id"));
  if (!it) return c.notFound();
  await splitVariant(it);
  return followVariant(c, it.id, "Variante séparée : elle forme un contenu à part");
});
itemRoutes.post("/:id/reset", async (c) => {
  const it = await itemById(intParam(c, "id"));
  if (!it) return c.notFound();
  await resetVariant(it);
  return followVariant(c, it.id, "Variante rendue au groupement automatique");
});
itemRoutes.get("/:id/merge-form", (c) => c.html(<MergeForm itemId={intParam(c, "id")} />));
itemRoutes.post("/merge-search", async (c) => {
  const f = await form(c);
  const it = await itemById(intField(f, "id"));
  if (!it) return c.notFound();
  return c.html(<MergeForm itemId={it.id} results={await mergeCandidates(it, (f.q ?? "").trim())} />);
});
itemRoutes.post("/merge", async (c) => {
  const f = await form(c);
  const it = await itemById(intField(f, "id"));
  if (!it || !f.key) return c.notFound();
  await mergeVariantInto(it, f.key);
  return followVariant(c, it.id, "Variante fusionnée");
});
