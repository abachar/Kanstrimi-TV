# Déploiement — Fedora CoreOS

Fichiers à déposer sur la machine cible. Remplacer `<owner>`, `<reseau-postgres>`,
`<reseau-caddy>` et `tv.exemple.fr`.

| Fichier | Destination |
|---|---|
| `kanstrimi-data.volume` | `/etc/containers/systemd/` |
| `kanstrimi-migrate.container` | `/etc/containers/systemd/` |
| `kanstrimi.container` | `/etc/containers/systemd/` |
| `55-kanstrimi-updates.toml` | `/etc/zincati/config.d/` |
| `Caddyfile.snippet` | à fusionner dans le Caddyfile existant |

## 1. Secrets podman

⚠️ `printf '%s'` et jamais `echo` : le `\n` final rendrait le hash inutilisable
par `bcrypt.compare` et **toute connexion échouerait**, sans message clair.

```bash
# Hash du mot de passe admin, généré depuis l'image (Node n'existe pas sur FCOS)
sudo podman run --rm ghcr.io/<owner>/kanstrimi-server:latest \
  node --import tsx scripts/hash-password.ts 'MON_MOT_DE_PASSE'
printf '%s' '$2b$10$...' | sudo podman secret create kanstrimi-admin-hash -

openssl rand -base64 48 | tr -d '\n' | sudo podman secret create kanstrimi-session-secret -

PGPW=$(openssl rand -hex 24)   # hexadécimal : aucun caractère à encoder dans l'URL
printf '%s' "postgres://kanstrimi:${PGPW}@postgres:5432/kanstrimi_db" \
  | sudo podman secret create kanstrimi-db-url -
echo "PGPW=$PGPW"
```

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
