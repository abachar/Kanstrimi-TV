import type { Child } from "hono/jsx";
import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { html, raw } from "hono/html";
import { env } from "@/shared";
import { Icon, type IconName } from "./icons";

/**
 * On md+ the side menu folds to its icons. Basecoat's sidebar has no icon-only state: it stays
 * "open" for Basecoat and md: utilities (which win over its component layer) narrow it and hide
 * the labels. The state lives in a cookie and the toggle is a plain form: every navigation is a
 * full page, a client-side toggle would not survive it. Below md the menu is a drawer, opened by
 * Basecoat's script, always with its labels.
 */
const MENU_COOKIE = "kanstrimi_menu";
export const isMenuCollapsed = (c: Context) => getCookie(c, MENU_COOKIE) === "collapsed";
export function toggleMenu(c: Context) {
  setCookie(c, MENU_COOKIE, isMenuCollapsed(c) ? "open" : "collapsed", { path: "/admin", maxAge: 60 * 60 * 24 * 365, sameSite: "Lax" });
}

type NavItem = readonly [href: string, label: string, icon: IconName];

/** The side menu: the dashboard, then the catalogue by kind, what the app stored, the tools. */
export const NAV: readonly (readonly [group: string | null, items: readonly NavItem[]])[] = [
  [null, [["/admin", "Tableau de bord", "dashboard"]]],
  [
    "Catalogue",
    [
      ["/admin/catalog?kind=live", "Live", "live"],
      ["/admin/catalog?kind=vod", "Films", "film"],
      ["/admin/catalog?kind=series", "Séries", "series"],
      ["/admin/studios", "Studios", "studios"],
      ["/admin/filters", "Filtres", "rules"],
      ["/admin/epg", "EPG", "epg"],
    ],
  ],
  [
    "Application",
    [
      ["/admin/devices", "Appareils", "devices"],
      ["/admin/favorites", "Favoris", "favorites"],
      ["/admin/history", "Historique", "history"],
      ["/admin/waitlist", "Liste d'attente", "waitlist"],
    ],
  ],
  [
    "Serveur",
    [
      ["/admin/caches", "Caches", "caches"],
      ["/admin/tasks", "Tâches", "logs"],
      ["/admin/settings", "Paramètres", "settings"],
    ],
  ],
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

/** The menu entry a page sits under: the one `href` names (a detail page's parent), else the one `path` matches. */
function navEntry(href: string): { group: string | null; href: string; label: string } | null {
  for (const [group, items] of NAV) for (const [h, label] of items) if (isActive(h, href)) return { group, href: h, label };
  return null;
}

/**
 * The trail in the header: the menu group, the menu entry when the page is one of its details
 * (`under`), then the page itself. The group has no page of its own: it is not a link.
 */
function Breadcrumb({ title, path, under }: { title: string; path: string; under?: string }) {
  const entry = navEntry(under ?? path);
  const sep = (cls = "") => html`<li aria-hidden="true" class="${cls}">${Icon({ name: "chevron-right", cls: "size-3.5" })}</li>`;
  // On a phone the group goes: the page and its parent are what the narrow header has room for.
  const group = entry?.group ? html`<li class="max-sm:hidden">${entry.group}</li>${sep("max-sm:hidden")}` : "";
  const parent =
    under && entry ? html`<li class="shrink-0"><a href="${entry.href}" class="hover:text-foreground">${entry.label}</a></li>${sep()}` : "";
  return html`<nav aria-label="Fil d'Ariane" class="min-w-0"><ol class="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">${group}${parent}<li class="min-w-0 truncate font-medium text-foreground" aria-current="page">${title}</li></ol></nav>`;
}

/**
 * htmx under the admin's CSP (`script-src 'self'`): nothing evaluated from an attribute, and no
 * `<style>` of its own — the busy spinners carry their classes (`Busy`).
 */
const HTMX_CONFIG = JSON.stringify({ allowEval: false, includeIndicatorStyles: false });

/**
 * The side menu. `open`: rendered open on a phone, where it is a drawer. Basecoat can only open it
 * from script, which the CSP forbids inline: the menu button has htmx swap in this one instead,
 * and Basecoat initialises it open.
 */
export function Menu({ path, collapsed, open = false }: { path: string; collapsed: boolean; open?: boolean }) {
  const rail = (cls: string) => (collapsed ? ` ${cls}` : "");
  return html`<aside id="menu" class="sidebar" data-side="left"${open ? raw(' data-initial-mobile-open="true"') : ""} aria-hidden="false">
  <nav aria-label="Menu" class="${rail("md:w-13")}">
    <header>
      <a href="/admin" class="btn justify-start gap-2 text-base font-semibold${rail("md:justify-center md:px-0")}" data-variant="ghost" title="Kanstrimi">
        <span class="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">${Icon({ name: "play", cls: "size-4" })}</span>
        <span class="${rail("md:hidden")}">Kanstrimi</span>
      </a>
    </header>
    <section class="scrollbar">
      ${NAV.map(
        ([group, items], i) => html`<div role="group"${group ? raw(` aria-labelledby="menu-g${i}"`) : ""}>
        ${group ? html`<h3 id="menu-g${i}" class="${rail("md:hidden")}">${group}</h3>` : ""}
        <ul>
          ${items.map(([href, text, icon]) => html`<li><a href="${href}" class="${rail("md:justify-center")}"${collapsed ? html` title="${text}"` : ""}${isActive(href, path) ? raw(' aria-current="page"') : ""}>${Icon({ name: icon })}<span class="${rail("md:hidden")}">${text}</span></a></li>`)}
        </ul>
      </div>`,
      )}
    </section>
    <footer>
      <form method="post" action="/admin/logout"><button class="btn w-full justify-start${rail("md:justify-center md:px-0")}" data-variant="ghost" title="Quitter">${Icon({ name: "logout" })}<span class="${rail("md:hidden")}">Quitter</span></button></form>
    </footer>
  </nav>
</aside>`;
}

export function Layout({
  title,
  path,
  flash,
  under,
  loggedIn = true,
  collapsed = false,
  children,
}: {
  title: string;
  path: string;
  /** A detail page: the menu entry it belongs to (`/admin/studios`), the parent in its breadcrumb. */
  under?: string;
  flash?: { ok?: string; err?: string };
  loggedIn?: boolean;
  /** md+ only: the menu shows its icons alone; the phone drawer keeps its labels. */
  collapsed?: boolean;
  children?: Child;
}) {
  const v = env.bootId;
  const flashes = html`${flash?.ok ? Flash({ ok: true, msg: flash.ok }) : ""}${flash?.err ? Flash({ ok: false, msg: flash.err }) : ""}`;
  const fold = collapsed ? "Déplier le menu" : "Réduire le menu";
  /** md+ classes of the icon rail, empty when the menu is unfolded. */
  const rail = (cls: string) => (collapsed ? ` ${cls}` : "");
  return html`<!doctype html>
<html lang="fr" class="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · Kanstrimi</title>
<link href="/admin/assets/admin.css?v=${v}" rel="stylesheet">
<script src="/admin/assets/basecoat.min.js?v=${v}" defer></script>
<script src="/admin/assets/htmx.min.js?v=${v}" defer></script>
<meta name="htmx-config" content="${HTMX_CONFIG}">
</head>
<body class="bg-background text-foreground antialiased">
<div id="toaster" class="toaster"></div>
${env.devPassword ? html`<div hx-get="/admin/dev/reload?boot=${env.bootId}" hx-trigger="every 1s" hx-swap="none" aria-hidden="true"></div>` : ""}
${
  loggedIn
    ? html`
${Menu({ path, collapsed })}
<main class="min-h-screen${rail("md:ml-13")}">
  <header class="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur md:px-6">
    <button type="button" class="btn md:hidden" data-variant="ghost" data-size="icon" aria-label="Ouvrir le menu" aria-controls="menu" hx-get="/admin/menu?path=${encodeURIComponent(path)}" hx-target="#menu" hx-swap="outerHTML">${Icon({ name: "menu" })}</button>
    <form method="post" action="/admin/menu" class="max-md:hidden">
      <input type="hidden" name="next" value="${path}">
      <button class="btn" data-variant="ghost" data-size="icon" title="${fold}" aria-label="${fold}">${Icon({ name: "panel" })}</button>
    </form>
    ${Breadcrumb({ title, path, under })}
  </header>
  <div class="mx-auto flex max-w-7xl flex-col gap-6 p-4 pb-12 md:p-6">
    ${flashes}
    ${children}
  </div>
</main>`
    : html`
<main class="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
  ${flashes}
  ${children}
</main>`
}
</body>
</html>`;
}

/** A Basecoat toast, appended to `#toaster` by an HTMX answer: what a fragment request shows of an error. */
export const Toast = ({ title, msg }: { title: string; msg: string }) =>
  html`<div class="toast" role="alert" aria-atomic="true" data-category="error"><div class="toast-content">${Icon({ name: "error" })}<section><h2>${title}</h2><p>${msg}</p></section></div></div>`;

/** A flash message from `?ok=` / `?err=`. */
const Flash = ({ ok, msg }: { ok: boolean; msg: string }) =>
  html`<div class="alert"${ok ? "" : raw(' data-variant="destructive"')} role="${ok ? "status" : "alert"}">${Icon({ name: ok ? "success" : "error" })}<h2>${msg}</h2></div>`;
