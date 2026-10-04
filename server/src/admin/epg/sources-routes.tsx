import { Hono } from "hono";
import { addEpgSource, deleteEpgSource, epgSourceById, listEpgSources, moveEpgSource, setEpgLink, updateEpgSource } from "@/catalog";
import { describeError } from "@/shared";
import { back, form, intParam, page } from "../http";
import { pageParam, pickEnum } from "../query";
import { OURS_SHOW, sourcePage, THEIRS_SHOW, type SourcePageQuery } from "./sources-data";
import { SourcePage } from "./sources-view";

/** `/admin/epg/sources`: the fallback guides, listed and added from the EPG page, one page each. */
export const sourceRoutes = new Hono();

const EPG = "/admin/epg";

sourceRoutes.post("/", async (c) => {
  const f = await form(c);
  try {
    const s = await addEpgSource({ name: f.name, url: f.url ?? "" });
    return back(c, EPG, { ok: `Source ${s.name} ajoutée : elle sera lue au prochain import EPG` });
  } catch (e) {
    return back(c, EPG, { err: describeError(e) });
  }
});

sourceRoutes.get("/:id", async (c) => {
  const source = await epgSourceById(intParam(c, "id"));
  if (!source) return c.notFound();
  const tab = pickEnum(c.req.query("tab"), ["ours", "theirs"] as const, "ours");
  const query: SourcePageQuery = {
    tab,
    q: c.req.query("q")?.trim() ?? "",
    show: tab === "ours" ? pickEnum(c.req.query("show"), OURS_SHOW, "missing") : pickEnum(c.req.query("show"), THEIRS_SHOW, "all"),
    page: pageParam(c.req.query("page")),
  };
  const [data, sources] = await Promise.all([sourcePage(source, query), listEpgSources()]);
  return page(
    c,
    source.name,
    <SourcePage source={source} query={query} {...data} sourceNames={new Map(sources.map((s) => [s.id, s.name]))} />,
  );
});

sourceRoutes.post("/:id", async (c) => {
  const id = intParam(c, "id");
  const f = await form(c);
  try {
    await updateEpgSource(id, { name: f.name ?? "", url: f.url ?? "", enabled: "enabled" in f, offsetMinutes: Number(f.offset) });
    return back(c, `/admin/epg/sources/${id}`, { ok: "Source enregistrée" });
  } catch (e) {
    return back(c, `/admin/epg/sources/${id}`, { err: describeError(e) });
  }
});

sourceRoutes.post("/:id/up", async (c) => {
  await moveEpgSource(intParam(c, "id"), -1);
  return back(c, EPG, {});
});
sourceRoutes.post("/:id/down", async (c) => {
  await moveEpgSource(intParam(c, "id"), 1);
  return back(c, EPG, {});
});
sourceRoutes.post("/:id/delete", async (c) => {
  await deleteEpgSource(intParam(c, "id"));
  return back(c, EPG, { ok: "Source supprimée" });
});

/** Where a link form leads back: this source's page only, it lands in a redirect. */
const sourceBack = (id: number, url: string | undefined) => {
  const self = `/admin/epg/sources/${id}`;
  return url && (url === self || url.startsWith(`${self}?`)) ? url : self;
};

sourceRoutes.post("/:id/link", async (c) => {
  const id = intParam(c, "id");
  const f = await form(c);
  const to = sourceBack(id, f.back);
  const key = f.content_key ?? "";
  const channel = f.channel?.trim() ?? "";
  try {
    if (f.action === "auto") await setEpgLink(id, key, "auto");
    else if (f.action === "none") await setEpgLink(id, key, null);
    else if (!channel) return back(c, to, { err: "Choisir une chaîne du fichier" });
    else await setEpgLink(id, key, channel);
    return back(c, to, {
      ok:
        f.action === "auto"
          ? "Lien par le nom rétabli"
          : f.action === "none"
            ? "Cette source ne servira pas cette chaîne"
            : `Chaîne reliée à ${channel} : ses programmes arrivent au prochain import EPG`,
    });
  } catch (e) {
    return back(c, to, { err: describeError(e) });
  }
});
