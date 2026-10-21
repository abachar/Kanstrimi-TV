import type { ProfileFilter, Kind, Profile } from "@/db";
import { KINDS } from "@/db";
import { PROFILE_QUALITIES, type FilterPreview as Preview } from "@/catalog";
import { Title, Card, Busy, Badge, Empty } from "../ui";
import { fmt } from "../format";
import { KIND_ICONS, KIND_TITLES } from "../labels";
import { Icon } from "../icons";
import { QueryHelp } from "../catalog/search-bar";

/** The assets the avatar field needs: Cropper.js and the glue that fills the hidden field (`assets/avatar.js`). */
export const AVATAR_ASSETS = ["cropper.min.css", "cropper.min.js", "avatar.js"];

const PLACEHOLDER: Record<Kind, string> = {
  live: 'marché:"fr" || pays:maroc',
  vod: 'variant.langue:"vf","vo"',
  series: 'variant.langue:"vf","vo"',
};

/** A query typed and refused: the form shows it again with what is wrong. */
export type Draft = { kind: Kind; query: string; error: string };

export const avatarUrl = (p: Profile) => `/img/avatars/${p.id}.webp?v=${p.avatarVersion}`;

const Avatar = ({ p, size }: { p: Profile; size: number }) => (
  <img src={avatarUrl(p)} alt="" width={size} height={size} class="shrink-0 rounded-full bg-muted object-cover" />
);

/**
 * A picture to choose and crop square: the file input shows the image, Cropper.js frames it, and
 * `avatar.js` writes the crop into the hidden field on submit. `required`: a new profile needs one.
 */
function AvatarField({ required }: { required: boolean }) {
  return (
    <div class="flex flex-col gap-2">
      <label class="label" for="avatar-file">
        Photo {required ? "" : "(laisser vide pour garder l'actuelle)"}
      </label>
      <input class="input" id="avatar-file" type="file" accept="image/*" required={required} />
      <input type="hidden" name="avatar" value="" />
      <div data-stage hidden class="max-w-sm">
        <img data-crop alt="" class="block max-h-80 max-w-full" />
        <p class="mt-1 text-xs text-muted-foreground">Cadrez le carré : il devient l'avatar du profil.</p>
      </div>
    </div>
  );
}

function NewProfileForm({ error }: { error?: string }) {
  return (
    <Card
      title="Nouveau profil"
      icon="plus"
      hint="Un nom et une photo. Le profil ne voit rien tant que l'étape « Filtres » ne l'a pas jugé : elle part dès la création."
    >
      <form method="post" action="/admin/profiles" class="flex flex-col gap-4" data-avatar>
        <div class="flex flex-col gap-2">
          <label class="label" for="new-name">
            Nom
          </label>
          <input class="input max-w-sm" id="new-name" name="name" required maxlength={40} autocomplete="off" />
        </div>
        <AvatarField required />
        {error && (
          <p class="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <div>
          <button class="btn" data-variant="primary">
            <Icon name="plus" />
            Créer le profil
          </button>
        </div>
      </form>
    </Card>
  );
}

export type ProfileLine = { profile: Profile; filters: Partial<Record<Kind, ProfileFilter>>; pending: boolean; judged: boolean };

export function ProfilesView({ rows, error }: { rows: ProfileLine[]; error?: string }) {
  return (
    <>
      <Title
        t="Profils"
        sub="Les personnes du foyer. Chacune a ses filtres, qui disent ce qu'elle voit, ses réglages de lecture, et ce que l'app enregistre pour elle : positions, lectures, versions choisies, « Ma liste », chaînes regardées, films attendus. Le profil par défaut est celui des appareils qui n'en ont pas choisi, du Top Shelf et des écrans de l'admin."
      />
      <Card title="Profils" icon="profiles" extra={fmt(rows.length)}>
        {rows.length === 0 ? (
          <Empty title="Aucun profil" />
        ) : (
          <ul class="flex flex-col divide-y">
            {rows.map(({ profile: p, filters, pending, judged }) => (
              <li class="flex items-start gap-5 py-4">
                <Avatar p={p} size={96} />
                <div class="flex min-w-0 flex-1 flex-col gap-2">
                  <div class="flex flex-wrap items-center gap-2">
                    <a class="font-medium hover:underline" href={`/admin/profiles/${p.id}`}>
                      {p.name}
                    </a>
                    {p.isDefault && <Badge tone="info">par défaut</Badge>}
                    {pending && (
                      <Badge tone="warn" title="Un filtre a changé depuis le dernier jugement">
                        filtres à appliquer
                      </Badge>
                    )}
                    {!judged && (
                      <Badge tone="bad" title="L'étape « Filtres » ne l'a pas encore jugé : il ne voit rien">
                        pas encore jugé
                      </Badge>
                    )}
                  </div>
                  <p class="text-sm text-muted-foreground">
                    {QUALITY_LABELS[p.maxQuality as (typeof PROFILE_QUALITIES)[number]] ?? p.maxQuality} max
                    {p.autoPlayNext ? " · suite automatique" : ""}
                    {p.rememberVersions ? " · versions mémorisées" : ""}
                    {p.switchSourceOnFailure ? " · change de source" : ""}
                  </p>
                  <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                    {(KINDS as readonly Kind[]).map((k) => (
                      <>
                        <dt class="text-muted-foreground">{KIND_TITLES[k]}</dt>
                        <dd class="min-w-0 break-words font-mono text-xs leading-5">
                          {filters[k]?.query || <span class="font-sans text-sm text-muted-foreground">tout</span>}
                        </dd>
                      </>
                    ))}
                  </dl>
                </div>
                <a class="btn" data-variant="outline" data-size="sm" href={`/admin/profiles/${p.id}`}>
                  <Icon name="edit" />
                  Ouvrir
                </a>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <NewProfileForm error={error} />
    </>
  );
}

/** The filter of one kind: its query, saved or being written, its preview and the help of its fields. */
function FilterForm({ p, kind, filter, draft }: { p: Profile; kind: Kind; filter?: ProfileFilter; draft?: Draft }) {
  const pid = `preview-${kind}`;
  return (
    <Card
      title={KIND_TITLES[kind]}
      icon={KIND_ICONS[kind]}
      extra={filter?.query ? undefined : <Badge tone="muted">tout est vu</Badge>}
      hint="Ce qui correspond est vu par ce profil, le reste lui est caché. Vide : pas de filtre, il voit tout."
    >
      <form method="post" action={`/admin/profiles/${p.id}/filters`} class="flex flex-col gap-4">
        <input type="hidden" name="kind" value={kind} />
        <textarea
          class="textarea font-mono"
          name="query"
          rows={3}
          aria-label={`Filtre ${KIND_TITLES[kind]} de ${p.name}`}
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
            hx-post="/admin/profiles/preview"
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

const QUALITY_LABELS: Record<(typeof PROFILE_QUALITIES)[number], string> = { SD: "SD", HD: "HD", FHD: "HD 1080p", "4K": "4K" };

const Switch = ({ name, label, hint, on }: { name: string; label: string; hint?: string; on: boolean }) => (
  <div class="field" data-orientation="horizontal">
    <input class="input" type="checkbox" role="switch" name={name} id={`setting-${name}`} checked={on} />
    <section>
      <label class="label" for={`setting-${name}`}>
        {label}
      </label>
      {hint && <p class="text-sm text-muted-foreground">{hint}</p>}
    </section>
  </div>
);

/** The playback settings the apps show under Réglages › Lecture: the same for this profile on every device. */
function SettingsForm({ p }: { p: Profile }) {
  return (
    <Card
      title="Lecture"
      icon="play"
      hint="Les mêmes réglages sur tous les appareils où ce profil regarde ; l'app les change aussi (Réglages › Lecture). Un téléphone ou une tablette plafonne de lui-même à HD 1080p."
    >
      <form method="post" action={`/admin/profiles/${p.id}/settings`} class="flex flex-col gap-4">
        <div class="field">
          <label class="label" for="setting-max_quality">
            Qualité maximale
          </label>
          <select class="select max-w-xs" id="setting-max_quality" name="max_quality">
            {[...PROFILE_QUALITIES].reverse().map((q) => (
              <option value={q} selected={q === p.maxQuality}>
                {QUALITY_LABELS[q]}
              </option>
            ))}
          </select>
        </div>
        <Switch
          name="auto_play_next"
          label="Lecture automatique de la suite"
          hint="L'épisode suivant, ou la suite proposée, démarre au générique."
          on={p.autoPlayNext}
        />
        <Switch
          name="remember_versions"
          label="Mémoriser la version par titre"
          hint="La version choisie dans le sélecteur est gardée pour le titre (pour une série, pour tous ses épisodes) et rejouée d'office."
          on={p.rememberVersions}
        />
        <Switch name="switch_source_on_failure" label="Changer de source en cas de panne" on={p.switchSourceOnFailure} />
        <div>
          <button class="btn" data-variant="primary">
            <Icon name="save" />
            Enregistrer
          </button>
        </div>
      </form>
    </Card>
  );
}

/** Filters changed since the step last judged this profile: the catalogue does not follow them yet. */
function PendingBanner({ p, judged, busy }: { p: Profile; judged: boolean; busy: boolean }) {
  return (
    <div class="flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm" role="status">
      <span class="min-w-0 flex-1 text-amber-300">
        {judged
          ? "Filtres modifiés depuis le dernier passage : le catalogue de ce profil ne les suit pas encore. Ils s'appliquent à l'étape « Filtres », au prochain traitement planifié ou maintenant."
          : "Profil pas encore jugé : il ne voit rien tant que l'étape « Filtres » n'est pas passée pour lui."}
      </span>
      <form method="post" action={`/admin/profiles/${p.id}/apply`}>
        <button class="btn" data-variant="secondary" data-size="sm" disabled={busy}>
          <Icon name={busy ? "loader" : "play"} cls={busy ? "size-4 animate-spin" : ""} />
          {busy ? "Jugement en cours…" : "Appliquer maintenant (ce profil seul)"}
        </button>
      </form>
    </div>
  );
}

export function ProfileView({
  p,
  filters,
  pending,
  judged,
  busy,
  draft,
  error,
}: {
  p: Profile;
  filters: Partial<Record<Kind, ProfileFilter>>;
  pending: boolean;
  judged: boolean;
  busy: boolean;
  draft?: Draft;
  error?: string;
}) {
  return (
    <>
      <Title
        t={p.name}
        sub="Ses filtres disent ce qu'il voit, un par type, jugés version par version à l'étape « Filtres » ; une fiche sans version gardée lui disparaît. Les langues nommées dans le filtre Films ou Séries, dans l'ordre écrit, sont son ordre de lecture."
        actions={
          <div class="flex flex-wrap gap-2">
            {!p.isDefault && (
              <form method="post" action={`/admin/profiles/${p.id}/default`}>
                <button class="btn" data-variant="outline" data-size="sm">
                  <Icon name="check" />
                  Définir par défaut
                </button>
              </form>
            )}
            {!p.isDefault && (
              <form
                method="post"
                action={`/admin/profiles/${p.id}/delete`}
                hx-post={`/admin/profiles/${p.id}/delete`}
                hx-confirm={`Supprimer le profil ${p.name} ? Ses positions, sa liste et ses films attendus partent avec lui.`}
              >
                <button class="btn" data-variant="destructive" data-size="sm">
                  <Icon name="trash" />
                  Supprimer
                </button>
              </form>
            )}
          </div>
        }
      />
      {(pending || !judged) && <PendingBanner p={p} judged={judged} busy={busy} />}
      <Card title="Identité" icon="profiles" extra={p.isDefault ? <Badge tone="info">par défaut</Badge> : undefined}>
        <form method="post" action={`/admin/profiles/${p.id}`} class="flex flex-col gap-4 sm:flex-row sm:items-start" data-avatar>
          <Avatar p={p} size={96} />
          <div class="flex flex-1 flex-col gap-4">
            <div class="flex flex-col gap-2">
              <label class="label" for="name">
                Nom
              </label>
              <input class="input max-w-sm" id="name" name="name" value={p.name} required maxlength={40} autocomplete="off" />
            </div>
            <AvatarField required={false} />
            {error && (
              <p class="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            <div>
              <button class="btn" data-variant="primary">
                <Icon name="save" />
                Enregistrer
              </button>
            </div>
          </div>
        </form>
      </Card>
      <SettingsForm p={p} />
      {(KINDS as readonly Kind[]).map((kind) => (
        <FilterForm p={p} kind={kind} filter={filters[kind]} draft={draft?.kind === kind ? draft : undefined} />
      ))}
    </>
  );
}
