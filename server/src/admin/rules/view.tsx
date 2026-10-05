import type { FilterRule } from "@/db";
import type { RulePreview as Preview } from "@/catalog";
import { Title, Card, Options, Busy, Badge, Empty } from "../ui";
import { KIND_LABELS } from "../labels";
import { fmt } from "../format";
import { QueryHelp } from "../catalog/search-bar";

export function RuleForm({ rule, preview }: { rule?: FilterRule; preview?: Preview }) {
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
      <div class="grid grid-cols-2 gap-3 md:grid-cols-6">
        <div class="field col-span-2 gap-2 md:col-span-3">
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
          col="md:col-span-1"
        />
        <Sel
          name="action"
          label="Action"
          opts={[
            ["hide", "Masquer"],
            ["keep", "Garder seulement"],
          ]}
          cur={rule?.action ?? "hide"}
          col="md:col-span-1"
        />
        <div class="field gap-2 md:col-span-1">
          <label class="label" for={`position-${uid}`}>
            Position
          </label>
          <input class="input" id={`position-${uid}`} name="position" type="number" inputmode="numeric" value={rule?.position ?? 0} />
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
            placeholder='marché:"it", langue-vo:hindi…'
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
      <QueryHelp kind={rule?.kind ?? null} />
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
  return (
    <div class="flex flex-col gap-2">
      <div class="text-sm font-medium">
        {preview.total} fiche(s) concernée(s){preview.total > preview.matches.length ? ` (${preview.matches.length} premières)` : ""}
      </div>
      <pre class="max-h-80 overflow-auto rounded-md bg-muted p-3 font-mono text-xs">{preview.matches.join("\n")}</pre>
    </div>
  );
}

/**
 * Rules or languages changed since the last pass: the catalogue does not follow them yet. The rules apply
 * at « Filtres »; the languages at « Groupement », which comes before and runs the filters after it.
 */
function PendingBanner({ busy, what }: { busy: boolean; what: "rules" | "languages" }) {
  const [from, step] = what === "languages" ? ["group", "Groupement"] : ["filters", "Filtres"];
  return (
    <div class="flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm" role="status">
      <span class="min-w-0 flex-1 text-amber-300">
        {what === "languages" ? "Langues servies" : "Règles"} modifiées depuis le dernier passage : le catalogue ne les suit pas encore.
        Elles s'appliquent à l'étape « {step} », au prochain traitement planifié ou maintenant.
      </span>
      <form method="post" action="/admin/jobs/pipeline">
        <input type="hidden" name="from" value={from} />
        <button class="btn" data-variant="secondary" data-size="sm" disabled={busy}>
          {busy ? "Traitement en cours…" : `Appliquer (passage à partir de « ${step} »)`}
        </button>
      </form>
    </div>
  );
}

/**
 * The served languages of films and series: one box per language of the catalogue, with its number of
 * variants. A variant in another language is hidden; a title in none of them disappears. Channels are
 * left out: their « language » is their market's, the rules choose them.
 */
function LanguagesCard({ languages, served }: { languages: { lang: string; variants: number }[]; served: string[] }) {
  return (
    <form method="post" action="/admin/rules/languages" class="grid">
      <Card
        title="Langues servies (films et séries)"
        hint="Une variante dans une autre langue est masquée ; un titre qui n'existe dans aucune langue servie disparaît. Le direct n'est pas concerné : ses règles choisissent les marchés."
      >
        <div class="flex flex-col gap-4">
          <div class="flex flex-wrap gap-x-6 gap-y-2">
            {languages.map(({ lang, variants }) => (
              <label class="label gap-2 font-normal">
                <input class="input" type="checkbox" name="lang" value={lang} checked={!served.length || served.includes(lang)} />
                {lang} <span class="text-muted-foreground tabular-nums">{fmt(variants)}</span>
              </label>
            ))}
          </div>
          <div>
            <button class="btn" data-variant="primary">
              Enregistrer les langues
            </button>
          </div>
        </div>
      </Card>
    </form>
  );
}

export function RulesView({
  rules,
  pending,
  languagesPending,
  busy,
  languages,
  served,
}: {
  rules: FilterRule[];
  pending: boolean;
  languagesPending: boolean;
  busy: boolean;
  languages: { lang: string; variants: number }[];
  served: string[];
}) {
  return (
    <>
      <Title
        t="Règles de filtrage"
        sub="Une requête du langage de recherche par règle, qui juge les fiches (chaînes, films, séries) à l'étape « Filtres », après le groupement. La dernière règle qui correspond l'emporte ; une règle « garder » ne garde que ce qui correspond, pour son type. Les champs du fournisseur (catégorie, section, édition) servent aux recherches seulement."
      />
      {/* « Groupement » runs the filters after it: one banner says both. */}
      {(languagesPending || pending) && <PendingBanner busy={busy} what={languagesPending ? "languages" : "rules"} />}
      <LanguagesCard languages={languages} served={served} />
      <Card
        title={`Règles (${rules.length})`}
        extra={
          <a class="btn" data-variant="primary" data-size="sm" href="/admin/rules/new">
            Nouvelle règle
          </a>
        }
      >
        {/* Grid rows rather than an 8-column table: on a phone the name and the switch share
            the first line, the regex and the badges follow; on md+ the columns line up under a header. */}
        <div class="flex flex-col divide-y">
          <div class="grid grid-cols-12 gap-2 pb-2 text-xs text-muted-foreground max-md:hidden">
            <div class="col-span-1">#</div>
            <div class="col-span-2">Nom</div>
            <div class="col-span-4">Requête</div>
            <div class="col-span-2">Type · action</div>
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
                  />
                </div>
                <div class="order-3 col-span-2 md:col-span-4">
                  <code class="font-mono text-xs break-all">{r.query}</code>
                </div>
                <div class="order-4 col-span-2 flex flex-wrap gap-1">
                  <span class="md:hidden">
                    <Badge tone="muted" title="Position">
                      #{r.position}
                    </Badge>
                  </span>
                  <Badge>{KIND_LABELS[r.kind ?? "all"]}</Badge>
                  <Badge tone={r.action === "hide" ? "bad" : "ok"}>{r.action === "hide" ? "masque" : "garde"}</Badge>
                </div>
                <div class="order-last col-span-2 flex gap-1 md:justify-end">
                  <a class="btn" data-variant="ghost" data-size="sm" href={`/admin/rules/${r.id}`}>
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
                    Supprimer
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

/** One rule, new or existing, on a page of its own: its form, the preview of what it matches, the help. */
export function RulePage({ rule }: { rule?: FilterRule }) {
  return (
    <>
      <Title
        t={rule ? rule.name : "Nouvelle règle"}
        sub="Une requête qui juge les fiches de son type ; « Prévisualiser » montre celles qu'elle touche. Enregistrée, elle s'applique au prochain passage à partir de « Filtres »."
      />
      <Card title={rule ? "Modifier la règle" : "Nouvelle règle"}>
        <RuleForm rule={rule} />
      </Card>
    </>
  );
}
