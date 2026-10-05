import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Hono } from "hono";
import { resetDb, closeDb, seedCategories, seedItems, seedTmdb, seedProgrammes } from "@/test/db";
import { setSecretsForTests } from "@/config";
import { itemById, launch } from "@/catalog";
import { runAll, runNaming } from "@/catalog";
import { startRun } from "@/catalog/journal";
import { withCatalogLock } from "@/catalog/lock";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { getSettings } from "@/config";
import { setFavorite, setProgress, listProgress } from "@/player";
import { admin } from "..";

/** `launch` is the real one unless a test answers in its place: no pipeline runs from here. */
vi.mock("@/catalog", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/catalog")>();
  return { ...mod, launch: vi.fn(mod.launch) };
});

/** The admin as `app.ts` mounts it. Every page is rendered once: a JSX error surfaces as a 500 here. */
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
  expect(await runAll("manual", "group")).toBe(true); // group → filters, journalled: /admin/tasks has a row
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
    expect(bad.headers.get("location")).toContain("e=bad");
    const wrongEmail = await post("/admin/login", { email: "someone@else.test", password: "test" });
    expect(wrongEmail.headers.get("location")).toContain("e=bad");
    const noEmail = await post("/admin/login", { password: "test" });
    expect(noEmail.headers.get("location")).toContain("e=bad");
    const ok = await post("/admin/login?next=/admin/filters", { email: " Admin@Kanstrimi.test ", password: "test" });
    expect(ok.status).toBe(303);
    expect(ok.headers.get("location")).toBe("/admin/filters");
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
    expect(await html("/admin/catalog?kind=live")).toContain('id="live-groups"');
    // The Xtream view is gone: its old links land on the screen of the kind.
    expect(await html("/admin/catalog?kind=vod&view=xtream&cat=10")).toContain("Science-Fiction");
    expect((await call("/admin/catalog/items?kind=vod&cat=10")).status).toBe(404);
    // The search reads the contents; a wrong query says why instead of failing.
    expect(await html("/admin/catalog?kind=vod&q=visible%3Anon")).toContain("Aucun contenu"); // nothing hidden
    expect(await html("/admin/catalog?kind=vod&q=matrix%20%26%26%20xtream.nom%3Avost")).toContain(
      `/admin/content/k/${encodeURIComponent("tmdb:movie:603")}`,
    ); // one of its versions' names
    expect(await html("/admin/catalog?kind=vod&q=xtream.cat%C3%A9gorie%3Afilms")).toContain("1 contenu pour"); // one of its versions' category
    expect(await html("/admin/catalog?kind=vod&q=tmdb%3Apeut-etre")).toContain("tmdb vaut oui, non ou attente");
    expect(await html("/admin/catalog?kind=vod")).not.toContain('name="view"');
    expect(await html("/admin/catalog?kind=live")).toContain("Rechercher : tf1, thème:sport"); // examples of the kind
    expect(await html("/admin/catalog?kind=vod&q=genr%3Ascience")).toContain("voulais-tu genre");
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
    expect(await html("/admin/filters")).toContain("tout est gardé");
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

  it("a variant's switch reloads its content's page, which follows at once", async () => {
    const contentOf = async () => {
      await withCatalogLock(async () => {}); // the background refresh queued before this one is done
      const it = await itemById(matrixId);
      const [c] = await db.select().from(schema.catalogContents).where(eq(schema.catalogContents.id, it!.contentId!));
      return c;
    };
    expect(await contentOf()).toMatchObject({ visible: true, variantCount: 2 });
    // The variant's switch, on its content's page: the page reloads, the content follows without a `group` run.
    const categoriesHidden = async () =>
      (await db.select().from(schema.catalogCategories)).map((c) => [c.id, c.hiddenManual] as const).sort((x, y) => x[0] - y[0]);
    const before = await categoriesHidden();
    const hide = await post(`/admin/catalog/item/${matrixId}/visible`, {});
    expect(hide.status).toBe(204);
    expect(hide.headers.get("hx-refresh")).toBe("true");
    expect((await itemById(matrixId))?.hiddenManual).toBe(true);
    expect(await contentOf()).toMatchObject({ visible: true, variantCount: 1 }); // the VOST stays
    expect(await categoriesHidden()).toEqual(before); // never a category with the same id
    await post(`/admin/catalog/item/${matrixId}/visible`, { visible: "on" });
    expect((await itemById(matrixId))?.hiddenManual).toBe(false);
    expect(await contentOf()).toMatchObject({ visible: true, variantCount: 2 });
    expect((await post("/admin/catalog/category/1/visible", {})).status).toBe(404); // no screen hides a category any more
  });

  it("filters: preview, save without applying, the banner to apply them, a refused query typed again, clear", async () => {
    const preview = await (await post("/admin/filters/preview", { query: "matrix", kind: "vod" })).text();
    expect(preview).toMatch(/Garde <span[^>]*>1<\/span> fiche sur 1 \(2 versions sur 2\)/);
    expect(await (await post("/admin/filters/preview", { query: "genre:>5", kind: "vod" })).text()).toContain("pas un nombre");
    expect(flash(await post("/admin/filters", { kind: "live", query: 'marché:"fr"' }))).toContain("à appliquer");
    const page = await html("/admin/filters");
    expect(page).toContain("Filtres modifiés depuis le dernier passage");
    expect(page).toContain('name="from" value="filters"');
    expect(page).toContain("marché:&quot;fr&quot;</textarea>");
    expect(page).toContain("tout est gardé"); // the films and series have none
    const invalid = await (await post("/admin/filters", { kind: "vod", query: "titre:/(/" })).text();
    expect(invalid).toContain("Requête invalide");
    expect(invalid).toContain("titre:/(/</textarea>");
    expect(flash(await post("/admin/filters", { kind: "live", query: "" }))).toContain("Filtre enregistré");
    expect(await db.select().from(schema.curationFilters)).toEqual([]);
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

  it("answers an unexpected error as a page, or as a toast for an HTMX request, without its detail, which goes to the log", async () => {
    // Mounted again: a route added after `app` was built is not in it.
    admin.get("/__test/boom", () => {
      throw new Error("connect ECONNREFUSED 10.0.0.5:5432");
    });
    const boom = new Hono().route("/admin", admin);
    const call = (path: string, init: RequestInit = {}) => boom.request(path, { ...init, headers: { cookie, ...(init.headers ?? {}) } });
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const full = await call("/admin/__test/boom");
    expect(full.status).toBe(500);
    const body = await full.text();
    expect(body).toContain('role="alert"');
    expect(body).toContain('id="toaster"');
    expect(body).not.toContain("10.0.0.5");
    const ref = /réf\. ([0-9a-f]{6})/.exec(body)?.[1];
    expect(String(logged.mock.calls[0][0])).toContain(`${ref} GET /admin/__test/boom : `);
    expect(String(logged.mock.calls[0][0])).toContain("10.0.0.5:5432");
    const htmx = await call("/admin/__test/boom", { headers: { "HX-Request": "true" } });
    expect(htmx.status).toBe(200); // htmx swaps no 5xx: the toast goes to the toaster
    expect(htmx.headers.get("HX-Retarget")).toBe("#toaster");
    expect(htmx.headers.get("HX-Reswap")).toBe("beforeend");
    const toast = await htmx.text();
    expect(toast).toContain('class="toast"');
    expect(toast).not.toContain("10.0.0.5");
    logged.mockRestore();
  });

  it("a route identifier that is no positive integer is a 404, before any query", async () => {
    for (const p of [
      "/admin/content/abc",
      "/admin/content/0",
      "/admin/content/1.5",
      "/admin/content/99999999999",
      "/admin/item/-3/merge-form",
    ])
      expect((await call(p)).status, p).toBe(404);
  });

  it("an identifier out of range, a missing form id or a negative offset never reach the database", async () => {
    expect((await call("/admin/tasks/99999999999")).status).toBe(404);
    expect((await post("/admin/catalog/tmdb-assign", {})).status).toBe(404);
    expect((await post("/admin/catalog/tmdb-search", { id: "abc" })).status).toBe(404);
    expect((await post("/admin/item/merge-search", {})).status).toBe(404);
    const shelf = "/admin/catalog/shelf?kind=vod&shelf=genre%3Ascience-fiction";
    expect(await html(`${shelf}&n=-5`)).toBe(await html(`${shelf}&n=0`)); // numbered from 1, not from -4
    expect((await call("/admin/tasks?page=-3")).status).toBe(200);
    expect((await call("/admin/epg?page=-3")).status).toBe(200);
  });

  it("the EPG preview shows the day the page shows, not today", async () => {
    await seedProgrammes([
      { channelId: "TF1.fr", start: -5, end: 5, title: "Maintenant unique" },
      { channelId: "TF1.fr", start: 24 * 60 + 5, end: 24 * 60 + 15, title: "Demain unique" },
    ]);
    try {
      const tomorrow = new Date(Date.now() + 24 * 3600_000).toISOString();
      const page = await html(`/admin/epg?channel=TF1.fr&at=${encodeURIComponent(tomorrow)}`);
      expect(page).toContain("Demain unique");
      expect(page).not.toContain("Maintenant unique");
      const preview = await html(`/admin/epg/preview/TF1.fr?minutes=0&at=${encodeURIComponent(tomorrow)}`);
      expect(preview).toContain("Demain unique");
      expect(preview).not.toContain("Maintenant unique");
      // The panel hands the day it shows back to the next preview.
      expect(page).toMatch(/<input type="hidden" name="at" value="[^"]+"/);
      expect(await html("/admin/epg/preview/TF1.fr?minutes=0")).toContain("Maintenant unique"); // no day: now
    } finally {
      await db.delete(schema.catalogEpgProgrammes);
    }
  });

  it("fallback EPG sources: added on the EPG page, a page each, links chosen by hand, shown in the grid", async () => {
    const url = "https://epg.test/files/qatar1.xml";
    expect(flash(await post("/admin/epg/sources", { url }))).toContain("Source qatar1 ajoutée");
    expect(flash(await post("/admin/epg/sources", { url }))).toContain("déjà une source");
    expect(flash(await post("/admin/epg/sources", { url: "pas une adresse" }))).toContain("Adresse invalide");
    expect(await html("/admin/epg")).toContain("Sources EPG de secours");
    expect(await html("/admin/settings")).not.toContain("Sources EPG de secours");
    const [src] = await db.select().from(schema.curationEpgSources);
    const base = `/admin/epg/sources/${src.id}`;
    await db.insert(schema.catalogEpgSourceChannels).values({ sourceId: src.id, channelId: "TF1.qa", names: ["TF1 Qatar"], programmes: 3 });
    const [tf1] = await db.select().from(schema.catalogContents).where(eq(schema.catalogContents.key, "live:fr-tf1"));
    expect(tf1).toBeDefined();
    try {
      const page = await html(base);
      expect(page).toContain("Nos chaînes");
      expect(page).toContain('<option value="TF1.qa">');
      expect(await html(`${base}?tab=theirs`)).toContain("TF1 Qatar");
      const link = (fields: Record<string, string>) => post(`${base}/link`, { content_key: tf1.key, back: base, ...fields });
      expect(flash(await link({ action: "link", channel: "Autre.qa" }))).toContain("n'est pas une chaîne de cette source");
      expect(flash(await link({ action: "link", channel: "TF1.qa" }))).toContain("reliée à TF1.qa");
      // A redirect anywhere but this source's page falls back to it.
      expect(
        (await post(`${base}/link`, { content_key: tf1.key, action: "auto", back: "https://evil.test" })).headers.get("location"),
      ).toMatch(new RegExp(`^${base}\\?ok=`));
      await link({ action: "link", channel: "TF1.qa" });
      expect(await html(`${base}?show=linked`)).toContain("manuel");
      const guide = `@${src.id}/TF1.qa`;
      expect((await db.select().from(schema.catalogContents).where(eq(schema.catalogContents.id, tf1.id)))[0].epgFallbackId).toBe(guide);
      await seedProgrammes([{ channelId: guide, start: -5, end: 30, title: "Journal du Golfe" }]);
      const grid = await html("/admin/epg");
      expect(grid).toContain("Journal du Golfe");
      expect(grid).toContain("qatar1 · TF1.qa");
      // The grid's search is the filter language, on the channels' variants.
      expect(await html("/admin/epg?q=tf1")).toContain("Journal du Golfe");
      expect(await html(`/admin/epg?q=${encodeURIComponent('marché:"fr"')}`)).toContain("Journal du Golfe");
      const neg = await html("/admin/epg?q=-tf1");
      expect(neg).not.toContain("Journal du Golfe");
      expect(await html(`/admin/epg?q=${encodeURIComponent("champ:x")}`)).toContain('role="alert"');
      expect(await html(`/admin/epg?channel=${encodeURIComponent(guide)}`)).toContain("source de secours");
      // The channel's page says how it finds its guide and lists what the base holds, under « Live » in the breadcrumb.
      const sheet = await html(`/admin/content/${tf1.id}`);
      expect(sheet).toContain("Rapprochement EPG");
      expect(sheet).toMatch(/Secours : <span[^>]*>qatar1<\/span>, chaîne <code[^>]*>TF1\.qa<\/code>,\s*rattachée à la main/);
      expect(sheet).toContain("Journal du Golfe");
      expect(sheet).toContain("en ce moment");
      expect(sheet).toMatch(/aria-label="Fil d'Ariane".*<a href="\/admin\/catalog\?kind=live"[^>]*>Live<\/a>.*aria-current="page">TF1</s);
      expect(await html(base)).toMatch(/aria-label="Fil d'Ariane".*<a href="\/admin\/epg"[^>]*>EPG<\/a>/s);
      expect(flash(await post(base, { name: "Qatar", url, offset: "-180" }))).toContain("Source enregistrée");
      expect((await db.select().from(schema.curationEpgSources))[0]).toMatchObject({ name: "Qatar", enabled: false, offsetMinutes: -180 });
      expect(flash(await post(`${base}/delete`, {}))).toContain("Source supprimée");
      expect(await db.select().from(schema.curationEpgSources)).toEqual([]);
      expect((await call(base)).status).toBe(404);
    } finally {
      await db.delete(schema.curationEpgSources);
      await db.delete(schema.catalogEpgProgrammes);
    }
  });

  it("launching a task goes back to the task journal, whatever the Referer says", async () => {
    const r = await call("/admin/jobs/epg", {
      method: "POST",
      body: new URLSearchParams(),
      headers: { "content-type": "application/x-www-form-urlencoded", origin: "http://localhost", referer: "::bad" },
    });
    expect(r.status).toBe(303);
    expect(new URL(r.headers.get("location")!, "http://x").pathname).toBe("/admin/tasks");
    await vi.waitUntil(async () => (await html("/admin/jobs/status")).includes("Aucun job en cours")); // the rebuild is over
  });

  it("a failed TMDB association says why in a sentence, never the query", async () => {
    setSecretsForTests({ tmdb_api_key: "k" });
    vi.stubGlobal("fetch", async () => Response.json({ id: 99999999999, title: "Trop grand", release_date: "2000-01-01" }));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const r = await post("/admin/catalog/tmdb-assign", { id: String(matrixId), tmdb_id: "99999999999" });
      const text = await r.text();
      expect(text).not.toContain("Failed query");
      expect(text).not.toContain("select");
      expect(text).toContain("text-destructive");
      const unknown = await (await post("/admin/catalog/tmdb-assign", { id: "999999", tmdb_id: "603" })).text();
      expect(unknown).toContain("Variante introuvable");
    } finally {
      vi.unstubAllGlobals();
      logged.mockRestore();
      setSecretsForTests({ tmdb_api_key: "" });
    }
  });

  it("a filter on versions, applied from « Filtres »: the version and the content say so", async () => {
    const page = await html("/admin/filters");
    expect(page).toContain("Champs d&#39;une version");
    expect(page).not.toContain('<code class="font-mono text-xs">visible</code>'); // searches only
    const save = (query: string) => post("/admin/filters", { kind: "vod", query });
    try {
      expect(flash(await save('variant.langue:"vf"'))).toContain("Filtre enregistré");
      expect(await runAll("manual", "filters")).toBe(true);
      expect(await html("/admin/filters")).not.toContain("modifiés depuis le dernier passage");
      // Matrix keeps its VF version, its VOST one is left out.
      const matrix = (await itemById(matrixId))!.contentId!;
      const sheet = await html(`/admin/content/${matrix}`);
      expect(sheet).toContain("Visible dans l&#39;app");
      expect(sheet).toContain("écartée par le filtre");
      expect(flash(await save('variant.langue:"it"'))).toContain("Filtre enregistré");
      expect(await runAll("manual", "filters")).toBe(true);
      expect(await html(`/admin/content/${matrix}`)).toContain("Aucune version servie : 2 versions écartées par le filtre");
    } finally {
      await db.delete(schema.curationFilters);
      await runAll("manual", "group");
    }
  });

  it("the adult checkbox of the settings form: ticked serves adult contents, absent stops serving them", async () => {
    const form = {
      tmdb_language: "fr-FR",
      sync_cron: "0 3 * * *",
      epg_cron: "0 3 */3 * *",
      trending_cron: "30 4 * * *",
      markers_cron: "45 4 * * *",
      public_base_url: "",
    };
    expect((await post("/admin/settings", { ...form, serve_adult: "on" })).status).toBe(303);
    expect((await getSettings()).serve_adult).toBe("1");
    expect((await post("/admin/settings", form)).status).toBe(303);
    expect((await getSettings()).serve_adult).toBe("0");
  });

  it("launching the pipeline hands over the step to start from and the shrink acceptance", async () => {
    const spy = vi.mocked(launch);
    spy.mockClear();
    spy.mockImplementationOnce(() => true);
    const r = await post("/admin/jobs/pipeline", { from: "filters", accept_shrink: "1" });
    expect(flash(r)).toContain("à partir de « ");
    expect(spy).toHaveBeenCalledWith("pipeline", "filters", { acceptShrink: true });
    spy.mockImplementationOnce(() => true);
    await post("/admin/jobs/pipeline", { from: "nope" });
    expect(spy).toHaveBeenLastCalledWith("pipeline", undefined, { acceptShrink: false });
  });

  it("ends every session, this one included; a new login opens one again", async () => {
    expect((await call("/admin")).status).toBe(200);
    const r = await post("/admin/settings/revoke-sessions", {});
    expect(r.headers.get("hx-redirect") ?? r.headers.get("location")).toBe("/admin/login");
    expect((await call("/admin")).headers.get("location")).toBe("/admin/login"); // the cookie still sent is refused
    const ok = await post("/admin/login", { email: "admin@kanstrimi.test", password: "test" });
    cookie = ok.headers.get("set-cookie")!.split(";")[0];
    expect((await call("/admin")).status).toBe(200);
  });

  it("logs out", async () => {
    const r = await post("/admin/logout", {});
    expect(r.headers.get("hx-redirect")).toBe("/admin/login");
  });
});
