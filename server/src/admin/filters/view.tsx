import type { Filter, Kind } from "@/db";
import { KINDS } from "@/db";
import type { FilterPreview as Preview } from "@/catalog";
import { Title, Card, Busy, Badge } from "../ui";
import { fmt } from "../format";
import { KIND_ICONS, KIND_TITLES } from "../labels";
import { Icon } from "../icons";
import { QueryHelp } from "../catalog/search-bar";

const PLACEHOLDER: Record<Kind, string> = {
  live: 'marché:"fr" || pays:maroc',
  vod: 'variant.langue:"vf","vo"',
  series: 'variant.langue:"vf","vo"',
};

/** A query typed and refused: the form shows it again with what is wrong. */
export type Draft = { kind: Kind; query: string; error: string };

/** The filter of one kind: its query, saved or being written, its preview and the help of its fields. */
function FilterForm({ kind, filter, draft }: { kind: Kind; filter?: Filter; draft?: Draft }) {
  const pid = `preview-${kind}`;
  return (
    <Card
      title={KIND_TITLES[kind]}
      icon={KIND_ICONS[kind]}
      extra={filter ? undefined : <Badge tone="muted">tout est gardé</Badge>}
      hint="Ce qui correspond est gardé, le reste est écarté. Vide : pas de filtre, tout est gardé."
    >
      <form method="post" action="/admin/filters" class="flex flex-col gap-4">
        <input type="hidden" name="kind" value={kind} />
        <textarea
          class="textarea font-mono"
          name="query"
          rows={3}
          aria-label={`Filtre ${KIND_TITLES[kind]}`}
          placeholder={PLACEHOLDER[kind]}
          autocapitalize="off"
          autocorrect="off"
          spellcheck={false}
        >
          {draft?.query ?? filter?.query ?? ""}
        </textarea>
        {draft && (
          <p class="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
            {draft.error}
          </p>
        )}
        <div class="flex flex-wrap items-center gap-2">
          <button class="btn" data-variant="primary">
            <Icon name="save" />
            Enregistrer
          </button>
          <button
            type="button"
            class="btn"
            data-variant="outline"
            hx-post="/admin/filters/preview"
            hx-include="closest form"
            hx-target={`#${pid}`}
            hx-disabled-elt="this"
            hx-indicator={`#${pid}-busy`}
          >
            <Icon name="eye" />
            Prévisualiser
          </button>
          <Busy id={`${pid}-busy`} label="Calcul en cours" />
        </div>
        <div id={pid} aria-live="polite"></div>
        <QueryHelp kind={kind} filter />
      </form>
    </Card>
  );
}

const plural = (n: number, word: string) => (n > 1 ? `${word}s` : word);

const Titles = ({ title, total, titles }: { title: string; total: number; titles: string[] }) => (
  <div class="flex min-w-0 flex-col gap-2">
    <div class="text-sm font-medium">
      {title}
      {total > titles.length ? ` (${titles.length} premières)` : ""}
    </div>
    <pre class="max-h-80 overflow-auto rounded-md bg-muted p-3 font-mono text-xs">{titles.join("\n") || "—"}</pre>
  </div>
);

export function FilterPreview({ preview }: { preview: Preview }) {
  if ("error" in preview)
    return (
      <p class="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
        {preview.error}
      </p>
    );
  const left = preview.contents - preview.keptContents;
  return (
    <div class="flex flex-col gap-3">
      <p class="text-sm">
        Garde <span class="font-medium">{fmt(preview.keptContents)}</span> {plural(preview.keptContents, "fiche")} sur{" "}
        {fmt(preview.contents)} ({`${fmt(preview.keptVersions)} ${plural(preview.keptVersions, "version")} sur ${fmt(preview.versions)}`}),
        en écarte {fmt(left)}.
      </p>
      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Titles title="Gardées" total={preview.keptContents} titles={preview.kept} />
        <Titles title="Écartées" total={left} titles={preview.left} />
      </div>
    </div>
  );
}

/** Filters changed since the last `filters` step: the catalogue does not follow them yet. */
function PendingBanner({ busy }: { busy: boolean }) {
  return (
    <div class="flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm" role="status">
      <span class="min-w-0 flex-1 text-amber-300">
        Filtres modifiés depuis le dernier passage : le catalogue ne les suit pas encore. Ils s'appliquent à l'étape « Filtres », au
        prochain traitement planifié ou maintenant.
      </span>
      <form method="post" action="/admin/jobs/pipeline">
        <input type="hidden" name="from" value="filters" />
        <button class="btn" data-variant="secondary" data-size="sm" disabled={busy}>
          <Icon name={busy ? "loader" : "play"} cls={busy ? "size-4 animate-spin" : ""} />
          {busy ? "Traitement en cours…" : "Appliquer (passage à partir de « Filtres »)"}
        </button>
      </form>
    </div>
  );
}

export function FiltersView(p: { filters: Partial<Record<Kind, Filter>>; pending: boolean; busy: boolean; draft?: Draft }) {
  return (
    <>
      <Title
        t="Filtres"
        sub="Un filtre par type dit ce que l'app garde, comme une recherche dit ce qu'elle affiche ; le reste est écarté à l'étape « Filtres ». Il se juge version par version, ses champs de fiche lus sur la fiche de la version : une fiche sans version gardée disparaît."
      />
      {p.pending && <PendingBanner busy={p.busy} />}
      {(KINDS as readonly Kind[]).map((kind) => (
        <FilterForm kind={kind} filter={p.filters[kind]} draft={p.draft?.kind === kind ? p.draft : undefined} />
      ))}
    </>
  );
}
