import { Hono, type Context } from "hono";
import {
  contentById,
  contentIdByKey,
  explainMatch,
  itemById,
  setIptvMatch,
  splitVariant,
  resetVariant,
  mergeVariantInto,
  mergeCandidates,
  UpstreamUnavailable,
} from "@/catalog";
import { getSettings } from "@/config";
import { getTmdbClient } from "@/providers/tmdb";
import { contextFor, setFavorite, setFinished, setSeriesWatched } from "@/player";
import { describeError } from "@/shared";
import { back, form, page, intField, intParam } from "../http";
import { InlineResult } from "../ui";
import { contentDetail, episodeOf, orphanDetail } from "./data";
import { episodeAnchor } from "./episodes";
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
  return page(c, detail.content.title, <ContentView {...detail} open={Number(c.req.query("v")) || null} />, {
    under: `/admin/catalog?kind=${detail.content.kind}`,
  });
});

/** Puts the content in « Ma liste » (`on`), or takes it out. */
contentRoutes.post("/:id/favorite", async (c) => {
  const content = await contentById(intParam(c, "id"));
  if (!content) return c.notFound();
  const on = (await form(c)).on === "1";
  await setFavorite(content.key, on);
  return back(c, `/admin/content/${content.id}`, { ok: on ? "Ajouté à Ma liste" : "Retiré de Ma liste" });
});

/** « Vu » (`on`) or not: a movie, one `episode` of a series, or every episode of it, as the app marks them. */
contentRoutes.post("/:id/watched", async (c) => {
  const content = await contentById(intParam(c, "id"));
  if (!content || content.kind === "live") return c.notFound();
  const f = await form(c);
  const on = f.on === "1";
  const to = `/admin/content/${content.id}`;
  if (f.episode) {
    const episode = await episodeOf(content.id, f.episode);
    if (!episode) return c.notFound();
    await setFinished(episode.key, on);
    return back(c, `${to}#${episodeAnchor(episode)}`, { ok: on ? "Épisode marqué comme vu" : "Épisode retiré de mes vus" });
  }
  if (content.kind === "series") {
    try {
      const ctx = contextFor(c.req.raw, null, await getSettings());
      if (!(await setSeriesWatched(ctx, content, on))) return back(c, to, { err: "Aucun épisode servi dans cette série" });
    } catch (e) {
      if (!(e instanceof UpstreamUnavailable)) throw e;
      return back(c, to, { err: e.message });
    }
  } else await setFinished(content.key, on);
  return back(c, to, { ok: on ? "Marqué comme vu" : "Retiré de mes vus" });
});

/** `/admin/item/:id`: a provider entry, shown on its content's page; the actions on one entry. */
export const itemRoutes = new Hono();

itemRoutes.get("/:id", async (c) => {
  const it = await itemById(intParam(c, "id"));
  if (!it) return c.notFound();
  if (it.contentId) return c.redirect(contentLink(it.contentId, it.id), 302);
  const detail = (await orphanDetail(it.id))!;
  return page(c, it.name, <ContentView {...detail} open={it.id} />, { under: `/admin/catalog?kind=${it.kind}` });
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
