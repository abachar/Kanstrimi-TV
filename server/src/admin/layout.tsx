import type { Child } from "hono/jsx";
import { html, raw } from "hono/html";

export const NAV = [
  ["/admin", "Tableau de bord"],
  ["/admin/catalog?kind=live", "Live"],
  ["/admin/catalog?kind=vod", "Films"],
  ["/admin/catalog?kind=series", "Séries"],
  ["/admin/rules", "Règles"],
  ["/admin/devices", "Appareils"],
  ["/admin/logs", "Journaux"],
  ["/admin/settings", "Paramètres"],
] as const;

/** `path` may carry a query string: the catalogue entries differ by `kind` only. */
function isActive(href: string, path: string) {
  const [hp, hq] = href.split("?");
  const [pp, pq] = path.split("?");
  if (hp !== pp) return false;
  if (!hq) return true;
  const want = new URLSearchParams(hq), got = new URLSearchParams(pq ?? "");
  return [...want].every(([k, v]) => (got.get(k) ?? (k === "kind" ? "vod" : null)) === v);
}

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
    <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#nav" aria-controls="nav" aria-expanded="false" aria-label="Ouvrir le menu"><span class="navbar-toggler-icon"></span></button>
    <div class="collapse navbar-collapse" id="nav">
      <ul class="navbar-nav me-auto">
        ${NAV.map(([href, label]) => html`<li class="nav-item"><a class="nav-link${isActive(href, path) ? " active" : ""}" ${isActive(href, path) ? raw('aria-current="page"') : ""} href="${href}">${label}</a></li>`)}
      </ul>
      <form method="post" action="/admin/logout"><button class="btn btn-outline-secondary btn-sm">Quitter</button></form>
    </div>` : ""}
  </div>
</nav>
<main class="container pb-5">
  ${flash?.ok ? html`<div class="alert alert-success" role="status">${flash.ok}</div>` : ""}
  ${flash?.err ? html`<div class="alert alert-danger" role="alert">${flash.err}</div>` : ""}
  ${children}
</main>
</body>
</html>`;
}

// ---------------------------------------------------------------- formats

export function fmt(n: number) { return n.toLocaleString("fr-FR"); }
const relative = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });
export function ago(iso?: string | null) {
  if (!iso) return "jamais";
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 1) return "à l'instant";
  if (m < 60) return relative.format(-m, "minute");
  const h = Math.round(m / 60);
  if (h < 24) return relative.format(-h, "hour");
  return relative.format(-Math.round(h / 24), "day");
}
export function duration(a: Date, b: Date) {
  const s = Math.round((b.getTime() - a.getTime()) / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m} min ${s % 60} s` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

// ---------------------------------------------------------------- building blocks

export const Title = ({ t, sub }: { t: string; sub: string }) => <div class="mb-4"><h1 class="h2 mb-1">{t}</h1><p class="text-secondary mb-0">{sub}</p></div>;

/**
 * `extra` is a short inline complement (a link, a language code); `hint` is a sentence.
 * The hint drops under the title on a phone and sits beside it on md+, so a card header
 * never becomes a grey paragraph the reader has to scan to find the title again.
 */
export const Card = ({ title, extra, hint, children }: { title: string; extra?: unknown; hint?: string; children?: unknown }) => (
  <div class="card mb-3">
    <div class="card-header">
      <span class="fw-semibold">{title}</span>
      {extra && <small class="text-secondary ms-2">{extra}</small>}
      {hint && <small class="text-secondary d-block d-md-inline ms-md-2">{hint}</small>}
    </div>
    <div class="card-body">{children}</div>
  </div>
);

export function Status({ status }: { status: string }) {
  const cls: Record<string, string> = { success: "success", error: "danger", running: "primary" };
  const label: Record<string, string> = { success: "Succès", error: "Erreur", running: "En cours" };
  return <span class={`badge text-bg-${cls[status] ?? "secondary"}`}>{label[status] ?? status}</span>;
}

/** `<option>`s of a select, the current one selected. */
export const Options = ({ opts, cur }: { opts: readonly (readonly [string, string])[]; cur: string }) => (
  <>{opts.map(([v, l]) => <option value={v} selected={v === cur}>{l}</option>)}</>
);

/** Previous / next links around "Page x / y". */
export function Pagination({ page, total, size, link }: { page: number; total: number; size: number; link: (p: number) => string }) {
  return (
    <nav class="d-flex align-items-center gap-3" aria-label="Pagination">
      {page > 1 && <a class="btn btn-outline-secondary btn-sm" href={link(page - 1)} rel="prev">← Précédent</a>}
      <span class="text-secondary small">Page {page} / {Math.max(1, Math.ceil(total / size))}</span>
      {page * size < total && <a class="btn btn-outline-secondary btn-sm ms-auto" href={link(page + 1)} rel="next">Suivant →</a>}
    </nav>
  );
}

/** A busy spinner htmx shows while a request runs (`.htmx-indicator` is styled by htmx itself). */
export const Busy = ({ id, label }: { id?: string; label: string }) => (
  <span id={id} class="htmx-indicator spinner-border spinner-border-sm text-secondary" role="status" aria-label={label}></span>
);
