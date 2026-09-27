# Kanstrimi — serveur

Node 22 · Hono · TypeScript · Postgres + Drizzle · admin rendue côté serveur (Hono JSX +
HTMX + Bootstrap 5 via CDN, **aucun CSS ni JS maison**) · Vitest · esbuild pour la production.
Il importe le catalogue du fournisseur, le nettoie, l'enrichit et le sert à l'app tvOS ; la
vidéo ne le traverse jamais (`302` vers le fournisseur).

## Démarrage

```bash
cp .env.example .env                       # DATABASE_URL, SESSION_SECRET (32+ car.), DATA_DIR
npm run hash-password -- <mot-de-passe>    # → ADMIN_PASSWORD_HASH dans .env
npm install
npm run db:migrate                         # applique drizzle/*.sql
npm run dev                                # http://localhost:3000/admin
```

Se connecter à `/admin`, puis **Paramètres** : URL et identifiants Xtream (bouton *Tester*),
clé TMDB, URL publique. Puis **Tableau de bord → Tout enchaîner**, et **Appareils** pour
appairer l'Apple TV.

| Script | Rôle |
|---|---|
| `npm run dev` | serveur en watch (tsx) |
| `npm run typecheck` · `npm test` · `npm run build` | à lancer après chaque modification |
| `npm run db:generate` | migration drizzle-kit après un changement de `src/db/schema.ts` |
| `npm run db:migrate` | migrateur runtime (`src/db/migrate.ts` ; en production le conteneur oneshot `kanstrimi-migrate` lance `dist/db/migrate.js`) |

Les tests `*.db.test.ts` exigent un Postgres de test : `TEST_DATABASE_URL`, sinon
`kanstrimi_test` en local. Il est migré par `src/test/global-setup.ts` et vidé par chaque
fichier de test ; jamais la base de dev.

## Traitement

Cinq jobs indépendants (`src/sync/jobs.ts`), chacun relançable seul depuis le tableau de
bord, refusé s'il tourne déjà. Pas d'orchestrateur.

| Job | Rôle |
|---|---|
| `source` | lit le catalogue Xtream dans la base, supprime les disparus, puis applique les filtres et regroupe |
| `filters` | recalcule `hidden_by_rule` depuis les règles regex, sans réseau |
| `enrich` | matching TMDB des éléments en attente (identifiant amont vérifié par preuves, puis recherche par titre), puis regroupe |
| `group` | variantes → `contents`, sans réseau : clé stable `tmdb:movie:603`, `fallback:movie:<slug>:<année>`, `live:<marché>-<slug>` |
| `epg` | télécharge le XMLTV amont sur disque (rien ne le sert encore : première moitié du `now`/`next` des chaînes) |

Le cron `sync_cron` enchaîne `source → enrich` ; `epg_cron` gère l'EPG. Les crons sont
évalués en heure locale.

## APIs exposées

| Route | Rôle |
|---|---|
| `/api/v1/*` | API REST de l'app tvOS. Contrat : `src/app/api/types.ts`. Jeton d'appareil `Bearer dvc_…` sauf `/devices` (appairage par code) et `/stream/{source}` (lien signé HMAC lié à l'appareil, 24 h, `302`). |
| `/img/<size>/<file>` | images TMDB en cache (`DATA_DIR/images`), URL portée par chaque carte |
| `/api/health` | santé (base joignable ; l'état du coffre est dans le corps, pas dans le code HTTP) |

## Structure

Cinq blocs, chacun avec un `index.ts` qui est sa seule porte d'entrée : on importe `@/sync`,
jamais `@/sync/grouping/group`. Dépendances dans un seul sens :
`admin → app, sync, db, shared` · `app → sync, db, shared` · `sync → db, shared` · `db → shared`.

```
src/
  server.ts            composition : Hono, blocs, scheduler, arrêt propre
  shared/              env (validé par zod), crypto, erreurs, journal des requêtes
  db/                  schéma Drizzle, client, migrateur (bundlé en dist/db/migrate.js), kind,
                       réglages chiffrés, coffre (clé AES en RAM), queries/ = requêtes partagées
                       ou porteuses d'un invariant (visibilité)
  sync/                le pipeline, une étape par dossier :
    reader/            client Xtream, import du catalogue, EPG
    filters/           moteur de règles regex et leur application
    grouping/          grammaire des noms, variantes → contents, champs de carte
    enrich/tmdb/       client, matching par preuves, enrichissement, cache images
    episodes.ts        arbre des épisodes d'une série, importé à la demande
    jobs.ts cron.ts journal.ts   orchestration : 5 jobs, cron, journal des exécutions
  app/                 l'app tvOS : api/ (routes, contrat types.ts, sérialisation, catalogue,
                       progression, favoris, images) et devices/ (appairage, jetons)
  admin/               une page par dossier : routes.tsx, view.tsx, data.ts (ses requêtes)
  test/                base de test et jeux de données
```

Une requête monte dans `db/queries/` quand un deuxième bloc en a besoin ou quand se tromper
casserait une règle métier ; sinon elle reste dans le bloc qui l'utilise.

## Conventions et pièges

- **Pas de roue réinventée quand une lib fait le travail** : `croner` évalue les crons et
  `cronstrue` les décrit en français (`sync/cron.ts`) ; `@hono/zod-validator` porte les
  schémas zod sur les routes (`c.req.valid(...)`) ; `hono/csrf` protège les formulaires de
  l'admin (comparaison sur l'hôte, TLS terminé par Caddy), `hono/secure-headers` et
  `hono/body-limit` s'appliquent à tout ; `shared/env.ts` valide l'environnement avec zod et
  arrête le processus avec un message clair. Reste maison à dessein : la similarité de titres
  (calibrée), les clients Xtream et TMDB (petits, taillés pour ce qu'on stocke), le logger
  (caviarde les mots de passe des URL).
- Alias `@/` → `src/`. Les vues JSX rendent en HTML ; interactivité minimale via `hx-*`.
- **Partagé ou local** : ce qui ne sert qu'à un bloc reste dans ce bloc (`admin/*/data.ts`) ;
  l'enrichissement ne regroupe pas lui-même, c'est `sync/jobs.ts` qui enchaîne les étapes. Uniquement
  des classes Bootstrap, pas d'attribut `style`.
- **Visibilité** : un seul jeu de prédicats, `db/queries/visibility.ts` (`visibleItem`,
  `hiddenItem`, `visibleCategory`, `inHiddenCategory`). Une catégorie masquée masque ses
  éléments sans toucher leurs colonnes.
- **Groupement** : `sync/grouping/naming.ts` est *la* grammaire des noms. Un `item` = une
  variante jouable ; `contents.key` = identité exposée aux apps, jamais `contents.id`. Les
  mises à jour massives passent par `unnest()` avec le template postgres-js (`client`), pas
  `sql` de Drizzle qui éclate les tableaux.
- **Données amont non fiables** : `xtream_id` est du texte opaque et non unique
  (dédoublonnage à l'import), les champs manquants sont tolérés, l'identifiant TMDB fourni
  n'est jamais cru sur parole.
- **Secrets** : un seul mot de passe (hash bcrypt dans `.env`), clé AES-256-GCM dérivée en
  RAM (`db/vault.ts`), chiffrement transparent des réglages sensibles dans `db/settings.ts`. Après un redémarrage le serveur est **verrouillé** jusqu'à la première
  requête authentifiée ; le premier appel d'un appareil tvOS déverrouille grâce à
  `devices.wrapped_key`.
- **Ne jamais journaliser une URL brute** : le mot de passe circule dans les query strings et
  les chemins de flux. Passer par `requestLogger()` de `shared/http-log.ts`.

## Déploiement

Image `linux/amd64` construite par GitHub Actions (`.github/workflows/build.yml`, à la racine
du dépôt) et publiée sur `ghcr.io` ; `Containerfile` multi-stage : esbuild produit
`dist/server.js` et `dist/db/migrate.js` (chemin figé : le Quadlet de migration en dépend), dépendances incluses, aucun `node_modules` en
production. Cible : Fedora CoreOS, podman rootless + systemd Quadlet, derrière Caddy.

- Variables : `ADMIN_PASSWORD_HASH` (obligatoire), `DATABASE_URL` et `SESSION_SECRET`
  (obligatoires en production), `DATA_DIR`, `PORT`, `TZ`.
- `DATA_DIR` est un cache reconstructible (images TMDB, `epg.xml`) : seule la base se sauvegarde.
- Le mot de passe circule en clair dans les URL des players (protocole Xtream) : LAN ou HTTPS uniquement.
