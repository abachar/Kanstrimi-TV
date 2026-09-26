# API `/api/v1` — ce que l'app tvOS attend

*Contrat tel que l'app le consomme aujourd'hui, dérivé de `tvOS/kanstrimi/Contract/` et du
protocole `CatalogClient`. Le mock (`MockCatalogClient`) répond exactement ces formes ; le
client HTTP les décodera sans adaptation. Rédigé le 2026-09-26. Remplace la section 3 de
`conception-groupement-et-api-rest.md` là où elles divergent (versions × sources au lieu de
variantes, jeton d'appareil au lieu de Basic).*

## Règles communes

- Préfixe `/api/v1`, JSON en `snake_case`, dates ISO 8601 UTC, `null` explicite, jamais de chaîne vide à sa place.
- Authentification : `Authorization: Bearer <jeton d'appareil>` sur tout sauf `/pair`. Un `401` sur n'importe quel appel efface le jeton et ramène à l'appairage.
- Erreurs : `{ "error": { "code": "not_found", "message": "Contenu introuvable" } }`, code stable en anglais, message en français. Codes attendus : `unauthorized` (401), `not_found` (404), `bad_request` (400), `upstream` (502, le fournisseur n'a pas répondu).
- Identifiants de contenu opaques et stables : `tmdb:movie:603`, `tmdb:tv:1396`, `tmdb:tv:1396:s01e05`, `live:tf1`, `fallback:movie:<titre>:<année>`. L'app ne manipule jamais de `stream_id`.
- Vocabulaire : `language` ∈ `VF` · `VOSTFR` · `VO` · code ISO ; `quality` ∈ `SD` · `HD` · `FHD` · `4K` ; `dynamic_range` ∈ `SDR` · `HDR` · `DV` (absent = SDR) ; `kind` ∈ `movie` · `series` · `episode` · `live`.
- Listes paginées : `{ "items": [...], "next_cursor": "…" | null }`.

## Types partagés

**Carte** (`ContentCard`), même forme dans toutes les listes :

```json
{
  "id": "tmdb:movie:603", "kind": "movie", "title": "Matrix", "year": 1999,
  "poster": "https://kanstrimi.crafters.dev/img/w500/abc.jpg", "backdrop": "https://…/w1280/def.jpg",
  "rating": 8.2, "genres": ["Science-fiction", "Action"],
  "languages": ["VF", "VOSTFR"], "max_quality": "4K", "dynamic_range": "DV",
  "progress": { "position": 4520, "duration": 8280, "finished": false },
  "episode": null, "hint": null, "added_at": "2026-09-20T04:10:00Z"
}
```

`progress` n'est présent que si une progression existe ; `episode` (`{ "season": 2, "number": 4, "title": "…" }`) seulement quand la carte est un épisode (rangée Reprendre) ; `hint` est un court texte calculé par le serveur (« VOSTFR seul », « VF partielle S3 »).

**Version et sources** (`Version`, `Source`) :

```json
{
  "id": "vf-4k-dv", "language": "VF", "quality": "4K", "dynamic_range": "DV",
  "sources": [
    { "id": "src-3f9a1c02", "container": "MKV", "stream_url": "https://kanstrimi.crafters.dev/movie/u/p/12345.mkv", "origin": "Films 4K UHD" },
    { "id": "src-7b21e0aa", "container": "MKV", "stream_url": "https://kanstrimi.crafters.dev/movie/u/p/67890.mkv", "origin": "4K DV" }
  ]
}
```

Les sources sont **dans l'ordre serveur**, la première est celle par défaut. `stream_url` est opaque, jamais mise en cache, relue à chaque lecture (le serveur répond 302 avec un jeton amont frais).

**Progression** : `{ "position": 4520, "duration": 8280, "finished": false }` en secondes ; `finished` est dérivé côté serveur à 90 %.

## Appairage et session

### `POST /api/v1/pair` — sans authentification

Crée un code à 6 caractères valable 10 minutes. Limité en fréquence.

```json
{ "code": "K7Q4MZ", "expires_at": "2026-09-26T21:24:00Z", "url": "https://kanstrimi.crafters.dev/admin/pair/K7Q4MZ" }
```

### `GET /api/v1/pair/{code}` — sans authentification

Sondé toutes les 2 s par l'Apple TV jusqu'à validation dans l'admin.

```json
{ "status": "pending" }
{ "status": "approved", "token": "dvc_8f2c…", "device_name": "Salon" }
{ "status": "expired" }
```

### `GET /api/v1/session`

Nom de l'appareil, versions, langues, compteurs. Appelé après l'appairage et à chaque lancement.

```json
{
  "device_name": "Salon", "server_version": "0.9.3", "server_host": "kanstrimi.crafters.dev",
  "tmdb_language": "fr-FR", "catalog_languages": ["VF", "VOSTFR", "VO"],
  "default_language_order": ["VF", "VOSTFR", "VO"],
  "counts": { "movies": 35219, "series": 22174, "channels": 722 },
  "last_import": "2026-09-26T02:10:00Z", "tmdb_rate": 0.97
}
```

### `DELETE /api/v1/session`

Révoque le jeton de l'appareil qui appelle (« Dissocier cet Apple TV »). Réponse `204`.

## Accueil

### `GET /api/v1/home`

Un seul appel : le hero et les rangées ordonnées, avec leurs cartes. Le serveur décide de l'ordre et de la présence des rangées. Mis en cache sur disque par l'app pour le mode hors ligne.

```json
{
  "hero": {
    "card": { "id": "tmdb:movie:100000", "kind": "movie", "title": "La Lisière", "year": 2025, "…": "…" },
    "tagline": "FILM · NOUVEAUTÉ", "overview": "Un dernier été…", "runtime": 127, "certification": "12+",
    "versions": [ { "id": "vf-4k-dv", "language": "VF", "quality": "4K", "dynamic_range": "DV", "sources": ["…"] } ]
  },
  "rows": [
    { "id": "resume", "kind": "resume", "title": "Reprendre", "cards": ["… cartes avec progress, et episode pour les épisodes …"] },
    { "id": "recent-movies", "kind": "recent_movies", "title": "Films récents", "cards": ["…"] },
    { "id": "recent-series", "kind": "recent_series", "title": "Séries récentes", "cards": ["…"] },
    { "id": "favorites", "kind": "favorites", "title": "Ma liste", "cards": ["…"] }
  ],
  "generated_at": "2026-09-26T21:14:00Z"
}
```

`kind` ∈ `resume` · `recent_movies` · `recent_series` · `favorites` · `collection`. Une rangée `resume` absente ou vide n'est pas affichée.

## Films et séries

### `GET /api/v1/movies` · `GET /api/v1/series`

Liste paginée par curseur. Paramètres : `sort` (`recent` défaut films, `latest_episodes` défaut séries, `title`, `year`, `rating`), `genre`, `language`, `min_quality`, `dynamic_range`, `vf_available=1`, `complete_season_vf=1` (séries), `new_episodes=1` (séries), `cursor`, `limit` (18 par défaut, l'app en affiche six par ligne).

```json
{ "items": [ { "id": "tmdb:movie:603", "kind": "movie", "…": "…" } ], "next_cursor": "eyJzIjoicmVjZW50IiwidiI6IjIwMjYtMDktMjAiLCJpIjoiLi4uIn0" }
```

### `GET /api/v1/genres?kind=movie|series`

Genres TMDB présents dans le catalogue visible, avec compte, triés par compte décroissant.

```json
[ { "id": "thriller", "name": "Thriller", "count": 4120 }, { "id": "drame", "name": "Drame", "count": 3987 } ]
```

### `GET /api/v1/content/{id}`

La fiche complète en un appel : métadonnées, versions avec sources prêtes à jouer, progression, favori. Série : `seasons` sans épisodes, `current_episode` pour le bouton principal, `versions` = agrégat dédoublonné des versions des épisodes (pour la langue de la série).

```json
{
  "id": "tmdb:tv:20000", "kind": "series", "title": "Brise-Lames", "original_title": null,
  "year": 2024, "end_year": 2026, "overview": "Une équipe de sauveteurs…", "genres": ["Thriller"],
  "runtime": null, "certification": "16+", "rating": 8.1,
  "poster": "https://…", "backdrop": "https://…",
  "cast": [ { "name": "Idir Benali", "role": null } ], "director": "Karim Souleymane",
  "trailer": null, "has_tmdb": true, "provider_category": null, "raw_title": null,
  "versions": [ { "id": "vf-4k-hdr", "language": "VF", "quality": "4K", "dynamic_range": "HDR", "sources": [] } ],
  "progress": { "position": 1140, "duration": 3060, "finished": false },
  "is_favorite": false,
  "seasons": [ { "number": 1, "title": "Saison 1", "episode_count": 8, "year": 2024 }, { "number": 2, "title": "Saison 2", "episode_count": 8, "year": 2025 } ],
  "current_episode": { "season": 2, "number": 4, "title": "Sans retour" },
  "added_at": "2026-09-22T04:10:00Z"
}
```

Film : `seasons` et `current_episode` à `null`, `versions` avec leurs sources. Sans correspondance TMDB : `has_tmdb: false`, `poster`/`overview`/`cast` à `null` ou vides, `provider_category` et `raw_title` renseignés.

### `GET /api/v1/content/{id}/seasons/{n}`

Les épisodes d'une saison avec versions, sources et progression. C'est l'appel qui touche le fournisseur (`get_series_info`), donc en erreur possible : `502 upstream`, la fiche garde les autres saisons.

```json
[
  {
    "id": "tmdb:tv:20000:s02e04", "season": 2, "number": 4, "title": "Sans retour",
    "overview": "…", "runtime": 55, "still": "https://…", "air_date": "2025-03-22T00:00:00Z",
    "versions": [ { "id": "vf-4k-hdr", "language": "VF", "quality": "4K", "dynamic_range": "HDR", "sources": [ { "id": "src-…", "container": "MKV", "stream_url": "https://…", "origin": "Séries 4K" } ] } ],
    "progress": { "position": 1140, "duration": 3060, "finished": false }
  }
]
```

## Lecture

### `GET /api/v1/content/{id}/playback`

Le contexte de lecture d'un film, d'un épisode ou d'une chaîne, sans passer par la fiche : ce que « Reprendre » sur l'accueil et « Lecture » depuis la recherche appellent. Pour un épisode, `next` pointe le suivant, saison suivante comprise ; l'app demande ensuite son propre contexte.

```json
{
  "content": { "id": "tmdb:tv:20000:s02e04", "kind": "episode", "title": "Sans retour", "subtitle": "Brise-Lames",
               "episode": { "season": 2, "number": 4, "title": "Sans retour" }, "backdrop": "https://…" },
  "versions": [ "… versions avec sources …" ],
  "resume_at": 1140, "duration": 3060,
  "next": { "id": "tmdb:tv:20000:s02e05", "series_title": "Brise-Lames",
            "episode": { "season": 2, "number": 5, "title": "Marée haute" }, "runtime": 51,
            "languages": ["VOSTFR"], "max_quality": "4K", "dynamic_range": "HDR", "still": "https://…" },
  "series_id": "tmdb:tv:20000"
}
```

Film : `next` et `series_id` à `null`. Chaîne : `kind: "live"`, `subtitle` = programme en cours, `resume_at` et `duration` à `null`.

### `POST /api/v1/progress`

Toutes les 30 s pendant la lecture, à la pause, à la sortie et au changement de version. Idempotent, le dernier gagne. Réponse `204`.

```json
{ "content_id": "tmdb:tv:20000:s02e04", "position": 1170, "duration": 3060, "sent_at": "2026-09-26T21:15:30Z" }
```

### `PUT /api/v1/favorites/{id}` · `DELETE /api/v1/favorites/{id}`

Bascule « Ma liste ». Réponse `204`.

## Direct

### `GET /api/v1/live`

Toutes les chaînes visibles d'un coup, groupées par catégorie fournisseur, chacune avec logo, versions et sources. Pas de pagination.

```json
[
  {
    "category": "Sport",
    "channels": [
      {
        "id": "live:arena-1", "name": "Arena 1", "number": 20, "logo": "https://…", "category": "Sport",
        "versions": [
          { "id": "fr-4k", "language": "FR", "quality": "4K",
            "sources": [ { "id": "src-…", "container": "TS", "stream_url": "https://kanstrimi.crafters.dev/live/u/p/4411.ts", "origin": "|FR| Sport" },
                         { "id": "src-…", "container": "TS", "stream_url": "https://…/4412.ts", "origin": "|FR| Sport Backup" } ] },
          { "id": "en-4k", "language": "EN", "quality": "4K", "sources": [ "…" ] }
        ]
      }
    ]
  }
]
```

### `GET /api/v1/live/{id}/epg`

En cours et suivant pour une chaîne, demandé au focus, mis en cache une minute côté app. Vide tant que l'EPG n'est pas en base ; la forme ne change pas ensuite.

```json
{
  "now":  { "title": "Ligue · Lyon – Nantes", "start": "2026-09-26T18:45:00Z", "end": "2026-09-26T20:45:00Z", "overview": null },
  "next": { "title": "Le Mag du foot", "start": "2026-09-26T20:45:00Z", "end": "2026-09-26T21:15:00Z", "overview": null }
}
```

`{ "now": null, "next": null }` sans EPG.

## Recherche

### `GET /api/v1/search?q=heures&scope=all|movies|series|live`

Plein texte sur titre, acteurs, réalisateur ; chaînes par nom. Résultats typés avec les mêmes cartes, plus le meilleur résultat. L'app déclenche après 300 ms sans frappe et annule la précédente.

```json
{
  "query": "heures",
  "best": { "id": "tmdb:movie:100034", "kind": "movie", "title": "Le Silence des Quais", "…": "…" },
  "movies": [ "… cartes …" ],
  "series": [ "… cartes …" ],
  "live":   [ { "id": "live:cine-club", "kind": "live", "title": "Ciné Club", "genres": ["Cinéma"], "languages": ["FR"], "max_quality": "4K", "…": "…" } ]
}
```

## Récapitulatif

| Méthode et chemin | Auth | Écran | Réponse |
|---|---|---|---|
| `POST /pair` | non | Appairage | `PairingCode` |
| `GET /pair/{code}` | non | Appairage | `PairingStatus` |
| `GET /session` | oui | Réglages, lancement | `Session` |
| `DELETE /session` | oui | Réglages › Dissocier | `204` |
| `GET /home` | oui | Accueil | `HomeScreen` |
| `GET /movies`, `GET /series` | oui | Films, Séries | `Page<ContentCard>` |
| `GET /genres?kind=` | oui | Barre de filtres | `Genre[]` |
| `GET /content/{id}` | oui | Fiche | `ContentDetail` |
| `GET /content/{id}/seasons/{n}` | oui | Fiche série | `Episode[]` |
| `GET /content/{id}/playback` | oui | Reprendre, recherche, épisode suivant | `PlaybackContext` |
| `GET /live` | oui | Direct | `ChannelGroup[]` |
| `GET /live/{id}/epg` | oui | Direct, lecteur direct | `EPGNow` |
| `GET /search?q=&scope=` | oui | Recherche | `SearchResults` |
| `POST /progress` | oui | Lecteur | `204` |
| `PUT`/`DELETE /favorites/{id}` | oui | Fiche | `204` |
