import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Hono } from "hono";
import { resetDb, closeDb, seedCategories, seedItems, seedTmdb } from "@/test/db";
import { setSecretsForTests } from "@/config";
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
/** A page, checked against the admin's CSP (`script-src 'self'`): no inline handler, no script from elsewhere. */
const html = async (path: string) => {
  const r = await call(path);
  expect(r.status, path).toBe(200);
  const text = await r.text();
  expect(text, path).not.toMatch(/\s(on[a-z]+|hx-on[:-][\w:-]*)=/i);
  expect(text, path).not.toMatch(/<script(?![^>]*\ssrc="\/admin\/assets\/)[^>]*>/);
  expect(text, path).not.toContain("javascript:");
  return text;
};

beforeAll(async () => {
  await resetDb();
  await seedCategories([
    { kind: "vod", xtreamId: "10", name: "|FR| FILMS" },
    { kind: "live", xtreamId: "20", name: "FRANCE | TV" },
  ]);
  await seedTmdb("movie", 603, { title: "Matrix", release_date: "1999-03-31", genres: [{ id: 878, name: "Science-Fiction" }] });
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
    // Whatever the body says it is, or without any Content-Type at all.
    const bare = (headers: Record<string, string>) =>
      call("/admin/menu", { method: "POST", body: new Uint8Array([110, 101, 120, 116]), headers });
    expect((await bare({ origin: "http://evil.test" })).status).toBe(403);
    expect((await bare({ "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect((await bare({ origin: "http://evil.test", "content-type": "application/json" })).status).toBe(403);
    expect((await call("/admin/menu", { method: "DELETE", headers: { origin: "http://evil.test" } })).status).toBe(403);
    // The same site without a Content-Type goes on to the login guard.
    expect((await bare({ origin: "http://localhost" })).status).toBe(302);
  });

  it("logs in with the admin e-mail and password", async () => {
    const bad = await post("/admin/login", { email: "admin@kanstrimi.test", password: "nope" });
    expect(bad.headers.get("location")).toContain("err=");
    const wrongEmail = await post("/admin/login", { email: "someone@else.test", password: "test" });
    expect(wrongEmail.headers.get("location")).toContain("err=");
    const noEmail = await post("/admin/login", { password: "test" });
    expect(noEmail.headers.get("location")).toContain("err=");
    const ok = await post("/admin/login?next=/admin/rules", { email: " Admin@Kanstrimi.test ", password: "test" });
    expect(ok.status).toBe(303);
    expect(ok.headers.get("location")).toBe("/admin/rules");
    cookie = ok.headers.get("set-cookie")!.split(";")[0];
    expect(cookie).toMatch(/^kanstrimi_admin=/);
  });

  it("renders every page", async () => {
    expect(await html("/admin")).toContain("Tableau de bord");
    // « Catalogue » by default: the app's shelves, folded, each title leading to its content's page.
    const shelves = await html("/admin/catalog?kind=vod");
    expect(shelves).toContain("Science-Fiction"); // a genre shelf
    const genre = await html("/admin/catalog/shelf?kind=vod&shelf=genre%3Ascience-fiction");
    expect(genre).toContain(`/admin/content/k/${encodeURIComponent("tmdb:movie:603")}`);
    expect(genre).toContain("Variantes");
    expect((await call("/admin/catalog/shelf?kind=vod&shelf=nope")).status).toBe(404);
    expect((await call("/admin/catalog/shelf?kind=live&shelf=recent")).status).toBe(404);
    expect(await html("/admin/catalog?kind=series")).toContain("Catalogue");
    expect(await html("/admin/catalog?kind=vod&view=xtream")).toContain("|FR| FILMS");
    expect(await html("/admin/catalog?kind=vod&view=grouped")).toContain("|FR| FILMS"); // the former name of the Xtream view
    expect(await html("/admin/catalog?kind=vod&view=xtream&q=visible%3Anon")).toContain("0 résultat"); // nothing hidden
    expect(await html("/admin/catalog?kind=vod&view=xtream&q=tmdb%3Aattente")).toContain("0 résultat");
    expect(await html("/admin/catalog?kind=vod&view=xtream&q=tmdb%3Aoui")).toContain("Matrix (4K)");
    expect(await html("/admin/catalog?kind=vod&view=xtream&q=tmdb%3Apeut-etre")).toContain("tmdb vaut oui, non ou attente");
    expect(await html("/admin/catalog?kind=vod&view=xtream&q=matrix")).toContain("Matrix (VOST)");
    expect(await html("/admin/catalog?kind=live&view=xtream&q=tf1")).not.toContain("TMDB associé");
    expect(await html("/admin/catalog?kind=live")).toContain('id="live-groups"');
    expect(await html("/admin/catalog/items?kind=vod&cat=10&view=xtream&page=1")).toContain("Matrix (4K)");
    const live = await html("/admin/catalog?kind=live&view=xtream");
    expect(live).toContain("Sans catégorie");
    expect(live).toContain("1 sans catégorie");
    expect(await html("/admin/catalog/items?kind=live&cat=_none&page=1")).toContain("BELLA RADIO");
    expect(await html("/admin/catalog?kind=live&view=xtream&q=bella")).toContain("Sans catégorie"); // the category column of a hit
    // The filter language, in both views; a wrong query says why instead of failing.
    expect(await html("/admin/catalog?kind=vod&view=xtream&q=genre%3Ascience")).toContain("Matrix (4K)");
    // One search bar in both views, each keeping its own view.
    expect(await html("/admin/catalog?kind=vod&view=xtream")).toContain('name="view" value="xtream"');
    expect(await html("/admin/catalog?kind=vod")).toContain('name="view" value="catalog"');
    expect(await html("/admin/catalog?kind=live")).toContain("Rechercher : tf1, thème:sport"); // examples of the kind
    expect(await html("/admin/catalog?kind=vod&view=xtream&q=genr%3Ascience")).toContain("voulais-tu genre");
    const found = await html("/admin/catalog?kind=vod&q=qualit%C3%A9%3A%3E%3Dfhd");
    expect(found).toContain(`/admin/content/k/${encodeURIComponent("tmdb:movie:603")}`);
    expect(found).toContain("1 contenu pour");
    expect(await html("/admin/catalog?kind=vod&q=genre%3A%3E5")).toContain("pas un nombre");
    expect(await html("/admin/catalog?kind=vod&q=zzz")).toContain("Aucun contenu");
    expect(await html("/admin/catalog/found?kind=vod&q=matrix&n=0")).toContain("Matrix");
    // An entry opens on its content's page, itself unfolded among the others.
    const toContent = (await call(`/admin/item/${matrixId}`)).headers.get("location")!;
    expect(toContent).toMatch(new RegExp(`^/admin/content/\\d+\\?v=${matrixId}#variant-${matrixId}$`));
    const sheet = await html(toContent);
    expect(sheet).toContain("Afficher le JSON brut");
    expect(sheet).toContain("2 variantes");
    expect(sheet).toContain("Séparer");
    expect((await call(`/admin/content/k/${encodeURIComponent("tmdb:movie:603")}`)).headers.get("location")).toBe(toContent.split("?")[0]);
    expect((await call("/admin/content/k/nope")).status).toBe(404);
    expect((await call("/admin/content/999999")).status).toBe(404);
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
    // `back` lands in a link: anything outside the EPG page falls back to it.
    expect(await html("/admin/epg/preview/TF1.fr?back=%2Fadmin%2Fepg%3Fq%3Dtf1")).toContain('href="/admin/epg?q=tf1"');
    for (const bad of ["javascript:alert(1)", "https://evil.test/admin/epg", "//evil.test", "/admin/epgx"]) {
      const panel = await html(`/admin/epg/preview/TF1.fr?back=${encodeURIComponent(bad)}`);
      expect(panel, bad).toContain('href="/admin/epg"');
      expect(panel, bad).not.toContain(bad.replace(/&/g, "&amp;"));
    }
    expect(await html("/admin/settings")).toContain("Serveur Xtream");
    // The environment's values, in clear; never a field the form sends back.
    setSecretsForTests({ xtream_password: "s3cret", tmdb_api_key: "" });
    const settings = await html("/admin/settings");
    expect(settings).toContain('value="s3cret"');
    expect(settings).toContain('value="non défini"');
    expect(settings).not.toMatch(/name="(xtream_\w+|tmdb_api_key)"/);
    expect(await html("/admin/favorites")).toContain("Aucun favori");
    expect(await html("/admin/history")).toContain("En cours");
    expect(await html("/admin/caches")).toContain("Fiches TMDB");
    expect(await html("/admin/studios?q=zzz")).toContain("Aucun résultat");
    expect((await call("/admin/studios/company:424242")).status).toBe(404);
    expect((await call("/admin/studios/3")).status).toBe(404);
    expect(await html("/admin/pair/K7Q4MZ")).toContain("Code inconnu");
    // A pending code says where and when it was asked for, and whether that is the admin's own address.
    const { createPairing } = await import("@/devices");
    const asked = await createPairing("203.0.113.9");
    const pair = await html(`/admin/pair/${asked.code}`);
    expect(pair).toContain("203.0.113.9");
    expect(pair).toContain("Une autre adresse que la vôtre");
    const mine = await call(`/admin/pair/${asked.code}`, { headers: { "x-forwarded-for": "203.0.113.9" } });
    expect(await mine.text()).toContain("la même adresse que vous");
    expect(await html("/admin/jobs/status")).toContain("Aucun job en cours");
    expect(await html("/admin/tasks")).toContain('name="from"');
    expect((await call("/admin/item/999999")).status).toBe(404);
    expect((await call("/admin/dev/reload?boot=x")).status, "dev reload is off without DEV_PASSWORD").toBe(404);
    const fold = await post("/admin/menu", { next: "/admin/catalog?kind=vod" });
    expect(fold.headers.get("set-cookie")).toContain("kanstrimi_menu=collapsed");
    expect(fold.headers.get("location")).toBe("/admin/catalog?kind=vod");
    expect((await post("/admin/menu", { next: "https://evil.test/" })).headers.get("location")).toBe("/admin");
  });

  it("serves htmx from its own assets and asks for confirmation through htmx, without inline script", async () => {
    const home = await html("/admin");
    expect(home).toContain('<script src="/admin/assets/htmx.min.js');
    expect(home).toContain('<meta name="htmx-config" content="{&quot;allowEval&quot;:false,&quot;includeIndicatorStyles&quot;:false}">');
    // The phone menu opens by swapping in the menu, rendered open; the current page stays highlighted.
    expect(home).toContain('hx-get="/admin/menu?path=%2Fadmin"');
    const menu = await html("/admin/menu?path=%2Fadmin%2Fepg");
    expect(menu).toMatch(/^<aside id="menu" class="sidebar" data-side="left" data-initial-mobile-open="true"/);
    expect(menu).toMatch(/href="\/admin\/epg"[^>]*aria-current="page"/);
    expect(await html("/admin/menu?path=https%3A%2F%2Fevil.test")).toMatch(/href="\/admin"[^>]*aria-current="page"/);
    // A form behind a confirmation posts through htmx, which answers by a redirect htmx follows.
    await setFavorite("tmdb:movie:603", true);
    const key = encodeURIComponent("tmdb:movie:603");
    expect(await html("/admin/favorites")).toMatch(
      new RegExp(`hx-post="/admin/favorites/${key}/remove"[^>]*hx-confirm="Retirer ce favori \\?"`),
    );
    const r = await call(`/admin/favorites/${key}/remove`, {
      method: "POST",
      headers: { origin: "http://localhost", "HX-Request": "true" },
    });
    expect(r.status).toBe(204);
    expect(r.headers.get("hx-redirect")).toBe("/admin/favorites?ok=Favori+retir%C3%A9");
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

  it("rules: preview, save without applying, the banner to apply them, delete", async () => {
    const preview = await post("/admin/rules/preview", { query: "vost", kind: "vod" });
    expect(await preview.text()).toContain("1 variante(s) concernée(s)");
    expect(await (await post("/admin/rules/preview", { query: "genre:>5", kind: "vod" })).text()).toContain("pas un nombre");
    const created = await post("/admin/rules", {
      name: "VOST",
      kind: "vod",
      query: "vost",
      action: "hide",
      enabled: "true",
      position: "0",
    });
    expect(flash(created)).toContain("à appliquer");
    const page = await html("/admin/rules");
    expect(page).toContain("Règles modifiées depuis le dernier passage");
    expect(page).toContain('name="from" value="filters"');
    const invalid = await post("/admin/rules", { name: "Cassée", kind: "vod", query: "nom:/(/", action: "hide", position: "0" });
    expect(flash(invalid)).toContain("Requête invalide");
    const id = /hx-post="\/admin\/rules\/(\d+)\/delete"/.exec(page)![1];
    expect((await post(`/admin/rules/${id}/delete`, {})).status).toBe(303);
    expect(await html("/admin/rules")).toContain("Aucune règle");
  });

  it("content page: split a variant and put it back, the page following the variant", async () => {
    const split = await post(`/admin/item/${matrixId}/split`, {});
    const alone = split.headers.get("hx-redirect")!;
    expect(alone).toMatch(/^\/admin\/content\/\d+\?v=\d+&ok=.+#variant-\d+$/);
    const page = await html(alone);
    expect(page).toContain("1 variante visible sur 1");
    expect(page).toContain("Revenir au groupement automatique");
    const reset = await post(`/admin/item/${matrixId}/reset`, {});
    expect(await html(reset.headers.get("hx-redirect")!)).toContain("2 variantes");
    expect((await call(`/admin/item/${matrixId}/merge-form`)).status).toBe(200);
  });

  it("waitlist: search TMDB, add a movie, remove it", async () => {
    expect(await html("/admin/waitlist")).toContain("Aucun film attendu");
    expect(await html("/admin/waitlist?q=mission")).toContain("Clé API TMDB non configurée");
    setSecretsForTests({ tmdb_api_key: "k" });
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
      setSecretsForTests({ tmdb_api_key: "" });
    }
  });

  it("answers an unexpected error as a page, or as a toast for an HTMX request, and logs it", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const full = await call("/admin/content/abc");
    expect(full.status).toBe(500);
    const body = await full.text();
    expect(body).toContain('role="alert"');
    expect(body).toContain('id="toaster"');
    const htmx = await call("/admin/content/abc", { headers: { "HX-Request": "true" } });
    expect(htmx.status).toBe(200); // htmx swaps no 5xx: the toast goes to the toaster
    expect(htmx.headers.get("HX-Retarget")).toBe("#toaster");
    expect(htmx.headers.get("HX-Reswap")).toBe("beforeend");
    expect(await htmx.text()).toContain('class="toast"');
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  it("logs out", async () => {
    const r = await post("/admin/logout", {});
    expect(r.headers.get("hx-redirect")).toBe("/admin/login");
  });
});
