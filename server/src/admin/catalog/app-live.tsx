import { type LiveChannel, qualityOfRank } from "@/catalog";
import { fmt } from "../format";
import { Badge, Empty } from "../ui";
import { Icon } from "../icons";
import { Attach, countryName } from "../channels/view";
import { More, SUMMARY } from "./list-parts";
import { branchKey, LIVE_PAGE, type LiveView, type Shortcut } from "./live-data";

/**
 * The Live screen: one tree, market → theme → channels, for everything a provider in use carries (the
 * channels of the reference, the names left without one under « Non reconnus », the event feeds under
 * « Événements »). The search above it prunes the tree; its shortcuts are searches written in advance.
 * A channel opens its page, where it is corrected; a name left is attached where it stands.
 */

const LIVE = "/admin/catalog?kind=live";

/** French names of the markets a household usually watches; the code itself otherwise. */
const MARKETS: Record<string, string> = {
  fr: "France",
  ar: "Monde arabe",
  be: "Belgique",
  ch: "Suisse",
  uk: "Royaume-Uni",
  us: "États-Unis",
};
const marketName = (m: string | null) => (m === null ? "Sans marché" : (MARKETS[m] ?? m.toUpperCase()));
const themeName = (t: string | null) => t ?? "Sans thème";

/** The screen for a search, with a branch open when a form comes back to it. */
export function liveLink(q: string, open = ""): string {
  const u = new URLSearchParams();
  if (q) u.set("q", q);
  if (open) u.set("open", open);
  return u.size ? `${LIVE}&${u}` : LIVE;
}
/** One page of a branch, from its channel `n + 1`. */
const branchLink = (q: string, market: string | null, theme: string | null, n = 0) =>
  `/admin/catalog/branch?${new URLSearchParams({ q, market: market ?? "", theme: theme ?? "", n: String(n) })}`;

/**
 * Searches written in advance, each with what it finds: a click writes it in the box. The one the box
 * holds is marked.
 */
export function LiveShortcuts({ shortcuts, q }: { shortcuts: Shortcut[]; q: string }) {
  return (
    <nav class="flex flex-wrap gap-2" aria-label="Recherches toutes prêtes">
      {shortcuts.map((s) => (
        <a
          class="btn"
          data-variant={s.q === q ? "primary" : "outline"}
          href={liveLink(s.q)}
          title={`${s.title} · ${s.q}`}
          aria-current={s.q === q ? "page" : undefined}
        >
          {s.label}
          <span class="tabular-nums opacity-70">{fmt(s.count)}</span>
        </a>
      ))}
    </nav>
  );
}

/** A channel's line: twelve columns on md+, the name alone on its line on a phone. */
const ROW = "grid grid-cols-[2rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1 px-4 py-2 text-sm md:grid-cols-12";
const CELL = "max-md:col-start-2";
const AI_KIND: Record<string, string> = { channel: "une chaîne", event: "un événement", other: "autre chose" };
const CLAUDE_NAMES = 3;

const RowsHeader = () => (
  <div class={`${ROW} bg-muted/30 text-xs font-medium text-muted-foreground max-md:hidden`}>
    <div class="md:col-span-1"></div>
    <div class="md:col-span-4">Chaîne</div>
    <div class="md:col-span-1">Pays</div>
    <div class="md:col-span-1">Qualité</div>
    <div class="md:col-span-1">Flux</div>
    <div class="md:col-span-1">Dans l'app</div>
    <div class="md:col-span-3">Rattacher à</div>
  </div>
);

/** What is said under a channel's name: how its provider writes a name left, and what Claude read. */
function notesOf(ch: LiveChannel): string[] {
  const loose = ch.status !== "known";
  return [
    loose ? [ch.sample !== ch.name ? ch.sample : null, ch.category].filter(Boolean).join(" · ") : "",
    ch.byClaude.length
      ? `Claude : ${ch.byClaude.slice(0, CLAUDE_NAMES).join(" · ")}${ch.byClaude.length > CLAUDE_NAMES ? ` · +${ch.byClaude.length - CLAUDE_NAMES}` : ""}`
      : "",
    loose && ch.aiName ? `Claude y lit « ${ch.aiName} », qu'aucune chaîne connue ne porte dans ce marché` : "",
    loose && !ch.aiName && ch.aiKind ? `Claude y voit ${AI_KIND[ch.aiKind] ?? ch.aiKind}` : "",
  ].filter(Boolean);
}

/**
 * One channel. A name left without a channel also carries what attaches it: the closest channels of
 * the reference, one click away, and « Autre… », which unfolds under the line the search in the whole
 * reference and the creation of a channel.
 */
function ChannelLine({ ch, back }: { ch: LiveChannel; back: string }) {
  const quality = qualityOfRank(ch.maxQualityRank ?? 0);
  const attachable = ch.status !== "known" && ch.market !== null;
  const slot = `name-${ch.id}`;
  return (
    <div>
      <div class={ROW}>
        <div class="md:col-span-1">
          {ch.logoUrl ? <img src={ch.logoUrl} alt="" width="32" height="32" class="size-8 object-contain" loading="lazy" /> : ""}
        </div>
        <div class="min-w-0 md:col-span-4">
          <a class="font-medium break-words hover:underline" href={`/admin/content/${ch.id}`} title="Ouvrir la chaîne et ses variantes">
            {ch.name}
          </a>
          {notesOf(ch).map((note) => (
            <div class="truncate text-xs text-muted-foreground" title={note}>
              {note}
            </div>
          ))}
        </div>
        <div class={`${CELL} text-muted-foreground md:col-span-1`}>{ch.country ? countryName(ch.country) : ""}</div>
        <div class={`${CELL} md:col-span-1`}>{quality && <Badge tone="muted">{quality}</Badge>}</div>
        <div class={`${CELL} tabular-nums md:col-span-1`}>{fmt(ch.streams)}</div>
        <div class={`${CELL} md:col-span-1`}>{ch.visible ? <Badge tone="ok">affichée</Badge> : <Badge tone="muted">écartée</Badge>}</div>
        <div class={`${CELL} flex flex-wrap items-center gap-2 md:col-span-3`}>
          {attachable && (
            <>
              {ch.suggestions.map((c) => (
                <Attach market={ch.market!} title={ch.name} c={c} back={back} />
              ))}
              <button
                type="button"
                class="btn"
                data-variant="ghost"
                data-size="sm"
                hx-get={`/admin/channels/panel?${new URLSearchParams({ market: ch.market!, title: ch.name, slot, back })}`}
                hx-target={`#${slot}`}
                hx-swap="innerHTML"
              >
                <Icon name="search" />
                Autre…
              </button>
            </>
          )}
        </div>
      </div>
      {/* Where « Autre… » unfolds: nothing until then. */}
      {attachable && <div id={slot}></div>}
    </div>
  );
}

/**
 * One page of a branch, from its channel `n + 1`: `rows` holds one more than the page when the branch
 * goes on. A form of these lines comes back to the screen with this branch open.
 */
export function BranchRows({
  q,
  market,
  theme,
  rows,
  n,
}: {
  q: string;
  market: string | null;
  theme: string | null;
  rows: LiveChannel[];
  n: number;
}) {
  const back = liveLink(q, branchKey(market, theme));
  return (
    <>
      {n === 0 && <RowsHeader />}
      {rows.slice(0, LIVE_PAGE).map((ch) => (
        <ChannelLine ch={ch} back={back} />
      ))}
      {rows.length > LIVE_PAGE && <More link={branchLink(q, market, theme, n + LIVE_PAGE)} />}
    </>
  );
}

/** The tree: a market unfolds its themes, a theme loads its channels the first time it opens. */
export function LiveTree({ q, view }: { q: string; view: LiveView }) {
  if (!view.total)
    return (
      <Empty
        title="Aucune chaîne"
        sub={q ? "Aucune chaîne ne correspond à la recherche." : "Aucun fournisseur en service ne porte de chaîne."}
      />
    );
  return (
    <>
      <p class="text-sm text-muted-foreground">
        {fmt(view.total)} chaîne{view.total > 1 ? "s" : ""} dans {fmt(view.markets.length)} marché{view.markets.length > 1 ? "s" : ""}
        {q ? ` pour « ${q} »` : ""} : par marché, puis par thème. Une chaîne ouvre sa fiche et ses variantes ; un nom resté sans chaîne («
        Non reconnus », « Événements ») se rattache sur sa ligne, pour tous les fournisseurs et toutes ses qualités.
      </p>
      <div class="flex flex-col divide-y overflow-hidden rounded-xl border" id="live-tree">
        {view.markets.map((m, i) => (
          <details open={m.themes.some((t) => view.loaded.has(branchKey(m.market, t.theme)))}>
            <summary class={SUMMARY}>
              <span class="truncate font-medium">{marketName(m.market)}</span>
              <Badge tone="plain">{fmt(m.channels)}</Badge>
              {m.visible > 0 && <span class="text-xs text-muted-foreground">{fmt(m.visible)} dans l'app</span>}
            </summary>
            <div class="flex flex-col divide-y border-t">
              {m.themes.map((t, j) => {
                const id = `branch-${i}-${j}`;
                const rows = view.loaded.get(branchKey(m.market, t.theme));
                return (
                  <details
                    open={rows !== undefined}
                    {...(rows === undefined
                      ? {
                          "hx-get": branchLink(q, m.market, t.theme),
                          "hx-target": `#${id}`,
                          "hx-swap": "beforeend",
                          "hx-trigger": "toggle once",
                        }
                      : {})}
                  >
                    <summary class={`${SUMMARY} ps-8`}>
                      <span class="truncate">{themeName(t.theme)}</span>
                      <Badge tone="plain">{fmt(t.channels)}</Badge>
                      {t.visible > 0 && <span class="text-xs text-muted-foreground">{fmt(t.visible)} dans l'app</span>}
                    </summary>
                    <div id={id} class="flex flex-col divide-y border-t">
                      {rows && <BranchRows q={q} market={m.market} theme={t.theme} rows={rows} n={0} />}
                    </div>
                  </details>
                );
              })}
            </div>
          </details>
        ))}
      </div>
    </>
  );
}
