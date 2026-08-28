import type { Child } from "hono/jsx";
import { html, raw } from "hono/html";

export const NAV = [
  ["/admin", "Tableau de bord"],
  ["/admin/catalog", "Catalogue"],
  ["/admin/rules", "Règles"],
  ["/admin/logs", "Journaux"],
  ["/admin/settings", "Paramètres"],
] as const;

export function Layout({ title, path, flash, loggedIn = true, children }: { title: string; path: string; flash?: { ok?: string; err?: string }; loggedIn?: boolean; children?: Child }) {
  return html`<!doctype html>
<html lang="fr" data-bs-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · Kanstrimi</title>
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js" defer></script>
<script src="https://cdn.jsdelivr.net/npm/htmx.org@2.0.4/dist/htmx.min.js" defer></script>
</head>
<body>
<nav class="navbar navbar-expand-md bg-body-tertiary mb-4">
  <div class="container">
    <a class="navbar-brand fw-bold" href="/admin">Kanstrimi</a>
    ${loggedIn ? html`
    <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#nav" aria-label="Menu"><span class="navbar-toggler-icon"></span></button>
    <div class="collapse navbar-collapse" id="nav">
      <ul class="navbar-nav me-auto">
        ${NAV.map(([href, label]) => html`<li class="nav-item"><a class="nav-link${href === path ? " active" : ""}" ${href === path ? raw('aria-current="page"') : ""} href="${href}">${label}</a></li>`)}
      </ul>
      <form method="post" action="/admin/logout"><button class="btn btn-outline-secondary btn-sm">Quitter</button></form>
    </div>` : ""}
  </div>
</nav>
<main class="container pb-5">
  ${flash?.ok ? html`<div class="alert alert-success">${flash.ok}</div>` : ""}
  ${flash?.err ? html`<div class="alert alert-danger">${flash.err}</div>` : ""}
  ${children}
</main>
</body>
</html>`;
}

export function fmt(n: number) { return n.toLocaleString("fr-FR"); }
export function ago(iso?: string | null) {
  if (!iso) return "jamais";
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.round(h / 24)} j`;
}
export function Status({ status }: { status: string }) {
  const cls: Record<string, string> = { success: "success", error: "danger", running: "primary" };
  const label: Record<string, string> = { success: "Succès", error: "Erreur", running: "En cours" };
  return <span class={`badge text-bg-${cls[status] ?? "secondary"}`}>{label[status] ?? status}</span>;
}
