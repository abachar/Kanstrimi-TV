# Kanstrimi Server

Serveur central de streaming : se connecte à un fournisseur **Xtream Codes**, importe le catalogue dans Postgres, applique des **règles de filtrage** (regex), **enrichit** films et séries via **TMDB**, et ré-expose le tout via une **API Xtream-compatible** consommée par n'importe quelle app IPTV (TiviMate, Smarters, app Kanstrimi tvOS…).

## Stack
Node 22+ · Hono · TypeScript · Postgres + Drizzle · admin rendue côté serveur (Hono JSX + HTMX + Bootstrap 5) · Vitest. Aucune étape de build.

## Démarrage
```bash
cp .env.example .env         # DATABASE_URL, SESSION_SECRET (32+ chars), DATA_DIR
npm run hash-password -- <mot-de-passe>   # → coller ADMIN_PASSWORD_HASH dans .env
# base : kanstrimi_db (rôle kanstrimi)
npm install
npm run db:migrate              # applique drizzle/*.sql
npm run dev                     # http://localhost:3000/admin  (PORT pour changer)
```
Connexion à `/admin` avec ce mot de passe. Puis **Paramètres** → URL/identifiants Xtream (bouton *Tester*), compte client pour les apps, clé TMDB → **Tableau de bord → Tout enchaîner**.

Production : image conteneur (voir *Déploiement*).

## Traitement en 3 étapes
| Étape | Bouton | Rôle |
|---|---|---|
| 1 | Lire la source | Import catégories + chaînes/films/séries depuis Xtream, suppression des disparus, puis application des règles |
| 2 | Appliquer les filtres | Recalcule la visibilité depuis les règles, sans réseau — relançable à volonté |
| 3 | Enrichir TMDB | Matching des éléments en attente, cache des métadonnées |
| — | EPG | Télécharge le XMLTV amont sur disque |

Chaque étape est indépendante et refusée si déjà en cours. Le cron `sync_cron` enchaîne 1 → 3 ; `epg_cron` gère l'EPG.

## API exposée aux apps
| Route | Rôle |
|---|---|
| `/player_api.php?username=&password=[&action=…]` | API Xtream complète — catalogue filtré et enrichi |
| `/get.php?username=&password=&type=m3u_plus&output=ts` | Playlist M3U |
| `/xmltv.php?username=&password=` | EPG (cache disque, sinon relais) |
| `/live|movie|series/<user>/<pass>/<id>.<ext>` | 302 vers le flux réel (masqué → 404) |
| `/img/<size>/<file>` | Images TMDB mises en cache (`DATA_DIR/images`) |
| `/api/health` | Santé (DB) |

Les apps se connectent avec l'utilisateur client (Paramètres) et **le mot de passe admin**. Les flux passent toujours par ce serveur (302) : les identifiants Xtream ne sont jamais transmis aux apps.

## Sécurité des secrets
- Un seul mot de passe (admin web = compte client IPTV), stocké uniquement sous forme de hash bcrypt dans `.env` (`ADMIN_PASSWORD_HASH`).
- `xtream_username`, `xtream_password` et `tmdb_api_key` sont chiffrés en base (AES-256-GCM) avec une clé dérivée du mot de passe (scrypt + sel). Rien de déchiffrable sur disque.
- Chaque requête portant le mot de passe (admin ou player) déverrouille le serveur ; la clé reste en RAM. **Après un redémarrage, le serveur est verrouillé** (API 401, cron en pause) jusqu'à la première connexion valide.
- Changer le mot de passe = nouveau hash dans `.env` **et** ressaisie des identifiants Xtream/TMDB dans l'admin.
- Le mot de passe circule en clair dans les URLs des players (protocole Xtream) : réservé au LAN ou derrière HTTPS.

## Structure
```
src/server.ts             entrée Hono + scheduler
src/routes/xtream.ts      routes Xtream (player_api, get.php, xmltv, flux, images)
src/admin/                index.tsx (routes), views.tsx (pages), layout.tsx
src/lib/jobs/jobs.ts      les 3 étapes + cron
src/lib/sync/sync.ts      import + règles
src/lib/filters/rules.ts  moteur de règles
src/lib/tmdb/             client, matching, enrichissement, cache images
src/lib/api/              auth des apps, construction des réponses Xtream
src/lib/auth/vault.ts     clé de chiffrement en RAM, vérification du mot de passe
src/lib/crypto.ts         AES-256-GCM + scrypt
src/db/schema.ts          tables
```

## Déploiement
Image construite par GitHub Actions et publiée sur `ghcr.io` (`Containerfile`, `linux/amd64`). Cible : Fedora CoreOS, podman + systemd Quadlet, derrière un reverse proxy Caddy.

- Les migrations s'appliquent au démarrage via `npm run db:migrate` (`src/db/migrate.ts`, migrateur de `drizzle-orm` — pas besoin de `drizzle-kit` en production).
- Variables : `ADMIN_PASSWORD_HASH` (obligatoire, sinon arrêt immédiat), `DATABASE_URL` et `SESSION_SECRET` (obligatoires quand `NODE_ENV=production`), `DATA_DIR`, `PORT`.
- `DATA_DIR` est un **cache reconstructible** (images TMDB + `epg.xml`) : aucune sauvegarde nécessaire, seule la base compte.
- Le conteneur doit fixer son fuseau (`TZ` / `Timezone=`) : les expressions cron sont évaluées en heure locale.
- Après un redémarrage, le coffre est verrouillé : la première requête authentifiée (admin ou player) le déverrouille et relance la planification.

## Tests
`npm run test` · `npm run typecheck`
