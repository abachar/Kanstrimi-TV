import type { FilterRule } from "@/db";
import type { RulePreview as Preview } from "@/catalog";
import { Title, Card, Options, Busy, Badge, Empty } from "../ui";
import { KIND_LABELS } from "../labels";

export function RuleForm({ rule, preview }: { rule?: FilterRule; preview?: Preview }) {
  // Every field id carries the rule id: the same form is rendered once per rule on the page.
  const uid = rule?.id ?? "new";
  const Sel = ({ name, label, opts, cur, col }: { name: string; label: string; opts: [string, string][]; cur: string; col: string }) => (
    <div class={`field gap-2 ${col}`}>
      <label class="label" for={`${name}-${uid}`}>
        {label}
      </label>
      <select class="select w-full" id={`${name}-${uid}`} name={name}>
        <Options opts={opts} cur={cur} />
      </select>
    </div>
  );
  const pid = `preview-${uid}`;
  return (
    <form method="post" action="/admin/rules" class="flex flex-col gap-4">
      {rule && <input type="hidden" name="id" value={rule.id} />}
      <div class="grid grid-cols-2 gap-3 md:grid-cols-12">
        <div class="field col-span-2 gap-2 md:col-span-4">
          <label class="label" for={`name-${uid}`}>
            Nom
          </label>
          <input class="input" type="text" id={`name-${uid}`} name="name" value={rule?.name ?? ""} required />
        </div>
        <Sel
          name="kind"
          label="Type"
          opts={[
            ["all", "Tous"],
            ["live", "Live"],
            ["vod", "Films"],
            ["series", "Séries"],
          ]}
          cur={rule?.kind ?? "all"}
          col="md:col-span-2"
        />
        <Sel
          name="target"
          label="Cible"
          opts={[
            ["name", "Nom"],
            ["category", "Catégorie"],
          ]}
          cur={rule?.target ?? "name"}
          col="md:col-span-2"
        />
        <Sel
          name="action"
          label="Action"
          opts={[
            ["hide", "Masquer ce qui matche"],
            ["keep", "Ne garder que ce qui matche"],
          ]}
          cur={rule?.action ?? "hide"}
          col="md:col-span-2"
        />
        <div class="field gap-2 md:col-span-2">
          <label class="label" for={`position-${uid}`}>
            Position
          </label>
          <input class="input" id={`position-${uid}`} name="position" type="number" inputmode="numeric" value={rule?.position ?? 0} />
        </div>
        <div class="field col-span-2 gap-2 md:col-span-8">
          <label class="label" for={`pattern-${uid}`}>
            Regex
          </label>
          <input
            class="input font-mono"
            type="text"
            id={`pattern-${uid}`}
            name="pattern"
            value={rule?.pattern ?? ""}
            placeholder="XXX|ADULT|^(?!.*\bFR\b)"
            autocapitalize="off"
            autocorrect="off"
            spellcheck={false}
            required
          />
        </div>
        <div class="field gap-2 md:col-span-2">
          <label class="label" for={`flags-${uid}`}>
            Flags
          </label>
          <input class="input font-mono" type="text" id={`flags-${uid}`} name="flags" value={rule?.flags ?? "i"} autocapitalize="off" />
        </div>
        <label class="label flex items-center gap-2 self-end pb-2 md:col-span-2" for={`en-${uid}`}>
          <input class="input" type="checkbox" role="switch" name="enabled" id={`en-${uid}`} checked={rule?.enabled ?? true} />
          Activée
        </label>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <button class="btn" data-variant="primary">
          {rule ? "Mettre à jour" : "Ajouter"}
        </button>
        <button
          type="button"
          class="btn"
          data-variant="outline"
          hx-post="/admin/rules/preview"
          hx-include="closest form"
          hx-target={`#${pid}`}
          hx-disabled-elt="this"
          hx-indicator={`#${pid}-busy`}
        >
          Prévisualiser
        </button>
        <Busy id={`${pid}-busy`} label="Recherche en cours" />
      </div>
      <div id={pid} aria-live="polite">
        <RulePreview preview={preview} />
      </div>
    </form>
  );
}

export function RulePreview({ preview }: { preview?: Preview }) {
  if (!preview) return <></>;
  return (
    <div class="flex flex-col gap-2">
      <div class="text-sm font-medium">
        {preview.total} correspondance(s){preview.total > preview.matches.length ? ` (${preview.matches.length} premières)` : ""}
      </div>
      <pre class="max-h-80 overflow-auto rounded-md bg-muted p-3 font-mono text-xs">{preview.matches.join("\n")}</pre>
    </div>
  );
}

export function RulesView({ rules }: { rules: FilterRule[] }) {
  return (
    <>
      <Title
        t="Règles de filtrage"
        sub="Regex JavaScript sur le nom ou la catégorie, réappliquées à chaque lecture de la source. Une règle « keep » ne garde que ce qui matche, pour son type."
      />
      <Card title="Nouvelle règle">
        <RuleForm />
      </Card>
      <Card title={`Règles (${rules.length})`}>
        {/* Grid rows rather than an 8-column table: on a phone the name and the switch share
            the first line, the regex and the badges follow; on md+ the columns line up under a header. */}
        <div class="flex flex-col divide-y">
          <div class="grid grid-cols-12 gap-2 pb-2 text-xs text-muted-foreground max-md:hidden">
            <div class="col-span-1">#</div>
            <div class="col-span-2">Nom</div>
            <div class="col-span-4">Regex</div>
            <div class="col-span-2">Type · cible · action</div>
            <div class="col-span-1">Actif</div>
          </div>
          {rules.length === 0 && <Empty title="Aucune règle." />}
          {rules.map((r) => (
            <div class={`flex flex-col py-3 ${r.enabled ? "" : "text-muted-foreground"}`}>
              <div class="grid grid-cols-[1fr_auto] items-center gap-2 md:grid-cols-12">
                <div class="col-span-1 tabular-nums max-md:hidden">{r.position}</div>
                <div class="order-1 font-medium md:col-span-2">{r.name}</div>
                <div class="order-2 md:order-5 md:col-span-1">
                  <input
                    class="input"
                    type="checkbox"
                    role="switch"
                    name="enabled"
                    checked={r.enabled}
                    aria-label={`Règle « ${r.name} » active`}
                    hx-post={`/admin/rules/${r.id}/toggle`}
                    hx-trigger="change"
                    hx-swap="none"
                  />
                </div>
                <div class="order-3 col-span-2 md:col-span-4">
                  <code class="font-mono text-xs break-all">
                    /{r.pattern}/{r.flags}
                  </code>
                </div>
                <div class="order-4 col-span-2 flex flex-wrap gap-1">
                  <span class="md:hidden">
                    <Badge tone="muted" title="Position">
                      #{r.position}
                    </Badge>
                  </span>
                  <Badge>{KIND_LABELS[r.kind ?? "all"]}</Badge>
                  <Badge>{r.target === "category" ? "catégorie" : "nom"}</Badge>
                  <Badge tone={r.action === "hide" ? "bad" : "ok"}>{r.action === "hide" ? "masque" : "garde"}</Badge>
                </div>
                {/* "Éditer" is the label of a hidden checkbox: its `peer-checked` shows the form below, without script. */}
                <div class="order-last col-span-2 flex gap-1 md:justify-end">
                  <label
                    for={`edit-toggle-${r.id}`}
                    class="btn cursor-pointer"
                    data-variant="ghost"
                    data-size="sm"
                    aria-controls={`edit-${r.id}`}
                  >
                    Éditer
                  </label>
                  <button
                    type="button"
                    class="btn text-destructive"
                    data-variant="ghost"
                    data-size="sm"
                    hx-post={`/admin/rules/${r.id}/delete`}
                    hx-confirm={`Supprimer la règle « ${r.name} » ?`}
                  >
                    Supprimer
                  </button>
                </div>
              </div>
              <input type="checkbox" id={`edit-toggle-${r.id}`} class="peer sr-only" aria-label={`Éditer la règle « ${r.name} »`} />
              <div class="hidden pt-4 peer-checked:block" id={`edit-${r.id}`}>
                <RuleForm rule={r} />
              </div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
