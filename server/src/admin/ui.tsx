/** Bootstrap building blocks shared by the admin pages. Only classes, never a `style` attribute. */

export const Title = ({ t, sub }: { t: string; sub: string }) => (
  <div class="mb-4">
    <h1 class="h2 mb-1">{t}</h1>
    <p class="text-secondary mb-0">{sub}</p>
  </div>
);

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
  <>
    {opts.map(([v, l]) => (
      <option value={v} selected={v === cur}>
        {l}
      </option>
    ))}
  </>
);

/** Previous / next links around "Page x / y". */
export function Pagination({ page, total, size, link }: { page: number; total: number; size: number; link: (p: number) => string }) {
  return (
    <nav class="d-flex align-items-center gap-3" aria-label="Pagination">
      {page > 1 && (
        <a class="btn btn-outline-secondary btn-sm" href={link(page - 1)} rel="prev">
          ← Précédent
        </a>
      )}
      <span class="text-secondary small">
        Page {page} / {Math.max(1, Math.ceil(total / size))}
      </span>
      {page * size < total && (
        <a class="btn btn-outline-secondary btn-sm ms-auto" href={link(page + 1)} rel="next">
          Suivant →
        </a>
      )}
    </nav>
  );
}

/** A busy spinner htmx shows while a request runs (`.htmx-indicator` is styled by htmx itself). */
export const Busy = ({ id, label }: { id?: string; label: string }) => (
  <span id={id} class="htmx-indicator spinner-border spinner-border-sm text-secondary" role="status" aria-label={label}></span>
);
