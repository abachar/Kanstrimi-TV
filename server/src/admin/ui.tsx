/**
 * Basecoat building blocks shared by the admin pages. Only Tailwind and Basecoat classes, never a
 * `style` attribute. Class names are always written whole (Tailwind finds them by reading the
 * source): pick from a map, never build `text-${x}`.
 */
import { Icon } from "./icons";

export const Title = ({ t, sub, actions }: { t: string; sub: string; actions?: unknown }) => (
  <div class="flex flex-wrap items-end justify-between gap-4">
    <div class="flex flex-col gap-1">
      <h1 class="text-2xl font-semibold tracking-tight">{t}</h1>
      <p class="text-sm text-muted-foreground">{sub}</p>
    </div>
    {actions && <div class="flex flex-wrap gap-2">{actions}</div>}
  </div>
);

/**
 * `extra` is a short complement at the right of the header (a link, a language code); `hint`
 * is a sentence under the title. No `h-full`: a card only fills a row when its grid cell is itself
 * a `grid` (see the dashboard).
 */
export const Card = ({ title, extra, hint, children }: { title: string; extra?: unknown; hint?: string; children?: unknown }) => (
  <section class="card">
    <header>
      <h2>{title}</h2>
      {hint && <p>{hint}</p>}
      {extra && <div class="card-action text-sm text-muted-foreground">{extra}</div>}
    </header>
    <section>{children}</section>
  </section>
);

/** A figure of the dashboard: a label, a big number, a line under it. */
export const Stat = ({ label, value, sub, children }: { label: string; value: string; sub?: unknown; children?: unknown }) => (
  <section class="card h-full" data-size="sm">
    <header>
      <p>{label}</p>
    </header>
    <section class="flex flex-col gap-1">
      <div class="text-3xl font-semibold tabular-nums tracking-tight">{value}</div>
      {sub && <div class="text-xs text-muted-foreground">{sub}</div>}
      {children}
    </section>
  </section>
);

/**
 * The colours of a status, the same everywhere: `ok` done or visible, `warn` needs a look,
 * `bad` failed, `info` running or informative, `muted` hidden or neutral.
 */
export type Tone = "ok" | "warn" | "bad" | "info" | "muted" | "plain";
const TONES: Record<Tone, string> = {
  ok: "bg-emerald-500/15 text-emerald-400",
  warn: "bg-amber-500/15 text-amber-400",
  bad: "bg-destructive/20 text-destructive",
  info: "bg-sky-500/15 text-sky-400",
  muted: "border-border text-muted-foreground",
  plain: "bg-secondary text-secondary-foreground",
};
export const Badge = ({ tone = "plain", title, children }: { tone?: Tone; title?: string; children?: unknown }) => (
  <span class={`badge ${TONES[tone]}`} data-variant={tone === "muted" ? "outline" : "secondary"} title={title}>
    {children}
  </span>
);

export function Status({ status }: { status: string }) {
  const tone: Record<string, Tone> = { success: "ok", error: "bad", running: "info", killed: "warn" };
  const label: Record<string, string> = { success: "Succès", error: "Erreur", running: "En cours", killed: "Arrêté" };
  return <Badge tone={tone[status] ?? "plain"}>{label[status] ?? status}</Badge>;
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
    <nav class="flex items-center gap-3" aria-label="Pagination">
      {page > 1 && (
        <a class="btn" data-variant="outline" data-size="sm" href={link(page - 1)} rel="prev">
          <Icon name="chevron-left" />
          Précédent
        </a>
      )}
      <span class="text-sm text-muted-foreground">
        Page {page} / {Math.max(1, Math.ceil(total / size))}
      </span>
      {page * size < total && (
        <a class="btn ms-auto" data-variant="outline" data-size="sm" href={link(page + 1)} rel="next">
          Suivant
          <Icon name="chevron-right" />
        </a>
      )}
    </nav>
  );
}

/** A spinner, spinning while it is shown. */
export const Spinner = ({ label }: { label?: string }) => (
  <span role="status" aria-label={label} class="inline-flex">
    <Icon name="loader" cls="size-4 animate-spin" />
  </span>
);

/** A busy spinner htmx shows while a request runs (`.htmx-indicator` is styled by htmx itself). */
export const Busy = ({ id, label }: { id?: string; label: string }) => (
  <span id={id} class="htmx-indicator inline-flex text-muted-foreground" role="status" aria-label={label}>
    <Icon name="loader" cls="size-4 animate-spin" />
  </span>
);

/** A table that scrolls sideways on a phone instead of widening the page. */
export const Table = ({ children }: { children?: unknown }) => (
  <div class="table-container">
    <table class="table">{children}</table>
  </div>
);

/** What an empty list says instead of a blank space. */
export const Empty = ({ title, sub }: { title: string; sub?: string }) => (
  <div class="empty gap-1 rounded-lg border border-dashed p-8">
    <h3 class="text-sm font-medium">{title}</h3>
    {sub && <p class="text-sm text-muted-foreground">{sub}</p>}
  </div>
);

/** A bar for a ratio. Native `<progress>`: its width needs no `style`. */
export const Meter = ({ value, max, label }: { value: number; max: number; label?: string }) => (
  <progress
    class="h-1.5 w-full overflow-hidden rounded-full bg-muted [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:bg-primary"
    value={value}
    max={max || 1}
    aria-label={label}
  ></progress>
);
