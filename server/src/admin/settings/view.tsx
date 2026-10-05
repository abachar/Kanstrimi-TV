import type { Settings } from "@/config";
import { describeCron } from "../format";
import { Title, Card, Busy } from "../ui";
import { Icon } from "../icons";

const ENV_HINT = "Variables d'environnement (secrets podman en production) : redémarrer le serveur après un changement.";

export function SettingsView({ s }: { s: Settings }) {
  const F = ({
    name,
    label,
    type = "text",
    hint,
    col = "",
  }: {
    name: keyof Settings;
    label: string;
    type?: string;
    hint?: string;
    col?: string;
  }) => (
    <div class={`field ${col}`}>
      <label class="label" for={`f-${name}`}>
        {label}
      </label>
      <input
        class="input"
        id={`f-${name}`}
        name={name}
        type={type}
        value={s[name]}
        aria-describedby={hint ? `f-${name}-hint` : undefined}
        autocomplete={type === "password" ? "off" : undefined}
      />
      {hint && (
        <p class="text-sm text-muted-foreground" id={`f-${name}-hint`}>
          {hint}
        </p>
      )}
    </div>
  );
  /** A value of the environment, in clear (selectable to copy); never sent back (no `name`). */
  const Env = ({ name, label, col = "" }: { name: keyof Settings; label: string; col?: string }) => (
    <div class={`field ${col}`}>
      <label class="label" for={`e-${name}`}>
        {label} <code class="font-mono text-xs text-muted-foreground">{name.toUpperCase()}</code>
      </label>
      <input class="input font-mono" id={`e-${name}`} readonly value={s[name] || "non défini"} />
    </div>
  );
  /** htmx test buttons: the answer lands in `#target`, the spinner shows meanwhile. */
  const Test = ({ url, target, label }: { url: string; target: string; label: string }) => (
    <div class="mt-4 flex flex-wrap items-center gap-2">
      <button
        type="button"
        class="btn"
        data-variant="outline"
        data-size="sm"
        hx-post={url}
        hx-include="closest form"
        hx-target={`#${target}`}
        hx-disabled-elt="this"
        hx-indicator={`#${target}-busy`}
      >
        <Icon name="test" />
        {label}
      </button>
      <Busy id={`${target}-busy`} label="Test en cours" />
      <span id={target} aria-live="polite"></span>
    </div>
  );
  return (
    <>
      <Title t="Paramètres" sub="Source Xtream, TMDB, clients, planification, sécurité" />
      <form method="post" action="/admin/settings" class="flex flex-col gap-6">
        <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card title="Serveur Xtream (source)" icon="server" hint={ENV_HINT}>
            <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Env name="xtream_url" label="URL" col="md:col-span-2" />
              <Env name="xtream_username" label="Utilisateur" />
              <Env name="xtream_password" label="Mot de passe" />
            </div>
            <Test url="/admin/settings/test-xtream" target="xt-result" label="Tester la connexion" />
          </Card>
          <Card title="TMDB" icon="database">
            <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Env name="tmdb_api_key" label="Clé API (v3) ou token v4" col="md:col-span-2" />
              <F name="tmdb_language" label="Langue" hint="fr-FR, en-US…" />
            </div>
            <Test url="/admin/settings/test-tmdb" target="tm-result" label="Tester TMDB" />
          </Card>
          <Card
            title="Clients"
            icon="clients"
            hint="Les appareils s'appairent par QR code (page Appareils) ; ils lisent les flux chez le fournisseur, avec ses URL : seuls les appareils appairés les reçoivent."
          >
            <div class="flex flex-col gap-4">
              <F
                name="public_base_url"
                label="URL publique de ce serveur"
                hint="Optionnel, ex : https://kanstrimi.example.org — utilisée dans le QR code d'appairage et les liens des images"
              />
              <div class="field" data-orientation="horizontal">
                <input class="input" type="checkbox" role="switch" name="serve_adult" id="serve-adult" checked={s.serve_adult === "1"} />
                <section>
                  <label class="label" for="serve-adult">
                    Servir les contenus adultes à l'application Apple
                  </label>
                  <p class="text-sm text-muted-foreground">
                    Désactivé : les contenus marqués adultes par TMDB ou par la catégorie du fournisseur disparaissent de l'accueil, des
                    listes, de la recherche et des fiches.
                  </p>
                </section>
              </div>
            </div>
          </Card>
          <Card title="Planification" icon="clock" hint="Cron à 5 champs : minute, heure, jour, mois, jour de la semaine.">
            <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
              <F name="sync_cron" label="Traitement complet" hint={describeCron(s.sync_cron)} />
              <F name="epg_cron" label="Import EPG" hint={describeCron(s.epg_cron)} />
              <F name="trending_cron" label="Tendances TMDB" hint={describeCron(s.trending_cron)} />
              <F name="markers_cron" label="Intros et génériques (SkipDB)" hint={describeCron(s.markers_cron)} />
            </div>
          </Card>
        </div>
        <div class="grid md:flex md:justify-end">
          <button class="btn" data-variant="primary">
            <Icon name="save" />
            Enregistrer
          </button>
        </div>
      </form>

      {/* A form around a card is the grid cell: `grid` on it stretches the card to the row's height. */}
      <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <form
          method="post"
          action="/admin/settings/revoke-sessions"
          class="grid"
          hx-post="/admin/settings/revoke-sessions"
          hx-confirm="Déconnecter toutes les sessions, celle-ci comprise ?"
        >
          <Card title="Mot de passe et sessions" icon="key">
            <div class="flex flex-col items-start gap-4">
              <p class="text-sm text-muted-foreground">
                Défini par <code class="font-mono text-foreground">ADMIN_PASSWORD_HASH</code> dans{" "}
                <code class="font-mono text-foreground">.env</code> (
                <code class="font-mono text-foreground">npm run hash-password -- &lt;mot-de-passe&gt;</code>
                ). Un nouveau mot de passe ferme toutes les sessions ; une session dure 30 jours au plus.
              </p>
              <button class="btn" data-variant="outline" data-size="sm">
                <Icon name="logout" />
                Déconnecter toutes les sessions
              </button>
            </div>
          </Card>
        </form>
        <form method="post" action="/admin/settings/retry-unmatched" class="grid">
          <Card title="Retenter les introuvables" icon="retry">
            <div class="flex flex-col items-start gap-4">
              <p class="text-sm text-muted-foreground">
                Remet en attente les seuls éléments que TMDB n'a pas trouvés, pour profiter d'une règle améliorée ou de nouvelles fiches.
                Relancer ensuite le traitement à partir de « enrich ».
              </p>
              <button class="btn" data-variant="outline" data-size="sm">
                <Icon name="retry" />
                Retenter les introuvables
              </button>
            </div>
          </Card>
        </form>
        <form
          method="post"
          action="/admin/settings/reset-matches"
          class="grid"
          hx-post="/admin/settings/reset-matches"
          hx-confirm="Réinitialiser tous les matchings automatiques ?"
        >
          <Card title="Réinitialiser le matching TMDB" icon="reset">
            <div class="flex flex-col items-start gap-4">
              <p class="text-sm text-muted-foreground">
                Remet tous les éléments (sauf associations manuelles) en attente. Relancer ensuite le traitement à partir de « enrich ».
              </p>
              <div class="field" data-orientation="horizontal">
                <input class="input" type="checkbox" name="overrides" id="reset-overrides" />
                <label class="label font-normal" for="reset-overrides">
                  Effacer aussi les fusions et séparations manuelles de groupes
                </label>
              </div>
              <button class="btn" data-variant="destructive" data-size="sm">
                <Icon name="reset" />
                Réinitialiser le matching
              </button>
            </div>
          </Card>
        </form>
      </div>
    </>
  );
}
