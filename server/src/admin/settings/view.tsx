import type { Settings } from "@/config";
import { describeCron } from "../format";
import { Title, Card, Busy } from "../ui";

export function SettingsView({ s }: { s: Settings }) {
  const F = ({
    name,
    label,
    type = "text",
    hint,
    col = "col-12 col-md-4",
  }: {
    name: keyof Settings;
    label: string;
    type?: string;
    hint?: string;
    col?: string;
  }) => (
    <div class={col}>
      <label class="form-label" for={`f-${name}`}>
        {label}
      </label>
      <input
        class="form-control"
        id={`f-${name}`}
        name={name}
        type={type}
        value={s[name]}
        aria-describedby={hint ? `f-${name}-hint` : undefined}
        autocomplete={type === "password" ? "off" : undefined}
      />
      {hint && (
        <div class="form-text" id={`f-${name}-hint`}>
          {hint}
        </div>
      )}
    </div>
  );
  /** htmx test buttons: the answer lands in `#target`, the spinner shows meanwhile. */
  const Test = ({ url, target, label }: { url: string; target: string; label: string }) => (
    <div class="mt-3 d-flex flex-wrap align-items-center gap-2">
      <button
        type="button"
        class="btn btn-outline-secondary btn-sm"
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
      <form method="post" action="/admin/settings">
        <Card title="Serveur Xtream (source)">
          <div class="row g-3">
            <F name="xtream_url" label="URL" hint="http://host:port" />
            <F name="xtream_username" label="Utilisateur" />
            <F name="xtream_password" label="Mot de passe" type="password" />
          </div>
          <Test url="/admin/settings/test-xtream" target="xt-result" label="Tester la connexion" />
        </Card>
        <Card
          title="Application Apple"
          hint="Les appareils s'appairent par QR code (page Appareils) ; les flux passent par ce serveur (302), les identifiants Xtream ne sont jamais transmis."
        >
          <div class="row g-3">
            <F
              name="public_base_url"
              label="URL publique de ce serveur"
              hint="Optionnel, ex : https://kanstrimi.example.org — utilisée dans le QR code d'appairage et les liens de lecture"
              col="col-12 col-md-6"
            />
          </div>
          <div class="form-check mt-3">
            <input class="form-check-input" type="checkbox" name="serve_adult" id="serve-adult" checked={s.serve_adult === "1"} />
            <label class="form-check-label" for="serve-adult">
              Servir les contenus adultes à l'application Apple
            </label>
            <div class="form-text">
              Désactivé : les contenus marqués adultes par TMDB ou par la catégorie du fournisseur disparaissent de l'accueil, des listes,
              de la recherche et des fiches. L'API Xtream n'est pas concernée : ses règles de filtrage s'appliquent seules.
            </div>
          </div>
        </Card>
        <Card title="Planification" hint="Cron à 5 champs : minute, heure, jour, mois, jour de la semaine.">
          <div class="row g-3">
            <F
              name="sync_cron"
              label="Traitement complet (source → filtres → TMDB)"
              hint={describeCron(s.sync_cron)}
              col="col-12 col-md-6"
            />
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
        <div class="d-grid d-md-block mb-4">
          <button class="btn btn-primary">Enregistrer</button>
        </div>
      </form>

      <div class="row g-3">
        <div class="col-12 col-md-6">
          <Card title="Mot de passe">
            <p class="text-secondary small mb-0">
              Défini par <code>ADMIN_PASSWORD_HASH</code> dans <code>.env</code> (<code>npm run hash-password -- &lt;mot-de-passe&gt;</code>
              ). Il chiffre les identifiants Xtream et la clé TMDB en base : en cas de changement, ressaisissez-les ici.
            </p>
          </Card>
        </div>
        <div class="col-12 col-md-6">
          <form method="post" action="/admin/settings/retry-unmatched" class="mb-3">
            <Card title="Retenter les introuvables">
              <p class="text-secondary small">
                Remet en attente les seuls éléments que TMDB n'a pas trouvés, pour profiter d'une règle améliorée ou de nouvelles fiches.
                Relancer ensuite l'étape 3.
              </p>
              <button class="btn btn-outline-secondary btn-sm">Retenter les introuvables</button>
            </Card>
          </form>
          <form
            method="post"
            action="/admin/settings/reset-matches"
            onsubmit="return confirm('Réinitialiser tous les matchings automatiques ?')"
          >
            <Card title="Réinitialiser le matching TMDB">
              <p class="text-secondary small">
                Remet tous les éléments (sauf associations manuelles) en attente. Relancer ensuite l'étape 3.
              </p>
              <div class="form-check mb-2">
                <input class="form-check-input" type="checkbox" name="overrides" id="reset-overrides" />
                <label class="form-check-label small" for="reset-overrides">
                  Effacer aussi les fusions et séparations manuelles de groupes
                </label>
              </div>
              <button class="btn btn-outline-danger btn-sm">Réinitialiser le matching</button>
            </Card>
          </form>
        </div>
      </div>
    </>
  );
}
