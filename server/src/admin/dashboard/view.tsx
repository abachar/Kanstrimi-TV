import type { Settings } from "@/config";
import type { SyncLog, Kind } from "@/db";
import type { ItemCount, CategoryCount } from "./data";
import { describeCron, nextCronRun } from "../format";
import { fmt, ago } from "../format";
import { Title, Card } from "../ui";
import { KIND_TITLES } from "../labels";
import { LogsTable } from "../logs/view";
import { JobsStatus, type JobsState } from "./jobs";

export type GroupCount = { kind: string; total: number; visible: number; multi: number; fallback: number; adult: number };
export type DashboardData = {
  s: Settings;
  items: ItemCount[];
  cats: CategoryCount[];
  groups: GroupCount[];
  logs: SyncLog[];
  img: { files: number; bytes: number };
  epg: { exists: boolean; bytes: number; mtime: string | null };
};

const NO_ITEMS: Omit<ItemCount, "kind"> = { total: 0, hidden: 0, matched: 0, unmatched: 0, pending: 0 };
const NO_GROUPS: Omit<GroupCount, "kind"> = { total: 0, visible: 0, multi: 0, fallback: 0, adult: 0 };

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
  const Btn = ({ job, label, cls }: { job: string; label: string; cls: string }) => (
    <button formaction={`/admin/jobs/${job}`} class={`btn ${cls}`}>
      {label}
    </button>
  );
  return (
    <>
      <Title t="Tableau de bord" sub="Vue d'ensemble du serveur et du catalogue" />
      {!configured && (
        <div class="alert alert-warning" role="alert">
          Serveur Xtream non configuré —{" "}
          <a href="/admin/settings" class="alert-link">
            ouvrir les paramètres
          </a>
          .
        </div>
      )}

      <Card
        title="Traitement"
        hint="4 étapes indépendantes : lire la source → appliquer les filtres → enrichir (TMDB) → grouper les variantes"
      >
        {/* On a phone the one-shot action comes first, above the fold; on md+ it goes back to the right. */}
        <form method="post" class="d-grid d-md-flex gap-2">
          <Btn job="pipeline" label="Tout enchaîner" cls="btn-success order-first order-md-last ms-md-auto" />
          <Btn job="source" label="1. Lire la source" cls="btn-primary" />
          <Btn job="filters" label="2. Appliquer les filtres" cls="btn-secondary" />
          <Btn job="enrich" label="3. Enrichir TMDB" cls="btn-secondary" />
          <Btn job="group" label="4. Grouper" cls="btn-secondary" />
          <Btn job="epg" label="EPG" cls="btn-outline-secondary" />
        </form>
        <JobsStatus {...jobs} />
        <div class="text-secondary small mt-2">
          Sync {ago(s.last_sync_at)} · {schedule(s.sync_cron)} — EPG{" "}
          {d.epg.exists ? `${(d.epg.bytes / 1e6).toFixed(1)} Mo, ${ago(d.epg.mtime)}` : "non reconstruit"} · {schedule(s.epg_cron)}
        </div>
      </Card>

      <div class="row g-3 mb-3">
        {(["live", "vod", "series"] as const).map((k) => {
          const i = item(k),
            c = cat(k);
          return (
            <div class="col-12 col-md-4">
              <div class="card h-100">
                <div class="card-body">
                  <div class="text-secondary small">{KIND_TITLES[k]}</div>
                  <div class="display-6 fw-bold">{fmt(i.total - i.hidden)}</div>
                  <div class="text-secondary small">
                    {fmt(c.total - c.hidden)} catégories · {fmt(i.hidden)} masqués
                  </div>
                  {k !== "live" && <span class="badge text-bg-success mt-2">TMDB {pct(i.matched, i.total)} %</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div class="row g-3">
        <div class="col-12 col-lg-6">
          <Card title="Enrichissement TMDB" extra={s.tmdb_api_key ? s.tmdb_language : "clé absente"}>
            {(["vod", "series"] as const).map((k) => {
              const i = item(k);
              return (
                <div class="mb-3">
                  <div class="d-flex justify-content-between small">
                    <span id={`prog-${k}`}>{k === "vod" ? "Films associés" : "Séries associées"}</span>
                    <span>
                      {fmt(i.matched)} / {fmt(i.total)}
                    </span>
                  </div>
                  <progress class="w-100" value={i.matched} max={i.total || 1} aria-labelledby={`prog-${k}`}></progress>
                </div>
              );
            })}
            <div class="d-flex justify-content-between small">
              <span>Non trouvés</span>
              <span class="text-warning">{fmt(item("vod").unmatched + item("series").unmatched)}</span>
            </div>
            <div class="d-flex justify-content-between small">
              <span>En attente</span>
              <span>{fmt(item("vod").pending + item("series").pending)}</span>
            </div>
            <hr />
            <div class="text-secondary small">
              Cache images : {fmt(d.img.files)} fichiers, {(d.img.bytes / 1e6).toFixed(0)} Mo
            </div>
          </Card>
          <Card title="Groupement des variantes" extra={<a href="/admin/catalog?view=groups&kind=vod">voir les groupes</a>}>
            {(["vod", "series", "live"] as const).map((k) => {
              const g = group(k),
                i = item(k);
              return (
                <div class="d-flex justify-content-between small mb-1">
                  <span>{k === "live" ? "Chaînes" : KIND_TITLES[k]}</span>
                  <span>
                    {fmt(g.visible)} contenus pour {fmt(i.total - i.hidden)} entrées · {fmt(g.multi)} à plusieurs variantes
                    {k !== "live" ? ` · ${fmt(g.fallback)} sans TMDB` : ""}
                    {g.adult ? ` · ${fmt(g.adult)} adultes` : ""}
                  </span>
                </div>
              );
            })}
          </Card>
        </div>
        <div class="col-12 col-lg-6">
          <Card title="Application Apple TV" extra={<a href="/admin/devices">appareils</a>}>
            <label class="form-label small mb-0" for="cx-url">
              URL du serveur
            </label>
            <input id="cx-url" class="form-control form-control-sm mb-2" readonly value={base} />
            <p class="text-secondary small mb-0">
              L'app affiche un QR code vers cette adresse ; l'approuver ici l'appaire. Les liens de lecture pointent sur ce serveur et
              redirigent vers le fournisseur.
            </p>
          </Card>
        </div>
      </div>

      <Card title="Activité récente" extra={<a href="/admin/logs">tout voir</a>}>
        <LogsTable logs={d.logs} />
      </Card>
    </>
  );
}
