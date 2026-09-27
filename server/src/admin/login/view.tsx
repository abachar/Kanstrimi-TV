export function LoginView({ locked, error, next }: { locked: boolean; error?: string; next?: string }) {
  return (
    <div class="col-12 col-sm-8 col-md-5 col-lg-4 mx-auto mt-5">
      <div class="card">
        <div class="card-body">
          <h2 class="h4 mb-3">Connexion</h2>
          {locked && (
            <p class="text-secondary small">
              Serveur verrouillé depuis le redémarrage : le mot de passe déchiffre les identifiants et relance la planification.
            </p>
          )}
          {error && (
            <div class="alert alert-danger" role="alert">
              {error}
            </div>
          )}
          <form method="post" action={next ? `/admin/login?next=${encodeURIComponent(next)}` : "/admin/login"} class="vstack gap-2">
            <label class="visually-hidden" for="password">
              Mot de passe
            </label>
            <input
              class="form-control"
              type="password"
              name="password"
              id="password"
              placeholder="Mot de passe"
              autocomplete="current-password"
              required
              autofocus
            />
            <button class="btn btn-primary">Se connecter</button>
          </form>
        </div>
      </div>
    </div>
  );
}
