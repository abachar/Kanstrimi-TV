import type { Settings } from "@/config";
import { describeCron } from "../format";
import { Title, Card, Busy } from "../ui";

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
        {label}
      </button>
      <Busy id={`${target}-busy`} label="Test en cours" />
      <span id={target} aria-live="polite"></span>
    </div>
  );
  return (
    <>
      <Title t="Paramètres" sub="Source Xtream, compte client, TMDB, planification, sécurité" />
      <form method="post" action="/admin/settings" class="flex flex-col gap-6">
        <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card title="Serveur Xtream (source)">
            <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
              <F name="xtream_url" label="URL" hint="http://host:port" col="md:col-span-2" />
              <F name="xtream_username" label="Utilisateur" />
              <F name="xtream_password" label="Mot de passe" type="password" />
            </div>
            <Test url="/admin/settings/test-xtream" target="xt-result" label="Tester la connexion" />
          </Card>
          <Card title="TMDB">
            <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
              <F name="tmdb_api_key" label="Clé API (v3) ou token v4" type="password" col="md:col-span-2" />
              <F name="tmdb_language" label="Langue" hint="fr-FR, en-US…" />
            </div>
            <Test url="/admin/settings/test-tmdb" target="tm-result" label="Tester TMDB" />
          </Card>
          <Card
            title="Application Apple"
            hint="Les appareils s'appairent par QR code (page Appareils) ; les flux passent par ce serveur (302), les identifiants Xtream ne sont jamais transmis."
          >
            <div class="flex flex-col gap-4">
              <F
                name="public_base_url"
                label="URL publique de ce serveur"
                hint="Optionnel, ex : https://kanstrimi.example.org — utilisée dans le QR code d'appairage et les liens de lecture"
              />
              <div class="field" data-orientation="horizontal">
                <input class="input" type="checkbox" role="switch" name="serve_adult" id="serve-adult" checked={s.serve_adult === "1"} />
                <section>
                  <label class="label" for="serve-adult">
                    Servir les contenus adultes à l'application Apple
                  </label>
                  <p class="text-sm text-muted-foreground">
                    Désactivé : les contenus marqués adultes par TMDB ou par la catégorie du fournisseur disparaissent de l'accueil, des
                    listes, de la recherche et des fiches. L'API Xtream n'est pas concernée : ses règles de filtrage s'appliquent seules.
                  </p>
                </section>
              </div>
            </div>
          </Card>
          <Card title="Planification" hint="Cron à 5 champs : minute, heure, jour, mois, jour de la semaine.">
            <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
              <F name="sync_cron" label="Traitement complet" hint={describeCron(s.sync_cron)} />
              <F name="epg_cron" label="Reconstruction EPG" hint={describeCron(s.epg_cron)} />
            </div>
          </Card>
        </div>
        <div class="grid md:flex md:justify-end">
          <button class="btn" data-variant="primary">
            Enregistrer
          </button>
        </div>
      </form>

      <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card title="Mot de passe">
          <p class="text-sm text-muted-foreground">
            Défini par <code class="font-mono text-foreground">ADMIN_PASSWORD_HASH</code> dans{" "}
            <code class="font-mono text-foreground">.env</code> (
            <code class="font-mono text-foreground">npm run hash-password -- &lt;mot-de-passe&gt;</code>
            ). Il chiffre les identifiants Xtream et la clé TMDB en base : en cas de changement, ressaisissez-les ici.
          </p>
        </Card>
        <form method="post" action="/admin/settings/retry-unmatched">
          <Card title="Retenter les introuvables">
            <div class="flex flex-col items-start gap-4">
              <p class="text-sm text-muted-foreground">
                Remet en attente les seuls éléments que TMDB n'a pas trouvés, pour profiter d'une règle améliorée ou de nouvelles fiches.
                Relancer ensuite l'étape 3.
              </p>
              <button class="btn" data-variant="outline" data-size="sm">
                Retenter les introuvables
              </button>
            </div>
          </Card>
        </form>
        <form
          method="post"
          action="/admin/settings/reset-matches"
          onsubmit="return confirm('Réinitialiser tous les matchings automatiques ?')"
        >
          <Card title="Réinitialiser le matching TMDB">
            <div class="flex flex-col items-start gap-4">
              <p class="text-sm text-muted-foreground">
                Remet tous les éléments (sauf associations manuelles) en attente. Relancer ensuite l'étape 3.
              </p>
              <div class="field" data-orientation="horizontal">
                <input class="input" type="checkbox" name="overrides" id="reset-overrides" />
                <label class="label font-normal" for="reset-overrides">
                  Effacer aussi les fusions et séparations manuelles de groupes
                </label>
              </div>
              <button class="btn" data-variant="destructive" data-size="sm">
                Réinitialiser le matching
              </button>
            </div>
          </Card>
        </form>
      </div>
    </>
  );
}
