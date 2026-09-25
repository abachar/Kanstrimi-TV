# Conception — groupement des variantes et API REST `/api/v1`

*Blocs 1 et 3 de `server/BACKLOG.md`. Rédigé le 2026-09-25, avant toute ligne de code.
Les décisions de `tvOS/ETUDE.md` (identité à deux niveaux, curseur, Basic auth, URL de
flux opaque) sont reprises telles quelles ; ce document dit comment les réaliser côté
serveur.*

---

## 1. Ce qu'on construit, en une page

Aujourd'hui la base contient des **entrées fournisseur** (`items`) : « |FR| Tenet (4K) »
et « |FR| Tenet » sont deux lignes sans lien. On ajoute un niveau au-dessus :

```
contents  (l'œuvre : Tenet, tmdb:movie:577922)      ← ce que l'app affiche, favorise, reprend
   └── items (les variantes : FR 4K mkv, FR FHD mkv)  ← ce que le lecteur joue, jetable
```

Le **groupement** est une étape sans réseau qui calcule pour chaque `item` une clé de
contenu, crée ou met à jour la ligne `contents`, et y recopie les champs de carte (titre,
année, affiche, note, genres) pour que les listes se servent sans jointure JSON.

L'**API REST** lit `contents` pour les listes, la recherche et les fiches, et descend dans
`items` uniquement pour les variantes. Elle coexiste avec l'API Xtream, qui **ne change
pas** : elle continue de lister les `items` un par un, comme aujourd'hui.

Trois décisions à retenir avant de lire la suite :

1. **L'API Xtream reste figée.** Le point « une seule entrée par groupe dans
   `get_vod_streams` » du bloc 1 est abandonné : TiviMate affichera les doublons, comme
   avant. Le groupement ne sert que le REST. (`server/src/routes/xtream.ts`,
   `lib/api/catalog.ts`, `wire.ts`, `context.ts` ne sont pas touchés.)
2. **Un `item` est une variante, il n'y a pas de table `variants`.** Une ligne `items`
   porte déjà une langue, une qualité et un `stream_id` ; on lui ajoute ces colonnes
   extraites et un `content_id`. Pas de troisième table.
3. **L'identité exposée est la clé texte, pas le `serial`.** `contents.key`
   (`tmdb:movie:577922`) est l'identifiant REST. Une ligne `contents` peut être supprimée
   et recréée sans que l'app ni les futures tables `favorites` / `watch_progress` (qui
   référenceront `content_key`, jamais `contents.id`) s'en aperçoivent.

---

## 2. Bloc 1 — groupement des variantes

### 2.1 Extraction des tags : `src/lib/grouping/tags.ts`

Un seul module pur, sans base ni réseau, qui remplace `cleanTitle()` de
`lib/tmdb/match.ts` (qui devient un simple réexport) pour n'avoir **qu'une grammaire**.
Il fusionne les regex de `match.ts` (déjà calibrées sur le catalogue en production) et
celles de `_Old/kanstrimi/…/cleanNames.ts` (préfixes de marché à 90 codes, tags Unicode
`ᴴᴰ ᵁᴴᴰ`, délais `|-12H|`, placeholders d'événements pour le direct).

```ts
type ParsedName = {
  title: string;          // titre nettoyé, pour l'affichage et TMDB
  year?: number;
  market?: string;        // "fr", "be", "ma"… depuis |FR|, FR -, [FR] — le préfixe
  lang?: Lang;            // "fr" | "vostfr" | "multi" | "en" | "it" | … | undefined
  quality?: Quality;      // "sd" | "hd" | "fhd" | "4k"
  tags: string[];         // ce qui reste d'informatif : "hdr", "dv", "hevc", "3d"
  seasonHint?: number;    // séries : « Vincenzo (MULTI) S01 » → 1
};
export function parseName(name: string, kind: "live" | "vod" | "series"): ParsedName;
export const QUALITY_RANK: Record<Quality, number>; // sd 1 · hd 2 · fhd 3 · 4k 4
```

Règles de normalisation, dans cet ordre :

| Entrée | `lang` | Remarque |
|---|---|---|
| `FR`, `VF`, `VFF`, `VFQ`, `TRUEFRENCH`, `FRENCH` | `fr` | |
| `VOSTFR`, `VOST`, `SUB` (sans autre langue) | `vostfr` | |
| `MULTI`, `MULTI-AUDIO` | `multi` | |
| `EN`, `ENG`, `VO` | `en` | |
| autre code ISO à deux lettres | code en minuscules | |
| rien | *(absent)* | l'app le traite comme « langue du marché » |

| Entrée | `quality` |
|---|---|
| `SD`, `480P`, `ˢᴰ` | `sd` |
| `HD`, `720P`, `ᴴᴰ` | `hd` |
| `FHD`, `1080P`, `BLURAY`, `REMUX` | `fhd` |
| `4K`, `UHD`, `2160P`, `ᵁᴴᴰ` | `4k` |

Le **marché** est distinct de la langue : `|FR| Tenet (VOST)` est marché `fr`, langue
`vostfr`. Pour le direct, le marché fait partie de l'identité (TF1 belge et TF1 française
sont deux chaînes) ; pour les films et séries, il ne compte pas (TMDB tranche).

Le `seasonHint` est indispensable : le fournisseur découpe certaines séries en une entrée
par saison (« Vincenzo (MULTI) S01 »). Sans lui, chaque saison serait un groupe.

**Test de non-régression :** un corpus de ~300 noms réels tirés des trois listes
(`server/src/lib/grouping/__tests__/corpus.txt`, une ligne `nom ⇒ titre | année | lang | quality`),
plus la garantie que `parseName(n, "vod").title` égale l'ancien `cleanTitle(n).title` sur
les cas du test existant de `match.ts`. Le remplacement de `cleanTitle` peut faire bouger
des `clean_title` en base : les `match_status = 'manual'` sont conservés (déjà le cas dans
`upsertItems`), les autres seront remis en `pending` par la comparaison de nom déjà
existante seulement si le nom amont change — donc pas de re-matching massif. Vérifier sur un
`npm run test` que le corpus ne change pas plus d'une poignée de titres.

### 2.2 Schéma

Migration `0002` (Drizzle SQL générée, appliquée par `src/db/migrate.ts`).

```sql
create table contents (
  id            serial primary key,
  key           text not null unique,          -- tmdb:movie:577922 · tmdb:tv:1396 · title:vod:tenet:2020 · live:fr:tf1
  kind          content_kind not null,
  tmdb_id       integer,
  -- champs de carte, dénormalisés par l'étape de groupement
  title         text not null,
  original_title text,
  year          integer,
  poster_path   text,                          -- chemin TMDB (/abc.jpg), l'URL /img/ est construite à la sortie
  backdrop_path text,
  rating        real,
  vote_count    integer,
  genre_ids     integer[] not null default '{}',
  runtime       integer,                       -- minutes ; séries : durée d'épisode
  -- direct
  market        text,
  logo_url      text,                          -- stream_icon amont de la meilleure variante
  category_xtream_id text,                     -- catégorie amont de la meilleure variante (repli de navigation)
  -- agrégats
  variant_count integer not null default 0,
  visible       boolean not null default false,
  added_at      timestamptz not null,          -- min(items.added_at) du groupe
  search        tsvector,                      -- titre + titre original + 10 acteurs + réalisateur, accents retirés
  updated_at    timestamptz not null default now()
);
create index contents_list_idx   on contents (kind, visible, added_at desc, id);
create index contents_title_idx  on contents (kind, visible, title, id);
create index contents_rating_idx on contents (kind, visible, rating desc nulls last, id);
create index contents_year_idx   on contents (kind, visible, year desc nulls last, id);
create index contents_genres_idx on contents using gin (genre_ids);
create index contents_search_idx on contents using gin (search);

alter table items
  add column content_key   text,               -- clé calculée, jointure vers contents.key
  add column content_id    integer references contents(id) on delete set null,
  add column key_override  text,               -- fusion / séparation manuelle (admin)
  add column market        text,
  add column lang          text,
  add column quality       text,
  add column quality_rank  integer not null default 0,
  add column tags          text[] not null default '{}',
  add column season_hint   integer;
create index items_content_idx on items (content_id);
create index items_content_key_idx on items (content_key);
```

Pourquoi dénormaliser sur `contents` plutôt que joindre `tmdb_cache` : les listes REST
trient et filtrent sur `rating`, `year`, `genre_ids` pour 35 000 films. Un tri sur
`(data->>'vote_average')::real` dans un JSONB de 20 Ko par ligne ne s'indexe pas
raisonnablement ; six colonnes plates et quatre index composites, si.

Pas d'extension `unaccent` : l'utilisateur Postgres du conteneur n'est pas forcément
superuser. Les accents sont retirés en JS (`normalize("NFD")`) avant `to_tsvector('simple', …)`
et sur la requête avant `to_tsquery`. Même règle des deux côtés, aucun `CREATE EXTENSION`.

### 2.3 La clé de contenu

Calculée en JS pour chaque `item`, dans cet ordre de priorité :

1. `key_override` s'il est renseigné (fusion ou séparation manuelle).
2. `tmdb_id` présent et `match_status ∈ {matched, manual}` → `tmdb:movie:<id>` ou `tmdb:tv:<id>`.
3. Sinon, films et séries → `title:<kind>:<slug(title)>:<year|->`, où `slug` est la
   normalisation de `match.ts` (`normalize()`) avec tirets, tronquée à 80 caractères.
4. Direct → `live:<market|->:<slug(title)>`.

Conséquences assumées :

- Avant enrichissement, deux « Pinocchio » sans année tombent dans le même groupe de repli.
  Dès que TMDB les sépare, ils migrent chacun vers leur clé `tmdb:`. Le cron enchaîne
  `source → enrich → group`, la fenêtre est courte. Ceux que TMDB ne trouve pas restent
  fusionnés : c'est visible dans l'admin (filtre « TMDB introuvable ») et c'est le même
  compromis qu'aujourd'hui.
- Un `item` change de groupe quand son matching change (auto ou manuel). Le groupe
  précédent, s'il se vide, est supprimé. Une clé `title:` peut donc disparaître puis
  réapparaître : c'est pour cela que rien d'externe ne référence `contents.id`.
- Deux variantes de même `lang` et `quality` dans un groupe (même film dans deux
  catégories) restent deux variantes. L'app prend la première ; on ne dédoublonne pas.

### 2.4 L'étape `group` : `src/lib/grouping/group.ts`

Quatrième job dans `lib/jobs/jobs.ts`, au même rang que `filters` : sans réseau,
idempotent, relançable seul depuis le tableau de bord. `runSync()` l'appelle après
`applyRules()`, `runEnrich()` l'appelle en fin d'exécution, `assignManual()` la déclenche
pour un seul item. Journalisée dans `sync_logs` sous `job = 'group'`.

```
runGrouping()
 1. select id, kind, name, tmdb_id, match_status, key_override, raw from items   (≈ 90 000 lignes, ~50 Mo de raw : lire par tranches de 5 000 avec un curseur id > last)
 2. parseName() + clé → update items set content_key, market, lang, quality, quality_rank, tags, season_hint
    (une seule requête par tranche : unnest de tableaux, jamais 90 000 UPDATE)
 3. insert into contents (key, kind, tmdb_id, title, year, added_at) select distinct on (content_key) …
    from items … on conflict (key) do update set tmdb_id = excluded.tmdb_id
    — le titre provisoire est le clean_title de la première variante ; TMDB l'écrase à l'étape 5
 4. update items i set content_id = c.id from contents c where c.key = i.content_key and i.content_id is distinct from c.id
 5. Champs de carte depuis tmdb_cache, par tranche de 1 000 contenus TMDB :
    title / original_title / year / poster / backdrop / rating / vote_count / genre_ids / runtime / search
    (lecture JSONB en JS — cast et réalisateur nécessitent credits.cast[0..9] et crew[job=Director] ;
     une seule requête UPDATE … FROM unnest(...) par tranche)
    Les contenus title: sans TMDB reçoivent search = to_tsvector(title) et rien d'autre.
 6. Agrégats en une requête : variant_count, added_at = min, visible = exists(variante visible),
    logo_url / category_xtream_id = ceux de la variante de rang le plus élevé
 7. delete from contents where not exists (select 1 from items where content_id = contents.id)
 8. stats → { contents, items_grouped, multi_variant_groups, avg_variants, orphans_removed }
```

Budget : tout en SQL par lots, aucune boucle ligne à ligne. Cible < 30 s pour 90 000
items sur la machine de prod (l'import complet tient en 5 min, l'enrichissement domine).

`visible` doit aussi suivre les interrupteurs manuels de l'admin, qui ne passent pas par
`group`. Une fonction `refreshVisibility(contentIds?)` (l'étape 6 seule) est appelée par
`applyRules()` et par la route `/admin/catalog/:scope/:id/visible` : une requête, quelques
dizaines de millisecondes.

### 2.5 Séries : variantes et épisodes

Une variante de série est une **entrée amont** de série (« Vincenzo », « Vincenzo (MULTI)
S01 », « Vincenzo VOSTFR »). Chacune a ses propres saisons et épisodes chez le
fournisseur, obtenus par `get_series_info` (déjà mis en cache 12 h dans `info_cache`).

Le REST expose une seule arborescence par contenu : les épisodes des variantes sont
**fusionnés par numéro** `(saison, épisode)`, chaque épisode portant ses propres
variantes jouables (une par entrée amont qui le possède). L'identité d'épisode est
`tmdb:tv:1396:s01e05` comme le prévoit l'étude ; le `stream_id` amont reste dans la
variante. Coût : un `get_series_info` par variante à l'ouverture d'une saison (1 à 3 en
pratique), amorti par le cache. La liste des saisons de la fiche vient de TMDB, sans appel
amont.

### 2.6 Admin

Dans `/admin/catalog`, une troisième vue **« Groupes »** à côté de « Par catégorie » et
« Liste » : une ligne par `contents`, badge « n variantes », ligne dépliable (HTMX) qui
liste les `items` avec langue, qualité, catégorie, visibilité. Filtres : seulement les
groupes à plusieurs variantes ; seulement les groupes de repli (`title:`).

Deux actions, toutes deux par `key_override` :

- **Séparer** une variante : `key_override = 'manual:<items.id>'`, elle devient son propre
  contenu. Le bouton propose d'abord « corriger le matching TMDB », qui est la vraie
  solution dans 90 % des cas.
- **Fusionner dans…** : champ de recherche sur `contents.title`, l'override reçoit la clé
  cible. Pour fusionner deux groupes TMDB distincts (doublon TMDB, rare), même mécanisme.

Un override est effacé par la réinitialisation du matching (`resetMatches`) seulement sur
demande explicite (case à cocher), jamais par le sync. Tableau de bord : compteurs
« contenus / variantes par contenu », stats de la dernière exécution `group`.

---

## 3. Bloc 3 — API REST `/api/v1`

### 3.1 Principes

- Fichiers : `src/routes/api-v1.ts` (Hono, montée sur `/api/v1`) et `src/lib/rest/`
  (`auth.ts`, `cursor.ts`, `catalog.ts`, `types.ts`). **Aucune importation de
  `lib/api/catalog.ts`** : le REST a son propre sérialiseur, typé, sans `raw`.
- Authentification : `Authorization: Basic base64(proxy_username:mot_de_passe)`. Mêmes
  vérifications qu'`authenticate()` (bcrypt via `vault.verify`, qui déverrouille le coffre
  au passage — c'est ce qui garantit que l'Apple TV seule dans le salon relance le cron
  après un redémarrage). Pas de jeton, pas de session. Réponse `401` avec
  `WWW-Authenticate: Basic realm="kanstrimi"`.
- JSON en `snake_case`, dates ISO 8601 UTC, pas de champ dupliqué, pas de chaîne vide à la
  place de `null`. Erreurs : `{ "error": { "code": "not_found", "message": "…" } }` en
  français, codes stables en anglais.
- `Cache-Control: no-store` partout sauf `/img/` (déjà `immutable`).
- Les URL d'image sont complètes (`{baseUrl}/img/w500/abc.jpg`), construites avec
  `publicBaseUrl()` de `context.ts`, réutilisé sans modification.
- Toute liste est **paginée par curseur** : `{ "items": […], "next_cursor": "…" | null }`.
  Le curseur est un base64url de `[sort, valeur, id]` ; un curseur qui ne correspond pas
  au tri demandé donne `400 bad_cursor`. `limit` de 1 à 100, 40 par défaut.

### 3.2 Types de sortie (`types.ts`)

```ts
type Card = {
  id: string;                          // contents.key
  type: "movie" | "series" | "channel";
  title: string; year: number | null;
  poster: string | null; backdrop: string | null;
  rating: number | null;               // 0–10, une décimale
  added_at: string;
  variant_count: number;
};
type Variant = {
  id: string;                          // opaque : base64url({ k: "movie"|"live"|"series", id: xtreamId, ext })
  lang: string | null; quality: string | null; tags: string[];
  container: string;                   // "mkv", "mp4", "ts"
  label: string;                       // nom amont, pour le menu du lecteur
  stream_url: string;                  // URL Xtream sur CE serveur ; opaque pour l'app, relue à chaque lecture
};
type Detail = Card & {
  original_title: string | null; tagline: string | null; overview: string | null;
  runtime: number | null; certification: string | null; countries: string[];
  genres: { id: number; name: string }[];
  cast: { name: string; character: string | null; photo: string | null }[];  // 10 premiers
  directors: string[]; trailer_youtube: string | null;
  variants: Variant[];                 // films : triées (cf. 3.4) ; séries : []
  seasons: SeasonSummary[];            // séries seulement, depuis TMDB, sans appel amont
  category: { id: string; name: string } | null;   // repli de navigation, contenus non rapprochés
};
type SeasonSummary = { number: number; name: string; episode_count: number; poster: string | null; air_date: string | null };
type Episode = {
  id: string;                          // "tmdb:tv:1396:s01e05" ou "title:series:…:s01e05"
  season: number; number: number; title: string | null;
  overview: string | null; still: string | null; runtime: number | null; air_date: string | null;
  variants: Variant[];
};
type Channel = Card & { type: "channel"; market: string | null; logo: string | null; variants: Variant[] };
type Programme = { start: string; stop: string; title: string; description: string | null };
```

`stream_url` plutôt qu'un endpoint `/stream/{variant_id}` : en mode 302, rejouer la même
URL Kanstrimi fait émettre un jeton amont frais, ce qui est exactement la stratégie de
réessai de l'étude. Un endpoint de plus n'apporterait qu'un aller-retour. Le jour d'une
URL signée HMAC, `stream_url` change de forme et l'app ne le sait pas. Le `variant.id`
reste opaque pour que l'app puisse le citer (journal, préférence « dernière variante
lue ») sans rien en déduire.

### 3.3 Endpoints

| Méthode et chemin | Réponse | Notes |
|---|---|---|
| `GET /movies` | `{ items: Card[], next_cursor }` | `cursor`, `limit`, `sort=added\|title\|year\|rating` (défaut `added`), `genre=<id>` (répétable, ET), `year_min`, `year_max`, `rating_min`, `q` (même moteur que `/search`, restreint aux films) |
| `GET /series` | idem | mêmes paramètres |
| `GET /genres?type=movie\|tv` | `{ items: { id, name, count }[] }` | genres TMDB présents dans le catalogue visible, comptés ; noms depuis la liste de genres TMDB mise en cache dans `settings` par l'étape `group` |
| `GET /content/{id}` | `Detail` | `404` si inconnu ou invisible. Films : variantes incluses. Séries : `seasons` depuis TMDB, `variants: []` |
| `GET /content/{id}/seasons/{n}` | `{ season: SeasonSummary, episodes: Episode[] }` | fusionne les `get_series_info` des variantes (cache 12 h) ; titres et images d'épisodes depuis TMDB quand `tmdb_cache` a la saison (bloc 5), sinon depuis l'amont |
| `GET /live` | `{ groups: { id, name, channels: Channel[] }[] }` | tout d'un bloc, groupé par catégorie amont visible ; 722 chaînes FR → ~150 Ko, pas de pagination |
| `GET /live/{id}/epg?hours=6` | `{ now: Programme \| null, next: Programme \| null, programmes: Programme[] }` | vide tant que le bloc 2 n'existe pas, la forme ne change pas ensuite |
| `GET /search?q=&type=movie\|series\|channel&limit=` | `{ items: Card[] }` | plein texte, mixte, 30 résultats max, pas de curseur |
| `GET /home` | `{ sections: { id, title, items: Card[] }[] }` | bloc 4. Livré dès le bloc 3 avec deux sections « Films récents » et « Séries récentes » pour que l'app ait un accueil ; « Continuer à regarder », favoris et collections s'y ajoutent sans changer la forme |

Absents volontairement : `GET /content/{id}/variants` (dans `Detail`), `GET /stream/…`
(voir 3.2), tout `POST` (bloc 4).

### 3.4 Ordre des variantes

Le serveur renvoie les variantes déjà triées, selon un réglage `preferred_langs`
(défaut `fr,multi,vostfr,en`) dans les paramètres, puis `quality_rank` décroissant, puis
nom. Une variante sans langue vient après les langues listées et avant les autres. L'app
garde sa propre préférence (langue, qualité maximale) et la rejoue par-dessus : l'ordre
serveur est un bon défaut, pas une décision.

### 3.5 Recherche

```sql
select …, ts_rank(search, q) + least(coalesce(vote_count,0)/5000.0, 0.2) as score
from contents, to_tsquery('simple', $tsq) q
where kind = any($kinds) and visible and search @@ q
order by score desc, added_at desc limit 30
```

`$tsq` est construit en JS : accents retirés, découpe en mots, chaque mot en `mot:*`
(préfixe, pour la saisie clavier) joints par `&`. La dictée Siri produit des mots
complets, le préfixe ne gêne pas. Pas de `pg_trgm` : sans extension, et le tsvector
couvre déjà titre, acteurs et réalisateur comme le demande le cahier des charges.

### 3.6 Tri et curseurs

| `sort` | Clé de tri | Curseur |
|---|---|---|
| `added` (défaut) | `added_at desc, id desc` | `["added", "<iso>", id]` |
| `title` | `title asc, id asc` | `["title", "<titre>", id]` |
| `year` | `year desc nulls last, id desc` | `["year", <n>\|null, id]` |
| `rating` | `rating desc nulls last, id desc` | `["rating", <r>\|null, id]` |

Condition de reprise : `(clé, id) < (valeur, id)` en comparaison de tuple, les `null`
étant placés en fin par un `coalesce` explicite dans la clause. Les quatre index de 2.2
correspondent un à un à ces tris, chacun préfixé par `(kind, visible)`.

---

## 4. Ordre de réalisation

Six livraisons, chacune committable et déployable seule. L'API Xtream fonctionne
identiquement à chaque étape.

| # | Livraison | Contenu | Vérification |
|---|---|---|---|
| 1 | `tags.ts` + corpus | Module pur, tests, `cleanTitle` réexporté | `npm run test`, diff des `clean_title` sur un dump |
| 2 | Schéma + étape `group` | Migration 0002, `group.ts`, job, appels depuis sync / enrich / assignManual, journal | Dashboard : lancer « Groupement », lire les stats ; `select count(*) from contents` |
| 3 | Admin « Groupes » | Vue, dépliage, séparer / fusionner, compteurs dashboard | À la main sur le catalogue de prod |
| 4 | REST lecture | Auth Basic, `movies`, `series`, `genres`, `content`, `search`, curseurs | Tests vitest sur curseur et sérialiseur ; `curl` sur Harbor |
| 5 | REST séries et direct | `seasons/{n}`, `live`, `live/{id}/epg` vide | `curl` sur une série multi-variantes |
| 6 | `home` minimal | Deux sections récentes | — |

Puis mettre à jour `server/BACKLOG.md` (bloc 1 : point 6 abandonné, ajouter `tags`,
`group`, admin ; bloc 3 : remplacer la liste par les endpoints de 3.3 ; bloc 4 : `favorites`
et `watch_progress` référencent `content_key`), `docs/cahier-des-charges.md` (§3 et §5.2),
`server/CLAUDE.md` (quatre étapes au lieu de trois, `lib/rest/` distinct de `lib/api/`) et
`server/README.md`.

---

## 5. Risques et points ouverts

- **Le corpus décide.** La qualité du groupement dépend de `parseName()`. La livraison 1
  doit s'accompagner d'une mesure : nombre de contenus obtenus sur le catalogue réel
  (attendu ≈ 35 200 films FR d'après l'étude, contre 39 845 items). Un écart notable de
  part ou d'autre signale une regex trop large ou trop étroite.
- **`items.added_at`** vaut aujourd'hui la date d'insertion en base, pas la date amont
  (`raw.added`, epoch Unix chez ce fournisseur). Le tri « récemment ajouté » serait donc
  faux après le premier import complet. À corriger dans `upsertItems` (livraison 2) :
  `added_at = to_timestamp(raw.added)` quand il est exploitable, sinon `now()`.
- **Épisodes sans TMDB.** Tant que le bloc 5 n'enrichit pas les épisodes, `Episode.title`
  vient de l'amont (« Episode 16 ») et `still` est `null`. Acceptable pour une V1, à noter
  dans la fiche du bloc 5.
- **Séries : quel `seasons[]` quand TMDB ne connaît pas la série ?** Repli sur les
  saisons de la première variante (un appel amont depuis la fiche). Rare (séries non
  rapprochées, souvent du contenu local), mais le cas doit répondre plutôt que renvoyer
  vide.
- **Genres et langue TMDB.** `genre_ids` est stable, les noms dépendent de
  `tmdb_language`. L'étape `group` met en cache la liste de genres de la langue courante
  ; changer la langue impose de relancer `group` (message dans les paramètres).
- **Taille de `/live`.** Si l'utilisateur laisse visibles plusieurs marchés (10 000
  chaînes), la réponse dépasse le méga-octet. Un paramètre `category=` est prévu pour
  restreindre ; l'app l'utilisera si le volume le justifie.
- **Basic auth et journaux.** `requestLogger()` masque déjà les query strings ; vérifier
  qu'il ne journalise pas l'en-tête `Authorization` (il ne journalise aucun en-tête
  aujourd'hui, à garder tel quel).
