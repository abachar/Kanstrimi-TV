import type { FilterRule, Kind } from "@/db";
import type { RulePreview as Preview } from "@/catalog";
import { Title, Card, Busy, Empty } from "../ui";
import { KIND_ICONS, KIND_TITLES } from "../labels";
import { Icon } from "../icons";
import { QueryHelp } from "../catalog/search-bar";

/** A rule of one kind, fixed: its fields, its help and its preview are that kind's. */
export function RuleForm({ kind, rule, preview }: { kind: Kind; rule?: FilterRule; preview?: Preview }) {
  const uid = rule?.id ?? "new";
  const pid = `preview-${uid}`;
  return (
    <form method="post" action="/admin/rules" class="flex flex-col gap-4">
      {rule && <input type="hidden" name="id" value={rule.id} />}
      <input type="hidden" name="kind" value={kind} />
      <div class="grid grid-cols-2 gap-3 md:grid-cols-6">
        <div class="field col-span-2 gap-2 md:col-span-6">
          <label class="label" for={`name-${uid}`}>
            Nom
          </label>
          <input class="input" type="text" id={`name-${uid}`} name="name" value={rule?.name ?? ""} required />
        </div>
        <div class="field col-span-2 gap-2 md:col-span-5">
          <label class="label" for={`query-${uid}`}>
            Requête
          </label>
          <input
            class="input font-mono"
            type="text"
            id={`query-${uid}`}
            name="query"
            value={rule?.query ?? ""}
            placeholder={kind === "live" ? 'marché:"fr", xtream.catégorie:radios…' : 'genre:horreur, -variant.langue:"vf","vo"…'}
            autocapitalize="off"
            autocorrect="off"
            spellcheck={false}
            required
          />
        </div>
        <label class="label flex items-center gap-2 self-end pb-2 md:col-span-1" for={`en-${uid}`}>
          <input class="input" type="checkbox" role="switch" name="enabled" id={`en-${uid}`} checked={rule?.enabled ?? true} />
          Activée
        </label>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <button class="btn" data-variant="primary">
          <Icon name={rule ? "save" : "plus"} />
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
          <Icon name="eye" />
          Prévisualiser
        </button>
        <Busy id={`${pid}-busy`} label="Recherche en cours" />
      </div>
      <div id={pid} aria-live="polite">
        <RulePreview preview={preview} />
      </div>
      <QueryHelp kind={kind} rule />
    </form>
  );
}

export function RulePreview({ preview }: { preview?: Preview }) {
  if (!preview) return null;
  if ("error" in preview)
    return (
      <p class="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
        {preview.error}
      </p>
    );
  const what = preview.target === "variant" ? "version(s)" : "fiche(s)";
  return (
    <div class="flex flex-col gap-2">
      <div class="text-sm font-medium">
        {preview.total} {what} concernée(s){preview.total > preview.matches.length ? ` (${preview.matches.length} premières)` : ""}
      </div>
      <pre class="max-h-80 overflow-auto rounded-md bg-muted p-3 font-mono text-xs">{preview.matches.join("\n")}</pre>
    </div>
  );
}

/** Rules changed since the last `filters` step: the catalogue does not follow them yet. */
function PendingBanner({ busy }: { busy: boolean }) {
  return (
    <div class="flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm" role="status">
      <span class="min-w-0 flex-1 text-amber-300">
        Règles modifiées depuis le dernier passage : le catalogue ne les suit pas encore. Elles s'appliquent à l'étape « Masquage », au
        prochain traitement planifié ou maintenant.
      </span>
      <form method="post" action="/admin/jobs/pipeline">
        <input type="hidden" name="from" value="filters" />
        <button class="btn" data-variant="secondary" data-size="sm" disabled={busy}>
          <Icon name={busy ? "loader" : "play"} cls={busy ? "size-4 animate-spin" : ""} />
          {busy ? "Traitement en cours…" : "Appliquer (passage à partir de « Masquage »)"}
        </button>
      </form>
    </div>
  );
}

export function RulesView({ rules, pending, busy }: { rules: FilterRule[]; pending: boolean; busy: boolean }) {
  return (
    <>
      <Title
        t="Règles de masquage"
        sub="Une requête du langage de recherche par règle, pour un type ; ce qui correspond à une règle active est masqué, à l'étape « Masquage ». Sans champ de version, elle masque la fiche ; avec un champ de version (variant., xtream.), elle masque les versions qui correspondent, dans les fiches que ses autres termes désignent ; une fiche sans version disparaît. Une exception s'écrit dans la requête : variant.langue:vostfr -xtream.catégorie:manga."
      />
      {pending && <PendingBanner busy={busy} />}
      <Card
        title={`Règles (${rules.length})`}
        icon="rules"
        extra={
          <a class="btn" data-variant="primary" data-size="sm" href="/admin/rules/new">
            <Icon name="plus" />
            Nouvelle règle
          </a>
        }
      >
        {/* Grid rows rather than an 8-column table: on a phone the name and the switch share
            the first line, the query and the badges follow; on md+ the columns line up under a header. */}
        <div class="flex flex-col divide-y">
          <div class="grid grid-cols-12 gap-2 pb-2 text-xs text-muted-foreground max-md:hidden">
            <div class="col-span-4">Nom</div>
            <div class="col-span-5">Requête</div>
            <div class="col-span-1">Actif</div>
          </div>
          {rules.length === 0 && <Empty title="Aucune règle." />}
          {rules.map((r) => (
            <div class={`grid grid-cols-[1fr_auto] items-center gap-2 py-3 md:grid-cols-12 ${r.enabled ? "" : "text-muted-foreground"}`}>
              <div class="order-1 flex min-w-0 items-center gap-2 font-medium md:col-span-4">
                <span class="shrink-0 text-muted-foreground" title={KIND_TITLES[r.kind]}>
                  <Icon name={KIND_ICONS[r.kind]} cls="size-4" />
                </span>
                <span class="min-w-0 break-words">{r.name}</span>
              </div>
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
                />
              </div>
              <div class="order-3 col-span-2 md:col-span-5">
                <code class="font-mono text-xs break-all">{r.query}</code>
              </div>
              <div class="order-last col-span-2 flex gap-1 md:justify-end">
                <a class="btn" data-variant="ghost" data-size="sm" href={`/admin/rules/${r.id}`}>
                  <Icon name="edit" />
                  Éditer
                </a>
                <button
                  type="button"
                  class="btn text-destructive"
                  data-variant="ghost"
                  data-size="sm"
                  hx-post={`/admin/rules/${r.id}/delete`}
                  hx-confirm={`Supprimer la règle « ${r.name} » ?`}
                >
                  <Icon name="trash" />
                  Supprimer
                </button>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

/** A new rule starts with its kind: each has its own fields, and it stays that kind. */
export function KindChoice() {
  return (
    <>
      <Title t="Nouvelle règle" sub="Choisir d'abord le type : chacun a ses champs, et la règle le garde." />
      <div class="flex flex-wrap gap-3">
        {(Object.keys(KIND_TITLES) as Kind[]).map((k) => (
          <a class="btn" data-variant="outline" href={`/admin/rules/new?kind=${k}`}>
            <Icon name={KIND_ICONS[k]} />
            {KIND_TITLES[k]}
          </a>
        ))}
      </div>
    </>
  );
}

/** One rule, new or existing, on a page of its own: its form, the preview of what it matches, the help. */
export function RulePage({ kind, rule }: { kind: Kind; rule?: FilterRule }) {
  return (
    <>
      <Title
        t={rule ? rule.name : `Nouvelle règle · ${KIND_TITLES[kind]}`}
        sub="Sans champ de version, la règle masque la fiche ; avec un champ de version (variant., xtream.), elle masque les versions qui correspondent, dans les fiches que ses autres termes désignent. « Prévisualiser » montre ce qu'elle touche ; enregistrée, elle s'applique à l'étape « Masquage »."
      />
      <Card title={`${rule ? "Modifier la règle" : "Nouvelle règle"} · ${KIND_TITLES[kind]}`} icon={KIND_ICONS[kind]}>
        <RuleForm kind={kind} rule={rule} />
      </Card>
    </>
  );
}
