import type { Child } from "hono/jsx";
import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { html, raw } from "hono/html";
import { env } from "@/shared";

/**
 * The side menu folds to its icons on md+. The state lives in a cookie and the toggle is a
 * plain form: every navigation is a full page, so a client-side class swap would not survive it.
 */
const MENU_COOKIE = "kanstrimi_menu";
export const isMenuCollapsed = (c: Context) => getCookie(c, MENU_COOKIE) === "collapsed";
export function toggleMenu(c: Context) {
  setCookie(c, MENU_COOKIE, isMenuCollapsed(c) ? "open" : "collapsed", { path: "/admin", maxAge: 60 * 60 * 24 * 365, sameSite: "Lax" });
}

/** `icon` is a Bootstrap Icons name (`bi-<icon>`), loaded from the same CDN as Bootstrap. */
type NavItem = readonly [href: string, label: string, icon: string];

/** The side menu, one flat list: the catalogue by kind, what the app stored, then the tools. */
export const NAV: readonly NavItem[] = [
  ["/admin", "Tableau de bord", "speedometer2"],
  ["/admin/catalog?kind=live", "Live", "broadcast"],
  ["/admin/catalog?kind=vod", "Films", "film"],
  ["/admin/catalog?kind=series", "Séries", "collection-play"],
  ["/admin/favorites", "Favoris", "star"],
  ["/admin/history", "Historique", "clock-history"],
  ["/admin/rules", "Règles", "funnel"],
  ["/admin/devices", "Appareils", "tv"],
  ["/admin/caches", "Caches", "hdd"],
  ["/admin/logs", "Journaux", "journal-text"],
  ["/admin/settings", "Paramètres", "gear"],
];

/** `path` may carry a query string: the catalogue entries differ by `kind` only. */
function isActive(href: string, path: string) {
  const [hp, hq] = href.split("?");
  const [pp, pq] = path.split("?");
  if (hp !== pp) return false;
  if (!hq) return true;
  const want = new URLSearchParams(hq),
    got = new URLSearchParams(pq ?? "");
  return [...want].every(([k, v]) => (got.get(k) ?? (k === "kind" ? "vod" : null)) === v);
}

export function Layout({
  title,
  path,
  flash,
  loggedIn = true,
  collapsed = false,
  children,
}: {
  title: string;
  path: string;
  flash?: { ok?: string; err?: string };
  loggedIn?: boolean;
  /** md+ only: icons without labels; the phone offcanvas always shows both. */
  collapsed?: boolean;
  children?: Child;
}) {
  // Hides a label on md+ when the menu is folded; the offcanvas (below md) keeps it.
  const label = collapsed ? "d-md-none" : "";
  return html`<!doctype html>
<html lang="fr" data-bs-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · Kanstrimi</title>
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
<link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js" defer></script>
<script src="https://cdn.jsdelivr.net/npm/htmx.org@2.0.4/dist/htmx.min.js" defer></script>
</head>
<body>
${env.devPassword ? html`<div hx-get="/admin/dev/reload?boot=${env.bootId}" hx-trigger="every 1s" hx-swap="none" aria-hidden="true"></div>` : ""}
${
  loggedIn
    ? html`
<nav class="navbar bg-body-tertiary d-md-none">
  <div class="container-fluid">
    <a class="navbar-brand fw-bold" href="/admin">Kanstrimi</a>
    <button class="navbar-toggler" type="button" data-bs-toggle="offcanvas" data-bs-target="#menu" aria-controls="menu" aria-label="Ouvrir le menu"><span class="navbar-toggler-icon"></span></button>
  </div>
</nav>
<div class="container-fluid">
  <div class="row">
    <nav class="${collapsed ? "col-md-auto" : "col-md-3 col-lg-2"} p-0 offcanvas-md offcanvas-start" id="menu" tabindex="-1" aria-label="Menu">
      <div class="offcanvas-body p-0 sticky-md-top">
        <div class="d-flex flex-column w-100 p-3 bg-body-tertiary vh-100 overflow-auto">
          <div class="d-flex justify-content-between align-items-center gap-2 mb-3">
            <a class="navbar-brand fw-bold ${label}" href="/admin">Kanstrimi</a>
            <button type="button" class="btn-close d-md-none" data-bs-dismiss="offcanvas" data-bs-target="#menu" aria-label="Fermer"></button>
            <form method="post" action="/admin/menu" class="d-none d-md-block${collapsed ? " mx-auto" : ""}">
              <input type="hidden" name="next" value="${path}">
              <button class="btn btn-sm btn-outline-secondary border-0" title="${collapsed ? "Étendre le menu" : "Réduire le menu"}" aria-label="${collapsed ? "Étendre le menu" : "Réduire le menu"}"><i class="bi bi-chevron-double-${collapsed ? "right" : "left"}" aria-hidden="true"></i></button>
            </form>
          </div>
          <ul class="nav flex-column nav-pills mb-2">
            ${NAV.map(([href, text, icon]) => html`<li class="nav-item"><a class="nav-link d-flex align-items-center gap-2${collapsed ? " justify-content-md-center px-md-2" : ""}${isActive(href, path) ? " active" : ""}" ${isActive(href, path) ? raw('aria-current="page"') : ""} href="${href}" title="${text}"><i class="bi bi-${icon}" aria-hidden="true"></i><span class="${label}">${text}</span></a></li>`)}
          </ul>
          <form method="post" action="/admin/logout" class="mt-auto pt-3"><button class="btn btn-outline-secondary btn-sm w-100 d-flex align-items-center justify-content-center gap-2" title="Quitter"><i class="bi bi-box-arrow-right" aria-hidden="true"></i><span class="${label}">Quitter</span></button></form>
        </div>
      </div>
    </nav>
    <main class="col-12 col-md px-3 px-md-4 py-4 pb-5">
      ${flash?.ok ? html`<div class="alert alert-success" role="status">${flash.ok}</div>` : ""}
      ${flash?.err ? html`<div class="alert alert-danger" role="alert">${flash.err}</div>` : ""}
      ${children}
    </main>
  </div>
</div>`
    : html`
<main class="container py-4 pb-5">
  ${flash?.ok ? html`<div class="alert alert-success" role="status">${flash.ok}</div>` : ""}
  ${flash?.err ? html`<div class="alert alert-danger" role="alert">${flash.err}</div>` : ""}
  ${children}
</main>`
}
</body>
</html>`;
}
