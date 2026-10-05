import { parseSourceGuideId, sourceGuideId } from "@/catalog";
import type { EpgSource } from "@/db";
import { ago, fmt, hhmm } from "../format";
import { Icon } from "../icons";
import { Badge, Card, Empty, Options, Pagination, Table, Title } from "../ui";
import { OURS_PER_PAGE, THEIRS_PER_PAGE, type OurChannel, type SourceChannel, type SourcePageQuery, type SourceRow } from "./sources-data";
import { signed } from "./view";

/** The fallback guides: their card on the EPG page, and the page of one source. */

const OFFSET_CHOICES = Array.from({ length: 49 }, (_, i) => (i - 24) * 30);

/** « jusqu'au lun. 6, 11:27 » : how far ahead a channel's guide goes. */
const until = (d: Date | null) => (d ? `${d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" })}, ${hhmm(d)}` : "—");

/** How the last import of a source went. */
function SourceState({ s }: { s: EpgSource }) {
  if (!s.enabled) return <Badge tone="muted">désactivée</Badge>;
  if (s.fetchError)
    return (
      <Badge tone="bad" title={s.fetchError}>
        échec {s.fetchedAt ? `· dernier succès ${ago(s.fetchedAt.toISOString())}` : ""}
      </Badge>
    );
  if (!s.fetchedAt) return <Badge tone="warn">jamais lue</Badge>;
  return <Badge tone="ok">lue {ago(s.fetchedAt.toISOString())}</Badge>;
}

/** The EPG page: the ordered list of sources, and the form that adds one. */
export function SourcesCard({ sources }: { sources: SourceRow[] }) {
  return (
    <Card
      title="Sources EPG de secours"
      icon="fallback"
      extra={sources.length ? `${sources.length}` : undefined}
      folded
      hint="Fichiers XMLTV qui complètent le guide du fournisseur pour les chaînes visibles qu'il laisse sans programme, lus à chaque import EPG. Pour une chaîne, la première source de la liste qui a son guide l'emporte."
    >
      <div class="flex flex-col gap-4">
        {sources.length ? (
          <ol class="flex flex-col divide-y">
            {sources.map((s, i) => (
              <li class="flex flex-wrap items-center gap-3 py-2">
                <div class="flex min-w-0 flex-1 flex-col">
                  <a class="font-medium hover:underline" href={`/admin/epg/sources/${s.id}`}>
                    {s.name}
                  </a>
                  <span class="truncate font-mono text-xs text-muted-foreground">{s.url}</span>
                </div>
                <SourceState s={s} />
                <span class="text-sm text-muted-foreground tabular-nums">
                  {fmt(s.channelCount ?? 0)} chaînes · {fmt(s.linked)} guide{s.linked > 1 ? "s" : ""} utilisé{s.linked > 1 ? "s" : ""}
                </span>
                <div class="flex shrink-0 gap-1">
                  <form method="post" action={`/admin/epg/sources/${s.id}/up`}>
                    <button class="btn" data-variant="ghost" data-size="icon-sm" title="Monter" aria-label="Monter" disabled={i === 0}>
                      <Icon name="arrow-up" />
                    </button>
                  </form>
                  <form method="post" action={`/admin/epg/sources/${s.id}/down`}>
                    <button
                      class="btn"
                      data-variant="ghost"
                      data-size="icon-sm"
                      title="Descendre"
                      aria-label="Descendre"
                      disabled={i === sources.length - 1}
                    >
                      <Icon name="arrow-down" />
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p class="text-sm text-muted-foreground">Aucune : seul le guide du fournisseur est lu.</p>
        )}
        <form method="post" action="/admin/epg/sources" class="grid grid-cols-1 gap-2 md:grid-cols-12">
          <input class="input md:col-span-3" name="name" placeholder="Nom (facultatif)" aria-label="Nom de la source" />
          <input
            class="input md:col-span-7"
            name="url"
            type="url"
            required
            placeholder="https://www.open-epg.com/files/qatar1.xml"
            aria-label="Adresse du fichier XMLTV"
          />
          <button class="btn md:col-span-2" data-variant="outline">
            <Icon name="plus" />
            Ajouter
          </button>
        </form>
      </div>
    </Card>
  );
}

export type SourcePageProps = {
  source: EpgSource;
  query: SourcePageQuery;
  channels: SourceChannel[];
  ours: OurChannel[];
  oursTotal: number;
  theirs: SourceChannel[];
  theirsTotal: number;
  counts: { missing: number; linked: number; used: number };
  /** Source ids to names: whose guide a channel uses when it is another source's. */
  sourceNames: Map<number, string>;
};

export function SourcePage(p: SourcePageProps) {
  const { source: s, query: q } = p;
  const base = `/admin/epg/sources/${s.id}`;
  const link = (over: Partial<Record<"tab" | "q" | "show" | "page", string>>) => {
    const u = new URLSearchParams({ tab: q.tab, ...(q.q && { q: q.q }), show: q.show, page: String(q.page), ...over });
    return `${base}?${u}`;
  };
  const here = link({});
  const tab = (t: "ours" | "theirs", label: string) => (
    <a class="btn" data-variant={q.tab === t ? "primary" : "outline"} href={`${base}?tab=${t}`}>
      <Icon name={t === "ours" ? "live" : "file"} />
      {label}
    </a>
  );
  return (
    <>
      <Title
        t={s.name}
        sub={`Source EPG de secours · ${fmt(s.channelCount ?? 0)} chaînes dans le fichier · ${fmt(p.counts.used)} guide${p.counts.used > 1 ? "s" : ""} utilisé${p.counts.used > 1 ? "s" : ""} par l'app`}
        actions={
          <>
            <form method="post" action="/admin/jobs/epg">
              <button class="btn" data-variant="outline">
                <Icon name="download" />
                Importer l'EPG maintenant
              </button>
            </form>
          </>
        }
      />
      <Card title="Source" icon="source" extra={<SourceState s={s} />} hint={s.fetchError ?? undefined}>
        <form method="post" action={base} class="grid grid-cols-1 gap-4 md:grid-cols-12">
          <div class="field md:col-span-3">
            <label class="label" for="src-name">
              Nom
            </label>
            <input class="input" id="src-name" name="name" value={s.name} />
          </div>
          <div class="field md:col-span-6">
            <label class="label" for="src-url">
              Adresse du fichier XMLTV
            </label>
            <input class="input font-mono" id="src-url" name="url" type="url" required value={s.url} />
          </div>
          <div class="field md:col-span-3">
            <label class="label" for="src-offset">
              Décalage de toute la source
            </label>
            <select class="select" id="src-offset" name="offset">
              <Options opts={OFFSET_CHOICES.map((m) => [String(m), signed(m)] as const)} cur={String(s.offsetMinutes)} />
            </select>
          </div>
          <div class="field md:col-span-12" data-orientation="horizontal">
            <input class="input" type="checkbox" role="switch" name="enabled" id="src-enabled" checked={s.enabled} />
            <label class="label" for="src-enabled">
              Lire cette source à chaque import EPG
            </label>
          </div>
          <div class="flex flex-wrap gap-2 md:col-span-12">
            <button class="btn" data-variant="primary">
              <Icon name="save" />
              Enregistrer
            </button>
          </div>
        </form>
        <form
          method="post"
          action={`${base}/delete`}
          hx-post={`${base}/delete`}
          hx-confirm={`Supprimer la source ${s.name}, ses liens et ses programmes ?`}
          class="mt-4"
        >
          <button class="btn" data-variant="destructive" data-size="sm">
            <Icon name="trash" />
            Supprimer la source
          </button>
        </form>
      </Card>
      <div class="flex flex-wrap gap-2">
        {tab("ours", `Nos chaînes (${fmt(p.counts.missing)} sans guide du fournisseur)`)}
        {tab("theirs", `Chaînes du fichier (${fmt(p.channels.length)})`)}
      </div>
      <form method="get" action={base} class="grid grid-cols-2 gap-2 md:grid-cols-12" role="search">
        <input type="hidden" name="tab" value={q.tab} />
        <input
          class="input col-span-2 md:col-span-7"
          type="search"
          name="q"
          value={q.q}
          placeholder="Chercher une chaîne…"
          aria-label="Chaîne"
        />
        <select class="select w-full md:col-span-4" name="show" aria-label="Lesquelles">
          <Options
            opts={
              q.tab === "ours"
                ? [
                    ["missing", "Sans guide du fournisseur"],
                    ["linked", "Reliées à cette source"],
                    ["all", "Toutes les chaînes visibles"],
                  ]
                : [
                    ["all", "Toutes"],
                    ["linked", "Reliées à une de nos chaînes"],
                    ["free", "Libres"],
                  ]
            }
            cur={q.show}
          />
        </select>
        <button class="btn md:col-span-1" data-variant="outline">
          <Icon name="rules" />
          Filtrer
        </button>
      </form>
      {q.tab === "ours" ? (
        <OursCard {...p} here={here} link={link} />
      ) : (
        <Card title="Chaînes du fichier" icon="file" extra={`${fmt(p.theirsTotal)} chaînes`}>
          {p.theirs.length ? (
            <Table>
              <thead>
                <tr>
                  <th>Identifiant</th>
                  <th>Noms</th>
                  <th class="text-right">Programmes</th>
                  <th>Jusqu'au</th>
                  <th>Reliée à</th>
                </tr>
              </thead>
              <tbody>
                {p.theirs.map((ch) => (
                  <tr>
                    <td class="font-mono text-xs">{ch.channelId}</td>
                    <td class="text-sm">{ch.names.join(" · ")}</td>
                    <td class="text-right tabular-nums">{fmt(ch.programmes)}</td>
                    <td class="text-sm whitespace-nowrap">{until(ch.lastEndAt)}</td>
                    <td class="text-sm">
                      <div class="flex flex-wrap gap-1">
                        {ch.linkedTo.map((c) => (
                          <a href={`/admin/content/${c.id}`} class="hover:underline">
                            <Badge tone={c.manual ? "info" : "plain"} title={c.manual ? "choisi à la main" : "trouvé par le nom"}>
                              {c.title}
                            </Badge>
                          </a>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <Empty
              title="Aucune chaîne"
              sub={s.fetchedAt ? "Aucune chaîne du fichier pour ces filtres." : "La source n'a pas encore été lue : lancer un import EPG."}
            />
          )}
          <div class="mt-4">
            <Pagination page={q.page} total={p.theirsTotal} size={THEIRS_PER_PAGE} link={(n) => link({ page: String(n) })} />
          </div>
        </Card>
      )}
    </>
  );
}

/** Our channels and their link to the source, each editable: a channel of the file, back to the name, or none. */
function OursCard(p: SourcePageProps & { here: string; link: (o: { page: string }) => string }) {
  const { source: s } = p;
  const byId = new Map(p.channels.map((ch) => [ch.channelId, ch]));
  const usedHere = (c: OurChannel) => c.link && c.fallbackId === sourceGuideId(s.id, c.link.channelId);
  /** Why a linked channel's guide is not this source's, or that it is. */
  const state = (c: OurChannel) => {
    if (!c.link) return null;
    const ch = byId.get(c.link.channelId);
    if (usedHere(c)) return <Badge tone="ok">utilisé</Badge>;
    if (!ch?.programmes) return <Badge tone="warn">sans programme</Badge>;
    if (!s.enabled) return <Badge tone="muted">source désactivée</Badge>;
    if (c.fallbackId) {
      const other = parseSourceGuideId(c.fallbackId)?.sourceId;
      return <Badge tone="muted">{(other && p.sourceNames.get(other)) ?? "une autre source"} passe avant</Badge>;
    }
    return c.guided ? <Badge tone="muted">le fournisseur passe avant</Badge> : <Badge tone="muted">au prochain import</Badge>;
  };
  return (
    <Card
      title="Nos chaînes"
      icon="live"
      extra={`${fmt(p.oursTotal)} chaînes`}
      hint="Le lien par le nom ne complète que les chaînes sans guide du fournisseur ; un choix à la main vaut toujours. Les programmes d'une chaîne nouvellement reliée arrivent au prochain import EPG."
    >
      <datalist id="source-channels">
        {p.channels.map((ch) => (
          <option value={ch.channelId}>{`${ch.names[0] ?? ch.channelId} · ${fmt(ch.programmes)} programmes`}</option>
        ))}
      </datalist>
      {p.ours.length ? (
        <ul class="flex flex-col divide-y">
          {p.ours.map((c) => (
            <li class="flex flex-wrap items-center gap-3 py-2">
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
              <div class="flex min-w-48 flex-1 flex-col">
                <a class="truncate text-sm font-medium hover:underline" href={`/admin/content/${c.id}`}>
                  {c.title}
                </a>
                <span class="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                  {[c.market?.toUpperCase(), c.country].filter(Boolean).join(" · ")}
                  {c.guided ? <Badge tone="muted">guide du fournisseur</Badge> : <Badge tone="warn">sans guide du fournisseur</Badge>}
                  {c.refused ? (
                    <Badge tone="muted">aucune chaîne de cette source (choix)</Badge>
                  ) : (
                    c.link && (
                      <>
                        <Badge tone={c.link.manual ? "info" : "plain"}>{c.link.manual ? "manuel" : "auto"}</Badge>
                        <span class="font-mono">{c.link.channelId}</span>
                        {state(c)}
                      </>
                    )
                  )}
                </span>
              </div>
              <form method="post" action={`/admin/epg/sources/${s.id}/link`} class="flex flex-wrap items-center gap-1">
                <input type="hidden" name="content_key" value={c.key} />
                <input type="hidden" name="back" value={p.here} />
                <input
                  class="input w-64"
                  list="source-channels"
                  name="channel"
                  value={c.link?.manual ? c.link.channelId : ""}
                  placeholder={c.link && !c.link.manual ? c.link.channelId : "Chaîne du fichier…"}
                  aria-label={`Chaîne de la source pour ${c.title}`}
                />
                <button class="btn" data-variant="outline" data-size="sm" name="action" value="link">
                  <Icon name="link" />
                  Relier
                </button>
                {(c.link?.manual || c.refused) && (
                  <button class="btn" data-variant="ghost" data-size="sm" name="action" value="auto" title="Revenir au lien par le nom">
                    <Icon name="auto" />
                    Auto
                  </button>
                )}
                {!c.refused && (
                  <button
                    class="btn"
                    data-variant="ghost"
                    data-size="sm"
                    name="action"
                    value="none"
                    title="Ne jamais prendre cette source pour cette chaîne"
                  >
                    <Icon name="none" />
                    Aucune
                  </button>
                )}
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <Empty title="Aucune chaîne" sub="Aucune chaîne visible pour ces filtres." />
      )}
      <div class="mt-4">
        <Pagination page={p.query.page} total={p.oursTotal} size={OURS_PER_PAGE} link={(n) => p.link({ page: String(n) })} />
      </div>
    </Card>
  );
}
