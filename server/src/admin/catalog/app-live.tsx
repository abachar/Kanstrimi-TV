import type { ChannelRow as KnownChannel, LiveMarketStat, LiveSummary, UnmatchedName } from "@/catalog";
import type { ChannelGroupWire, ChannelWire, Version } from "@/player";
import { fmt } from "../format";
import { Badge, Empty, Options, Pagination, Table } from "../ui";
import { Icon } from "../icons";
import { contentKeyLink } from "../content/links";
import { Attach, countryName } from "../channels/view";
import { SUMMARY } from "./list-parts";
import type { CatalogQuery, LiveShow } from "./query";

/**
 * The Live screen. A channel is a channel of the reference (iptv-org and ours): the screen lists the
 * ones the app shows (the groups exactly as `/player/channels` serves them, read through the same
 * function with a device-less context), every channel of a market, and what is not a channel yet:
 * the names left to attach and the event feeds. A channel opens its page, where it is corrected; a
 * name is attached where it stands.
 */

export const LIVE_PAGE_SIZE = 50;
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
const marketName = (m: string) => MARKETS[m] ?? m.toUpperCase();

/** A link to the screen: what it lists, then the market, the name sought and the page when they matter. */
export function liveLink(q: Partial<Pick<CatalogQuery, "show" | "market" | "name" | "page">>): string {
  const u = new URLSearchParams();
  if (q.show && q.show !== "shown") u.set("show", q.show);
  if (q.market) u.set("market", q.market);
  if (q.name) u.set("name", q.name);
  if (q.page && q.page > 1) u.set("page", String(q.page));
  return u.size ? `${LIVE}&${u}` : LIVE;
}

/** What each market counts in a view: its channels, its names left, its event feeds. */
const COUNT: Record<Exclude<LiveShow, "shown">, (m: LiveMarketStat) => number> = {
  all: (m) => m.channels,
  unmatched: (m) => m.unknown,
  events: (m) => m.events,
};

/**
 * The summary and the filter at once: how many channels the app shows, how many the reference holds,
 * how many names and event feeds are left out of it in the markets the household watches. Each
 * figure opens its list.
 */
export function LiveTabs({ summary, show }: { summary: LiveSummary; show: LiveShow }) {
  const watched = summary.markets.filter((m) => m.watched);
  const sum = (of: (m: LiveMarketStat) => number, markets = watched) => markets.reduce((n, m) => n + of(m), 0);
  const tabs: [LiveShow, string, number, string][] = [
    ["shown", "Affichées dans l'app", summary.shown, "Ce que reçoit le profil par défaut"],
    ["all", "Toutes les chaînes", sum(COUNT.all, summary.markets), "Les chaînes reconnues, tous marchés, qu'un profil les voie ou non"],
    [
      "unmatched",
      "Non rattachées",
      sum(COUNT.unmatched),
      "Les noms des fournisseurs qui ne correspondent à aucune chaîne connue, dans les marchés regardés",
    ],
    ["events", "Événements", sum(COUNT.events), "Les flux d'un match ou d'un paiement à la séance, dans les marchés regardés"],
  ];
  return (
    <nav class="flex flex-wrap gap-2" aria-label="Ce que la liste montre">
      {tabs.map(([key, label, n, title]) => (
        <a
          class="btn"
          data-variant={show === key ? "primary" : "outline"}
          href={liveLink({ show: key })}
          title={title}
          aria-current={show === key ? "page" : undefined}
        >
          {label}
          <span class="tabular-nums opacity-70">{fmt(n)}</span>
        </a>
      ))}
    </nav>
  );
}

/** The market a per-market list shows: the watched ones as buttons, the others in a select. */
function MarketBar({ markets, market, show }: { markets: LiveMarketStat[]; market: string; show: Exclude<LiveShow, "shown"> }) {
  const main = markets.filter((m) => m.watched || m.market === market);
  const others = markets.filter((m) => !m.watched && m.market !== market && COUNT[show](m) > 0);
  return (
    <div class="flex flex-wrap items-center gap-2">
      {main.map((m) => (
        <a
          class="btn"
          data-variant={m.market === market ? "secondary" : "ghost"}
          data-size="sm"
          href={liveLink({ show, market: m.market })}
        >
          {marketName(m.market)}
          <span class="tabular-nums text-muted-foreground">{fmt(COUNT[show](m))}</span>
        </a>
      ))}
      {others.length > 0 && (
        <form method="get" action="/admin/catalog" class="flex items-center gap-2">
          <input type="hidden" name="kind" value="live" />
          <input type="hidden" name="show" value={show} />
          <select class="select h-8" name="market" aria-label="Autre marché">
            <Options opts={others.map((m) => [m.market, `${marketName(m.market)} · ${fmt(COUNT[show](m))}`] as const)} cur="" />
          </select>
          <button class="btn" data-variant="ghost" data-size="sm">
            Voir
          </button>
        </form>
      )}
    </div>
  );
}

/** Every channel of the reference a market holds, shown by the app or not. */
export function AllChannelsView({
  markets,
  market,
  page,
  channels,
}: {
  markets: LiveMarketStat[];
  market: string;
  page: number;
  channels: { rows: KnownChannel[]; total: number };
}) {
  return (
    <>
      <MarketBar markets={markets} market={market} show="all" />
      {channels.rows.length === 0 ? (
        <Empty title="Aucune chaîne" sub="Aucune chaîne reconnue dans ce marché." />
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <th></th>
                <th>Chaîne</th>
                <th>Pays</th>
                <th>Thème</th>
                <th>Versions</th>
                <th>Dans l'app</th>
              </tr>
            </thead>
            <tbody>
              {channels.rows.map((ch) => (
                <tr>
                  <td>
                    {ch.logoUrl ? <img src={ch.logoUrl} alt="" width="32" height="32" class="size-8 object-contain" loading="lazy" /> : ""}
                  </td>
                  <td>
                    <a class="font-medium hover:underline" href={`/admin/content/${ch.id}`} title="Ouvrir la chaîne et ses variantes">
                      {ch.title}
                    </a>
                  </td>
                  <td class="text-muted-foreground">{ch.country ? countryName(ch.country) : "—"}</td>
                  <td>{ch.themes.join(", ")}</td>
                  <td class="tabular-nums">{fmt(ch.versions)}</td>
                  <td>{ch.visible ? <Badge tone="ok">affichée</Badge> : <Badge tone="muted">écartée</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination page={page} total={channels.total} size={LIVE_PAGE_SIZE} link={(p) => liveLink({ show: "all", market, page: p })} />
        </>
      )}
    </>
  );
}

const AI_KIND: Record<string, string> = { channel: "chaîne", event: "événement", other: "autre chose" };

/**
 * The names of a market that are no channel yet (unknown, or event feeds), the most frequent first.
 * A suggestion attaches the name in one click; « Autre… » unfolds, under the line, the search in the
 * whole reference and the creation of a channel.
 */
export function NamesView({
  markets,
  market,
  show,
  name,
  page,
  names,
}: {
  markets: LiveMarketStat[];
  market: string;
  show: "unmatched" | "events";
  name: string;
  page: number;
  names: { rows: UnmatchedName[]; total: number };
}) {
  const here = liveLink({ show, market, name, page });
  return (
    <>
      <div class="flex flex-wrap items-center gap-2">
        <MarketBar markets={markets} market={market} show={show} />
        <form method="get" action="/admin/catalog" class="ms-auto flex gap-2" role="search">
          <input type="hidden" name="kind" value="live" />
          <input type="hidden" name="show" value={show} />
          <input type="hidden" name="market" value={market} />
          <input class="input h-8" type="search" name="name" value={name} placeholder="Nom…" aria-label="Chercher un nom" />
          <button class="btn" data-variant="outline" data-size="sm">
            <Icon name="search" />
            Chercher
          </button>
        </form>
      </div>
      <p class="text-sm text-muted-foreground">
        {show === "events"
          ? "Des flux qui ne sont pas des chaînes : un match, une séance payante, un canal numéroté d'une plateforme. Un nom rangé ici à tort se rattache comme les autres."
          : "Rattacher un nom à sa chaîne vaut pour tous les fournisseurs et toutes ses qualités. Ce qui reste ici va sous « Non reconnus » dans l'app."}
      </p>
      {names.rows.length === 0 ? (
        <Empty title="Rien à rattacher" sub={name ? `Aucun nom ne contient « ${name} ».` : "Chaque nom de ce marché a sa chaîne."} />
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <th>Nom</th>
                <th>Versions</th>
                <th>Catégorie</th>
                <th>Claude</th>
                <th>Rattacher à</th>
              </tr>
            </thead>
            <tbody>
              {names.rows.map((n, i) => (
                <>
                  <tr>
                    <td class="font-medium" title={n.sample}>
                      {n.title}
                    </td>
                    <td class="tabular-nums" title={`${n.providers} fournisseur${n.providers > 1 ? "s" : ""}`}>
                      {fmt(n.variants)}
                    </td>
                    <td class="text-muted-foreground">{n.category ?? "—"}</td>
                    <td>
                      {n.aiTitle ? (
                        <span title="Le nom que Claude y lit : aucune chaîne connue ne le porte dans ce marché">{n.aiTitle}</span>
                      ) : n.aiKind ? (
                        <Badge tone="muted">{AI_KIND[n.aiKind] ?? n.aiKind}</Badge>
                      ) : (
                        <span class="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td>
                      <div class="flex flex-wrap items-center gap-2">
                        {n.suggestions.map((c) => (
                          <Attach market={n.market} title={n.title} c={c} back={here} />
                        ))}
                        <button
                          type="button"
                          class="btn"
                          data-variant="ghost"
                          data-size="sm"
                          hx-get={`/admin/channels/panel?market=${encodeURIComponent(n.market)}&title=${encodeURIComponent(n.title)}&slot=name-${i}&back=${encodeURIComponent(here)}`}
                          hx-target={`#name-${i}`}
                          hx-swap="innerHTML"
                        >
                          <Icon name="search" />
                          Autre…
                        </button>
                      </div>
                    </td>
                  </tr>
                  {/* Where « Autre… » unfolds: no line of its own until then. */}
                  <tr class="border-0 hover:bg-transparent">
                    <td colspan={5} class="p-0" id={`name-${i}`}></td>
                  </tr>
                </>
              ))}
            </tbody>
          </Table>
          <Pagination page={page} total={names.total} size={LIVE_PAGE_SIZE} link={(p) => liveLink({ show, market, name, page: p })} />
        </>
      )}
    </>
  );
}

/** « FHD · VF · 2 sources » */
function versionsSummary(versions: Version[]): string {
  if (!versions.length) return "aucune version";
  const qualities = [...new Set(versions.map((v) => v.quality))];
  const languages = [...new Set(versions.map((v) => v.language))];
  const sources = versions.reduce((n, v) => n + v.sources.length, 0);
  return [...qualities, ...languages, `${sources} source${sources > 1 ? "s" : ""}`].join(" · ");
}

const ChannelRow = ({ ch }: { ch: ChannelWire }) => (
  <tr>
    <td class="text-end text-muted-foreground tabular-nums">{ch.number ?? ""}</td>
    <td>{ch.logo ? <img src={ch.logo} alt="" width="32" height="32" class="size-8 object-contain" loading="lazy" /> : ""}</td>
    <td>
      <span class="inline-flex items-center gap-1">
        {ch.is_favorite ? (
          <span title="Favori" class="text-amber-400">
            <Icon name="favorites" cls="size-3.5 fill-current" />
          </span>
        ) : (
          ""
        )}
        <a class="font-medium hover:underline" href={contentKeyLink(ch.id)} title="Ouvrir la chaîne et ses variantes">
          {ch.name}
        </a>
      </span>
    </td>
    <td>{ch.max_quality && <Badge tone="muted">{ch.max_quality}</Badge>}</td>
    <td class="text-xs text-muted-foreground">{versionsSummary(ch.versions)}</td>
    <td>{ch.has_epg ? <Badge tone="info">EPG</Badge> : <span class="text-muted-foreground">—</span>}</td>
  </tr>
);

/** The groups under their country, in the server's order. */
function sections(groups: ChannelGroupWire[]): [string, ChannelGroupWire[]][] {
  const out = new Map<string, ChannelGroupWire[]>();
  for (const g of groups) out.set(g.section, [...(out.get(g.section) ?? []), g]);
  return [...out];
}

export function AppLiveView({ groups }: { groups: ChannelGroupWire[] }) {
  // Counted once, whatever the groups it is listed in.
  const total = new Set(groups.flatMap((g) => g.channels.map((ch) => ch.id))).size;
  return (
    <>
      <p class="text-sm text-muted-foreground">
        Lecture seule : les {fmt(groups.length)} groupes et {fmt(total)} chaînes que l'app reçoit (contenus visibles, adultes selon le
        réglage). Cliquer une chaîne ouvre sa fiche et ses variantes.
      </p>
      {groups.length === 0 && <Empty title="Aucun groupe" sub="Aucune chaîne visible pour l'app." />}
      {groups.length > 0 && (
        <div class="flex flex-col divide-y overflow-hidden rounded-xl border" id="live-groups">
          {/* `name` makes the groups exclusive: opening one closes the other, as the former accordion did. */}
          {sections(groups).map(([section, gs]) => (
            <>
              <h2 class="bg-muted/60 px-4 py-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{section}</h2>
              {gs.map((g) => (
                <details id={`grp-${g.id}`} name="live-groups">
                  <summary class={SUMMARY}>
                    <span class="truncate font-medium">{g.theme}</span>
                    <Badge tone="plain">{fmt(g.channels.length)}</Badge>
                  </summary>
                  <div class="border-t px-2">
                    <Table>
                      <thead>
                        <tr>
                          <th class="text-end">N°</th>
                          <th></th>
                          <th>Chaîne</th>
                          <th>Qualité</th>
                          <th>Versions</th>
                          <th>EPG</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.channels.map((ch) => (
                          <ChannelRow ch={ch} />
                        ))}
                      </tbody>
                    </Table>
                  </div>
                </details>
              ))}
            </>
          ))}
        </div>
      )}
    </>
  );
}
