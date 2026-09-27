import type { FilterRule } from "@/db";
import type { RulePreview as Preview } from "@/admin/rules/data";
import { Title, Card, Options, Busy } from "../layout";
import { KIND_LABELS } from "../labels";

export function RuleForm({ rule, preview }: { rule?: FilterRule; preview?: Preview }) {
  // Every field id carries the rule id: the same form is rendered once per rule on the page.
  const uid = rule?.id ?? "new";
  const Sel = ({ name, label, opts, cur, col }: { name: string; label: string; opts: [string, string][]; cur: string; col: string }) => (
    <div class={col}><label class="form-label" for={`${name}-${uid}`}>{label}</label><select class="form-select" id={`${name}-${uid}`} name={name}><Options opts={opts} cur={cur} /></select></div>
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
        <Busy id={`${pid}-busy`} label="Recherche en cours" />
      </div>
      <div id={pid} aria-live="polite"><RulePreview preview={preview} /></div>
    </form>
  );
}

export function RulePreview({ preview }: { preview?: Preview }) {
  if (!preview) return <></>;
  return (
    <div class="mt-3">
      <div class="small fw-semibold">{preview.total} correspondance(s){preview.total > preview.matches.length ? ` (${preview.matches.length} premières)` : ""}</div>
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
