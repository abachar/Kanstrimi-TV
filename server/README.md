# Kanstrimi — serveur

Node 22 · Hono · TypeScript · Postgres + Drizzle · Biome · Vitest · esbuild. Admin rendue côté serveur (Hono JSX, HTMX,
Tailwind CSS 4 et Basecoat, icônes Lucide ; **aucun CSS ni JS maison**).
Le serveur importe le catalogue du fournisseur, le nettoie, l'enrichit et le sert à l'app Apple ; la vidéo ne le
traverse jamais (`302` vers le fournisseur).

## Démarrage

```bash
cp .env.example .env                       # DATABASE_URL, SESSION_SECRET (32+ car.), DATA_DIR
npm run hash-password -- <mot-de-passe>    # → ADMIN_PASSWORD_HASH dans .env
npm install
npm run db:migrate
npm run dev                                # http://localhost:3000/admin
```

Puis dans l'admin : **Paramètres** (Xtream, clé TMDB, URL publique), **Tâches → Traitement complet**, et
**Appareils** pour appairer l'Apple TV ou l'iPhone. En local, `DEV_PASSWORD` dans `.env` saute la connexion et
déverrouille le coffre (refusé en production).

| Script | Rôle |
|---|---|
| `npm run format` · `typecheck` · `test` · `build` | à lancer après chaque modification |
| `npm run db:generate` | migration après un changement de `src/db/schema.ts` |
| `npm run db:migrate` | applique `drizzle/*.sql` (en production : le conteneur `kanstrimi-migrate`) |
| `scripts/tmdb-cache-clean.sh [--fix]` | trouve, et vide avec `--fix`, les documents illisibles de `tmdb_cache` |

Les tests `*.db.test.ts` utilisent une base de test (`TEST_DATABASE_URL`, sinon `kanstrimi_test`), jamais la base de dev.
Les tests vivent dans un `__tests__/` à côté du code.

## Traitement

Le pipeline (`catalog/pipeline.ts`) enchaîne des étapes indépendantes ; chacune n'écrit que ce qui change et peut se
relancer seule (**Tâches → Lancer à partir de…**).

| Étape | Rôle |
|---|---|
| `source` | copie brute des listes Xtream ; refuse une réponse vide ou un catalogue qui fond de moitié (panne du fournisseur) |
| `merge` | copie brute → variantes du catalogue, par différence ; analyse des noms (titre, année, marché, langue, qualité, édition) |
| `channels` | rattache les chaînes du direct à iptv-org : thème, logo, drapeau adulte |
| `enrich` | matching TMDB des éléments en attente ; relit peu à peu les fiches anciennes |
| `filters` | règles regex de masquage |
| `group` | variantes → contenus (`catalog_contents`), fiches tirées du cache TMDB, agrégats sur les variantes visibles, arrivées de la liste d'attente |
| `trending` | tendances TMDB de la semaine (rangées « Top 10 », Top Shelf) |
| `epg` | guide des programmes des chaînes visibles, tous les trois jours, l'EPG de chaque variante ; décalages horaires corrigés dans l'admin |

TMDB passe avant les filtres : tout est matché une fois, et démasquer ne fait jamais apparaître de titres non matchés.
Un passage s'arrête à la première étape en échec, sauf `channels`, `enrich` et `trending` (réseau externe). Chaque passage
laisse une ligne dans `task_runs` / `task_steps` et un fichier de log dans `DATA_DIR/logs/` (90 jours) ; il peut être arrêté
depuis l'admin.

## Tables

Le préfixe dit qui écrit : `xtream_` (copie et cache du fournisseur), `tmdb_`, `iptvorg_` (caches des sources),
`catalog_` (ce que construit le pipeline), `curation_` (choix de l'admin), `app_` (ce que l'app enregistre : favoris,
progression, temps regardé du direct, appareils), `task_` (journal), et `settings`.
Deux niveaux : variantes (une entrée du fournisseur) et contenus (`catalog_contents.key`, la seule identité exposée à l'app).

## API

| Route | Rôle |
|---|---|
| `/player/*` | API de l'app Apple. Contrat : `src/player/types.ts`. Jeton d'appareil `Bearer`, sauf l'appairage (`/devices`) et `/stream/{source}` (lien signé, `302` vers le fournisseur). |
| `/img/…` | images TMDB et logos iptv-org en cache disque ; `/img/shelf/…` = images du Top Shelf, logo du titre dessiné sur le fond par `sharp` |
| `/admin` | administration |
| `/health` | santé (base joignable) |

## Structure

Un dossier par chose que fait le système, chacun importé par son `index.ts` (`@/catalog`, jamais un chemin profond).
Dépendances de bas en haut, vérifiées par `src/__tests__/architecture.test.ts` :
`shared ← db ← config ← providers/* ← catalog ← devices ← player ← admin`.

```
main.ts     composition : montages, planification, arrêt propre
admin/      pages de l'admin ; aucune écriture en base, elle appelle le domaine
player/     /player, un fichier par ressource ; types.ts = le contrat
catalog/    le domaine : grammaire des noms, clés, règles, groupement, épisodes, pipeline
devices/    appairage, jetons, déverrouillage du coffre
providers/  xtream/, tmdb/ (dont le cache d'images), iptv/ ; un provider ne connaît pas le catalogue
config/     réglages chiffrés, coffre
db/         client, schéma, migrations, prédicats de visibilité
shared/     utilitaires ; n'importe jamais `@/`
```

`player` ne connaît pas TMDB et ne prend aux providers que `upstreamStreamUrl` ; `admin` lit `player` par son index.

## Conventions et pièges

- **Une lib plutôt qu'une roue réinventée** : `croner`, `cronstrue`, zod, `hono/secure-headers`. Restent maison à dessein :
  la similarité de titres, les clients Xtream et TMDB, le logger.
- **Admin** : uniquement des classes Tailwind et Basecoat écrites en entier, pas d'attribut `style`.
- **Visibilité** : un seul jeu de prédicats (`db/visibility.ts`). Tout ce que voit l'app (tris, dates, compteurs, rangées)
  se calcule sur les seules variantes visibles.
- **Dates** : arrivée = date du fournisseur (`added`, `last_modified` pour une série) ; sortie = TMDB, tri par défaut.
- **Données amont non fiables** : `xtream_id` n'est pas un identifiant, les champs manquent, l'identifiant TMDB fourni
  n'est jamais cru sur parole.
- **Mises à jour massives** par `unnest()` avec le client postgres-js, pas le `sql` de Drizzle qui éclate les tableaux.
  Le merge, les règles et le groupement passent l'un après l'autre (`withCatalogLock`).
- **Secrets** : un seul mot de passe ; réglages sensibles chiffrés avec une clé gardée en RAM. Après un redémarrage le
  serveur est verrouillé jusqu'à la première requête authentifiée (le premier appel d'un appareil appairé suffit).
- **Ne jamais journaliser une URL brute** : le mot de passe Xtream y circule. Passer par `requestLogger()`.
- **Liste d'attente** (`catalog/waitlist.ts`, admin › Application) : des films cherchés sur TMDB avant que le fournisseur ne les ait. Dès
  qu'un contenu visible porte leur clé `tmdb:movie:<id>`, ils deviennent le hero de l'accueil et la tête du Top Shelf,
  jusqu'à 5 % de lecture. Un film mal reconnu (clé `fallback:`) ne se détecte qu'une fois son match TMDB corrigé.
- **Top Shelf** : tvOS garde les images par adresse ; changer leur mise en page = changer `SHELF_LAYOUT` et `?layout=`.

## Déploiement

Image `linux/amd64` construite par GitHub Actions et publiée sur `ghcr.io` ; Harbor (Fedora CoreOS, podman rootless,
Quadlet, derrière Caddy) la récupère seul. esbuild produit `dist/main.js` et `dist/db/migrate.js`, dépendances incluses ;
seul `sharp` (libvips natif) reste hors du bundle et forme l'unique `node_modules` de l'image.

- Variables : `ADMIN_PASSWORD_HASH`, `DATABASE_URL`, `SESSION_SECRET`, `ADMIN_EMAIL`, `DATA_DIR`, `PORT`, `TZ`.
- `DATA_DIR` ne contient que des caches reconstructibles et les logs : seule la base se sauvegarde.
- Le mot de passe circule en clair dans les URL Xtream : LAN ou HTTPS uniquement.
