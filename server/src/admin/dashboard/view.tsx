import type { Settings } from "@/config";
import type { EpgStat } from "@/providers/xtream";
import type { SyncLog, Kind } from "@/db";
import type { ItemCount, CategoryCount, AppCount } from "./data";
import { describeCron, nextCronRun } from "../format";
import { fmt, ago } from "../format";
import { Title, Card, Stat, Badge, Meter } from "../ui";
import { Icon } from "../icons";
import { KIND_TITLES } from "../labels";
import { LogsTable } from "../logs/view";
import { JobsStatus, type JobsState } from "./jobs";

export type GroupCount = { kind: string; visible: number; multi: number; fallback: number; adult: number; sagas: number };
export type DashboardData = {
  s: Settings;
  items: ItemCount[];
  cats: CategoryCount[];
  groups: GroupCount[];
  logs: SyncLog[];
  img: { files: number; bytes: number };
  epg: EpgStat;
  app: AppCount;
};

const NO_ITEMS: Omit<ItemCount, "kind"> = { total: 0, hidden: 0, matched: 0, unmatched: 0, pending: 0 };
const NO_GROUPS: Omit<GroupCount, "kind"> = { visible: 0, multi: 0, fallback: 0, adult: 0, sagas: 0 };

export function DashboardView({ d, jobs }: { d: DashboardData; jobs: JobsState }) {
  const { s } = d;
  const item = (k: Kind) => d.items.find((r) => r.kind === k) ?? NO_ITEMS;
  const cat = (k: Kind) => d.cats.find((r) => r.kind === k) ?? { total: 0, hidden: 0 };
  const group = (k: Kind) => d.groups.find((r) => r.kind === k) ?? NO_GROUPS;
  const configured = Boolean(s.xtream_url && s.xtream_username && s.xtream_password);
  const base = s.public_base_url || "http://<ip-de-cette-machine>:3000";
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
  const schedule = (expr: string) => {
    const next = nextCronRun(expr);
    return `${describeCron(expr)}${next ? `, prochain passage ${next.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}` : ""}`;
  };
  const Btn = ({ job, label, variant, cls = "" }: { job: string; label: string; variant: string; cls?: string }) => (
    <button formaction={`/admin/jobs/${job}`} class={`btn ${cls}`} data-variant={variant}>
      {label}
    </button>
  );
  const Row = ({ label, children }: { label: string; children?: unknown }) => (
    <div class="flex items-baseline justify-between gap-4 text-sm">
      <span class="text-muted-foreground">{label}</span>
      <span class="text-end tabular-nums">{children}</span>
    </div>
  );
  return (
    <>
      <Title t="Tableau de bord" sub="Vue d'ensemble du serveur et du catalogue" />
      {!configured && (
        <div class="alert" role="alert">
          <Icon name="alert" />
          <h2>Serveur Xtream non configuré</h2>
          <section>
            <a href="/admin/settings" class="underline underline-offset-4">
              Ouvrir les paramètres
            </a>
          </section>
        </div>
      )}

      <div class="grid grid-cols-1 gap-4 md:grid-cols-6">
        {(["live", "vod", "series"] as const).map((k) => {
          const i = item(k),
            c = cat(k);
          return (
            <a href={`/admin/catalog?kind=${k}`} class="md:col-span-2">
              <Stat
                label={KIND_TITLES[k]}
                value={fmt(i.total - i.hidden)}
                sub={`${fmt(c.total - c.hidden)} catégories · ${fmt(i.hidden)} masqués`}
              >
                {k !== "live" && (
                  <div class="mt-2 flex items-center gap-2">
                    <Meter value={i.matched} max={i.total - i.hidden} />
                    <Badge tone="ok">TMDB {pct(i.matched, i.total - i.hidden)} %</Badge>
                  </div>
                )}
              </Stat>
            </a>
          );
        })}

        <div class="md:col-span-6 lg:col-span-4">
          <Card
            title="Traitement"
            hint="Étapes indépendantes : lire la source → enrichir (TMDB) → appliquer les filtres → grouper les variantes"
          >
            <div class="flex flex-col gap-4">
              {/* On a phone the one-shot action comes first, above the fold; on md+ it goes back to the right. */}
              <form method="post" class="grid gap-2 md:flex md:flex-wrap">
                <Btn job="pipeline" label="Tout enchaîner" variant="primary" cls="md:order-last md:ms-auto" />
                <Btn job="source" label="1. Lire la source" variant="outline" />
                <Btn job="enrich" label="2. TMDB" variant="outline" />
                <Btn job="filters" label="3. Filtres" variant="outline" />
                <Btn job="group" label="4. Grouper" variant="outline" />
                <Btn job="trending" label="5. Tendances" variant="outline" />
                <Btn job="epg" label="EPG" variant="outline" />
              </form>
              <JobsStatus {...jobs} />
              <div class="flex flex-col gap-1 border-t pt-4 text-xs text-muted-foreground">
                <span>
                  Sync {ago(s.last_sync_at)} · {schedule(s.sync_cron)}
                </span>
                <span>
                  EPG{" "}
                  {d.epg.programmes
                    ? `${fmt(d.epg.programmes)} programmes sur ${fmt(d.epg.channels)} chaînes jusqu'au ${new Date(d.epg.to!).toLocaleDateString("fr-FR")}, importé ${ago(d.epg.importedAt)}`
                    : "jamais importé"}{" "}
                  · {schedule(s.epg_cron)}
                </span>
              </div>
            </div>
          </Card>
        </div>

        <div class="md:col-span-6 lg:col-span-2">
          <Card
            title="Application Apple"
            extra={
              <a href="/admin/devices" class="hover:text-foreground">
                appareils
              </a>
            }
          >
            <div class="flex flex-col gap-3">
              <div class="field">
                <label class="label" for="cx-url">
                  URL du serveur
                </label>
                <input id="cx-url" class="input font-mono" readonly value={base} />
              </div>
              <p class="text-xs text-muted-foreground">
                L'app affiche un QR code vers cette adresse ; l'approuver ici l'appaire. Les liens de lecture pointent sur ce serveur et
                redirigent vers le fournisseur.
              </p>
              <div class="grid grid-cols-3 gap-2 text-center">
                {(
                  [
                    ["/admin/favorites", d.app.favorites, "favoris"],
                    ["/admin/history", d.app.ongoing, "en cours"],
                    ["/admin/history", d.app.finished, "vus"],
                  ] as const
                ).map(([href, n, label]) => (
                  <a href={href} class="rounded-lg border p-2 hover:bg-muted">
                    <div class="text-lg font-semibold tabular-nums">{fmt(n)}</div>
                    <div class="text-xs text-muted-foreground">{label}</div>
                  </a>
                ))}
              </div>
            </div>
          </Card>
        </div>

        <div class="md:col-span-3">
          <Card title="Enrichissement TMDB" extra={s.tmdb_api_key ? s.tmdb_language : <Badge tone="warn">clé absente</Badge>}>
            <div class="flex flex-col gap-4">
              {(["vod", "series"] as const).map((k) => {
                const i = item(k);
                return (
                  <div class="flex flex-col gap-2">
                    <Row label={k === "vod" ? "Films associés" : "Séries associées"}>
                      {fmt(i.matched)} / {fmt(i.total - i.hidden)}
                    </Row>
                    <Meter value={i.matched} max={i.total - i.hidden} label={k === "vod" ? "Films associés" : "Séries associées"} />
                  </div>
                );
              })}
              <div class="flex flex-col gap-1 border-t pt-4">
                <Row label="Non trouvés">
                  <span class="text-amber-400">{fmt(item("vod").unmatched + item("series").unmatched)}</span>
                </Row>
                <Row label="En attente">{fmt(item("vod").pending + item("series").pending)}</Row>
                <Row label="Cache images">
                  {fmt(d.img.files)} fichiers, {(d.img.bytes / 1e6).toFixed(0)} Mo
                </Row>
              </div>
            </div>
          </Card>
        </div>

        <div class="md:col-span-3">
          <Card
            title="Groupement des variantes"
            extra={
              <a href="/admin/catalog?view=groups&kind=vod" class="hover:text-foreground">
                voir les groupes
              </a>
            }
          >
            <div class="flex flex-col divide-y">
              {(["vod", "series", "live"] as const).map((k) => {
                const g = group(k),
                  i = item(k);
                return (
                  <div class="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                    <Row label={k === "live" ? "Chaînes" : KIND_TITLES[k]}>
                      <span class="font-medium">{fmt(g.visible)}</span> contenus pour {fmt(i.total - i.hidden)} entrées
                    </Row>
                    <div class="flex flex-wrap gap-1">
                      <Badge tone="plain">{fmt(g.multi)} à plusieurs variantes</Badge>
                      {k !== "live" && <Badge tone={g.fallback ? "warn" : "muted"}>{fmt(g.fallback)} sans TMDB</Badge>}
                      {g.adult ? <Badge tone="muted">{fmt(g.adult)} adultes</Badge> : ""}
                      {g.sagas ? <Badge tone="plain">{fmt(g.sagas)} sagas</Badge> : ""}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        <div class="md:col-span-6">
          <Card
            title="Activité récente"
            extra={
              <a href="/admin/logs" class="hover:text-foreground">
                tout voir
              </a>
            }
          >
            <LogsTable logs={d.logs} />
          </Card>
        </div>
      </div>
    </>
  );
}
