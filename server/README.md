# Kanstrimi — serveur

Node 22 · Hono · TypeScript · Postgres + Drizzle · Biome · Vitest · esbuild. Admin rendue côté serveur (Hono JSX, HTMX,
Tailwind CSS 4 et Basecoat, icônes Lucide ; **aucun CSS ni JS maison**).
Le serveur importe le catalogue du fournisseur, le nettoie, l'enrichit et le sert à l'app Apple ; la vidéo ne le
traverse jamais (l'app lit l'URL du fournisseur).

## Démarrage

```bash
cp .env.example .env                       # DATABASE_URL, SESSION_SECRET (32+ car.), DATA_DIR, XTREAM_*, TMDB_API_KEY
npm run hash-password -- <mot-de-passe>    # 12 car. min → ADMIN_PASSWORD_HASH dans .env
npm install
npm run db:migrate
npm run dev                                # http://localhost:3000/admin
```

Puis dans l'admin : **Paramètres** (URL publique, langue TMDB, planification), **Tâches → Traitement complet**, et
**Appareils** pour appairer l'Apple TV ou l'iPhone. En local, `DEV_PASSWORD` dans `.env` saute la connexion (refusé en
production).

| Script | Rôle |
|---|---|
| `npm run format` · `typecheck` · `test` · `build` | à lancer après chaque modification |
| `npm run check` | linter et format sans rien réécrire (`biome ci`, comme la CI) |
| `npm run db:generate` | migration après un changement de `src/db/schema.ts` |
| `npm run db:migrate` | applique `drizzle/*.sql` (en production : le conteneur `kanstrimi-migrate`) |
| `scripts/tmdb-cache-clean.sh [--fix]` | trouve, et vide avec `--fix`, les documents illisibles de `tmdb_cache` |

Les tests `*.db.test.ts` utilisent une base de test (`TEST_DATABASE_URL`, sinon `kanstrimi_test`), jamais la base de dev.
Les tests vivent dans un `__tests__/` à côté du code.

**Contrat avec l'app** : `player/__tests__/contract.db.test.ts` écrit de vraies réponses de `/player` (horloge fixe) dans
`apple/kanstrimiTests/Contract/`, que l'app décode. Une réponse dont la forme change fait échouer le test ;
si le changement est voulu, réécrire les fichiers : `UPDATE_CONTRACT=1 npx vitest run src/player/__tests__/contract.db.test.ts`.

## Traitement

Le pipeline (`catalog/pipeline.ts`) enchaîne des étapes indépendantes ; chacune n'écrit que ce qui change et peut se
relancer seule (**Tâches → Lancer à partir de…**).

| Étape | Rôle |
|---|---|
| `source` | copie brute des listes Xtream ; refuse une réponse vide ou un catalogue qui fond de moitié (panne du fournisseur) |
| `merge` | copie brute → variantes du catalogue, par différence ; analyse des noms (titre, année, marché, langue, qualité, édition) |
| `channels` | rattache les chaînes du direct à iptv-org : thème, logo, drapeau adulte, pays dans une région |
| `enrich` | matching TMDB des éléments en attente (`catalog/matching.ts`) ; relit peu à peu les fiches anciennes |
| `filters` | règles de masquage (langage de filtre), une variante masquée par la dernière règle qui correspond |
| `group` | variantes → contenus (`catalog_contents`), fiches tirées du cache TMDB, agrégats sur les variantes visibles, arrivées de la liste d'attente |
| `trending` | tendances TMDB de la semaine (rangées « Top 10 », Top Shelf) |
| `epg` | guide des programmes des chaînes visibles, tous les trois jours, l'EPG de chaque variante ; décalages horaires corrigés dans l'admin |

TMDB passe avant les filtres : tout est matché une fois, et démasquer ne fait jamais apparaître de titres non matchés.
Le matching est un seul algorithme, `explainMatch` : `enrich` applique son verdict, l'admin l'affiche sous « Pourquoi ? ».
Une panne de TMDB (réseau, 429 qui dure) laisse l'élément en attente, jamais `unmatched` ; le client TMDB ne dépasse
pas 35 requêtes par seconde.
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
| `/player/*` | API de l'app Apple. Contrat : `src/player/types.ts`. Jeton d'appareil `Bearer`, sauf l'appairage (`/devices`). |
| `/img/…` | images TMDB et logos iptv-org en cache disque ; `/img/shelf/…` = images du Top Shelf, logo du titre dessiné sur le fond par `sharp` |
| `/admin` | administration |
| `/health` | santé (base joignable) ; en production, la cause d'une panne reste dans le journal |

## Structure

Un dossier par chose que fait le système, chacun importé par son `index.ts` (`@/catalog`, jamais un chemin profond).
Dépendances de bas en haut, vérifiées par `src/__tests__/architecture.test.ts` :
`shared ← db ← config ← providers/* ← catalog ← devices ← player ← admin`.

```
main.ts     démarrage : écoute, planification, arrêt propre
app.ts      l'application HTTP : montages, /health, erreurs
admin/      pages de l'admin ; aucune écriture en base (vérifié), elle appelle le domaine
player/     /player, un fichier par ressource ; types.ts = le contrat
catalog/    le domaine : grammaire des noms, clés, règles, groupement, épisodes, pipeline
devices/    appairage, jetons
providers/  xtream/, tmdb/ (dont le cache d'images), iptv/ ; un provider ne connaît pas le catalogue
config/     réglages (base et environnement), mot de passe
db/         client, schéma, migrations, prédicats de visibilité
shared/     utilitaires ; n'importe jamais `@/`
```

`player` ne connaît pas TMDB (ni ses tables) et ne prend aux providers que `upstreamStreamUrl` ; `admin` lit `player`
par son index.

## Conventions et pièges

- **Une lib plutôt qu'une roue réinventée** : `croner`, `cronstrue`, zod, `hono/secure-headers`. Restent maison à dessein :
  la similarité de titres, les clients Xtream et TMDB, le logger, `singleFlight` (un appel par clé à la fois : TMDB à
  l'ouverture d'une fiche, téléchargements d'images).
- **Biome** formate et vérifie (linter) ; `noUnusedLocals` côté TypeScript. Une erreur inattendue de l'admin s'affiche
  en page, ou en toast pour une requête HTMX.
- **Admin** : uniquement des classes Tailwind et Basecoat écrites en entier, pas d'attribut `style`. CSP stricte
  (`script-src 'self'`, `app.ts`) : htmx et Basecoat servis depuis `/admin/assets` (copiés par `npm run css`), aucun
  script ni gestionnaire en ligne (`onsubmit`, `hx-on`), une confirmation passe par `hx-confirm` (`back()` répond alors
  `HX-Redirect`). Toute écriture (POST, PUT, PATCH, DELETE) doit venir du site, quel que soit son `Content-Type`.
- **Langage de filtre** (`catalog/query/`, aide dans l'admin) : `genre:anim` contient, `genre:"animation"` égal,
  `a,b` l'un de, `< <= > >= = ..` pour les nombres, `/regex/`, `-` nie ; casse et accents ignorés. Une requête est une
  condition sur une variante (champs TMDB lus dans le cache de sa fiche), vérifiée champ par champ avant tout SQL, ses
  valeurs toujours en paramètres. Sert aux recherches de l'admin et aux règles.
- **Règles** : une requête chacune ; la dernière qui correspond l'emporte, une règle « garder » fait de son type une liste
  blanche, une catégorie dont toutes les variantes sont masquées l'est aussi. Enregistrer une règle ne l'applique pas
  (trop lent) : `rules_pending` affiche un bandeau, l'étape `filters` les applique.
- **Écrans Live, Films, Séries de l'admin** : « Catalogue » (par défaut) montre ce que l'app affiche, par les fonctions
  mêmes de `/player` : ses rangées repliées, chacune dépliée en tableau de tous ses titres (studios et sagas sur deux niveaux) ; « Xtream », les catégories et flux du fournisseur. Tout mène à la fiche d'un contenu
  (`/admin/content/:id`), ses variantes dépliables avec leurs données Xtream et les corrections (TMDB, iptv-org,
  séparer, fusionner) ; `/admin/item/:id` y redirige.
- **Visibilité** : un seul jeu de prédicats (`db/visibility.ts`). Tout ce que voit l'app (tris, dates, compteurs, rangées)
  se calcule sur les seules variantes visibles. Les genres de Films et Séries restent en mémoire jusqu'à ce que le
  groupement réécrive les contenus (`contentsGeneration`) : une écriture directe dans `catalog_contents` ne les rafraîchit pas.
- **Dates** : arrivée = date du fournisseur (`added`, `last_modified` pour une série) ; sortie = TMDB, tri par défaut.
- **Données amont non fiables** : `xtream_id` n'est pas un identifiant, les champs manquent, l'identifiant TMDB fourni
  n'est jamais cru sur parole.
- **Mises à jour massives** par `unnest()` avec le client postgres-js, pas le `sql` de Drizzle qui éclate les tableaux, ou
  par `jsonb_to_recordset` d'un seul paramètre (les cartes, colonnes décrites une fois dans `group.ts`). Une carte
  n'est réécrite que si elle change.
  Le merge, les règles et le groupement passent l'un après l'autre (`withCatalogLock`).
- **Secrets** : le compte du fournisseur et la clé TMDB viennent de l'environnement (secrets podman en production), jamais
  de la base ; l'admin les montre sans les modifier, un changement demande un redémarrage. Un seul mot de passe (bcrypt),
  celui de l'admin : `/admin/login` passe toujours par bcrypt et, par adresse, après cinq échecs, double l'attente à chaque nouvel échec (429).
- **Textes des cartes** (`player/cards.ts`) : les listes, l'accueil, la recherche, « À suivre » et les épisodes envoient des
  `ContentItem` dont le serveur écrit les textes (« 2019 · ★ 8.5 », badges dans l'ordre, « S2 · É4 · 1 h 08 restantes »,
  en-têtes « À SUIVRE ») ; l'app les dispose sans les recalculer. La fiche reste un `Card`.
- **Recherche** (`player/search.ts`) : un terme d'un caractère est un mot entier, un préfixe à partir de deux ; seuls les
  200 contenus les plus votés par type (préfixes, et mots entiers pour qu'un titre égal à la requête reste) sont classés.
- **Appairage** : `POST /player/devices` rend le code et le jeton de l'appareil (seule son empreinte est en base) ; le jeton
  ne vaut qu'une fois le code approuvé dans l'admin, `GET /player/devices/{code}` ne donne que le statut.
- **Liens de lecture** : `stream_url` est l'URL du fournisseur, compte compris, envoyée aux seuls appareils appairés ;
  l'app la lit elle-même (le fournisseur répond encore un `302` vers son backend) et ne redemande `/playback` qu'au « Réessayer » d'une panne.
- **Ne jamais journaliser une URL brute** : le mot de passe Xtream y circule. Passer par `requestLogger()`.
- **Liste d'attente** (`catalog/waitlist.ts`, admin › Application) : des films cherchés sur TMDB avant que le fournisseur ne les ait. Dès
  qu'un contenu visible porte leur clé `tmdb:movie:<id>`, ils passent en tête du Top Shelf et du carrousel de l'accueil,
  jusqu'à 5 % de lecture.
- **Carrousel de l'accueil** : le Top Shelf sans « Reprendre » (`shelfPicks`), six au plus ; sans rien à y mettre, les
  dernières nouveautés. `trending` refuse une liste vide et garde celle de la semaine précédente. Un film mal reconnu (clé `fallback:`) ne se détecte qu'une fois son match TMDB corrigé.
- **Groupes du direct** : pays × thème (« France · Sport », `section` et `theme` dans `/channels`). Un marché
  régional (`ar`) se découpe par pays : l'étape `channels` écrit `country` (`regionCountry`) : pays iptv-org s'il est
  dans la région, sinon la section du fournisseur ; une chaîne rangée sous un thème ou un bouquet seulement (beIN,
  OSN) reste sous « Monde arabe ».
- **« Si vous avez aimé… »** (`catalog/recommendations.ts`, `player/related.ts`) : recommandations TMDB (`/recommendations`,
  une page) demandées à la volée (ouverture d'une fiche, lecture, graines de l'accueil en fond), gardées 7 jours dans
  `tmdb_recommendations` (ids seuls), croisées avec le catalogue visible à chaque lecture. Jamais un titre vu ; la suite
  d'un titre écarte aussi ceux en cours, l'accueil aussi « Ma liste ». `/playback/{id}/suggestions` : panneau du lecteur
  et suite (saga d'abord) ; `/playback/{série}` lit l'épisode où elle reprend.
- **Top Shelf** : tvOS garde les images par adresse ; changer leur mise en page = changer `SHELF_LAYOUT` et `?layout=`.

## Déploiement

Image `linux/amd64` construite par GitHub Actions et publiée sur `ghcr.io` ; Harbor (Fedora CoreOS, podman rootless,
Quadlet, derrière Caddy) la récupère seul. esbuild produit `dist/main.js` et `dist/db/migrate.js`, dépendances incluses ;
seul `sharp` (libvips natif) reste hors du bundle et forme l'unique `node_modules` de l'image.

- Variables : `ADMIN_PASSWORD_HASH`, `DATABASE_URL`, `SESSION_SECRET`, `ADMIN_EMAIL`, `DATA_DIR`, `PORT`, `TZ`, et le
  compte du fournisseur `XTREAM_URL`, `XTREAM_USERNAME`, `XTREAM_PASSWORD` avec `TMDB_API_KEY` (secrets podman,
  `Secret=…,type=env,target=…` dans le Quadlet).
- `DATA_DIR` ne contient que des caches reconstructibles et les logs : seule la base se sauvegarde.
- Le mot de passe circule en clair dans les URL Xtream : LAN ou HTTPS uniquement.

## Licence

[PolyForm Strict 1.0.0](../LICENSE.md) — voir le [README principal](../README.md#licence).
