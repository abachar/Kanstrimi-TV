import type { Settings } from "@/config";
import type { Kind } from "@/db";
import type { EpgStat, RunWithSteps } from "@/catalog";
import type { ItemCount, CategoryCount, AppCount } from "./data";
import { fmt, ago, megabytes, nextRunText } from "../format";
import { Title, Card, Stat, Badge, Meter, Status } from "../ui";
import { Icon } from "../icons";
import { KIND_ICONS, KIND_TITLES, taskLabel } from "../labels";
import { JobsStatus, type JobsState } from "./jobs";

export type GroupCount = { kind: string; visible: number; multi: number; fallback: number; adult: number; iptv: number; sagas: number };
export type DashboardData = {
  s: Settings;
  items: ItemCount[];
  cats: CategoryCount[];
  groups: GroupCount[];
  /** The last run of each task, for « Traitement ». */
  last: Record<string, RunWithSteps[]>;
  img: { files: number; bytes: number };
  epg: EpgStat;
  app: AppCount;
};

const NO_ITEMS: Omit<ItemCount, "kind"> = { total: 0, hidden: 0, matched: 0, unmatched: 0, pending: 0 };
const NO_GROUPS: Omit<GroupCount, "kind"> = { visible: 0, multi: 0, fallback: 0, adult: 0, iptv: 0, sagas: 0 };

export function DashboardView({ d, jobs }: { d: DashboardData; jobs: JobsState }) {
  const { s } = d;
  const item = (k: Kind) => d.items.find((r) => r.kind === k) ?? NO_ITEMS;
  const cat = (k: Kind) => d.cats.find((r) => r.kind === k) ?? { total: 0, hidden: 0 };
  const group = (k: Kind) => d.groups.find((r) => r.kind === k) ?? NO_GROUPS;
  const configured = Boolean(s.xtream_url && s.xtream_username && s.xtream_password);
  const base = s.public_base_url || "http://<ip-de-cette-machine>:3000";
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
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
            <code class="font-mono">XTREAM_URL</code>, <code class="font-mono">XTREAM_USERNAME</code> et{" "}
            <code class="font-mono">XTREAM_PASSWORD</code> manquent dans l'environnement.
          </section>
        </div>
      )}

      <div class="grid grid-cols-1 gap-6 md:grid-cols-3">
        {(["live", "vod", "series"] as const).map((k) => {
          const i = item(k),
            c = cat(k);
          return (
            <a href={`/admin/catalog?kind=${k}`}>
              <Stat
                label={KIND_TITLES[k]}
                icon={KIND_ICONS[k]}
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
      </div>

      {/* One height per row of cards on lg+, where they sit side by side: `grid` wrappers stretch the card to their cell. */}
      <div class="grid grid-cols-1 gap-6 md:grid-cols-6 lg:auto-rows-fr">
        <div class="grid md:col-span-6 lg:col-span-4">
          <Card
            title="Traitement"
            icon="pipeline"
            extra={
              <a href="/admin/tasks" class="hover:text-foreground">
                tâches
              </a>
            }
          >
            <div class="flex flex-col gap-4">
              {(
                [
                  ["pipeline", s.sync_cron],
                  ["epg", s.epg_cron],
                  ["trending", s.trending_cron],
                ] as const
              ).map(([task, cron]) => {
                const run = d.last[task]?.[0];
                return (
                  <div class="flex flex-col gap-1">
                    <div class="flex items-center justify-between gap-2 text-sm">
                      <span class="font-medium">{taskLabel(task)}</span>
                      {run ? (
                        <a
                          href={`/admin/tasks/${run.id}`}
                          class="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground"
                        >
                          {ago(run.startedAt.toISOString())} <Status status={run.status} />
                        </a>
                      ) : (
                        <span class="text-muted-foreground">jamais</span>
                      )}
                    </div>
                    <span class="text-xs text-muted-foreground">{nextRunText(cron)}</span>
                  </div>
                );
              })}
              <div class="border-t pt-4">
                <JobsStatus {...jobs} />
              </div>
              {d.epg.programmes ? (
                <p class="text-xs text-muted-foreground">
                  Guide : {fmt(d.epg.programmes)} programmes sur {fmt(d.epg.channels)} chaînes jusqu'au{" "}
                  {new Date(d.epg.to!).toLocaleDateString("fr-FR")}
                </p>
              ) : (
                ""
              )}
            </div>
          </Card>
        </div>

        <div class="grid md:col-span-6 lg:col-span-2">
          <Card
            title="Clients"
            icon="clients"
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
                L'app affiche un QR code vers cette adresse ; l'approuver ici l'appaire. L'app lit elle-même l'URL du fournisseur : ce
                serveur ne relaie aucun flux.
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

        <div class="grid md:col-span-3">
          <Card
            title="Enrichissement TMDB"
            icon="database"
            extra={s.tmdb_api_key ? s.tmdb_language : <Badge tone="warn">clé absente</Badge>}
          >
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
                  {fmt(d.img.files)} fichiers, {megabytes(d.img.bytes)}
                </Row>
              </div>
            </div>
          </Card>
        </div>

        <div class="grid md:col-span-3">
          <Card
            title="Groupement des variantes"
            icon="group"
            extra={
              <a href="/admin/catalog?kind=vod" class="hover:text-foreground">
                voir le catalogue
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
                      {k === "live" && (
                        <Badge tone="plain">
                          {fmt(g.iptv)} iptv-org ({pct(g.iptv, g.visible)} %)
                        </Badge>
                      )}
                      {g.adult ? <Badge tone="muted">{fmt(g.adult)} adultes</Badge> : ""}
                      {g.sagas ? <Badge tone="plain">{fmt(g.sagas)} sagas</Badge> : ""}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
