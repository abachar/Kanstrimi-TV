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

Quatre tâches (`catalog/pipeline.ts`), chacune avec son cron dans Paramètres : **Traitement complet** (quatre étapes),
**EPG**, **Tendances TMDB** et **Intros et génériques**. Chaque étape n'écrit que ce qui change ; le traitement peut repartir d'une étape
(**Tâches → Lancer à partir de…**).

| Étape | Rôle |
|---|---|
| `source` | copie brute des listes Xtream, refusée si vide ou si le catalogue fond de moitié (panne du fournisseur) ; puis copie brute → variantes du catalogue, par différence, et analyse des noms (titre, année, marché, langue, qualité, édition) |
| `enrich` | matching TMDB des éléments en attente (`catalog/matching.ts`), qui relit peu à peu les fiches anciennes ; puis rattachement des chaînes du direct à iptv-org : thème, logo, drapeau adulte, pays dans une région. L'un en panne n'empêche pas l'autre |
| `group` | variantes → contenus (`catalog_contents`), fiches tirées du cache TMDB, agrégats sur les variantes visibles |
| `filters` | le filtre de chaque type (`catalog/filters/`) garde ou écarte chaque version, puis les contenus touchés recomptent leurs agrégats, `visible` (une version servie) et les arrivées de la liste d'attente. Un contenu sans version servie est masqué ; une version que le filtre n'a pas encore vue est écartée |

| Tâche à part | Rôle |
|---|---|
| `epg` | guide des programmes des chaînes visibles, deux fois par jour (le fournisseur ne couvre qu'un jour et demi), l'EPG de chaque variante, complété par les sources de secours ; décalages horaires corrigés dans l'admin |
| `trending` | tendances TMDB de la semaine (rangées « Top 10 », Top Shelf), une fois par jour ; sans clé TMDB, le cron passe son tour |
| `markers` | export quotidien de SkipDB (récaps, intros, génériques, aperçus du prochain épisode), remplacé en entier ; un export vide ou fondu de moitié garde le précédent |

TMDB passe en premier : tout est matché une fois, et un titre affiché n'attend jamais sa fiche. Les filtres passent en
dernier : ils lisent le contenu tel que l'app le montre.
Le matching est un seul algorithme, `explainMatch` : `enrich` applique son verdict, l'admin l'affiche sous « Pourquoi ? ».
Une panne de TMDB (réseau, 429 qui dure) laisse l'élément en attente, jamais `unmatched` ; le client TMDB ne dépasse
pas 35 requêtes par seconde.
Un passage s'arrête à la première étape en échec, sauf `enrich` (réseau externe). Chaque passage laisse une ligne dans
`task_runs`, une par étape dans `task_steps`, et un fichier de log dans `DATA_DIR/logs/` avec le détail de chaque
partie d'une étape ; il peut être arrêté depuis l'admin. La fin de chaque passage purge lignes et fichiers de plus de 5 jours.

## Tables

Le préfixe dit d'où vient la donnée : `xtream_` (copie et cache du fournisseur), `tmdb_`, `iptvorg_`, `skipdb_`, `theintrodb_`, `introdb_` (caches des sources),
`catalog_` (ce que construit le pipeline, plus les corrections de l'admin sur les variantes et les épisodes construits à l'ouverture d'une fiche), `curation_` (choix de l'admin), `app_` (ce que l'app enregistre : favoris,
progression, temps regardé du direct, appareils), `task_` (journal), et `settings`.
Deux niveaux : variantes (une entrée du fournisseur) et contenus (`catalog_contents.key`, la seule identité exposée à l'app).

## API

| Route | Rôle |
|---|---|
| `/player/*` | API de l'app Apple. Contrat : `src/player/types.ts`. Jeton d'appareil `Bearer`, sauf l'appairage (`/devices`). |
| `/img/…` | images TMDB et logos iptv-org en cache disque (un téléchargement demande une URL signée par le serveur (`?k=`) ; un fichier déjà en cache se sert à tous) ; `/img/shelf/…` = images du Top Shelf, logo du titre dessiné sur le fond par `sharp` |
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
catalog/    le domaine : grammaire des noms, clés, filtres, groupement, épisodes, pipeline
devices/    appairage, jetons
providers/  xtream/, xmltv/ (lecture d'un guide XMLTV, gzip compris), tmdb/ (dont le cache d'images), iptv/, skipdb/, theintrodb/, introdb/ ; un provider ne connaît pas le catalogue et n'écrit que ses tables (`xtream_`, `tmdb_`, `iptvorg_`, `skipdb_`, `theintrodb_`, `introdb_`), vérifié par `architecture.test.ts`
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
  `a,b` l'un de, `pays:aucun` sans valeur, `< <= > >= = ..` pour les nombres, `/regex/`, `-` nie ; `&&` « et », `||` « ou » (plus faible),
  toujours écrits (un espace seul entre deux termes est une erreur ; des mots libres qui se suivent forment un seul
  texte : `casa de papel`), `( … )` groupe, `-( … )` nie un groupe ; casse et accents ignorés. Chaque type
  (Direct, Films, Séries) a ses champs, dans un seul registre (`catalog/query/fields.ts`) qui sert aux recherches, aux
  filtres et à l'aide : sans préfixe, la fiche (ses colonnes, sa fiche TMDB en cache) ; `variant.` et `xtream.`, une
  version (ce qu'on en lit, ce qu'en dit le fournisseur). Avec un champ de version, l'expression se juge version par
  version, ses champs de fiche lus sur la fiche de la version : une recherche trouve les fiches dont une version passe. Vérifiée champ par champ avant tout SQL, ses valeurs toujours en paramètres.
- **Filtres** (`curation_filters`) : un au plus par type, une requête qui dit ce que l'app garde, comme une recherche dit
  ce qu'elle affiche ; sans filtre, tout est gardé. Il se juge version par version, ses champs de fiche lus sur la fiche de
  la version (`catalog_variants.hidden_by_rule` : true écartée, null pas encore jugée) ; une fiche sans version gardée
  disparaît. Par exemple `marché:"fr" || (marché:"ar" && (pays:maroc || (thème:"sport" && pays:aucun)))` pour le
  direct, `variant.langue:"vf","vo","ar" && xtream.marché:"fr","ar","en"` pour les films. Ils s'appliquent à l'étape `filters` ;
  enregistrer un filtre ne l'applique pas (trop lent) : `filters_pending` affiche un bandeau. Un regroupement manuel (séparer, fusionner, associer TMDB ou iptv-org) fait juger aussitôt ce qu'il touche.
- **Écrans Live, Films, Séries de l'admin** : ce que l'app affiche, par les fonctions mêmes de `/player` : ses rangées
  repliées, chacune dépliée en tableau de tous ses titres (studios et sagas sur deux niveaux) ; la recherche porte sur les
  contenus. Tout mène à la fiche d'un contenu (`/admin/content/:id`), ses variantes dépliables avec leurs données Xtream,
  leur interrupteur de visibilité et les corrections (TMDB, iptv-org, séparer, fusionner) ; `/admin/item/:id` y redirige
  (une variante pas encore groupée s'y montre seule). Plus d'écran pour masquer une catégorie : celles masquées à la main
  le restent. La fiche d'une chaîne montre aussi son rapprochement EPG (les
  identifiants que chaque variante essaie, dans l'ordre de l'app, et la source de secours) et tous ses programmes en base.
  Un fil d'Ariane dans l'en-tête place chaque page sous son entrée du menu (`page(…, { under })` pour une page de détail).
- **Visibilité** : un seul jeu de prédicats (`db/visibility.ts`). Une variante est visible si son filtre la garde et que ni
  la main, ni sa catégorie ne la masquent ; un contenu est visible si une de ses variantes l'est. Tout ce que voit l'app (tris, dates, compteurs, rangées)
  se calcule sur les seules variantes visibles. Côté app, `player/contents.ts` y ajoute le réglage adulte : `visibleContent`
  pour les contenus, `servedVariant` pour les variantes (un contenu mixte reste servi, sans ses variantes adultes).
  Les genres de Films et Séries restent en mémoire jusqu'à ce que le groupement réécrive les contenus
  (`contentsGeneration`) : une écriture directe dans `catalog_contents` ne les rafraîchit pas.
- **Dates** : arrivée = date du fournisseur (`added`, `last_modified` pour une série) ; sortie = TMDB, tri par défaut.
- **Données amont non fiables** : `xtream_id` n'est pas un identifiant, les champs manquent, l'identifiant TMDB fourni
  n'est jamais cru sur parole.
- **Mises à jour massives** par `unnest()` avec le client postgres-js, pas le `sql` de Drizzle qui éclate les tableaux, ou
  par `jsonb_to_recordset` d'un seul paramètre (les cartes, colonnes décrites une fois dans `group.ts`). Une carte
  n'est réécrite que si elle change.
  Le merge, les filtres et le groupement passent l'un après l'autre (`withCatalogLock`).
- **Secrets** : le compte du fournisseur et la clé TMDB viennent de l'environnement (secrets podman en production), jamais
  de la base ; l'admin les montre sans les modifier, un changement demande un redémarrage. Un seul mot de passe (bcrypt),
  celui de l'admin : `/admin/login` passe toujours par bcrypt et, par adresse, après cinq échecs, double l'attente à chaque nouvel échec (429).
  Le cookie de session porte sa génération, sa date et une empreinte du hash : « Déconnecter toutes les sessions »
  (Paramètres), un nouveau mot de passe ou 30 jours le rendent caduc. Une erreur inattendue s'affiche sans son détail,
  avec une référence à chercher dans le journal ; un identifiant de route passe par `intParam()` (404 sinon).
- **Textes des cartes** (`player/cards.ts`) : les listes, l'accueil, la recherche, « À suivre » et les épisodes envoient des
  `ContentItem` dont le serveur écrit les textes (« 2019 · ★ 8.5 », badges dans l'ordre, `quality` = le badge de qualité seul, « S2 · É4 · 1 h 08 restantes »,
  en-têtes « À SUIVRE ») ; l'app les dispose sans les recalculer. La fiche reste un `Card`.
- **Recherche** (`player/search.ts`) : une seule liste de 40, films, séries et chaînes mêlés, triée par pertinence (titre égal, puis le
  plus proche, puis le plus voté) ; une série le dit (« Série · 2025 »), une chaîne donne son groupe du Direct. un terme d'un caractère est un mot entier, un préfixe à partir de deux ; seuls les
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
  régional (`ar`) se découpe par pays : l'étape `enrich` (partie iptv-org) écrit `country` (`regionCountry`) : pays iptv-org s'il est
  dans la région, sinon la section du fournisseur ; une chaîne rangée sous un thème ou un bouquet seulement (beIN,
  OSN) reste sous « Monde arabe ».
- **« Si vous avez aimé… »** (`catalog/recommendations.ts`, `player/related.ts`) : recommandations TMDB (`/recommendations`,
  une page) demandées à la volée (ouverture d'une fiche, lecture, graines de l'accueil en fond), gardées 7 jours dans
  `tmdb_recommendations` (ids seuls), croisées avec le catalogue visible à chaque lecture. Jamais un titre vu ; la suite
  d'un titre écarte aussi ceux en cours, l'accueil aussi « Ma liste ». `/playback/{id}/suggestions` : panneau du lecteur
  et suite (saga d'abord) ; `/playback/{série}` lit l'épisode où elle reprend.
- **Récaps, intros et génériques** (`catalog/markers.ts`, `POST /playback/{id}/markers`) : l'app envoie ce qu'elle lit
  dans le fichier qu'elle ouvre (durée, chapitres) et reçoit ce qui se passe (`skips` : « Passer le récap » pour un
  épisode, « Passer l'intro », jamais superposés) et le début du générique (« À suivre » dès ce moment, 20 s de
  décompte). Le serveur n'ouvre aucun fichier : le fournisseur limite le débit (429 après une dizaine de requêtes
  rapprochées). Dans l'ordre : les chapitres nommés du fichier (« Recap », « Intro », « Credits », ceux des originaux
  Netflix et Amazon), puis SkipDB (importée, lue par l'id IMDb que TMDB donne), puis TheIntroDB et IntroDB, demandées
  ensemble à la lecture pour ce qui manque encore et gardées un mois (une semaine pour un titre inconnu ; 400 requêtes
  par jour au plus chacune). Elles apprennent donc ce qui est regardé, pas SkipDB. IntroDB ne dit pas sur quel fichier
  elle a mesuré : elle ne donne que le récap et l'intro d'un épisode. Un fichier qui nomme son intro et son générique
  dit tout : rien n'est demandé, pas même le récap. Le générique n'est donné que s'il est sûr, un faux couperait la
  fin : chapitre nommé en dernier, ou mesure d'une base sur un fichier de même durée (à 3 s près) et sans rien après
  que l'aperçu du prochain épisode. Le récap et l'intro sont donnés même non vérifiés ; quand les bases les font se
  chevaucher, l'intro commence où le récap finit. Un film dont TMDB annonce une scène pendant ou après le générique
  (mots-clés), ou dont les mots-clés sont inconnus, garde sa carte pour la fin du fichier.
- **Guide des programmes** (`catalog/epg.ts`, `epg-sources.ts`) : un import remplace chaîne par chaîne ce qu'il apporte ; une
  chaîne absente du fichier (XMLTV du fournisseur incomplet) garde ses programmes jusqu'à leur fin. Un fournisseur en panne
  ou vide n'efface rien, les sources passent quand même et l'étape finit en échec. **Sources de secours** (page EPG, une
  page chacune sous `/admin/epg/sources`) : des fichiers XMLTV (open-epg…) pour les chaînes visibles que le fournisseur laisse
  sans programme. Lien par le nom (`guideNameKey` : sans accents, pays, qualité ni parenthèses, titre ou id du fournisseur),
  ou à la main (une chaîne du fichier, ou aucune), qui vaut toujours. La première source de la liste qui a des programmes
  donne `catalog_contents.epg_fallback_id` (`@<source>/<id>`), que l'app essaie après les ids du fournisseur. Un décalage
  par source ; une règle de suffixe du fournisseur (`*.qa`) ne la touche pas.
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
