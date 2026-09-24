import { fmt, ago, Status } from "./layout";
import type { Settings } from "@/lib/settings";
import type { FilterRule, SyncLog, Item, Category } from "@/db/schema";
import { describeCron } from "@/lib/jobs/cron";

const Title = ({ t, sub }: { t: string; sub: string }) => <div class="mb-4"><h1 class="h2 mb-1">{t}</h1><p class="text-secondary mb-0">{sub}</p></div>;
/**
 * `extra` is a short inline complement (a link, a language code); `hint` is a sentence.
 * The hint drops under the title on a phone and sits beside it on md+, so a card header
 * never becomes a grey paragraph the reader has to scan to find the title again.
 */
const Card = ({ title, extra, hint, children }: { title: string; extra?: unknown; hint?: string; children?: unknown }) => (
  <div class="card mb-3">
    <div class="card-header">
      <span class="fw-semibold">{title}</span>
      {extra && <small class="text-secondary ms-2">{extra}</small>}
      {hint && <small class="text-secondary d-block d-md-inline ms-md-2">{hint}</small>}
    </div>
    <div class="card-body">{children}</div>
  </div>
);

// ---------------------------------------------------------------- login
export function LoginView({ locked, error }: { locked: boolean; error?: string }) {
  return (
    <div class="col-12 col-sm-8 col-md-5 col-lg-4 mx-auto mt-5"><div class="card">
      <div class="card-body">
        <h2 class="h4 mb-3">Connexion</h2>
        {locked && <p class="text-secondary small">Serveur verrouillé depuis le redémarrage : le mot de passe déchiffre les identifiants et relance la planification.</p>}
        {error && <div class="alert alert-danger" role="alert">{error}</div>}
        <form method="post" action="/admin/login" class="vstack gap-2">
          <label class="visually-hidden" for="password">Mot de passe</label>
          <input class="form-control" type="password" name="password" id="password" placeholder="Mot de passe" autocomplete="current-password" required autofocus />
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
    <div id="jobs-status" class="mt-3" aria-live="polite" hx-get="/admin/jobs/status" hx-trigger={running.length ? "every 3s" : "every 30s"} hx-swap="outerHTML">
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
      {!configured && <div class="alert alert-warning" role="alert">Serveur Xtream non configuré — <a href="/admin/settings" class="alert-link">ouvrir les paramètres</a>.</div>}

      <Card title="Traitement" hint="3 étapes indépendantes : lire la source → appliquer les filtres → enrichir (TMDB)">
        {/* On a phone the one-shot action comes first, above the fold; on md+ it goes back to the right. */}
        <form method="post" class="d-grid d-md-flex gap-2">
          <Btn job="pipeline" label="Tout enchaîner" cls="btn-success order-first order-md-last ms-md-auto" />
          <Btn job="source" label="1. Lire la source" cls="btn-primary" />
          <Btn job="filters" label="2. Appliquer les filtres" cls="btn-secondary" />
          <Btn job="enrich" label="3. Enrichir TMDB" cls="btn-secondary" />
          <Btn job="epg" label="EPG" cls="btn-outline-secondary" />
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
                <div class="d-flex justify-content-between small"><span id={`prog-${k}`}>{k === "vod" ? "Films associés" : "Séries associées"}</span><span>{fmt(i.matched)} / {fmt(i.total)}</span></div>
                <progress class="w-100" value={i.matched} max={i.total || 1} aria-labelledby={`prog-${k}`}></progress>
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
            <label class="form-label small mb-0" for="cx-url">URL du serveur</label><input id="cx-url" class="form-control form-control-sm mb-2" readonly value={base} />
            <div class="row g-2 mb-2">
              <div class="col"><label class="form-label small mb-0" for="cx-user">Utilisateur</label><input id="cx-user" class="form-control form-control-sm" readonly value={s.proxy_username} /></div>
              <div class="col"><label class="form-label small mb-0" for="cx-pass">Mot de passe</label><input id="cx-pass" class="form-control form-control-sm" readonly value="(mot de passe admin)" /></div>
            </div>
            <label class="form-label small mb-0" for="cx-m3u">Playlist M3U</label><input id="cx-m3u" class="form-control form-control-sm" readonly value={`${base}/get.php?username=${s.proxy_username}&password=<mot de passe admin>&type=m3u_plus&output=ts`} />
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
  items: "éléments", categories: "catégories", bytes: "", // bytes are already rendered as "x Mo"
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
    <div class={col}>
      <label class="form-label" for={`f-${name}`}>{label}</label>
      <input class="form-control" id={`f-${name}`} name={name} type={type} value={s[name]} aria-describedby={hint ? `f-${name}-hint` : undefined} autocomplete={type === "password" ? "off" : undefined} />
      {hint && <div class="form-text" id={`f-${name}-hint`}>{hint}</div>}
    </div>
  );
  /** htmx buttons show a spinner while the request runs; `.htmx-indicator` is styled by htmx itself. */
  const Test = ({ url, target, label }: { url: string; target: string; label: string }) => (
    <div class="mt-3 d-flex flex-wrap align-items-center gap-2">
      <button type="button" class="btn btn-outline-secondary btn-sm" hx-post={url} hx-include="closest form" hx-target={`#${target}`} hx-disabled-elt="this" hx-indicator={`#${target}-busy`}>{label}</button>
      <span id={`${target}-busy`} class="htmx-indicator spinner-border spinner-border-sm text-secondary" role="status" aria-label="Test en cours"></span>
      <span id={target} aria-live="polite"></span>
    </div>
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
          <Test url="/admin/settings/test-xtream" target="xt-result" label="Tester la connexion" />
        </Card>
        <Card title="Compte client (apps)" hint="Les apps IPTV se connectent avec cet utilisateur et le mot de passe admin ; les flux passent par ce serveur (302), les identifiants Xtream ne sont jamais transmis.">
          <div class="row g-3">
            <F name="proxy_username" label="Utilisateur" col="col-12 col-md-6" />
            <F name="public_base_url" label="URL publique de ce serveur" hint="Optionnel, ex : http://192.168.1.10:3000" col="col-12 col-md-6" />
          </div>
        </Card>
        <Card title="Planification" hint="Cron à 5 champs : minute, heure, jour, mois, jour de la semaine.">
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
          <Test url="/admin/settings/test-tmdb" target="tm-result" label="Tester TMDB" />
        </Card>
        <div class="d-grid d-md-block mb-4"><button class="btn btn-primary">Enregistrer</button></div>
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
              <button class="btn btn-outline-danger btn-sm">Réinitialiser le matching</button>
            </Card>
          </form>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- rules
export function RuleForm({ rule, preview }: { rule?: FilterRule; preview?: { matches: string[]; total: number } }) {
  // Every field id carries the rule id: the same form is rendered once per rule on the page.
  const uid = rule?.id ?? "new";
  const Sel = ({ name, label, opts, cur, col }: { name: string; label: string; opts: [string, string][]; cur: string; col: string }) => (
    <div class={col}><label class="form-label" for={`${name}-${uid}`}>{label}</label><select class="form-select" id={`${name}-${uid}`} name={name}>{opts.map(([v, l]) => <option value={v} selected={v === cur}>{l}</option>)}</select></div>
  );
  const pid = `preview-${uid}`;
  return (
    <form method="post" action="/admin/rules">
      {rule && <input type="hidden" name="id" value={rule.id} />}
      <div class="row g-2">
        <div class="col-12 col-md-4"><label class="form-label" for={`name-${uid}`}>Nom</label><input class="form-control" id={`name-${uid}`} name="name" value={rule?.name ?? ""} required /></div>
        <Sel name="kind" label="Type" opts={[["all", "Tous"], ["live", "Live"], ["vod", "Films"], ["series", "Séries"]]} cur={rule?.kind ?? "all"} col="col-6 col-md-2" />
        <Sel name="target" label="Cible" opts={[["name", "Nom"], ["category", "Catégorie"]]} cur={rule?.target ?? "name"} col="col-6 col-md-2" />
        <Sel name="action" label="Action" opts={[["hide", "Masquer ce qui matche"], ["keep", "Ne garder que ce qui matche"]]} cur={rule?.action ?? "hide"} col="col-6 col-md-2" />
        <div class="col-6 col-md-2"><label class="form-label" for={`position-${uid}`}>Position</label><input class="form-control" id={`position-${uid}`} name="position" type="number" inputmode="numeric" value={rule?.position ?? 0} /></div>
        <div class="col-12 col-md-8"><label class="form-label" for={`pattern-${uid}`}>Regex</label><input class="form-control font-monospace" id={`pattern-${uid}`} name="pattern" value={rule?.pattern ?? ""} placeholder="XXX|ADULT|^(?!.*\bFR\b)" autocapitalize="off" autocorrect="off" spellcheck={false} required /></div>
        <div class="col-6 col-md-2"><label class="form-label" for={`flags-${uid}`}>Flags</label><input class="form-control font-monospace" id={`flags-${uid}`} name="flags" value={rule?.flags ?? "i"} autocapitalize="off" /></div>
        <div class="col-6 col-md-2 d-flex align-items-end pb-2"><div class="form-check form-switch"><input class="form-check-input" type="checkbox" role="switch" name="enabled" id={`en-${uid}`} checked={rule?.enabled ?? true} /><label class="form-check-label" for={`en-${uid}`}>Activée</label></div></div>
      </div>
      <div class="d-flex flex-wrap align-items-center gap-2 mt-3">
        <button class="btn btn-primary">{rule ? "Mettre à jour" : "Ajouter"}</button>
        <button type="button" class="btn btn-outline-secondary" hx-post="/admin/rules/preview" hx-include="closest form" hx-target={`#${pid}`} hx-disabled-elt="this" hx-indicator={`#${pid}-busy`}>Prévisualiser</button>
        <span id={`${pid}-busy`} class="htmx-indicator spinner-border spinner-border-sm text-secondary" role="status" aria-label="Recherche en cours"></span>
      </div>
      <div id={pid} aria-live="polite"><RulePreview preview={preview} /></div>
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
      <Title t="Règles de filtrage" sub="Regex JavaScript sur le nom ou la catégorie, réappliquées à chaque lecture de la source. Une règle « keep » ne garde que ce qui matche, pour son type." />
      <Card title="Nouvelle règle"><RuleForm /></Card>
      <Card title={`Règles (${rules.length})`}>
        {/* Grid rows rather than an 8-column table: on a phone the name and the switch share
            the first line, the regex and the badges follow; on md+ the columns line up under a header. */}
        <div class="list-group list-group-flush">
          <div class="list-group-item d-none d-md-block small text-secondary"><div class="row g-2">
            <div class="col-md-1">#</div><div class="col-md-2">Nom</div><div class="col-md-4">Regex</div><div class="col-md-2">Type · cible · action</div><div class="col-md-1">Actif</div>
          </div></div>
          {rules.length === 0 && <div class="list-group-item small text-secondary">Aucune règle.</div>}
          {rules.map((r) => (
            <div class={`list-group-item ${r.enabled ? "" : "text-secondary"}`}>
              <div class="row g-2 align-items-center">
                <div class="col-md-1 d-none d-md-block">{r.position}</div>
                <div class="col col-md-2 order-1 fw-semibold">{r.name}</div>
                <div class="col-auto col-md-1 order-2 order-md-5">
                  <div class="form-check form-switch m-0"><input class="form-check-input" type="checkbox" role="switch" name="enabled" checked={r.enabled} aria-label={`Règle « ${r.name} » active`} hx-post={`/admin/rules/${r.id}/toggle`} hx-trigger="change" hx-swap="none" /></div>
                </div>
                <div class="col-12 col-md-4 order-3"><code class="text-break">/{r.pattern}/{r.flags}</code></div>
                <div class="col-12 col-md-2 order-4 d-flex flex-wrap gap-1">
                  <span class="badge text-bg-light d-md-none" title="Position">#{r.position}</span>
                  <span class="badge text-bg-secondary">{KIND_LABELS[r.kind ?? "all"]}</span>
                  <span class="badge text-bg-secondary">{r.target === "category" ? "catégorie" : "nom"}</span>
                  <span class={`badge text-bg-${r.action === "hide" ? "danger" : "success"}`}>{r.action === "hide" ? "masque" : "garde"}</span>
                </div>
                {/* Touch targets: link-buttons keep a vertical padding on a phone instead of `p-0`. */}
                <div class="col-12 col-md-2 order-last text-md-end text-nowrap">
                  <button type="button" class="btn btn-link btn-sm px-0 py-1 me-3" data-bs-toggle="collapse" data-bs-target={`#edit-${r.id}`} aria-expanded="false" aria-controls={`edit-${r.id}`}>Éditer</button>
                  <button type="button" class="btn btn-link btn-sm px-0 py-1 text-danger" hx-post={`/admin/rules/${r.id}/delete`} hx-confirm={`Supprimer la règle « ${r.name} » ?`}>Supprimer</button>
                </div>
              </div>
              <div class="collapse mt-3" id={`edit-${r.id}`}><RuleForm rule={r} /></div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

// ---------------------------------------------------------------- catalog
export type CatalogQuery = { kind: "live" | "vod" | "series"; q: string; cat: string; status: string; page: number; view: "grouped" | "flat" };
const KIND_LABELS: Record<string, string> = { all: "tous", live: "live", vod: "films", series: "séries" };
const MATCH_LABELS: Record<string, string> = { matched: "associé", manual: "manuel", unmatched: "introuvable", pending: "en attente" };
export function TmdbCell({ it, results }: { it: Item; results?: { id: number; label: string }[] }) {
  const kind = it.kind === "vod" ? "movie" : "tv";
  const cls = it.matchStatus === "matched" || it.matchStatus === "manual" ? "success" : it.matchStatus === "unmatched" ? "danger" : "secondary";
  const target = `#tmdb-${it.id}`;
  const score = it.matchScore != null && it.matchStatus !== "manual" ? ` ${Math.round(it.matchScore * 100)} %` : "";
  return (
    <div id={`tmdb-${it.id}`}>
      <div class="d-flex align-items-center gap-2 small">
        {it.tmdbId
          ? <a href={`https://www.themoviedb.org/${kind}/${it.tmdbId}`} target="_blank" rel="noreferrer" aria-label={`Fiche TMDB ${it.tmdbId} (nouvel onglet)`}>#{it.tmdbId}</a>
          : <span class="text-secondary" aria-label="Sans fiche TMDB">—</span>}
        <span class={`badge text-bg-${cls}`}>{MATCH_LABELS[it.matchStatus] ?? it.matchStatus}{score}</span>
        <button type="button" class="btn btn-link btn-sm px-0 py-1" data-bs-toggle="collapse" data-bs-target={`#fix-${it.id}`} aria-expanded={Boolean(results)} aria-controls={`fix-${it.id}`}>Corriger</button>
      </div>
      <div class={`collapse${results ? " show" : ""} mt-2`} id={`fix-${it.id}`}>
        <form hx-post="/admin/catalog/tmdb-search" hx-target={target} hx-swap="outerHTML" hx-indicator="this" class="input-group input-group-sm mb-2">
          <input type="hidden" name="id" value={it.id} />
          <input class="form-control" name="q" value={it.cleanTitle ?? it.name} aria-label="Titre à chercher sur TMDB" />
          <button class="btn btn-outline-secondary">Chercher</button>
        </form>
        {results && (
          <ul class="list-unstyled small mb-2">
            {results.map((r) => <li><button type="button" class="btn btn-link btn-sm px-0 py-1" hx-post="/admin/catalog/tmdb-assign" hx-vals={JSON.stringify({ id: it.id, tmdb_id: r.id })} hx-target={target} hx-swap="outerHTML" aria-label={`Associer à ${r.label}`}>Associer</button> {r.label} <span class="text-secondary">#{r.id}</span></li>)}
            {!results.length && <li class="text-secondary">Aucun résultat.</li>}
          </ul>
        )}
        <form hx-post="/admin/catalog/tmdb-assign" hx-target={target} hx-swap="outerHTML" class="input-group input-group-sm">
          <input type="hidden" name="id" value={it.id} />
          <input class="form-control" name="tmdb_id" inputmode="numeric" placeholder="ID TMDB (vide = retirer)" aria-label="Identifiant TMDB à associer" />
          <button class="btn btn-outline-secondary">Associer</button>
        </form>
      </div>
    </div>
  );
}
/** Link back to the catalog, keeping the current filters. */
export function catalogLink(qy: CatalogQuery, p: Partial<CatalogQuery> = {}) {
  return "/admin/catalog?" + new URLSearchParams({ ...qy, page: String(qy.page), ...Object.fromEntries(Object.entries(p).map(([k, v]) => [k, String(v)])) } as Record<string, string>).toString();
}
/**
 * Reads as "Visible", never as "Masqué": a switch that is off must mean the thing is off.
 * The stored column is `hidden_manual`, so the UI value is its opposite — the route
 * inverts it back. A rule-based hiding is shown as a badge because the switch cannot
 * undo it (visible = neither hidden_by_rule nor hidden_manual).
 *
 * An item swaps its whole row, not just the switch: the name is struck through and greyed
 * out on the row and its cells, which would otherwise keep the stale style. A category
 * lives in an accordion header with no row around it and answers `HX-Refresh` instead —
 * targeting `closest .list-group-item` there resolves to nothing and htmx drops the request silently.
 * The current filters ride along in the query string so the route can rebuild the row.
 */
export function VisibilityToggle({ scope, id, hiddenByRule, hiddenManual, catHidden = false, qy }: {
  scope: "item" | "category"; id: number; hiddenByRule: boolean; hiddenManual: boolean; catHidden?: boolean; qy: CatalogQuery;
}) {
  const domId = `vis-${scope}-${id}`;
  const visible = !hiddenManual;
  // A rule or a hidden category outranks the switch: say which, instead of showing a lie.
  const forced = hiddenByRule ? "Masqué par une règle" : catHidden ? "Masqué par la catégorie" : null;
  const label = forced ?? (visible ? "Visible" : "Masqué");
  const title = hiddenByRule ? "Une règle de filtrage masque cet élément : modifiez la règle pour le réafficher."
    : catHidden ? "Sa catégorie est masquée : réaffichez la catégorie pour le rendre visible."
      : "Afficher ou masquer cet élément pour les applications IPTV";
  const qs = new URLSearchParams({ kind: qy.kind, q: qy.q, cat: qy.cat, status: qy.status, view: qy.view, page: String(qy.page) }).toString();
  return (
    <div id={domId} class="d-flex align-items-center gap-2">
      <div class="form-check form-switch m-0">
        <input class="form-check-input" type="checkbox" role="switch" name="visible" id={`${domId}-input`} checked={visible && !forced} title={title}
          hx-post={`/admin/catalog/${scope}/${id}/visible?${qs}`} hx-trigger="change"
          {...(scope === "item" ? { "hx-target": "closest .list-group-item", "hx-swap": "outerHTML" } : { "hx-swap": "none" })} />
        <label class={`form-check-label small ${forced || !visible ? "text-secondary" : ""}`} for={`${domId}-input`}>{label}</label>
      </div>
    </div>
  );
}
/**
 * Items are a list of grid rows, not a `<table>`: a table keeps its five columns on a phone
 * and pushes the switch off-screen. On md+ the grid mimics a table, with the widths below
 * summing to 12; on a phone the same cells reflow (see `ItemRow`) — name and switch on the
 * first line, category and TMDB underneath.
 */
function catalogGrid(qy: CatalogQuery) {
  const flat = qy.view === "flat", tmdb = qy.kind !== "live";
  return { flat, tmdb, id: "col-md-1", name: `col-md-${9 - (flat ? 2 : 0) - (tmdb ? 3 : 0)}`, cat: "col-md-2", tmdbCol: "col-md-3", vis: "col-md-2" };
}
/** Column titles, md+ only: a phone shows one item per block and needs no header. */
function CatalogHeader({ qy }: { qy: CatalogQuery }) {
  const g = catalogGrid(qy);
  return (
    <div class="list-group-item d-none d-md-block small text-secondary"><div class="row g-2">
      <div class={g.id}>ID</div><div class={g.name}>Nom</div>
      {g.flat && <div class={g.cat}>Catégorie</div>}
      {g.tmdb && <div class={g.tmdbCol}>TMDB</div>}
      <div class={g.vis}>Visibilité</div>
    </div></div>
  );
}
/**
 * Grouped view: one Bootstrap accordion item per category. The switch sits *beside* the
 * accordion button, never inside it: a checkbox nested in a button is neither valid nor
 * clickable. The button is `overflow-hidden` so a long category name truncates instead of
 * shoving the switch past the right edge of a phone.
 */
export function CategoryRow({ c, qy, count }: { c: Category; qy: CatalogQuery; count?: number }) {
  const hidden = c.hiddenByRule || c.hiddenManual;
  const qs = new URLSearchParams({ kind: qy.kind, cat: c.xtreamId, status: qy.status, view: "grouped", page: "1" }).toString();
  return (
    <div class="accordion-item">
      {/* The strip is painted by the header, not the button (`bg-transparent shadow-none`):
          an opened button paints its own background and would split the row in two. */}
      <div class="accordion-header d-flex align-items-center bg-body-tertiary">
        <button type="button" class="accordion-button collapsed bg-transparent shadow-none overflow-hidden" data-bs-toggle="collapse" data-bs-target={`#cat-${c.id}`} aria-expanded="false"
          hx-get={`/admin/catalog/items?${qs}`} hx-target={`#rows-${c.id}`} hx-swap="beforeend" hx-trigger="click once">
          <span class={`fw-semibold text-truncate ${hidden ? "text-secondary text-decoration-line-through" : ""}`}>{c.name}</span>
          {count != null && <span class="badge text-bg-secondary ms-2 flex-shrink-0">{fmt(count)}</span>}
        </button>
        <div class="pe-3 flex-shrink-0 text-nowrap">
          <VisibilityToggle scope="category" id={c.id} hiddenByRule={c.hiddenByRule} hiddenManual={c.hiddenManual} qy={qy} />
        </div>
      </div>
      <div id={`cat-${c.id}`} class="accordion-collapse collapse">
        <div class="accordion-body p-0">
          {/* The rows container *is* the flush list, so appended items stay direct children and keep the flush borders. */}
          <div id={`rows-${c.id}`} class="list-group list-group-flush"><CatalogHeader qy={qy} /></div>
        </div>
      </div>
    </div>
  );
}
export function ItemRow({ r, qy, catLabel, catHidden = false }: { r: Item; qy: CatalogQuery; catLabel: string; catHidden?: boolean }) {
  const hidden = r.hiddenByRule || r.hiddenManual || catHidden;
  const g = catalogGrid(qy);
  return (
    <div class={`list-group-item ${hidden ? "text-secondary" : ""}`}>
      {/* `order-*` puts the switch next to the name on a phone and back in the last column on md+. */}
      <div class="row g-2 align-items-center">
        <div class={`${g.id} d-none d-md-block font-monospace small text-secondary`}>{r.xtreamId}</div>
        <div class={`col ${g.name} order-1`}>
          {hidden ? <s>{r.name}</s> : r.name}
          {r.cleanTitle && r.cleanTitle !== r.name && <div class="small text-secondary">→ {r.cleanTitle}{r.year ? ` (${r.year})` : ""}</div>}
        </div>
        <div class={`col-auto ${g.vis} order-2 order-md-5`}>
          <VisibilityToggle scope="item" id={r.id} hiddenByRule={r.hiddenByRule} hiddenManual={r.hiddenManual} catHidden={catHidden} qy={qy} />
        </div>
        {g.flat && <div class={`col-12 ${g.cat} order-3 small ${catHidden ? "text-decoration-line-through" : ""}`}>{catLabel}</div>}
        {g.tmdb && <div class={`col-12 ${g.tmdbCol} order-4`}><TmdbCell it={r} /></div>}
      </div>
    </div>
  );
}
/**
 * One page of a category, plus the sentinel that pulls the next one. `outerHTML` replaces
 * the sentinel with the next batch, so the infinite scroll is per-category and never holds
 * more than a page of unseen rows. `intersect`, not `revealed`: htmx only polls `revealed`
 * on scroll, so a fast flick past the sentinel would leave the list silently truncated.
 * `click` is the manual way out if the observer never fires at all.
 */
export function CategoryItems({ qy, cat, rows, catHidden, hasMore }: {
  qy: CatalogQuery; cat: string; rows: Item[]; catHidden: boolean; hasMore: boolean;
}) {
  const qs = new URLSearchParams({ kind: qy.kind, cat, status: qy.status, view: "grouped", page: String(qy.page + 1) }).toString();
  return (
    <>
      {rows.map((r) => <ItemRow r={r} qy={qy} catLabel="" catHidden={catHidden} />)}
      {rows.length === 0 && qy.page === 1 && <div class="list-group-item small text-secondary">Aucun élément.</div>}
      {hasMore && (
        <div class="list-group-item text-center py-2" hx-get={`/admin/catalog/items?${qs}`} hx-trigger="intersect once, click" hx-target="this" hx-swap="outerHTML" hx-indicator="this">
          {/* The button is only an affordance: the click bubbles up to the row, which owns the request. */}
          <button type="button" class="btn btn-link btn-sm">Charger la suite</button>
          <span class="htmx-indicator spinner-border spinner-border-sm text-secondary ms-1" role="status" aria-label="Chargement"></span>
        </div>
      )}
    </>
  );
}
export function CatalogView({ qy, cats, rows, total, catCounts }: {
  qy: CatalogQuery; cats: Category[]; rows: Item[]; total: number; catCounts: Map<string, number>;
}) {
  const PAGE = 100;
  const link = (p: Partial<CatalogQuery>) => catalogLink(qy, p);
  const catName = new Map(cats.map((c) => [c.xtreamId, c.name]));
  const hiddenCats = new Set(cats.filter((c) => c.hiddenByRule || c.hiddenManual).map((c) => c.xtreamId));
  const grouped = qy.view === "grouped";
  return (
    <>
      <Title t="Catalogue" sub="Parcourir, filtrer et corriger le contenu importé" />
      {/* Kind is the primary axis, so it gets the pills; the view toggle is secondary and lighter. */}
      <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
        <nav class="nav nav-pills" aria-label="Type de contenu">
          {(["live", "vod", "series"] as const).map((k) => <a class={`nav-link${k === qy.kind ? " active" : ""}`} {...(k === qy.kind ? { "aria-current": "page" } : {})} href={`/admin/catalog?kind=${k}&view=${qy.view}`}>{k === "vod" ? "Films" : k === "live" ? "Live" : "Séries"}</a>)}
        </nav>
        <div class="btn-group btn-group-sm ms-md-auto" role="group" aria-label="Présentation">
          <a class={`btn btn-${grouped ? "" : "outline-"}secondary`} {...(grouped ? { "aria-current": "true" } : {})} href={link({ view: "grouped", page: 1 })}>Par catégorie</a>
          <a class={`btn btn-${grouped ? "outline-" : ""}secondary`} {...(grouped ? {} : { "aria-current": "true" })} href={link({ view: "flat", page: 1 })}>Liste</a>
        </div>
      </div>
      <form method="get" action="/admin/catalog" class="row g-2 mb-3" role="search">
        <input type="hidden" name="kind" value={qy.kind} />
        {/* Searching is a flat-list activity: a hit buried in a collapsed group is a hit nobody sees. */}
        <input type="hidden" name="view" value="flat" />
        <div class="col-12 col-md-4"><input class="form-control" type="search" name="q" value={qy.q} placeholder="Rechercher un titre…" aria-label="Rechercher un titre" enterkeyhint="search" /></div>
        <div class="col-6 col-md-3"><select class="form-select" name="cat" aria-label="Catégorie"><option value="">Toutes catégories</option>{cats.map((c) => <option value={c.xtreamId} selected={c.xtreamId === qy.cat}>{c.name}</option>)}</select></div>
        <div class="col-6 col-md-3"><select class="form-select" name="status" aria-label="Statut">
          {[["", "Tous les statuts"], ["visible", "Visibles"], ["hidden", "Masqués"], ...(qy.kind !== "live" ? [["matched", "TMDB associé"], ["unmatched", "TMDB introuvable"], ["pending", "TMDB en attente"]] : [])].map(([v, l]) => <option value={v} selected={v === qy.status}>{l}</option>)}
        </select></div>
        <div class="col-12 col-md-2 d-grid"><button class="btn btn-secondary">Filtrer</button></div>
      </form>
      {grouped ? (
        <>
          <p class="text-secondary small">{fmt(cats.length)} catégorie(s) · {fmt(total)} élément(s)</p>
          <div class="accordion">{cats.map((c) => <CategoryRow c={c} qy={qy} count={catCounts.get(c.xtreamId)} />)}</div>
          {cats.length === 0 && <p class="text-secondary">Aucune catégorie — lancer l'étape 1.</p>}
        </>
      ) : (
        <>
          <p class="text-secondary small">{fmt(total)} résultat(s)</p>
          <div class="list-group mb-3">
            <CatalogHeader qy={qy} />
            {rows.map((r) => <ItemRow r={r} qy={qy} catLabel={catName.get(r.categoryXtreamId ?? "") ?? r.categoryXtreamId ?? ""} catHidden={hiddenCats.has(r.categoryXtreamId ?? "")} />)}
            {rows.length === 0 && <div class="list-group-item small text-secondary">Aucun résultat.</div>}
          </div>
          <nav class="d-flex align-items-center gap-3" aria-label="Pagination">
            {qy.page > 1 && <a class="btn btn-outline-secondary btn-sm" href={link({ page: qy.page - 1 })} rel="prev">← Précédent</a>}
            <span class="text-secondary small">Page {qy.page} / {Math.max(1, Math.ceil(total / PAGE))}</span>
            {qy.page * PAGE < total && <a class="btn btn-outline-secondary btn-sm ms-auto" href={link({ page: qy.page + 1 })} rel="next">Suivant →</a>}
          </nav>
        </>
      )}
    </>
  );
}
