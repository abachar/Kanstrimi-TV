import type { Kind, ProviderAccount } from "@/db";
import { isAccountComplete } from "@/config";
import { Badge, Busy, Card, Empty, Title } from "../ui";
import { Icon } from "../icons";
import { fmt } from "../format";

export type AccountLine = { account: ProviderAccount; counts: Record<Kind, number> };

/** The fields of an account; `a` fills them for an edit, none for a new one. */
function Fields({ a, prefix }: { a?: ProviderAccount; prefix: string }) {
  const F = ({
    name,
    label,
    type = "text",
    col = "",
    hint,
  }: {
    name: keyof ProviderAccount;
    label: string;
    type?: string;
    col?: string;
    hint?: string;
  }) => (
    <div class={`field ${col}`}>
      <label class="label" for={`${prefix}-${name}`}>
        {label}
      </label>
      <input
        class="input"
        id={`${prefix}-${name}`}
        name={name}
        type={type}
        value={a ? String(a[name] ?? "") : ""}
        required
        maxlength={name === "name" ? 40 : undefined}
        autocomplete="off"
        aria-describedby={hint ? `${prefix}-${name}-hint` : undefined}
      />
      {hint && (
        <p class="text-sm text-muted-foreground" id={`${prefix}-${name}-hint`}>
          {hint}
        </p>
      )}
    </div>
  );
  return (
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
      <F name="name" label="Nom" hint="Ce que l'app affiche sur chaque source : « 4K », « Backup »…" />
      <F name="url" label="URL" hint="http://hôte:port, sans chemin" />
      <F name="username" label="Utilisateur" />
      <F name="password" label="Mot de passe" />
    </div>
  );
}

const total = (c: Record<Kind, number>) => c.live + c.vod + c.series;

function AccountRow({ line, index, count }: { line: AccountLine; index: number; count: number }) {
  const { account: a, counts } = line;
  const complete = isAccountComplete(a);
  const target = `test-${a.id}`;
  return (
    <li class="flex flex-col gap-3 py-3 first:pt-0 last:pb-0">
      <div class="flex flex-wrap items-center gap-3">
        <form class="flex items-center" hx-post={`/admin/providers/${a.id}/enabled`} hx-trigger="change" hx-swap="none">
          <input
            class="input"
            type="checkbox"
            role="switch"
            name="enabled"
            checked={a.enabled}
            aria-label={`Activer ${a.name}`}
            disabled={!complete}
          />
        </form>
        <div class="flex min-w-0 flex-1 flex-col">
          <span class={`truncate font-medium ${a.enabled ? "" : "text-muted-foreground"}`}>
            {a.name}
            {index === 0 && a.enabled && (
              <span class="ms-2 align-middle">
                <Badge tone="ok">préféré</Badge>
              </span>
            )}
            {!a.enabled && (
              <span class="ms-2 align-middle">
                <Badge tone="muted">désactivé</Badge>
              </span>
            )}
            {!complete && (
              <span class="ms-2 align-middle">
                <Badge tone="warn">à compléter</Badge>
              </span>
            )}
          </span>
          <span class="truncate text-sm text-muted-foreground" title={a.url}>
            {a.url || "URL manquante"} · {a.username || "utilisateur manquant"}
            {total(counts) ? ` · ${fmt(counts.live)} chaînes, ${fmt(counts.vod)} films, ${fmt(counts.series)} séries` : " · rien d'importé"}
          </span>
        </div>
        <div class="flex shrink-0 gap-1">
          <form method="post" action={`/admin/providers/${a.id}/up`}>
            <button class="btn" data-variant="ghost" data-size="icon-sm" title="Préférer" aria-label="Monter" disabled={index === 0}>
              <Icon name="arrow-up" />
            </button>
          </form>
          <form method="post" action={`/admin/providers/${a.id}/down`}>
            <button
              class="btn"
              data-variant="ghost"
              data-size="icon-sm"
              title="Reléguer"
              aria-label="Descendre"
              disabled={index === count - 1}
            >
              <Icon name="arrow-down" />
            </button>
          </form>
          <button
            type="button"
            class="btn"
            data-variant="ghost"
            data-size="icon-sm"
            title="Tester la connexion"
            aria-label="Tester la connexion"
            hx-post={`/admin/providers/${a.id}/test`}
            hx-target={`#${target}`}
            hx-disabled-elt="this"
            hx-indicator={`#${target}-busy`}
            disabled={!complete}
          >
            <Icon name="test" />
          </button>
          <form
            method="post"
            action={`/admin/providers/${a.id}/delete`}
            hx-post={`/admin/providers/${a.id}/delete`}
            hx-confirm={`Supprimer ${a.name} ? Ses ${fmt(total(counts))} entrées quittent le catalogue ; un titre que lui seul avait disparaît de l'app.`}
          >
            <button class="btn" data-variant="ghost" data-size="icon-sm" title="Supprimer" aria-label="Supprimer">
              <Icon name="trash" />
            </button>
          </form>
        </div>
      </div>
      <div class="flex items-center gap-2 text-sm empty:hidden">
        <Busy id={`${target}-busy`} label="Test en cours" />
        <span id={target} aria-live="polite"></span>
      </div>
      <details class="group/e">
        <summary class="flex cursor-pointer list-none items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <Icon name="chevron-right" cls="size-4 transition-transform group-open/e:rotate-90" />
          Modifier
        </summary>
        <form method="post" action={`/admin/providers/${a.id}`} class="mt-3 flex flex-col gap-4">
          <Fields a={a} prefix={`a${a.id}`} />
          <div>
            <button class="btn">
              <Icon name="save" />
              Enregistrer
            </button>
          </div>
        </form>
      </details>
    </li>
  );
}

export function ProvidersView({ lines }: { lines: AccountLine[] }) {
  return (
    <>
      <Title
        t="Fournisseurs"
        sub="Les comptes Xtream, dans l'ordre de préférence : le premier joue par défaut, les autres sont des sources de secours dans « Versions »."
      />
      <div class="flex flex-col gap-6">
        <Card
          title="Comptes"
          icon="server"
          extra={fmt(lines.length)}
          hint="Le traitement complet importe chaque compte actif ; un titre présent chez plusieurs n'apparaît qu'une fois, avec une source par fournisseur. Désactivé : son catalogue reste en base, plus servi. Supprimé : tout ce qu'il a apporté disparaît."
        >
          {lines.length === 0 ? (
            <Empty title="Aucun fournisseur" sub="Ajoutez un compte ci-dessous, puis lancez le traitement complet." />
          ) : (
            <ol class="flex flex-col divide-y">
              {lines.map((line, i) => (
                <AccountRow line={line} index={i} count={lines.length} />
              ))}
            </ol>
          )}
        </Card>
        <Card
          title="Nouveau fournisseur"
          icon="plus"
          hint="Le mot de passe est gardé en clair : l'app le reçoit de toute façon dans chaque URL de flux."
        >
          <form method="post" action="/admin/providers" class="flex flex-col gap-4">
            <Fields prefix="new" />
            <div>
              <button class="btn">
                <Icon name="plus" />
                Ajouter
              </button>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}
