export function LoginView({ locked, error, next }: { locked: boolean; error?: string; next?: string }) {
  return (
    <section class="card w-full max-w-sm">
      <header>
        <h2>Connexion</h2>
        {locked && (
          <p>Serveur verrouillé depuis le redémarrage : le mot de passe déchiffre les identifiants et relance la planification.</p>
        )}
      </header>
      <section class="flex flex-col gap-4">
        {error && (
          <div class="alert" data-variant="destructive" role="alert">
            <h2>{error}</h2>
          </div>
        )}
        <form method="post" action={next ? `/admin/login?next=${encodeURIComponent(next)}` : "/admin/login"} class="flex flex-col gap-4">
          <div class="field">
            <label class="label" for="email">
              E-mail
            </label>
            <input class="input" type="email" name="email" id="email" autocomplete="username" required autofocus />
          </div>
          <div class="field">
            <label class="label" for="password">
              Mot de passe
            </label>
            <input class="input" type="password" name="password" id="password" autocomplete="current-password" required />
          </div>
          <button class="btn" data-variant="primary">
            Se connecter
          </button>
        </form>
      </section>
    </section>
  );
}
