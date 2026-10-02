import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Hono } from "hono";
import { resetDb, closeDb, seedCategories, seedItems, seedTmdb } from "@/test/db";
import { setSettings, verify } from "@/config";
import { itemById } from "@/catalog";
import { run, runNaming } from "@/catalog";
import { startRun } from "@/catalog/journal";
import { setFavorite, setProgress, listProgress } from "@/player";
import { admin } from "..";

/** The admin as `server.ts` mounts it. Every page is rendered once: a JSX error surfaces as a 500 here. */
const app = new Hono().route("/admin", admin);
let cookie = "";
let matrixId = 0;
const call = (path: string, init: RequestInit = {}) => app.request(path, { ...init, headers: { cookie, ...(init.headers ?? {}) } });
const post = (path: string, fields: Record<string, string>) =>
  call(path, {
    method: "POST",
    body: new URLSearchParams(fields),
    headers: { "content-type": "application/x-www-form-urlencoded", origin: "http://localhost" },
  });
/** The flash message a redirect carries (`?ok=` / `?err=`, form-encoded). */
const flash = (r: Response) => decodeURIComponent(r.headers.get("location")!.replace(/\+/g, " "));
const html = async (path: string) => {
  const r = await call(path);
  expect(r.status, path).toBe(200);
  return r.text();
};

beforeAll(async () => {
  await resetDb();
  expect(await verify("test")).toBe(true);
  await seedCategories([
    { kind: "vod", xtreamId: "10", name: "|FR| FILMS" },
    { kind: "live", xtreamId: "20", name: "FRANCE | TV" },
  ]);
  await seedTmdb("movie", 603, { title: "Matrix", release_date: "1999-03-31" });
  const items = await seedItems([
    { kind: "vod", xtreamId: "1", name: "|FR| Matrix (4K)", cat: "10", tmdbId: 603, matchStatus: "matched" },
    { kind: "vod", xtreamId: "2", name: "|FR| Matrix (VOST)", cat: "10", tmdbId: 603, matchStatus: "matched" },
    { kind: "live", xtreamId: "100", name: "|FR| TF1 HD", cat: "20" },
    { kind: "live", xtreamId: "101", name: "|IT| BELLA RADIO", section: "|IT| ITALIA |IT|" },
  ]);
  matrixId = items[0].id;
  await runNaming(); // what the source step does after the import
  expect(await run("group")).toBe(true); // journalled through the pipeline, so /admin/tasks has a row
});
afterAll(closeDb);

describe("admin", () => {
  it("redirects to the login page, keeping the pairing target", async () => {
    expect((await call("/admin")).headers.get("location")).toBe("/admin/login");
    expect((await call("/admin/pair/K7Q4MZ")).headers.get("location")).toBe("/admin/login?next=%2Fadmin%2Fpair%2FK7Q4MZ");
    expect((await call("/admin/login")).status).toBe(200);
  });

  it("refuses a form post from another origin", async () => {
    const r = await call("/admin/login", {
      method: "POST",
      body: new URLSearchParams({ password: "test" }),
      headers: { "content-type": "application/x-www-form-urlencoded", origin: "http://evil.test" },
    });
    expect(r.status).toBe(403);
  });

  it("logs in with the admin e-mail and password", async () => {
    const bad = await post("/admin/login", { email: "a.bachar@hotmail.fr", password: "nope" });
    expect(bad.headers.get("location")).toContain("err=");
    const wrongEmail = await post("/admin/login", { email: "someone@else.test", password: "test" });
    expect(wrongEmail.headers.get("location")).toContain("err=");
    const noEmail = await post("/admin/login", { password: "test" });
    expect(noEmail.headers.get("location")).toContain("err=");
    const ok = await post("/admin/login?next=/admin/rules", { email: " A.Bachar@hotmail.fr ", password: "test" });
    expect(ok.status).toBe(303);
    expect(ok.headers.get("location")).toBe("/admin/rules");
    cookie = ok.headers.get("set-cookie")!.split(";")[0];
    expect(cookie).toMatch(/^kanstrimi_admin=/);
  });

  it("renders every page", async () => {
    expect(await html("/admin")).toContain("Tableau de bord");
    expect(await html("/admin/catalog?kind=vod")).toContain("|FR| FILMS");
    expect(await html("/admin/catalog?kind=vod&vis=hidden")).not.toContain("|FR| FILMS"); // nothing hidden under it
    expect(await html("/admin/catalog?kind=vod&vis=all")).toContain("|FR| FILMS");
    expect(await html("/admin/catalog?kind=vod&q=matrix")).toContain("Matrix (VOST)");
    expect(await html("/admin/catalog?kind=live&q=tf1")).not.toContain("TMDB associé");
    expect(await html("/admin/catalog?kind=live&view=app")).toContain("France · ");
    expect(await html("/admin/catalog?kind=live&view=groups")).toContain("Application"); // live has no variant view: falls back to app
    const groups = await html("/admin/catalog?kind=vod&view=groups");
    expect(groups).toContain("2 variantes");
    expect(groups).toContain("Groupes");
    expect(await html("/admin/catalog/items?kind=vod&cat=10&view=grouped&page=1")).toContain("Matrix (4K)");
    const live = await html("/admin/catalog?kind=live");
    expect(live).toContain("Sans catégorie");
    expect(live).toContain("1 sans catégorie");
    expect(await html("/admin/catalog/items?kind=live&cat=_none&page=1")).toContain("BELLA RADIO");
    expect(await html("/admin/catalog?kind=live&q=bella")).toContain("Sans catégorie"); // the category column of a hit
    expect(await html(`/admin/item/${matrixId}`)).toContain("Afficher le JSON brut");
    expect(await html("/admin/rules")).toContain("Nouvelle règle");
    expect(await html("/admin/devices")).toContain("Aucun appareil");
    const logs = await html("/admin/tasks");
    expect(logs).toContain("Groupement"); // the lone step run of beforeAll
    expect(logs).toContain("Traitement complet");
    expect(logs).toContain("Jamais lancé");
    expect(logs).not.toContain('id="jobs-status"'); // the cards tell what runs, no second status above them
    expect(await html("/admin/tasks/card/epg")).toContain('id="task-epg"');
    expect((await call("/admin/tasks/card/nope")).status).toBe(404);
    const runId = /href="\/admin\/tasks\/(\d+)"/.exec(logs)![1];
    expect(await html(`/admin/tasks/${runId}`)).toContain("── group : terminé");
    expect((await call(`/admin/tasks/${runId}/raw`)).headers.get("content-disposition")).toContain(".log");
    expect((await call("/admin/tasks/999999")).status).toBe(404);
    // A run left « running » (its end never written): « Arrêter » closes it as killed.
    const stuck = await startRun("pipeline", "manual");
    expect(await html(`/admin/tasks/${stuck.id}`)).toContain(`/admin/tasks/${stuck.id}/kill`);
    expect(await html("/admin/tasks/card/pipeline")).not.toContain("hx-get"); // shown running, but nothing runs it: no polling
    expect(flash(await post(`/admin/tasks/${stuck.id}/kill`, {}))).toContain("Passage marqué arrêté");
    const stopped = await html(`/admin/tasks/${stuck.id}`);
    expect(stopped).toContain("Arrêté");
    expect(stopped).not.toContain(`/admin/tasks/${stuck.id}/kill`);
    expect(flash(await post(`/admin/tasks/${stuck.id}/kill`, {}))).toContain("n'est plus en cours");
    expect((await post("/admin/tasks/999999/kill", {})).status).toBe(404);
    expect(await html("/admin/epg")).toContain("Corrections du guide");
    expect(await html("/admin/epg?channel=TF1.fr")).toContain("Décalage à appliquer");
    expect(await html("/admin/epg/preview/TF1.fr?minutes=-180&pattern=*.fr")).toContain("Aperçu avec −3 h");
    expect(await html("/admin/settings")).toContain("Serveur Xtream");
    expect(await html("/admin/favorites")).toContain("Aucun favori");
    expect(await html("/admin/history")).toContain("En cours");
    expect(await html("/admin/caches")).toContain("Fiches TMDB");
    expect(await html("/admin/studios?q=zzz")).toContain("Aucun résultat");
    expect((await call("/admin/studios/company:424242")).status).toBe(404);
    expect((await call("/admin/studios/3")).status).toBe(404);
    expect(await html("/admin/pair/K7Q4MZ")).toContain("Code inconnu");
    expect(await html("/admin/jobs/status")).toContain("Aucun job en cours");
    expect(await html("/admin/tasks")).toContain('name="from"');
    expect((await call("/admin/item/999999")).status).toBe(404);
    expect((await call("/admin/dev/reload?boot=x")).status, "dev reload is off without DEV_PASSWORD").toBe(404);
    const fold = await post("/admin/menu", { next: "/admin/catalog?kind=vod" });
    expect(fold.headers.get("set-cookie")).toContain("kanstrimi_menu=collapsed");
    expect(fold.headers.get("location")).toBe("/admin/catalog?kind=vod");
    expect((await post("/admin/menu", { next: "https://evil.test/" })).headers.get("location")).toBe("/admin");
  });

  it("favourites: a key the app stored shows up, then goes away by POST", async () => {
    await setFavorite("tmdb:movie:603", true);
    await setFavorite("tmdb:movie:1", true); // points nowhere: shown as dead, never hidden
    const list = await html("/admin/favorites");
    expect(list).toContain("Matrix");
    expect(list).toContain("supprimé");
    expect(flash(await post(`/admin/favorites/${encodeURIComponent("tmdb:movie:603")}/remove`, {}))).toContain("Favori retiré");
    await post(`/admin/favorites/${encodeURIComponent("tmdb:movie:1")}/remove`, {});
    expect(await html("/admin/favorites")).toContain("Aucun favori");
  });

  it("history: a position moves from « En cours » to « Vus » and back to nothing", async () => {
    await setProgress("tmdb:movie:603", 600, 7200);
    const ongoing = await html("/admin/history");
    expect(ongoing).toContain("Matrix");
    expect(ongoing).toContain("Marquer vu");
    expect(ongoing).toContain("8 %");
    expect(flash(await post(`/admin/history/${encodeURIComponent("tmdb:movie:603")}/finished`, {}))).toContain("Marqué vu");
    const [p] = await listProgress();
    expect(p).toMatchObject({ contentKey: "tmdb:movie:603", position: 7200, duration: 7200, finished: true });
    expect(await html("/admin/history")).toContain("Marquer non vu");
    await post(`/admin/history/${encodeURIComponent("tmdb:movie:603")}/unfinished`, {});
    expect(await listProgress()).toEqual([]);
    await setProgress("tmdb:movie:603", 600, 7200);
    await post(`/admin/history/${encodeURIComponent("tmdb:movie:603")}/delete`, {});
    expect(await listProgress()).toEqual([]);
    const dashboard = await html("/admin");
    expect(dashboard).toMatch(/>0<\/div><div[^>]*>favoris/);
  });

  it("caches: counts the seeded TMDB sheet", async () => {
    expect(await html("/admin/caches")).toMatch(/1 <span[^>]*>fiches/);
  });

  it("toggles visibility and answers with the row (item) or a refresh (category)", async () => {
    const hide = await post(`/admin/catalog/item/${matrixId}/visible?kind=vod&q=matrix`, {});
    expect(hide.status).toBe(200);
    expect(await hide.text()).toContain("<s>|FR| Matrix (4K)</s>");
    expect((await itemById(matrixId))?.hiddenManual).toBe(true);
    const show = await post(`/admin/catalog/item/${matrixId}/visible?kind=vod&q=matrix`, { visible: "on" });
    expect(await show.text()).not.toContain("<s>");
    const cat = await post("/admin/catalog/category/1/visible?kind=vod", {});
    expect(cat.status).toBe(204);
    expect(cat.headers.get("hx-refresh")).toBe("true");
    await post("/admin/catalog/category/1/visible?kind=vod", { visible: "on" });
  });

  it("rules: create with a preview, then delete", async () => {
    const preview = await post("/admin/rules/preview", { pattern: "vost", flags: "i", kind: "vod", target: "name" });
    expect(await preview.text()).toContain("1 correspondance(s)");
    const created = await post("/admin/rules", {
      name: "VOST",
      kind: "vod",
      target: "name",
      pattern: "vost",
      flags: "i",
      action: "hide",
      enabled: "true",
      position: "0",
    });
    expect(flash(created)).toContain("1 éléments");
    const invalid = await post("/admin/rules", {
      name: "Cassée",
      kind: "vod",
      target: "name",
      pattern: "(",
      flags: "i",
      action: "hide",
      position: "0",
    });
    expect(flash(invalid)).toContain("Regex invalide");
    const page = await html("/admin/rules");
    const id = /hx-post="\/admin\/rules\/(\d+)\/delete"/.exec(page)![1];
    expect((await post(`/admin/rules/${id}/delete`, {})).status).toBe(303);
    expect(await html("/admin/rules")).toContain("Aucune règle");
  });

  it("groups: split a variant and put it back through the HTMX endpoints", async () => {
    const groupsPage = await html("/admin/catalog?kind=vod&view=groups");
    const contentId = /hx-get="\/admin\/catalog\/groups\/(\d+)"/.exec(groupsPage)![1];
    const variants = await html(`/admin/catalog/groups/${contentId}`);
    expect(variants).toContain("Séparer");
    const split = await post(`/admin/catalog/groups/split/${matrixId}`, {});
    expect(await split.text()).toContain("1 variante<");
    const reset = await post(`/admin/catalog/groups/reset/${matrixId}`, {});
    expect(await reset.text()).toContain("2 variantes");
    expect((await call("/admin/catalog/groups/merge-form/1")).status).toBe(200);
  });

  it("waitlist: search TMDB, add a movie, remove it", async () => {
    expect(await html("/admin/waitlist")).toContain("Aucun film attendu");
    expect(await html("/admin/waitlist?q=mission")).toContain("Clé API TMDB non configurée");
    await setSettings({ tmdb_api_key: "k" });
    vi.stubGlobal("fetch", async (u: URL) =>
      String(u).includes("/search/movie")
        ? Response.json({
            results: [
              { id: 603, title: "Matrix", release_date: "1999-03-31" },
              { id: 1200, title: "Mission : Impossible 9" },
            ],
          })
        : Response.json({ id: 1200, title: "Mission : Impossible 9", release_date: "2027-05-21" }),
    );
    try {
      const found = await html("/admin/waitlist?q=mission");
      expect(found).toContain("Au catalogue"); // Matrix
      expect(found).toContain('name="tmdb_id" value="1200"');
      expect(flash(await post("/admin/waitlist", { tmdb_id: "1200", q: "mission" }))).toContain("Film ajouté à la liste d'attente");
      expect(flash(await post("/admin/waitlist", { tmdb_id: "603" }))).toContain("déjà visible dans le catalogue");
      const listed = await html("/admin/waitlist");
      expect(listed).toContain("Mission : Impossible 9");
      expect(listed).toContain("En attente");
      expect(listed).toContain("Sortie le 21 mai 2027");
      expect(listed).toContain("https://www.themoviedb.org/movie/1200");
      expect(flash(await post("/admin/waitlist/1200/remove", {}))).toContain("Film retiré");
      expect(await html("/admin/waitlist")).toContain("Aucun film attendu");
    } finally {
      vi.unstubAllGlobals();
      await setSettings({ tmdb_api_key: "" });
    }
  });

  it("logs out", async () => {
    const r = await post("/admin/logout", {});
    expect(r.headers.get("hx-redirect")).toBe("/admin/login");
  });
});
