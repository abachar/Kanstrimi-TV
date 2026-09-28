# Kanstrimi — serveur

Node 22 · Hono · TypeScript · Biome (formatage, `biome.json`, 140 colonnes) · Postgres + Drizzle · admin rendue côté serveur (Hono JSX +
HTMX + Bootstrap 5 et Bootstrap Icons via CDN, **aucun CSS ni JS maison**) · Vitest · esbuild pour la production.
Il importe le catalogue du fournisseur, le nettoie, l'enrichit et le sert à l'app Apple (tvOS, iOS) ; la
vidéo ne le traverse jamais (`302` vers le fournisseur).

## Démarrage

```bash
cp .env.example .env                       # DATABASE_URL, SESSION_SECRET (32+ car.), DATA_DIR
npm run hash-password -- <mot-de-passe>    # → ADMIN_PASSWORD_HASH dans .env
npm install
npm run db:migrate                         # applique drizzle/*.sql
npm run dev                                # http://localhost:3000/admin
```

En local, `DEV_PASSWORD=<mot de passe>` dans `.env` saute la page de connexion, déverrouille le coffre au
démarrage et fait recharger les pages de l'admin après chaque redémarrage de `npm run dev` (un élément
HTMX interroge `/admin/dev/reload` chaque seconde). La variable est refusée avec `NODE_ENV=production`.

Se connecter à `/admin`, puis **Paramètres** : URL et identifiants Xtream (bouton *Tester*),
clé TMDB, URL publique. Puis **Tableau de bord → Tout enchaîner**, et **Appareils** pour
appairer l'Apple TV ou l'iPhone.

| Script | Rôle |
|---|---|
| `npm run dev` | serveur en watch (tsx) |
| `npm run format` · `npm run typecheck` · `npm test` · `npm run build` | à lancer après chaque modification (`format:check` vérifie sans écrire) |
| `npm run db:generate` | migration drizzle-kit après un changement de `src/db/schema.ts` (`--custom` pour une migration de données, ex. `0006`) |
| `npm run db:migrate` | migrateur runtime (`src/db/migrate.ts` ; en production le conteneur oneshot `kanstrimi-migrate` lance `dist/db/migrate.js`) |

Les tests `*.db.test.ts` exigent un Postgres de test : `TEST_DATABASE_URL`, sinon
`kanstrimi_test` en local. Il est migré par `src/test/global-setup.ts` et vidé par chaque
fichier de test ; jamais la base de dev. Les tests vivent dans un `__tests__/` à côté du code
qu'ils couvrent.

## Traitement

Le pipeline du catalogue (`src/catalog/pipeline.ts`) enchaîne cinq étapes, chacune une fonction
de son module, exécutée seule sous le journal (`sync_logs`) et refusée si elle tourne déjà.

| Étape | Module | Rôle |
|---|---|---|
| `source` | `providers/xtream/import.ts` | lit le catalogue Xtream dans la base, supprime les disparus. Les lignes séparatrices du direct (`•●★---|FR| SPORT |FR|---★●•`) ne sont pas des entrées : chacune nomme la `section` de ce qui la suit. Les radios (`stream_type: radio_streams`) arrivent sans catégorie : elles sont rangées dans une catégorie « RADIOS » à nous (`_radio`), qu'un interrupteur ou une règle masque comme les autres. |
| `filters` | `catalog/rules/apply.ts` | recalcule `hidden_by_rule` depuis les règles regex, sans réseau |
| `enrich` | `providers/tmdb/enrich.ts` | matching TMDB des éléments en attente (identifiant amont vérifié par preuves, puis recherche par titre) |
| `group` | `catalog/grouping/group.ts` | variantes → `contents`, sans réseau : clé stable `tmdb:movie:603`, `fallback:movie:<slug>:<année>`, `live:<marché>-<slug>` ; écrit aussi `clean_title`, `year`, et pour le direct le `theme` de chaque variante puis les `themes` du contenu |
| `epg` | `providers/xtream/epg.ts` | lit le XMLTV amont en flux (`saxes`) et remplit `epg_programmes` pour les seules chaînes visibles ; un import vide ou en échec garde le guide précédent. Tous les trois jours à 03:00 (`epg_cron`), le fournisseur donnant six jours |

`runAll()` = `source → filters → group`, puis `enrich → group` si une clé TMDB existe. Depuis le
tableau de bord, « Lire la source » enchaîne aussi filtres et groupement, « Enrichir » regroupe
ensuite ; « Tout enchaîner » appelle `runAll()`. Deux jobs `croner` (`protect: true`) lancent
`runAll` sur `sync_cron` et `epg` sur `epg_cron`, en heure locale ; ils sont recréés à chaque
enregistrement des Paramètres (`onSettingsChange`) et ne font rien tant que le coffre est verrouillé.

## APIs exposées

| Route | Rôle |
|---|---|
| `/player/*` | API REST de l'app Apple (`src/player/`). Contrat : `src/player/types.ts`. Jeton d'appareil `Bearer dvc_…` sauf `/devices` (appairage par code) et `/stream/{source}` (lien signé HMAC lié à l'appareil, 24 h, `302`). `/channels` et `/channels/{id}` portent `now` / `next` (une requête `lateral` pour toute la liste) et `has_epg` = la chaîne a des programmes en base. |
| `/img/<size>/<file>` | images TMDB en cache (`DATA_DIR/images`), route de `providers/tmdb/img-route.ts` montée par `main.ts` ; URL portée par chaque carte |
| `/health` | santé (base joignable ; l'état du coffre est dans le corps, pas dans le code HTTP) |

## Structure

Un dossier par chose que fait le système. Chaque bloc s'importe par son `index.ts`, qui liste
nommément ce qu'il expose : on importe `@/catalog`, jamais `@/catalog/grouping/group`, et ce
qui n'est pas dans l'index est privé au dossier. Le graphe des dépendances est vérifié par
`src/__tests__/architecture.test.ts` :

```
main.ts     composition : Hono, middlewares, montage de player, admin et /img, planification, arrêt propre
admin/      pages (routes.tsx + view.tsx, data.ts pour les seules requêtes de présentation) ;
            layout.tsx (menu latéral, offcanvas sous md), ui.tsx (composants Bootstrap), format.ts (nombres,
            dates, cron), labels.ts, http.tsx, session.ts, csrf.ts. Aucune écriture en base : l'admin appelle
            le domaine. catalog, groups, item = l'import brut et le groupement, ce qu'on corrige ;
            favorites et history = ce que l'app a enregistré, lus et modifiés par les fonctions de
            `player/` avec un contexte sans appareil ; caches n'affiche que des compteurs.
player/     /player, un fichier par ressource (devices, stream, info, home, lists, sheets, channels,
            playback, search, favorites) ; context, auth, http, cards, versions, stream-links, epg (maintenant / ensuite),
            contents (ce que l'app a le droit de voir), progress, episodes (wire), types.ts = le contrat
catalog/    le domaine : naming (la grammaire des noms), keys (contentKey, parseKey, préfixes),
            queries (lectures partagées), rules/ (moteur, application, gestion), grouping/ (group,
            split/merge manuel), matching (correction TMDB manuelle), episodes (arbre d'une série,
            rafraîchi à la demande), journal, pipeline (les cinq étapes, le verrou, les crons)
devices/    appairage par code, jetons, déverrouillage du coffre au premier appel
providers/  xtream/ (client, xtreamFromSettings, import, epg, upstreamStreamUrl), tmdb/ (client,
            match, enrich, card-fields, cache images + route /img). Un provider ne connaît pas le catalogue.
config/     settings (réglages chiffrés, cache mémoire, onSettingsChange), vault (mot de passe, clé AES en RAM)
db/         client, schema, migrate, kind (le vocabulaire live/vod/series et ses mappages),
            visibility (les prédicats visibleItem / hiddenItem / visibleCategory)
shared/     env, errors, http-log, crypto, text (stripAccents, slug, searchText, similarityKey)
            RÈGLE : n'importe jamais `@/`. C'est ce qui l'empêche de devenir un fourre-tout.
test/       base de test et jeux de données
```

Dépendances, de bas en haut : `shared ← db ← config ← providers/* ← catalog ← devices ← player ← admin`.
`player` ignore `admin` ; `admin` peut lire `player` par son index (Favoris et Historique appellent les
mêmes fonctions que l'API, avec un `RestContext` sans appareil, donc sans lien de flux). `player` ne prend aux providers qu'une fonction pure,
`upstreamStreamUrl`, pour le `302` ; il ne connaît pas TMDB. Le seul réseau au fil des requêtes
de l'app : le cache d'images à la première demande, et `catalog/episodes` qui relit
`get_series_info` et la saison TMDB quand l'arbre d'une série a plus de 12 h.

Une requête monte dans `catalog/queries.ts` quand un deuxième bloc en a besoin ; un prédicat monte
dans `db/visibility.ts` quand se tromper casserait une règle métier.

## Conventions et pièges

- **Pas de roue réinventée quand une lib fait le travail** : `croner` planifie et verrouille
  (`protect`), `cronstrue` décrit les crons en français (`admin/format.ts`) ; `@hono/zod-validator`
  porte les schémas zod sur les routes ; `admin/csrf.ts` protège les formulaires (`Origin`, sinon
  `Sec-Fetch-Site` ou `Referer`, comparés sur l'hôte : `hono/csrf` rejette Safari, qui omet parfois
  `Origin`), `hono/secure-headers` et `hono/body-limit` s'appliquent à tout ; `shared/env.ts` valide
  l'environnement avec zod et arrête le processus avec un message clair. Reste maison à dessein : la
  similarité de titres (calibrée), les clients Xtream et TMDB (petits, taillés pour ce qu'on stocke),
  le logger (caviarde les mots de passe des URL).
- Alias `@/` → `src/`. Les vues JSX rendent en HTML ; interactivité minimale via `hx-*`. Uniquement
  des classes Bootstrap, pas d'attribut `style`.
- **Une seule source pour chaque fait** : les mappages de `kind` (`tmdbMediaType`) dans `db/kind.ts` ;
  la forme des clés dans `catalog/keys.ts` (`isTmdbKey`, `hasTmdbKey`, `isEpisodeKey`…) ; la
  suppression d'accents dans `shared/text.ts` (quatre dérivés nommés par usage, dont les résultats
  sont stockés en base : ne pas les unifier davantage) ; les valeurs par défaut des réglages dans
  `config/settings.ts` (`getSettings()` les applique, aucun appelant n'a de repli) ; le client Xtream
  par `xtreamFromSettings(s)`.
- **Visibilité** : un seul jeu de prédicats, `db/visibility.ts` (`visibleItem`, `hiddenItem`,
  `visibleCategory`, `isItemHidden`), utilisé jusque dans l'agrégat SQL du groupement. Une catégorie
  masquée masque ses éléments sans toucher leurs colonnes. Côté app, `player/contents.ts` y ajoute
  le réglage « contenus adultes ».
- **Thèmes du direct** : `/player/channels` groupe par marché × thème (« France · Sport »). Le thème d'une
  variante vient de sa section (la ligne séparatrice qui la précède dans sa catégorie), sinon de sa
  catégorie (« SPORTS HD ») ; `naming.ts` porte le vocabulaire (`LIVE_THEMES`, `themeOf`, `liveTheme`) dans
  les langues du fournisseur. Une section au nom de la catégorie ou d'un pays est la liste généraliste,
  sauf dans une région (« ARAB WORLD », « BALKANS ») où les pays sont les sections. Un libellé inconnu
  reste un groupe à part (« Tf1+ », « Molotov ch. ») : rien n'est perdu, tout se voit dans l'admin.
- **Groupement** : `catalog/naming.ts` est *la* grammaire des noms. Un `item` = une variante
  jouable ; `contents.key` = identité exposée aux apps, jamais `contents.id`. Les mises à jour
  massives passent par `unnest()` avec le template postgres-js (`client`), pas `sql` de Drizzle qui
  éclate les tableaux. `regroupItems` (admin) et `runGrouping` (pipeline) se sérialisent entre eux.
- **Données amont non fiables** : `xtream_id` est du texte opaque et non unique (dédoublonnage à
  l'import), les champs manquants sont tolérés, l'identifiant TMDB fourni n'est jamais cru sur parole.
- **Secrets** : un seul mot de passe (hash bcrypt dans `.env`), clé AES-256-GCM dérivée en RAM
  (`config/vault.ts`), chiffrement transparent des réglages sensibles dans `config/settings.ts`. Après
  un redémarrage le serveur est **verrouillé** jusqu'à la première requête authentifiée ; le premier
  appel d'un appareil appairé déverrouille grâce à `devices.wrapped_key`.
- **Ne jamais journaliser une URL brute** : le mot de passe circule dans les query strings et les
  chemins de flux. Passer par `requestLogger()` de `shared/http-log.ts`.

## Déploiement

Image `linux/amd64` construite par GitHub Actions (`.github/workflows/build.yml`, à la racine
du dépôt) et publiée sur `ghcr.io` ; `Containerfile` multi-stage : esbuild produit
`dist/main.js` et `dist/db/migrate.js` (chemin figé : le Quadlet de migration en dépend), dépendances incluses, aucun `node_modules` en
production. Cible : Fedora CoreOS, podman rootless + systemd Quadlet, derrière Caddy.

- Variables : `ADMIN_PASSWORD_HASH` (obligatoire), `DATABASE_URL` et `SESSION_SECRET`
  (obligatoires en production), `DATA_DIR`, `PORT`, `TZ`.
- `DATA_DIR` est un cache reconstructible (images TMDB) : seule la base se sauvegarde, guide des programmes compris.
- Le mot de passe circule en clair dans les URL des players (protocole Xtream) : LAN ou HTTPS uniquement.
