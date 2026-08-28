# Déploiement — Fedora CoreOS

Image : `ghcr.io/<owner>/kanstrimi`. Remplacer `<owner>`, `<reseau-postgres>`,
`<reseau-caddy>` et `tv.exemple.fr` dans les fichiers.

| Fichier | Destination |
|---|---|
| `kanstrimi.env.example` | `/etc/kanstrimi/kanstrimi.env` (chmod 600) |
| `kanstrimi-data.volume` | `/etc/containers/systemd/` |
| `kanstrimi-migrate.container` | `/etc/containers/systemd/` |
| `kanstrimi.container` | `/etc/containers/systemd/` |
| `55-kanstrimi-updates.toml` | `/etc/zincati/config.d/` |
| `Caddyfile.snippet` | à fusionner dans le Caddyfile existant |

## 1. Configuration

Cinq variables, toutes passées par `/etc/kanstrimi/kanstrimi.env` :
`ADMIN_PASSWORD_HASH`, `DATABASE_URL`, `SESSION_SECRET`, `PORT`, `DATA_DIR`.

```bash
sudo install -d -m 0700 /etc/kanstrimi

# Hash du mot de passe admin, généré depuis l'image (Node n'existe pas sur FCOS).
sudo podman run --rm ghcr.io/<owner>/kanstrimi \
  node -e "const b=require('bcryptjs');console.log(b.hashSync(process.argv[1],10))" 'MON_MOT_DE_PASSE'

PGPW=$(openssl rand -hex 24)      # hexadécimal : aucun caractère à encoder dans l'URL
SESSION=$(openssl rand -base64 48 | tr -d '\n')

sudo tee /etc/kanstrimi/kanstrimi.env >/dev/null <<ENV
ADMIN_PASSWORD_HASH=<le hash ci-dessus>
DATABASE_URL=postgres://kanstrimi:${PGPW}@postgres:5432/kanstrimi_db
SESSION_SECRET=${SESSION}
PORT=3000
DATA_DIR=/var/lib/kanstrimi
ENV
sudo chmod 600 /etc/kanstrimi/kanstrimi.env
echo "PGPW=$PGPW"   # à réutiliser à l'étape 2
```

⚠️ Le hash bcrypt contient des `$`. Après le premier démarrage, **vérifier qu'il est
arrivé intact** — selon la version, podman peut interpréter les `$` d'un `--env-file` :

```bash
sudo podman exec kanstrimi node -e \
  "const h=process.env.ADMIN_PASSWORD_HASH;console.log(h && h.length===60 && /^\\\$2[aby]\\\$/.test(h) ? 'hash OK' : 'HASH INVALIDE: '+JSON.stringify(h))"
```

Si le hash est mutilé, basculer sur des secrets podman — la variante est en commentaire
dans `kanstrimi.container` :

```bash
printf '%s' '$2b$10$...' | sudo podman secret create kanstrimi-admin-hash -
```

`printf '%s'` et jamais `echo` : le `\n` final rendrait le hash inutilisable par
`bcrypt.compare` et **toute connexion échouerait** sans message clair.

## 2. Base dans le conteneur Postgres existant

```bash
sudo podman exec -i postgres psql -U postgres <<SQL
CREATE ROLE kanstrimi LOGIN PASSWORD 'REMPLACER_PAR_PGPW';
CREATE DATABASE kanstrimi_db OWNER kanstrimi;
SQL

# Postgres 15+ : sans ceci, les CREATE TYPE de la migration 0000 échouent
# avec "permission denied for schema public".
sudo podman exec -i postgres psql -U postgres -d kanstrimi_db <<SQL
ALTER SCHEMA public OWNER TO kanstrimi;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT ALL ON SCHEMA public TO kanstrimi;
SQL
```

## 3. Activation

```bash
sudo /usr/libexec/podman/quadlet -dryrun -v   # Quadlet est silencieux sur ses erreurs
sudo systemctl daemon-reload
sudo systemctl start kanstrimi.service        # déclenche kanstrimi-migrate au passage
sudo journalctl -u kanstrimi-migrate -u kanstrimi -f
sudo systemctl enable --now podman-auto-update.timer
```

`systemctl enable kanstrimi.service` est impossible (unité générée) : le démarrage au
boot vient de `[Install] WantedBy=multi-user.target` dans le `.container`.

## 4. Après installation

Dans `/admin` → Paramètres, renseigner **`public_base_url`** avec l'URL publique exacte :
elle construit les URLs d'images et de flux que les players mémorisent.

Après un redémarrage de la machine, le coffre est verrouillé : la planification est en
pause et l'admin redemande le mot de passe, mais l'API Xtream répond normalement dès la
première requête d'un player (elle déverrouille au passage). `/api/health` expose l'état
dans son champ `unlocked`, sans changer le code HTTP.

## 5. Mise à jour

`podman-auto-update.timer` tire la nouvelle image `:latest` et redémarre le service ;
les migrations sont rejouées avant, `kanstrimi-migrate` n'ayant pas `RemainAfterExit`.
Manuellement : `sudo podman auto-update`.
