# Kanstrimi — serveur

Node 22 · Hono · TypeScript · Biome (formatage, `biome.json`, 140 colonnes) · Postgres + Drizzle · admin rendue côté serveur (Hono JSX +
HTMX + Tailwind CSS 4 et Basecoat, le design shadcn/ui sans React, icônes Lucide inlinées en SVG ; **aucun CSS ni JS maison**) ·
Vitest · esbuild pour la production.
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
clé TMDB, URL publique. Puis **Tâches → Traitement complet → Lancer maintenant**, et **Appareils** pour
appairer l'Apple TV ou l'iPhone.

| Script | Rôle |
|---|---|
| `npm run dev` | CSS de l'admin puis serveur en watch (tsx) ; Tailwind recompile en parallèle à chaque modification de `src/admin` (recharger la page) |
| `npm run css` | compile `src/admin/assets/admin.css` (Tailwind + Basecoat) et copie le script de Basecoat dans `dist/assets/`, que `/admin/assets/*` sert ; lancé par `dev` et `build` |
| `npm run format` · `npm run typecheck` · `npm test` · `npm run build` | à lancer après chaque modification (`format:check` vérifie sans écrire) |
| `npm run db:generate` | migration drizzle-kit après un changement de `src/db/schema.ts` (`--custom` pour une migration de données, ex. `0006`) |
| `scripts/tmdb-cache-clean.sh [--fix]` | trouve les documents illisibles de `tmdb_cache` (jsonb abîmé : `unknown type of jsonb container`, ou segfault de Postgres au groupement) et, avec `--fix`, les vide pour qu'`enrich` les relise ; puis lancer le traitement à partir d'`enrich`. Par défaut `podman exec postgres psql` (Harbor, en `apps`), sinon `PSQL="psql <url>"` |
| `npm run db:migrate` | migrateur runtime (`src/db/migrate.ts` ; en production le conteneur oneshot `kanstrimi-migrate` lance `dist/db/migrate.js`) |

Les tests `*.db.test.ts` exigent un Postgres de test : `TEST_DATABASE_URL`, sinon
`kanstrimi_test` en local. Il est migré par `src/test/global-setup.ts` et vidé par chaque
fichier de test ; jamais la base de dev. Les tests vivent dans un `__tests__/` à côté du code
qu'ils couvrent.

## Traitement

Le pipeline du catalogue (`src/catalog/pipeline.ts`) connaît sept étapes, chacune une fonction
de son module, refusée si elle tourne déjà. Chaque étape n'écrit que les lignes qui changent
(`is distinct from`) : un passage sans nouveauté ne réécrit rien.

| Étape | Module | Rôle |
|---|---|---|
| `source` | `providers/xtream/import.ts` | lit les listes Xtream dans leur copie brute (`xtream_categories`, `xtream_streams`, tables `UNLOGGED` remplacées en une transaction), dédoublonnées, sans rien interpréter. Avant d'écrire, deux garde-fous : une réponse qui n'est pas une liste est une erreur ; un type (direct, films, séries) réduit à moins de la moitié de ce que tient le catalogue (`SHRINK_RATIO`, au-delà de 50 entrées) est pris pour une panne du fournisseur, et l'import est refusé, catalogue intact. Une baisse réelle passe par un lancement manuel, case « Accepter la baisse du catalogue » (proposée par la page Tâches après un tel refus). Ne touche jamais le catalogue. |
| `merge` | `catalog/merge.ts` | copie brute → `catalog_categories` et `catalog_variants` par différence, sans réseau : insère les nouvelles, met à jour celles dont le brut a changé (`changed_at` ; pour un film ou une série, le rang dans la liste et `num` ne comptent pas, un titre ajouté en tête les décalant tous), supprime les disparues sous le même garde-fou (une copie vide après un déploiement est refusée). Les lignes séparatrices du direct (`•●★---|FR| SPORT |FR|---★●•`) ne sont pas des entrées : chacune nomme la `section` de ce qui la suit. Les radios (`stream_type: radio_streams`) arrivent sans catégorie : elles sont rangées dans une catégorie « RADIOS » à nous (`_radio`), qu'un interrupteur ou une règle masque comme les autres. Un nom changé renvoie le match TMDB en attente (sauf match manuel). Puis `runNaming` (`catalog/grouping/group.ts`) analyse chaque nom : `clean_title`, `year`, marché, langue, qualité, `name_adult`, et pour le direct `name_theme`. |
| `channels` | `catalog/channels.ts`, `providers/iptv/` | la base [iptv-org](https://github.com/iptv-org/database) (`channels.json`, `logos.json` de son API, ≈ 14 Mo) gardée dans `DATA_DIR/iptv-org`, relue au plus une fois par jour et seulement si elle a changé (ETag), chargée dans `iptvorg_channels` ; injoignable, la copie précédente sert. Chaque variante du direct y est rattachée (`catalog_variants.iptv_id`, `iptv_match`) : par l'identifiant EPG du fournisseur (`TF1.fr`) si le nom concorde (inclusion ou similarité ≥ 0,7), sinon par le nom dans les pays de son marché (« ar » = monde arabe), sinon par le nom s'il est unique au monde ; les noms essayés sont le nom nettoyé, sans parenthèses, sans suffixe pays (« EGY »), et le contenu des parenthèses (« AL OULA (ERTU 1) » est aussi « ERTU 1 »). Un rattachement manuel (fiche de l'élément) est gardé. `epg_mismatch` marque un identifiant EPG du fournisseur qui désigne sûrement une autre chaîne (connu d'iptv-org sous un nom qui ne concorde pas, ou au format iptv-org d'un autre pays sans ressemblance) : l'import EPG garde alors les deux identifiants, et le groupement prend celui d'iptv-org seulement si le fournisseur n'a aucun programme sous le sien. La chaîne donne le thème (catégories iptv-org d'abord, un thème précis du fournisseur l'emportant sur « general »), le drapeau adulte et, au groupement, le logo. L'étape n'écrit que ses colonnes, `iptv_theme` et `iptv_adult` ; `theme` et `adult` en sont dérivés par Postgres (`coalesce(iptv_theme, name_theme)`, `name_adult or iptv_adult`) : un échec de `channels` ne défait jamais ce qu'il avait établi |
| `enrich` | `providers/tmdb/enrich.ts` | matching TMDB de tous les éléments en attente, masqués compris (identifiant amont vérifié par preuves, puis recherche par titre) ; lit `clean_title` et `year`. Un point d'avancement toutes les 30 s (`shared/progress.ts`) ; 20 échecs d'accès d'affilée (DNS, réseau, base : `isUnreachable`) l'arrêtent en erreur, le reste restant en attente ; un élément qui échoue trois fois pour une autre raison passe `unmatched` (`match_attempts`). Les `unmatched` de plus de 7 jours sont retentés, et 500 entrées du cache TMDB plus vieilles que 30 jours (les plus anciennes d'abord, parmi celles qu'un contenu utilise) sont relues à chaque passage, plus 5 000 entrées d'avant les logos (sans `images.logos`), titres visibles et sorties les plus récentes d'abord. Les images sont demandées dans la langue des fiches, en anglais et sans langue (`include_image_language`) : `language` seul ne renverrait que les images françaises |
| `filters` | `catalog/rules/apply.ts` | recalcule `hidden_by_rule` depuis les règles regex, sans réseau ; dans le pipeline, laisse la visibilité des contenus à `group` qui suit |
| `group` | `catalog/grouping/group.ts` | variantes → `catalog_contents`, sans réseau : clé stable `tmdb:movie:603`, `fallback:movie:<slug>:<année>`, `live:<marché>-<slug>` ; fiches depuis le cache TMDB, recopiées seulement pour un contenu nouveau, une entrée de cache plus récente que la fiche (`cards_at`) ou une langue changée ; un contenu TMDB garde toujours le titre de sa fiche. Agrégats (dont les `themes` et le drapeau adulte du contenu) sur les variantes visibles |
| `trending` | `providers/tmdb/trending.ts` | remplace `tmdb_trending` par les tendances TMDB de la semaine (films et séries, 100 de chaque) ; les rangées « Top 10 » les croisent avec le catalogue visible |
| `epg` | `providers/xtream/epg.ts` | lit le XMLTV amont en flux (`saxes`) et remplit `catalog_epg_programmes` pour les seules chaînes visibles, en une transaction : l'app lit l'ancien guide jusqu'à ce que le nouveau soit entier ; un import vide ou en échec, même au milieu du téléchargement, garde le guide précédent ; un programme en double (même chaîne, même début) n'est gardé qu'une fois. Les heures passent par les corrections `curation_epg_offsets` (`epg-offsets.ts`) : certains guides du fournisseur sont décalés d'heures rondes (beIN MENA : heure du Qatar prise pour de l'UTC, +3 h). Une règle vise un identifiant (`beINSports3.qa`) ou un suffixe (`*.qa`), l'identifiant l'emportant ; chaque programme garde le décalage qu'il porte (`offset_minutes`), si bien qu'une règle changée déplace aussitôt le guide stocké de la différence. Réglées depuis **Catalogue → EPG** (`/admin/epg`) : la grille des chaînes sur six heures, un clic sur une chaîne ouvre ses programmes du jour et l'aperçu du décalage avant enregistrement. Tous les trois jours à 03:00 (`epg_cron`), le fournisseur donnant six jours |

`runAll()` = `source → merge → channels → enrich → filters → group → trending`, sans les deux étapes TMDB s'il n'y a pas de clé.
TMDB passe avant les filtres : tout est matché une fois pour toutes, et démasquer une catégorie ou
changer une règle ne fait jamais apparaître de titres non matchés. Le groupement reste après les
filtres, ses agrégats ne comptant que les variantes visibles.

Deux **tâches** les lancent : `pipeline` (`runAll`) et `epg` (`runEpg`). Deux jobs `croner` (`protect: true`)
les déclenchent sur `sync_cron` et `epg_cron`, en heure locale ; ils sont recréés à chaque
enregistrement des Paramètres (`onSettingsChange`) et ne font rien tant que le coffre est verrouillé.
À la main : **Tâches → Lancer maintenant** (`launch`), tout le traitement ou à partir d'une étape choisie dans la liste (`runAll(trigger, from)`, pour reprendre après un échec sans relire la source).
Un passage s'arrête à la première étape en échec, sauf `channels`, `enrich` et `trending` : iptv-org ou TMDB
injoignable n'empêche ni les filtres ni le groupement du catalogue importé ; le passage finit alors en erreur.
`merge`, les règles, le groupement et les regroupements de l'admin écrivent les mêmes lignes : ils passent
l'un après l'autre (`withCatalogLock`, `catalog/lock.ts`).

**Journal** (`catalog/journal.ts`, `catalog/runlog.ts`) : chaque passage d'une tâche est
- une ligne `task_runs` (tâche, `cron` ou `manual`, statut, durée) et une ligne `task_steps` par étape
  (statut, chiffres) : le résumé que listent la page Tâches et le tableau de bord ;
- un fichier texte `DATA_DIR/logs/<date>T<heure>_<tâche>_<id>.log` : tout ce que les étapes écrivent
  sur la console pendant le passage (horodaté, étiqueté par étape, URL caviardées par `redactText`),
  plus le récit du pipeline. Un fichier et non la base : il s'écrit même quand c'est Postgres qui tombe.
  La console est dupliquée par `AsyncLocalStorage` : aucune étape n'écrit dans le fichier elle-même.

**Arrêter** (carte de la tâche et page du passage, `POST /admin/tasks/:id/kill`, `killRun`) : un passage que ce
processus fait tourner reçoit le signal d'arrêt de sa tâche (`shared/cancel.ts`) ; les étapes le vérifient entre deux
unités de travail (une tranche, un appel TMDB, un lot du guide), si bien que l'opération en cours finit et que rien de
nouveau ne part. Aucune écriture n'est coupée en deux : une transaction interrompue est annulée entière. Le passage et
son étape finissent `killed` (« Arrêté »), les étapes suivantes ne démarrent pas, rien n'est relancé. Un passage
affiché « en cours » que plus rien ne fait tourner (sa fin n'a pas pu s'écrire, Postgres tombé) est clos `killed` aussitôt,
avec ses étapes restées « en cours ».
Un passage resté « en cours » au démarrage est clos en erreur (`closeOrphanLogs`). Passages et fichiers
sont purgés après 90 jours (`RETENTION_DAYS`), à la fin de chaque passage. `/admin/tasks/:id` affiche les
étapes et la fin du fichier (1 Mo, rafraîchie toutes les 2 s tant que ça tourne), `/raw` le télécharge.

## Tables

Le préfixe dit qui écrit la table. Une copie ou un cache pur d'une source porte le nom de la source ;
ce que le pipeline construit ou annote est `catalog_` ; les choix de l'admin `curation_` ; ce que l'app
enregistre `app_` ; le journal `task_`.

| Préfixe | Tables |
|---|---|
| `xtream_` | `xtream_categories`, `xtream_streams` (copie brute, `source`), `xtream_info_cache` (`get_series_info` / `get_vod_info`) |
| `tmdb_` · `iptvorg_` | `tmdb_cache`, `tmdb_trending` · `iptvorg_channels` |
| `catalog_` | `catalog_categories`, `catalog_variants`, `catalog_contents`, `catalog_episodes`, `catalog_episode_variants`, `catalog_epg_programmes` |
| `curation_` | `curation_filter_rules`, `curation_epg_offsets`, `curation_studios` |
| `app_` | `app_favorites`, `app_watch_progress`, `app_devices` |
| `task_` | `task_runs`, `task_steps` |
| — | `settings` |

Deux niveaux se répondent : variantes (`catalog_variants`, `catalog_episode_variants`) et contenus
(`catalog_contents`, `catalog_episodes`). `catalog_variants` a plusieurs écrivains, chacun ses colonnes :
`merge` (champs du fournisseur, `changed_at`), le naming (`clean_title`… `name_*`), `channels` (`iptv_*`),
`enrich` (`match_*`, `tmdb_id`), `filters` (`hidden_by_rule`), `group` (`content_key`, `content_id`).

## APIs exposées

| Route | Rôle |
|---|---|
| `/player/*` | API REST de l'app Apple (`src/player/`). Contrat : `src/player/types.ts`. Jeton d'appareil `Bearer dvc_…` sauf `/devices` (appairage par code) et `/stream/{source}` (lien signé HMAC lié à l'appareil, 24 h, `302`). `/channels` et `/channels/{id}` portent `now` / `next` (une requête `lateral` pour toute la liste) et `has_epg` = la chaîne a des programmes en base ; `/channels/{id}/programmes` sert ses programmes du programme en cours jusqu'à 6 h (heure du serveur, `TZ`), pour le lecteur du direct — pas de grille complète, le guide du fournisseur n'étant pas fiable. `/search` cherche par préfixes dans l'index plein texte ; s'il ne trouve rien (3 caractères au moins), il prend les titres qui ressemblent à la requête : trigrammes `pg_trgm` sur `search_titles(title, original_title, title_en)` (sans accents, `unaccent`, migration 0021 ; extensions « trusted », créées par le propriétaire de la base), seuil par défaut 0,6 de `word_similarity`. `DELETE /playback/{id}/progress` sort un titre de « Reprendre » ; `PUT /playback/{id}/watched` `{ watched, season? }` marque vu (position en fin) ou non vu (ligne supprimée) un film ou un épisode, et sur un id de série toute la saison `season`. `/movies` et `/series` commencent par « Top 10 de la semaine » (si `tmdb_trending` en croise) ; `/movies/studios` et `/series/studios` servent les studios, filtre `studio=company:3` des listes ; `/movies/sagas` et `/movies/sagas/{id}` servent les sagas ; la fiche d'un film porte `saga` quand la sienne est servie. La fiche porte `cast` avec `id` (`person:<id TMDB>`) et `photo` ; `/people/{id}` sert les titres visibles d'un acteur (films et séries, sortie la plus récente d'abord), retrouvés par l'index GIN `jsonb_path_ops` sur `catalog_contents.cast`, sans table de personnes ni appel réseau. |
| `/img/<size>/<file>` | images TMDB en cache (`DATA_DIR/images`), route de `providers/tmdb/img-route.ts` montée par `main.ts` ; URL portée par chaque carte |
| `/img/logos/<id>-<hash>.<ext>` | logos iptv-org des chaînes en cache (`DATA_DIR/images/logos`), route de `providers/iptv/logos.ts` ; seul le logo courant d'une chaîne connue est servi (pas de proxy ouvert), le hash suit l'URL amont. `catalog_contents.logo_url` le porte en chemin relatif, préfixé par `channelLogo` ; sinon l'URL du fournisseur |
| `/health` | santé (base joignable ; l'état du coffre est dans le corps, pas dans le code HTTP) |

## Structure

Un dossier par chose que fait le système. Chaque bloc s'importe par son `index.ts`, qui liste
nommément ce qu'il expose : on importe `@/catalog`, jamais `@/catalog/grouping/group`, et ce
qui n'est pas dans l'index est privé au dossier. Le graphe des dépendances est vérifié par
`src/__tests__/architecture.test.ts` :

```
main.ts     composition : Hono, middlewares, montage de player, admin et /img, planification, arrêt propre
admin/      pages (routes.tsx + view.tsx, data.ts pour les seules requêtes de présentation) ;
            layout.tsx (menu latéral Basecoat réductible à ses icônes sur md+, tiroir sous md), ui.tsx (composants partagés, couleurs des statuts), icons.tsx (les icônes Lucide autorisées),
            assets/admin.css (point d'entrée Tailwind, sans règle à nous), format.ts (nombres,
            dates, cron), labels.ts, http.tsx, session.ts, csrf.ts. Aucune écriture en base : l'admin appelle
            le domaine. catalog, groups, item = l'import brut et le groupement, ce qu'on corrige ;
            studios = les hubs de l'app ; favorites et history = ce que l'app a enregistré, lus et modifiés par les fonctions de
            `player/` avec un contexte sans appareil ; caches n'affiche que des compteurs.
player/     /player, un fichier par ressource (devices, stream, info, home, lists, sagas, people, studios, sheets,
            channels, playback, search, favorites) ; context, auth, http, cards, versions, stream-links, epg (maintenant / ensuite),
            contents (ce que l'app a le droit de voir), progress, episodes (wire), types.ts = le contrat
catalog/    le domaine : naming (la grammaire des noms), keys (contentKey, parseKey, préfixes),
            queries (lectures partagées), rules/ (moteur, application, gestion), grouping/ (group,
            split/merge manuel), matching (correction TMDB manuelle), episodes (arbre d'une série,
            rafraîchi à la demande), journal et runlog (passages, fichiers de log), pipeline (étapes, tâches, crons)
devices/    appairage par code, jetons, déverrouillage du coffre au premier appel
providers/  xtream/ (client, xtreamFromSettings, import, epg, upstreamStreamUrl), tmdb/ (client,
            match, enrich, card-fields, cache images + route /img), iptv/ (sync de la base iptv-org, choix
            et cache des logos + route /img/logos). Un provider ne connaît pas le catalogue.
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
de l'app : le cache d'images à la première demande, `catalog/episodes` qui relit
`get_series_info` et la saison TMDB quand l'arbre d'une série a plus de 12 h, et `catalog/cards` qui relit
la fiche TMDB d'un film ou d'une série qu'on ouvre quand son entrée de cache a plus de 7 jours ou date d'avant
les logos. La fiche attend TMDB 2 s au plus, puis répond avec ce qu'elle a (la relecture sert à l'ouverture
suivante) ; après un échec, ce contenu laisse TMDB tranquille 10 min.

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
- Alias `@/` → `src/`. Les vues JSX rendent en HTML ; interactivité minimale via `hx-*` et le script de
  Basecoat (menu en tiroir) ; replis en `<details>`. Uniquement des classes Tailwind et Basecoat, pas d'attribut `style`,
  et des noms de classes écrits en entier : Tailwind les trouve en lisant `src/admin`, un `text-${x}` ne serait pas généré.
  Les couleurs de statut passent par `Badge` et ses tons (`ui.tsx`), les icônes par `Icon` (`icons.tsx`).
- **Une seule source pour chaque fait** : les mappages de `kind` (`tmdbMediaType`) dans `db/kind.ts` ;
  la forme des clés dans `catalog/keys.ts` (`isTmdbKey`, `hasTmdbKey`, `isEpisodeKey`…) ; la
  suppression d'accents dans `shared/text.ts` (quatre dérivés nommés par usage, dont les résultats
  sont stockés en base : ne pas les unifier davantage) ; les valeurs par défaut des réglages dans
  `config/settings.ts` (`getSettings()` les applique, aucun appelant n'a de repli) ; le client Xtream
  par `xtreamFromSettings(s)`.
- **Visibilité et agrégats** : un seul jeu de prédicats, `db/visibility.ts` (`visibleItem`, `hiddenItem`,
  `visibleCategory`, `isItemHidden`), utilisé jusque dans l'agrégat SQL du groupement (`max(added_at)`, compteurs, qualités, langues).
  Une catégorie masquée masque ses éléments sans toucher leurs colonnes. Côté app, `player/contents.ts` y ajoute
  le réglage « contenus adultes ». **Toute la logique servie à l'app (tris, dates, compteurs, genres, thèmes, rangées) se calcule
  sur les seules variantes visibles** : une variante masquée n'existe pas pour elle. Si un contenu n'a aucune variante visible,
  les agrégats se replient sur toutes les variantes pour éviter les colonnes nulles, mais l'app ne le verra pas. L'admin consulte les variantes brutes dans `catalog_variants`.
- **Dates et tris** :
  - **Date d'arrivée** (`catalog_variants.added_at`) = `raw.added` (films, direct) ou `raw.last_modified` (séries). En cas de donnée amont sale ou absente, on garde la valeur existante en base, sinon on utilise `now()`.
  - **Date d'arrivée d'un contenu** (`catalog_contents.added_at`) = la plus récente (`max`) des dates d'arrivée de ses variantes visibles.
  - **Date de sortie** (`catalog_contents.release_date`) = issue de TMDB, avec un repli au 1er janvier de l'année du titre s'il n'y a pas de match. C'est le tri par défaut des listes et rangées (la plus récente d'abord).
  - **Nouveautés** : films sortis il y a moins de 12 mois, triés par date d'ajout décroissante. Pas de ligne "Ajoutés récemment". Pour les séries, "Derniers épisodes" n'a pas de contrainte de date de sortie.
- **Logo du titre** (`catalog_contents.title_logo_path`, `logo` de la fiche) : un logo TMDB en PNG (le SVG ne
  s'affiche pas sur Apple TV), choisi par `logoOf` (`providers/tmdb/card-fields.ts`) : dans la langue des fiches,
  sinon en anglais si le titre affiché est le titre anglais, sinon sans langue, le mieux noté d'abord. Aucun ne
  convient = le titre reste en texte.
- **Sagas** : une saga = une collection TMDB (`belongs_to_collection`, copiée dans `catalog_contents.saga_*` par le
  groupement, aucun appel réseau). Elle n'existe pour l'app qu'avec au moins deux films visibles
  (`player/sagas.ts`) ; la liste va de la saga au film le plus récent à la plus ancienne, ses films du plus
  récent au plus ancien, comme les titres d'un studio. Le tableau de bord les compte.
- **Distribution** : `catalog_contents.cast` garde les 10 premiers du générique TMDB (`id`, nom, rôle, `profile_path`) ;
  seuls ces acteurs mènent à `/people/{id}`. La migration 0023 remet `cards_at` à NULL : le prochain groupement
  recopie toutes les fiches. Les lignes d'avant n'ont ni `id` ni photo (`id: null` côté API, pas de lien).
- **Studios** : table `curation_studios` (société de production TMDB ou chaîne), choisie et ordonnée dans l'admin
  (`catalog/studios.ts`, suggestions tirées du cache TMDB des contenus visibles, sans réseau, cherchables par nom ; `/admin/studios/company:3` montre les titres visibles d'un studio, même forme que le filtre `studio=` de l'app) ; liste par
  défaut semée par la migration `0014`. Le groupement copie `production_companies` et `networks` dans
  `catalog_contents.company_ids` / `network_ids`. Un studio sans titre visible du type n'est pas servi. Son `backdrop` est celui de son titre
  visible le plus récent qui en a un : le fond de son écran dans l'app.
- **Thèmes du direct** : `/player/channels` groupe par marché × thème (« France · Sport »). Le thème d'une
  variante vient d'abord de sa chaîne iptv-org (étape `channels`), sinon de sa section (la ligne séparatrice qui la précède dans sa catégorie), sinon de sa
  catégorie (« SPORTS HD ») ; `naming.ts` porte le vocabulaire (`LIVE_THEMES`, `themeOf`, `liveTheme`) dans
  les langues du fournisseur. Une section au nom de la catégorie ou d'un pays est la liste généraliste,
  sauf dans une région (« BALKANS ») où les pays sont les sections ; le monde arabe (« ARAB WORLD »,
  « MAGHREB ») est rangé par thème comme le reste, le nom de la chaîne le disant à défaut d'iptv-org. Un libellé inconnu
  reste un groupe à part (« Tf1+ », « Molotov ch. ») : rien n'est perdu, tout se voit dans l'admin.
- **Groupement** : `catalog/naming.ts` est *la* grammaire des noms. Une variante (`catalog_variants`) = une
  entrée du fournisseur : un flux jouable pour un film ou une chaîne, une fiche série dont les épisodes jouables sont
  `catalog_episode_variants` ; `catalog_contents.key` = identité exposée aux apps, jamais `catalog_contents.id`. Les mises à jour
  massives passent par `unnest()` avec le template postgres-js (`client`), pas `sql` de Drizzle qui
  éclate les tableaux. `regroupItems` (admin), `runGrouping`, `runMerge` et `applyRules` se sérialisent entre eux.
- **Données amont non fiables** : `xtream_id` est du texte opaque et non unique (dédoublonnage à
  l'import), les champs manquants sont tolérés, l'identifiant TMDB fourni n'est jamais cru sur parole.
- **Secrets** : un seul mot de passe (hash bcrypt dans `.env`), demandé avec l'e-mail `ADMIN_EMAIL` sur la page de connexion de l'admin (pas pour les clients IPTV), clé AES-256-GCM dérivée en RAM
  (`config/vault.ts`), chiffrement transparent des réglages sensibles dans `config/settings.ts`. Après
  un redémarrage le serveur est **verrouillé** jusqu'à la première requête authentifiée ; le premier
  appel d'un appareil appairé déverrouille grâce à `app_devices.wrapped_key`.
- **Ne jamais journaliser une URL brute** : le mot de passe circule dans les query strings et les
  chemins de flux. Passer par `requestLogger()` de `shared/http-log.ts`.

## Déploiement

Image `linux/amd64` construite par GitHub Actions (`.github/workflows/build.yml`, à la racine
du dépôt) et publiée sur `ghcr.io` ; `Containerfile` multi-stage : esbuild produit
`dist/main.js` et `dist/db/migrate.js` (chemin figé : le Quadlet de migration en dépend), dépendances incluses, aucun `node_modules` en
production. Cible : Fedora CoreOS, podman rootless + systemd Quadlet, derrière Caddy.

- Variables : `ADMIN_PASSWORD_HASH` (obligatoire), `DATABASE_URL` et `SESSION_SECRET`
  (obligatoires en production), `ADMIN_EMAIL` (défaut `a.bachar@hotmail.fr`), `DATA_DIR`, `PORT`, `TZ`.
- `DATA_DIR` : les caches reconstructibles (images TMDB et logos dans `images/`, base iptv-org dans `iptv-org/`) et les fichiers de log des passages (`logs/`, perdables : 90 jours d'historique). Seule la base se sauvegarde, guide des programmes compris.
- Le mot de passe circule en clair dans les URL des players (protocole Xtream) : LAN ou HTTPS uniquement.
