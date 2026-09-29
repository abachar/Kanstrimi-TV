import type { EpgOffset } from "@/db";
import { Badge, Card, Empty, Options, Pagination, Title } from "../ui";
import { CHANNELS_PER_PAGE, type GridChannel, type GridProgramme, type GridQuery } from "./data";

/**
 * The guide as a TV grid: a row per channel, the time in 15-minute columns over six hours. Blocks
 * are placed with grid classes (no `style`): the lists below are written whole so Tailwind finds them.
 */
export const SLOT_MIN = 15;
export const SLOTS = 24;
const COL_START = [
  "col-start-1",
  "col-start-2",
  "col-start-3",
  "col-start-4",
  "col-start-5",
  "col-start-6",
  "col-start-7",
  "col-start-8",
  "col-start-9",
  "col-start-10",
  "col-start-11",
  "col-start-12",
  "col-start-13",
  "col-start-14",
  "col-start-15",
  "col-start-16",
  "col-start-17",
  "col-start-18",
  "col-start-19",
  "col-start-20",
  "col-start-21",
  "col-start-22",
  "col-start-23",
  "col-start-24",
  "col-start-25",
];
const COL_SPAN = [
  "col-span-1",
  "col-span-2",
  "col-span-3",
  "col-span-4",
  "col-span-5",
  "col-span-6",
  "col-span-7",
  "col-span-8",
  "col-span-9",
  "col-span-10",
  "col-span-11",
  "col-span-12",
  "col-span-13",
  "col-span-14",
  "col-span-15",
  "col-span-16",
  "col-span-17",
  "col-span-18",
  "col-span-19",
  "col-span-20",
  "col-span-21",
  "col-span-22",
  "col-span-23",
  "col-span-24",
];

const hm = (d: Date) => d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
const day = (d: Date) => d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
export const signed = (m: number) => {
  if (!m) return "aucun";
  const a = Math.abs(m);
  return `${m > 0 ? "+" : "−"}${Math.floor(a / 60)} h${a % 60 ? ` ${String(a % 60).padStart(2, "0")}` : ""}`;
};

/** Grid columns of a programme, clipped to the window. */
function place(p: GridProgramme, from: Date) {
  const slot = (d: Date) => Math.round((d.getTime() - from.getTime()) / (SLOT_MIN * 60_000));
  const a = Math.max(0, Math.min(SLOTS - 1, slot(p.startAt)));
  const b = Math.max(a + 1, Math.min(SLOTS, slot(p.endAt)));
  return `${COL_START[a]} ${COL_SPAN[b - a - 1]}`;
}

export type EpgPageProps = {
  q: GridQuery;
  channels: GridChannel[];
  total: number;
  markets: string[];
  themes: string[];
  offsets: EpgOffset[];
  panel?: unknown;
};

export function EpgView(p: EpgPageProps) {
  const { q } = p;
  const now = new Date();
  const link = (over: Partial<Record<"at" | "page" | "channel", string>>) => {
    const u = new URLSearchParams({
      ...(q.q && { q: q.q }),
      ...(q.market && { market: q.market }),
      ...(q.theme && { theme: q.theme }),
      at: q.from.toISOString(),
      page: String(q.page),
      ...over,
    });
    return `/admin/epg?${u}`;
  };
  const shiftAt = (hours: number) => new Date(q.from.getTime() + hours * 3600_000).toISOString();
  const nowSlot = Math.floor((now.getTime() - q.from.getTime()) / (SLOT_MIN * 60_000));
  return (
    <>
      <Title
        t="EPG"
        sub={`Guide des programmes du fournisseur, ${day(q.from)} de ${hm(q.from)} à ${hm(q.to)}. Un décalage se corrige depuis la chaîne.`}
        actions={
          <>
            <a class="btn" data-variant="outline" href={link({ at: shiftAt(-3), page: "1" })}>
              − 3 h
            </a>
            <a class="btn" data-variant="outline" href="/admin/epg">
              Maintenant
            </a>
            <a class="btn" data-variant="outline" href={link({ at: shiftAt(3), page: "1" })}>
              + 3 h
            </a>
          </>
        }
      />
      {p.panel}
      <form method="get" action="/admin/epg" class="grid grid-cols-2 gap-2 md:grid-cols-12" role="search">
        <input type="hidden" name="at" value={q.from.toISOString()} />
        <input
          class="input col-span-2 md:col-span-5"
          type="search"
          name="q"
          value={q.q}
          placeholder="Chercher une chaîne…"
          aria-label="Chaîne"
        />
        <select class="select md:col-span-3" name="market" aria-label="Marché">
          <Options opts={[["", "Tous les marchés"], ...p.markets.map((m) => [m, m.toUpperCase()] as const)]} cur={q.market} />
        </select>
        <select class="select md:col-span-3" name="theme" aria-label="Thème">
          <Options opts={[["", "Tous les thèmes"], ...p.themes.map((t) => [t, t] as const)]} cur={q.theme} />
        </select>
        <button class="btn md:col-span-1" data-variant="outline">
          Filtrer
        </button>
      </form>
      <Card title="Grille" extra={`${p.total} chaînes avec un guide`}>
        {p.channels.length ? (
          <div class="flex flex-col gap-1 overflow-x-auto">
            <div class="flex min-w-[64rem] items-end gap-2 text-xs text-muted-foreground">
              <div class="w-56 shrink-0" />
              <div class="grid flex-1 grid-cols-24">
                {Array.from({ length: SLOTS / 2 }, (_, i) => (
                  <div
                    class={`${COL_START[i * 2]} col-span-2 border-l ps-1 ${nowSlot >= i * 2 && nowSlot < i * 2 + 2 ? "font-semibold text-foreground" : ""}`}
                  >
                    {hm(new Date(q.from.getTime() + i * 2 * SLOT_MIN * 60_000))}
                  </div>
                ))}
              </div>
            </div>
            {p.channels.map((c) => (
              <a href={`${link({ channel: c.epgId })}#panel`} class="flex min-w-[64rem] items-stretch gap-2 rounded-md py-1 hover:bg-muted">
                <div class="flex w-56 shrink-0 items-center gap-2 ps-1">
                  {c.logo ? (
                    <img
                      src={c.logo}
                      alt=""
                      width="32"
                      height="32"
                      class="size-8 shrink-0 rounded bg-white/90 object-contain p-0.5"
                      loading="lazy"
                    />
                  ) : (
                    <span class="size-8 shrink-0 rounded bg-muted" />
                  )}
                  <div class="min-w-0">
                    <div class="truncate text-sm font-medium">{c.title}</div>
                    <div class="truncate font-mono text-xs text-muted-foreground">
                      {c.market?.toUpperCase()} · {c.epgId}
                      {c.offset ? ` · ${signed(c.offset)}` : ""}
                    </div>
                  </div>
                </div>
                <div class="grid flex-1 grid-cols-24 gap-px">
                  {c.programmes.map((pr) => {
                    const live = pr.startAt <= now && pr.endAt > now;
                    return (
                      <div
                        class={`${place(pr, q.from)} truncate rounded px-2 py-1 text-xs ${live ? "bg-primary/25 text-foreground" : "bg-secondary text-secondary-foreground"}`}
                        title={`${hm(pr.startAt)}–${hm(pr.endAt)} · ${pr.title}`}
                      >
                        <span class="tabular-nums opacity-70">{hm(pr.startAt)}</span> {pr.title}
                      </div>
                    );
                  })}
                </div>
              </a>
            ))}
          </div>
        ) : (
          <Empty title="Aucune chaîne" sub="Aucune chaîne visible n'a de guide pour ces filtres." />
        )}
        <div class="mt-4">
          <Pagination page={q.page} total={p.total} size={CHANNELS_PER_PAGE} link={(n) => link({ page: String(n) })} />
        </div>
      </Card>
      <Card title="Corrections du guide" extra={p.offsets.length ? `${p.offsets.length}` : undefined}>
        {p.offsets.length ? (
          <ul class="flex flex-col divide-y text-sm">
            {p.offsets.map((o) => (
              <li class="flex items-center gap-3 py-2">
                <span class="font-mono">{o.pattern}</span>
                <Badge tone="info">{signed(o.minutes)}</Badge>
                <form method="post" action="/admin/epg/offsets" class="ms-auto">
                  <input type="hidden" name="pattern" value={o.pattern} />
                  <input type="hidden" name="minutes" value="0" />
                  <button class="btn" data-variant="ghost" data-size="sm">
                    Retirer
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p class="text-sm text-muted-foreground">Aucune : les heures du fournisseur sont prises telles quelles.</p>
        )}
      </Card>
    </>
  );
}

const OFFSET_CHOICES = Array.from({ length: 97 }, (_, i) => (i - 48) * SLOT_MIN);

export type PanelProps = {
  epgId: string;
  channels: { title: string; logo: string | null; market: string | null }[];
  programmes: GridProgramme[];
  /** The shift the rules give this id now, and the one previewed. */
  current: number;
  preview: number;
  scope: "exact" | "suffix";
  back: string;
};

/** A guide id: its programmes of the day, and the correction, previewed before it is saved. */
export function OffsetPanel(p: PanelProps) {
  const suffix = p.epgId.includes(".") ? `*${p.epgId.slice(p.epgId.lastIndexOf("."))}` : null;
  return (
    <section id="panel" class="card">
      <header>
        <h2 class="font-mono">{p.epgId}</h2>
        <p>
          {p.channels.map((c) => `${c.title}${c.market ? ` (${c.market.toUpperCase()})` : ""}`).join(" · ")} · décalage actuel{" "}
          {signed(p.current)}
        </p>
        <div class="card-action text-sm">
          <a class="text-muted-foreground hover:text-foreground" href={p.back}>
            fermer
          </a>
        </div>
      </header>
      <section class="flex flex-col gap-4">
        <form
          method="post"
          action="/admin/epg/offsets"
          class="flex flex-wrap items-end gap-3"
          hx-get={`/admin/epg/preview/${encodeURIComponent(p.epgId)}`}
          hx-trigger="change"
          hx-target="#preview"
          hx-select="#preview"
          hx-swap="outerHTML"
        >
          <input type="hidden" name="back" value={p.back} />
          <div class="field">
            <label class="label" for="minutes">
              Décalage à appliquer
            </label>
            <select class="select" id="minutes" name="minutes">
              <Options opts={OFFSET_CHOICES.map((m) => [String(m), signed(m)] as const)} cur={String(p.preview)} />
            </select>
          </div>
          <fieldset class="flex flex-wrap items-center gap-4 text-sm">
            <label class="label gap-2 font-normal">
              <input type="radio" class="input" name="pattern" value={p.epgId} checked={p.scope === "exact"} />
              cette chaîne
            </label>
            {suffix && (
              <label class="label gap-2 font-normal">
                <input type="radio" class="input" name="pattern" value={suffix} checked={p.scope === "suffix"} />
                tous les guides <span class="font-mono">{suffix}</span>
              </label>
            )}
          </fieldset>
          <button class="btn" data-variant="primary">
            Enregistrer
          </button>
        </form>
        <div id="preview">
          <p class="mb-2 text-xs text-muted-foreground">
            {p.preview === p.current ? "Heures actuelles du guide." : `Aperçu avec ${signed(p.preview)} (au lieu de ${signed(p.current)}).`}
          </p>
          {p.programmes.length ? (
            <ul class="flex max-h-96 flex-col divide-y overflow-y-auto text-sm">
              {p.programmes.map((pr) => {
                const d = (p.preview - p.current) * 60_000;
                const s = new Date(pr.startAt.getTime() + d),
                  e = new Date(pr.endAt.getTime() + d);
                return (
                  <li class="flex gap-3 py-1.5">
                    <span class="w-28 shrink-0 tabular-nums text-muted-foreground">
                      {hm(s)}–{hm(e)}
                    </span>
                    <span class="min-w-0">{pr.title}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty title="Aucun programme ce jour-là" />
          )}
        </div>
      </section>
    </section>
  );
}
