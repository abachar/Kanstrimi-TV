import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Hono } from "hono";
import { resetDb, closeDb, seedCategories, seedItems, seedTmdb } from "@/test/db";
import { verify } from "@/config";
import { itemById } from "@/catalog";
import { run } from "@/catalog";
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
  ]);
  matrixId = items[0].id;
  expect(await run("group")).toBe(true); // journalled through the pipeline, so /admin/logs has a row
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

  it("logs in with the admin password only", async () => {
    const bad = await post("/admin/login", { password: "nope" });
    expect(bad.headers.get("location")).toContain("err=");
    const ok = await post("/admin/login?next=/admin/rules", { password: "test" });
    expect(ok.status).toBe(303);
    expect(ok.headers.get("location")).toBe("/admin/rules");
    cookie = ok.headers.get("set-cookie")!.split(";")[0];
    expect(cookie).toMatch(/^kanstrimi_admin=/);
  });

  it("renders every page", async () => {
    expect(await html("/admin")).toContain("Tableau de bord");
    expect(await html("/admin/catalog?kind=vod")).toContain("|FR| FILMS");
    expect(await html("/admin/catalog?kind=vod&view=flat&q=matrix")).toContain("Matrix (VOST)");
    expect(await html("/admin/catalog?kind=live&view=flat")).not.toContain("TMDB associé");
    const groups = await html("/admin/catalog?kind=vod&view=groups");
    expect(groups).toContain("2 variantes");
    expect(groups).toContain("Groupes");
    expect(await html("/admin/catalog/items?kind=vod&cat=10&view=grouped&page=1")).toContain("Matrix (4K)");
    expect(await html(`/admin/item/${matrixId}`)).toContain("JSON amont brut");
    expect(await html("/admin/rules")).toContain("Nouvelle règle");
    expect(await html("/admin/devices")).toContain("Aucun appareil");
    expect(await html("/admin/logs")).toContain("Groupement");
    expect(await html("/admin/settings")).toContain("Serveur Xtream");
    expect(await html("/admin/pair/K7Q4MZ")).toContain("Code inconnu");
    expect(await html("/admin/jobs/status")).toContain("Aucun job en cours");
    expect((await call("/admin/item/999999")).status).toBe(404);
  });

  it("toggles visibility and answers with the row (item) or a refresh (category)", async () => {
    const hide = await post(`/admin/catalog/item/${matrixId}/visible?kind=vod&view=flat`, {});
    expect(hide.status).toBe(200);
    expect(await hide.text()).toContain("<s>|FR| Matrix (4K)</s>");
    expect((await itemById(matrixId))?.hiddenManual).toBe(true);
    const show = await post(`/admin/catalog/item/${matrixId}/visible?kind=vod&view=flat`, { visible: "on" });
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

  it("logs out", async () => {
    const r = await post("/admin/logout", {});
    expect(r.headers.get("hx-redirect")).toBe("/admin/login");
  });
});
