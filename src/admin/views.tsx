import { fmt, ago, Status } from "./layout";
import type { Settings } from "@/lib/settings";
import type { FilterRule, SyncLog, Item, Category } from "@/db/schema";
import { describeCron } from "@/lib/jobs/cron";

const Title = ({ t, sub }: { t: string; sub: string }) => <div class="mb-4"><h1 class="h2 mb-1">{t}</h1><p class="text-secondary mb-0">{sub}</p></div>;
const Card = ({ title, extra, children }: { title: string; extra?: unknown; children?: unknown }) => (
  <div class="card mb-3"><div class="card-header fw-semibold">{title} {extra && <small class="text-secondary fw-normal">{extra}</small>}</div><div class="card-body">{children}</div></div>
);

// ---------------------------------------------------------------- login
export function LoginView({ locked, error }: { locked: boolean; error?: string }) {
  return (
    <div class="col-12 col-sm-8 col-md-5 col-lg-4 mx-auto mt-5"><div class="card">
      <div class="card-body">
        <h2 class="h4 mb-3">Connexion</h2>
        {locked && <p class="text-secondary small">Serveur verrouillé depuis le redémarrage : le mot de passe déchiffre les identifiants et relance la planification.</p>}
        {error && <div class="alert alert-danger">{error}</div>}
        <form method="post" action="/admin/login" class="vstack gap-2">
          <input class="form-control" type="password" name="password" placeholder="Mot de passe" required autofocus />
          <button class="btn btn-primary">Se connecter</button>
        </form>
      </div>
    </div></div>
  );
}

// ---------------------------------------------------------------- dashboard
type Count = { kind: string; total: number; hidden: number; matched: number; unmatched: number; pending: number };
type CatCount = { kind: string; total: number; hidden: number };
export type DashboardData = {
  s: Settings; items: Count[]; cats: CatCount[]; logs: SyncLog[];
  img: { files: number; bytes: number }; epg: { exists: boolean; bytes: number; mtime: string | null };
};

export function JobsStatus({ running, lastError }: { running: { job: string; since: Date }[]; lastError: { job: string; message: string; at: Date } | null }) {
  const labels: Record<string, string> = { source: "Lecture source", filters: "Filtres", enrich: "Enrichissement TMDB", epg: "EPG" };
  return (
    <div id="jobs-status" class="mt-3" hx-get="/admin/jobs/status" hx-trigger={running.length ? "every 3s" : "every 30s"} hx-swap="outerHTML">
      {running.length
        ? running.map((r) => <p class="mb-1"><span class="spinner-border spinner-border-sm me-2"></span>{labels[r.job] ?? r.job} en cours… <small class="text-secondary">(depuis {ago(r.since.toISOString())})</small></p>)
        : <p class="text-secondary mb-1">Aucun job en cours.</p>}
      {lastError && <p class="text-danger small mb-0">Dernière erreur ({labels[lastError.job]} · {ago(lastError.at.toISOString())}) : {lastError.message}</p>}
    </div>
  );
}

export function DashboardView({ d, jobs }: { d: DashboardData; jobs: Parameters<typeof JobsStatus>[0] }) {
  const { s } = d;
  const item = (k: string) => d.items.find((r) => r.kind === k) ?? { total: 0, hidden: 0, matched: 0, unmatched: 0, pending: 0 };
  const cat = (k: string) => d.cats.find((r) => r.kind === k) ?? { total: 0, hidden: 0 };
  const configured = Boolean(s.xtream_url && s.xtream_username && s.xtream_password);
  const base = s.public_base_url || "http://<ip-de-cette-machine>:3000";
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
  const Btn = ({ job, label, cls }: { job: string; label: string; cls: string }) => <button formaction={`/admin/jobs/${job}`} class={`btn ${cls}`}>{label}</button>;
  return (
    <>
      <Title t="Tableau de bord" sub="Vue d'ensemble du serveur et du catalogue" />
      {!configured && <div class="alert alert-warning">Serveur Xtream non configuré — <a href="/admin/settings" class="alert-link">ouvrir les paramètres</a>.</div>}

      <Card title="Traitement" extra="— 3 étapes indépendantes : lire la source → appliquer les filtres → enrichir (TMDB)">
        <form method="post" class="d-grid d-md-flex gap-2">
          <Btn job="source" label="1. Lire la source" cls="btn-primary" />
          <Btn job="filters" label="2. Appliquer les filtres" cls="btn-secondary" />
          <Btn job="enrich" label="3. Enrichir TMDB" cls="btn-secondary" />
          <Btn job="epg" label="EPG" cls="btn-outline-secondary" />
          <Btn job="pipeline" label="Tout enchaîner" cls="btn-success ms-md-auto" />
        </form>
        <JobsStatus {...jobs} />
        <div class="text-secondary small mt-2">Sync {ago(s.last_sync_at)} · {describeCron(s.sync_cron)} — EPG {d.epg.exists ? `${(d.epg.bytes / 1e6).toFixed(1)} Mo, ${ago(d.epg.mtime)}` : "non reconstruit"} · {describeCron(s.epg_cron)}</div>
      </Card>

      <div class="row g-3 mb-3">
        {(["live", "vod", "series"] as const).map((k) => {
          const i = item(k), c = cat(k);
          return (
            <div class="col-12 col-md-4"><div class="card h-100"><div class="card-body">
              <div class="text-secondary small">{k === "live" ? "Live TV" : k === "vod" ? "Films" : "Séries"}</div>
              <div class="display-6 fw-bold">{fmt(i.total - i.hidden)}</div>
              <div class="text-secondary small">{fmt(c.total - c.hidden)} catégories · {fmt(i.hidden)} masqués</div>
              {k !== "live" && <span class="badge text-bg-success mt-2">TMDB {pct(i.matched, i.total)} %</span>}
            </div></div></div>
          );
        })}
      </div>

      <div class="row g-3">
        <div class="col-12 col-lg-6">
          <Card title="Enrichissement TMDB" extra={s.tmdb_api_key ? s.tmdb_language : "clé absente"}>
            {(["vod", "series"] as const).map((k) => { const i = item(k); return (
              <div class="mb-3">
                <div class="d-flex justify-content-between small"><span>{k === "vod" ? "Films associés" : "Séries associées"}</span><span>{fmt(i.matched)} / {fmt(i.total)}</span></div>
                <progress class="w-100" value={i.matched} max={i.total || 1}></progress>
              </div>
            ); })}
            <div class="d-flex justify-content-between small"><span>Non trouvés</span><span class="text-warning">{fmt(item("vod").unmatched + item("series").unmatched)}</span></div>
            <div class="d-flex justify-content-between small"><span>En attente</span><span>{fmt(item("vod").pending + item("series").pending)}</span></div>
            <hr />
            <div class="text-secondary small">Cache images : {fmt(d.img.files)} fichiers, {(d.img.bytes / 1e6).toFixed(0)} Mo</div>
          </Card>
        </div>
        <div class="col-12 col-lg-6">
          <Card title="Connexion des applications">
            <label class="form-label small mb-0">URL du serveur</label><input class="form-control form-control-sm mb-2" readonly value={base} />
            <div class="row g-2 mb-2">
              <div class="col"><label class="form-label small mb-0">Utilisateur</label><input class="form-control form-control-sm" readonly value={s.proxy_username} /></div>
              <div class="col"><label class="form-label small mb-0">Mot de passe</label><input class="form-control form-control-sm" readonly value="(mot de passe admin)" /></div>
            </div>
            <label class="form-label small mb-0">Playlist M3U</label><input class="form-control form-control-sm" readonly value={`${base}/get.php?username=${s.proxy_username}&password=<mot de passe admin>&type=m3u_plus&output=ts`} />
          </Card>
        </div>
      </div>

      <Card title="Activité récente" extra={<a href="/admin/logs">tout voir</a>}><LogsTable logs={d.logs} /></Card>
    </>
  );
}

// ---------------------------------------------------------------- logs
const STAT_LABELS: Record<string, string> = {
  live_items: "chaînes", vod_items: "films", series_items: "séries",
  live_categories: "cat. live", vod_categories: "cat. films", series_categories: "cat. séries",
  removed_items: "supprimés", removed_categories: "cat. supprimées",
  processed: "traités", matched: "associés", unmatched: "non trouvés", errors: "erreurs",
  items: "éléments", categories: "catégories", bytes: "octets",
};
/** Stats as readable chips; zeros and unknown keys stay, but the raw JSON never shows. */
function StatChips({ stats }: { stats: Record<string, unknown> | null }) {
  const entries = Object.entries(stats ?? {}).filter(([, v]) => typeof v === "number" || typeof v === "string");
  if (!entries.length) return <></>;
  return (
    <span class="d-inline-flex flex-wrap gap-1">
      {entries.map(([k, v]) => {
        const num = typeof v === "number";
        const value = k === "bytes" && num ? `${((v as number) / 1e6).toFixed(1)} Mo` : num ? fmt(v as number) : String(v);
        const zero = num && v === 0;
        const alert = num && (v as number) > 0 && (k === "errors" || k.startsWith("removed"));
        return (
          <span class={`badge text-bg-${alert ? "warning" : zero ? "secondary" : "light"} fw-normal`}>
            {value} <span class="opacity-75">{STAT_LABELS[k] ?? k.replace(/_/g, " ")}</span>
          </span>
        );
      })}
    </span>
  );
}

const JOB_LABELS: Record<string, string> = { source: "Lecture source", filters: "Filtres", enrich: "TMDB", epg: "EPG" };

export function LogsTable({ logs }: { logs: SyncLog[] }) {
  if (!logs.length) return <p class="text-secondary mb-0">Aucun job pour l'instant.</p>;
  const label = (l: SyncLog) => JOB_LABELS[l.job] ?? l.job;
  const when = (l: SyncLog) => l.startedAt.toLocaleString("fr-FR");
  const took = (l: SyncLog) => (l.finishedAt ? duration(l.startedAt, l.finishedAt) : "…");
  return (
    <>
      {/* Table on md+, stacked cards on phones: a 5-column table would scroll the details off-screen. */}
      <div class="table-responsive d-none d-md-block"><table class="table table-sm align-middle mb-0">
        <thead><tr><th>Job</th><th>Statut</th><th class="text-nowrap">Début</th><th>Durée</th><th class="w-50">Détails</th></tr></thead>
        <tbody>{logs.map((l) => (
          <tr>
            <td class="text-nowrap">{label(l)}</td>
            <td><Status status={l.status} /></td>
            <td class="text-nowrap small">{when(l)}</td>
            <td class="text-nowrap">{took(l)}</td>
            <td>
              {l.message && <div class="text-danger small text-break">{l.message}</div>}
              <StatChips stats={l.stats} />
            </td>
          </tr>
        ))}</tbody>
      </table></div>

      <div class="list-group d-md-none">{logs.map((l) => (
        <div class="list-group-item">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <span class="fw-semibold">{label(l)}</span>
            <Status status={l.status} />
          </div>
          <div class="text-secondary small mb-2">{when(l)} · {took(l)}</div>
          {l.message && <div class="text-danger small text-break mb-2">{l.message}</div>}
          <StatChips stats={l.stats} />
        </div>
      ))}</div>
    </>
  );
}

function duration(a: Date, b: Date) {
  const s = Math.round((b.getTime() - a.getTime()) / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m} min ${s % 60} s` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

export function LogsView({ logs }: { logs: SyncLog[] }) {
  return <><Title t="Journaux" sub="Historique des traitements" /><LogsTable logs={logs} /></>;
}

// ---------------------------------------------------------------- settings
export function SettingsView({ s }: { s: Settings }) {
  const F = ({ name, label, type = "text", hint, col = "col-12 col-md-4" }: { name: keyof Settings; label: string; type?: string; hint?: string; col?: string }) => (
    <div class={col}><label class="form-label">{label}</label><input class="form-control" name={name} type={type} value={s[name]} />{hint && <div class="form-text">{hint}</div>}</div>
  );
  return (
    <>
      <Title t="Paramètres" sub="Source Xtream, compte client, TMDB, planification, sécurité" />
      <form method="post" action="/admin/settings">
        <Card title="Serveur Xtream (source)">
          <div class="row g-3">
            <F name="xtream_url" label="URL" hint="http://host:port" />
            <F name="xtream_username" label="Utilisateur" />
            <F name="xtream_password" label="Mot de passe" type="password" />
          </div>
          <div class="mt-3 d-flex flex-wrap align-items-center gap-2">
            <button type="button" class="btn btn-outline-secondary btn-sm" hx-post="/admin/settings/test-xtream" hx-include="closest form" hx-target="#xt-result">Tester la connexion</button>
            <span id="xt-result"></span>
          </div>
        </Card>
        <Card title="Compte client (apps)" extra="— les apps IPTV se connectent avec cet utilisateur et le mot de passe admin ; les flux passent par ce serveur (302), les identifiants Xtream ne sont jamais transmis">
          <div class="row g-3">
            <F name="proxy_username" label="Utilisateur" col="col-12 col-md-6" />
            <F name="public_base_url" label="URL publique de ce serveur" hint="Optionnel, ex : http://192.168.1.10:3000" col="col-12 col-md-6" />
          </div>
        </Card>
        <Card title="Planification (cron 5 champs)" extra="min heure jour mois jour-semaine">
          <div class="row g-3">
            <F name="sync_cron" label="Traitement complet (source → filtres → TMDB)" hint={describeCron(s.sync_cron)} col="col-12 col-md-6" />
            <F name="epg_cron" label="Reconstruction EPG" hint={describeCron(s.epg_cron)} col="col-12 col-md-6" />
          </div>
        </Card>
        <Card title="TMDB">
          <div class="row g-3">
            <F name="tmdb_api_key" label="Clé API (v3) ou token v4" type="password" col="col-12 col-md-8" />
            <F name="tmdb_language" label="Langue" hint="fr-FR, en-US…" />
          </div>
          <div class="mt-3 d-flex flex-wrap align-items-center gap-2">
            <button type="button" class="btn btn-outline-secondary btn-sm" hx-post="/admin/settings/test-tmdb" hx-include="closest form" hx-target="#tm-result">Tester TMDB</button>
            <span id="tm-result"></span>
          </div>
        </Card>
        <button class="btn btn-primary mb-4">Enregistrer</button>
      </form>

      <div class="row g-3">
        <div class="col-12 col-md-6">
          <Card title="Mot de passe">
            <p class="text-secondary small mb-0">Défini par <code>ADMIN_PASSWORD_HASH</code> dans <code>.env</code> (<code>npm run hash-password -- &lt;mot-de-passe&gt;</code>). Il chiffre les identifiants Xtream et la clé TMDB en base : en cas de changement, ressaisissez-les ici.</p>
          </Card>
        </div>
        <div class="col-12 col-md-6">
          <form method="post" action="/admin/settings/reset-matches" onsubmit="return confirm('Réinitialiser tous les matchings automatiques ?')">
            <Card title="Réinitialiser le matching TMDB">
              <p class="text-secondary small">Remet tous les éléments (sauf associations manuelles) en attente. Relancer ensuite l'étape 3.</p>
              <button class="btn btn-outline-danger">Réinitialiser</button>
            </Card>
          </form>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- rules
export function RuleForm({ rule, preview }: { rule?: FilterRule; preview?: { matches: string[]; total: number } }) {
  const Sel = ({ name, label, opts, cur, col }: { name: string; label: string; opts: [string, string][]; cur: string; col: string }) => (
    <div class={col}><label class="form-label">{label}</label><select class="form-select" name={name}>{opts.map(([v, l]) => <option value={v} selected={v === cur}>{l}</option>)}</select></div>
  );
  const pid = `preview-${rule?.id ?? "new"}`;
  return (
    <form method="post" action="/admin/rules">
      {rule && <input type="hidden" name="id" value={rule.id} />}
      <div class="row g-2">
        <div class="col-12 col-md-4"><label class="form-label">Nom</label><input class="form-control" name="name" value={rule?.name ?? ""} required /></div>
        <Sel name="kind" label="Type" opts={[["all", "Tous"], ["live", "Live"], ["vod", "Films"], ["series", "Séries"]]} cur={rule?.kind ?? "all"} col="col-6 col-md-2" />
        <Sel name="target" label="Cible" opts={[["name", "Nom"], ["category", "Catégorie"]]} cur={rule?.target ?? "name"} col="col-6 col-md-2" />
        <Sel name="action" label="Action" opts={[["hide", "hide — masquer"], ["keep", "keep — liste blanche"]]} cur={rule?.action ?? "hide"} col="col-6 col-md-2" />
        <div class="col-6 col-md-2"><label class="form-label">Position</label><input class="form-control" name="position" type="number" value={rule?.position ?? 0} /></div>
        <div class="col-12 col-md-8"><label class="form-label">Regex</label><input class="form-control font-monospace" name="pattern" value={rule?.pattern ?? ""} placeholder="XXX|ADULT|^(?!.*\bFR\b)" required /></div>
        <div class="col-6 col-md-2"><label class="form-label">Flags</label><input class="form-control font-monospace" name="flags" value={rule?.flags ?? "i"} /></div>
        <div class="col-6 col-md-2 d-flex align-items-end"><div class="form-check"><input class="form-check-input" type="checkbox" name="enabled" id={`en-${rule?.id ?? "new"}`} checked={rule?.enabled ?? true} /><label class="form-check-label" for={`en-${rule?.id ?? "new"}`}>Activée</label></div></div>
      </div>
      <div class="d-flex gap-2 mt-3">
        <button class="btn btn-primary">{rule ? "Mettre à jour" : "Ajouter"}</button>
        <button type="button" class="btn btn-outline-secondary" hx-post="/admin/rules/preview" hx-include="closest form" hx-target={`#${pid}`}>Prévisualiser</button>
      </div>
      <div id={pid}><RulePreview preview={preview} /></div>
    </form>
  );
}
export function RulePreview({ preview }: { preview?: { matches: string[]; total: number } }) {
  if (!preview) return <></>;
  return (
    <div class="mt-3">
      <div class="small fw-semibold">{preview.total} correspondance(s){preview.total > 50 ? " (50 premières)" : ""}</div>
      <pre class="bg-body-tertiary p-2 rounded small overflow-auto">{preview.matches.join("\n")}</pre>
    </div>
  );
}
export function RulesView({ rules }: { rules: FilterRule[] }) {
  return (
    <>
      <Title t="Règles de filtrage" sub="Regex JavaScript sur le nom ou la catégorie. « hide » masque ce qui matche ; « keep » = liste blanche par type. Réappliquées à chaque lecture de la source." />
      <Card title="Nouvelle règle"><RuleForm /></Card>
      <Card title={`Règles (${rules.length})`}>
        <div class="table-responsive"><table class="table table-sm align-middle mb-0">
          <thead><tr><th>#</th><th>Nom</th><th>Type</th><th>Cible</th><th>Regex</th><th>Action</th><th>Actif</th><th></th></tr></thead>
          <tbody>{rules.map((r) => (
            <>
              <tr class={r.enabled ? "" : "text-secondary"}>
                <td>{r.position}</td><td>{r.name}</td><td>{r.kind ?? "tous"}</td><td>{r.target}</td>
                <td><code>/{r.pattern}/{r.flags}</code></td>
                <td><span class={`badge text-bg-${r.action === "hide" ? "danger" : "success"}`}>{r.action}</span></td>
                <td><div class="form-check form-switch"><input class="form-check-input" type="checkbox" role="switch" checked={r.enabled} hx-post={`/admin/rules/${r.id}/toggle`} hx-trigger="change" hx-swap="none" /></div></td>
                <td class="text-nowrap">
                  <button type="button" class="btn btn-link btn-sm p-0 me-2" data-bs-toggle="collapse" data-bs-target={`#edit-${r.id}`}>Éditer</button>
                  <button type="button" class="btn btn-link btn-sm p-0 text-danger" hx-post={`/admin/rules/${r.id}/delete`} hx-confirm="Supprimer cette règle ?">Supprimer</button>
                </td>
              </tr>
              <tr class="collapse" id={`edit-${r.id}`}><td colspan={8}><RuleForm rule={r} /></td></tr>
            </>
          ))}</tbody>
        </table></div>
      </Card>
    </>
  );
}

// ---------------------------------------------------------------- catalog
export type CatalogQuery = { kind: "live" | "vod" | "series"; q: string; cat: string; status: string; page: number };
export function TmdbCell({ it, results }: { it: Item; results?: { id: number; label: string }[] }) {
  const kind = it.kind === "vod" ? "movie" : "tv";
  const cls = it.matchStatus === "matched" || it.matchStatus === "manual" ? "success" : it.matchStatus === "unmatched" ? "danger" : "secondary";
  const target = `#tmdb-${it.id}`;
  return (
    <div id={`tmdb-${it.id}`}>
      <div class="d-flex align-items-center gap-2 small">
        {it.tmdbId ? <a href={`https://www.themoviedb.org/${kind}/${it.tmdbId}`} target="_blank" rel="noreferrer">#{it.tmdbId}</a> : <span class="text-secondary">—</span>}
        <span class={`badge text-bg-${cls}`}>{it.matchStatus}{it.matchScore != null && it.matchStatus !== "manual" ? ` ${Math.round(it.matchScore * 100)}%` : ""}</span>
        <button type="button" class="btn btn-link btn-sm p-0" data-bs-toggle="collapse" data-bs-target={`#fix-${it.id}`}>Corriger</button>
      </div>
      <div class={`collapse${results ? " show" : ""} mt-2`} id={`fix-${it.id}`}>
        <form hx-post="/admin/catalog/tmdb-search" hx-target={target} hx-swap="outerHTML" class="input-group input-group-sm mb-2">
          <input type="hidden" name="id" value={it.id} />
          <input class="form-control" name="q" value={it.cleanTitle ?? it.name} />
          <button class="btn btn-outline-secondary">Chercher</button>
        </form>
        {results && (
          <ul class="list-unstyled small mb-2">
            {results.map((r) => <li><button type="button" class="btn btn-link btn-sm p-0" hx-post="/admin/catalog/tmdb-assign" hx-vals={JSON.stringify({ id: it.id, tmdb_id: r.id })} hx-target={target} hx-swap="outerHTML">Associer</button> {r.label} <span class="text-secondary">#{r.id}</span></li>)}
            {!results.length && <li class="text-secondary">Aucun résultat.</li>}
          </ul>
        )}
        <form hx-post="/admin/catalog/tmdb-assign" hx-target={target} hx-swap="outerHTML" class="input-group input-group-sm">
          <input type="hidden" name="id" value={it.id} />
          <input class="form-control" name="tmdb_id" placeholder="ID TMDB (vide = retirer)" />
          <button class="btn btn-outline-secondary">Associer</button>
        </form>
      </div>
    </div>
  );
}
/**
 * Reads as "Visible", never as "Masqué": a switch that is off must mean the thing is off.
 * The stored column is `hidden_manual`, so the UI value is its opposite — the route
 * inverts it back. A rule-based hiding is shown as a badge because the switch cannot
 * undo it (visible = neither hidden_by_rule nor hidden_manual).
 */
export function VisibilityToggle({ scope, id, hiddenByRule, hiddenManual }: {
  scope: "item" | "category"; id: number; hiddenByRule: boolean; hiddenManual: boolean;
}) {
  const domId = `vis-${scope}-${id}`;
  const visible = !hiddenManual;
  const label = hiddenByRule ? "Masqué par une règle" : visible ? "Visible" : "Masqué";
  return (
    <div id={domId} class="d-flex align-items-center gap-2">
      <div class="form-check form-switch m-0">
        <input class="form-check-input" type="checkbox" role="switch" id={`${domId}-input`} checked={visible && !hiddenByRule}
          title={hiddenByRule ? "Une règle de filtrage masque cet élément : modifiez la règle pour le réafficher." : "Afficher ou masquer cet élément pour les applications IPTV"}
          hx-post={`/admin/catalog/${scope}/${id}/visible`} hx-trigger="change" hx-target={`#${domId}`} hx-swap="outerHTML" />
        <label class={`form-check-label small ${hiddenByRule || !visible ? "text-secondary" : ""}`} for={`${domId}-input`}>{label}</label>
      </div>
    </div>
  );
}
export function CatalogView({ qy, cats, rows, total }: { qy: CatalogQuery; cats: Category[]; rows: Item[]; total: number }) {
  const PAGE = 100;
  const link = (p: Partial<CatalogQuery>) => "/admin/catalog?" + new URLSearchParams({ ...qy, page: String(qy.page), ...Object.fromEntries(Object.entries(p).map(([k, v]) => [k, String(v)])) } as Record<string, string>).toString();
  const catName = new Map(cats.map((c) => [c.xtreamId, c.name]));
  return (
    <>
      <Title t="Catalogue" sub="Parcourir, filtrer et corriger le contenu importé" />
      <div class="btn-group mb-3" role="group">
        {(["live", "vod", "series"] as const).map((k) => <a class={`btn btn-${k === qy.kind ? "" : "outline-"}primary`} href={`/admin/catalog?kind=${k}`}>{k === "vod" ? "Films" : k === "live" ? "Live" : "Séries"}</a>)}
      </div>
      <div class="mb-3">
        <button type="button" class="btn btn-link p-0" data-bs-toggle="collapse" data-bs-target="#cats">Catégories ({cats.length})</button>
        <div class="collapse" id="cats"><div class="table-responsive"><table class="table table-sm mb-0">
          <tbody>{cats.map((c) => (
            <tr class={c.hiddenByRule || c.hiddenManual ? "text-secondary text-decoration-line-through" : ""}>
              <td><a href={link({ cat: c.xtreamId, page: 1 })}>{c.name}</a></td>
              <td class="text-end"><VisibilityToggle scope="category" id={c.id} hiddenByRule={c.hiddenByRule} hiddenManual={c.hiddenManual} /></td>
            </tr>
          ))}</tbody>
        </table></div></div>
      </div>
      <form method="get" action="/admin/catalog" class="row g-2 mb-3">
        <input type="hidden" name="kind" value={qy.kind} />
        <div class="col-12 col-md-4"><input class="form-control" name="q" value={qy.q} placeholder="Rechercher…" /></div>
        <div class="col-6 col-md-3"><select class="form-select" name="cat"><option value="">Toutes catégories</option>{cats.map((c) => <option value={c.xtreamId} selected={c.xtreamId === qy.cat}>{c.name}</option>)}</select></div>
        <div class="col-6 col-md-3"><select class="form-select" name="status">
          {[["", "Tous"], ["visible", "Visibles"], ["hidden", "Masqués"], ...(qy.kind !== "live" ? [["matched", "TMDB trouvé"], ["unmatched", "TMDB non trouvé"], ["pending", "TMDB en attente"]] : [])].map(([v, l]) => <option value={v} selected={v === qy.status}>{l}</option>)}
        </select></div>
        <div class="col-12 col-md-2 d-grid"><button class="btn btn-secondary">Filtrer</button></div>
      </form>
      <p class="text-secondary small">{fmt(total)} résultat(s)</p>
      <div class="table-responsive"><table class="table table-sm align-middle">
        <thead><tr><th>ID</th><th>Nom</th><th>Catégorie</th>{qy.kind !== "live" && <th>TMDB</th>}<th>Visibilité</th></tr></thead>
        <tbody>{rows.map((r) => (
          <tr class={r.hiddenByRule || r.hiddenManual ? "text-secondary" : ""}>
            <td><code>{r.xtreamId}</code></td>
            <td>{r.hiddenByRule || r.hiddenManual ? <s>{r.name}</s> : r.name}{r.cleanTitle && r.cleanTitle !== r.name && <div class="small text-secondary">→ {r.cleanTitle}{r.year ? ` (${r.year})` : ""}</div>}</td>
            <td class="small">{catName.get(r.categoryXtreamId ?? "") ?? r.categoryXtreamId}</td>
            {qy.kind !== "live" && <td><TmdbCell it={r} /></td>}
            <td><VisibilityToggle scope="item" id={r.id} hiddenByRule={r.hiddenByRule} hiddenManual={r.hiddenManual} /></td>
          </tr>
        ))}</tbody>
      </table></div>
      <nav class="d-flex align-items-center gap-3">
        {qy.page > 1 && <a class="btn btn-outline-secondary btn-sm" href={link({ page: qy.page - 1 })}>← Précédent</a>}
        <span class="text-secondary small">Page {qy.page} / {Math.max(1, Math.ceil(total / PAGE))}</span>
        {qy.page * PAGE < total && <a class="btn btn-outline-secondary btn-sm" href={link({ page: qy.page + 1 })}>Suivant →</a>}
      </nav>
    </>
  );
}
