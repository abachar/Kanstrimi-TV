# API `/api/v1` — contrat arrêté avec l'app tvOS

*Arrêté le 2026-09-26, écran par écran. Dérivé de `tvOS/kanstrimi/Contract/` et du protocole
`CatalogClient` ; le mock répond exactement ces formes, le client HTTP les décodera sans
adaptation. Remplace la section 3 de `conception-groupement-et-api-rest.md`.*

## Règles communes

- Préfixe `/api/v1`, JSON `snake_case`, dates ISO 8601 UTC, `null` explicite.
- `Authorization: Bearer <jeton>` partout sauf `/devices`. Un `401` sur n'importe quel appel efface jeton et code, vide le cache et ramène à l'appairage.
- Erreurs : `{ "error": { "code": "not_found", "message": "…" } }`. Codes : `unauthorized` 401, `not_found` 404, `bad_request` 400, `upstream` 502, `too_many_requests` 429 (appairage), `locked` 503 (serveur redémarré et aucun appel authentifié depuis : rappeler `/playback` régénère le lien).
- Identifiants opaques et stables, issus des tables du serveur : `tmdb:movie:603`, `tmdb:tv:1396`, `tmdb:tv:1396:s01e05`, `live:tf1`, `fallback:movie:<titre>:<année>`. Aucun identifiant fournisseur ne circule.
- Vocabulaire : `kind` ∈ `movie` · `series` · `episode` · `live` ; `language` ∈ `VF` · `VOSTFR` · `VO` · code ISO ; `quality` ∈ `SD` · `HD` · `FHD` · `4K` ; `dynamic_range` ∈ `HDR` · `DV` (absent = SDR).
- Le serveur sert ses propres tables (filtrage, classement, complétion, IA), pas la source brute. Plusieurs sources sont prévues (comptes Xtream, fichiers locaux) : chaque `source` porte son `provider`.

## Routes

```
POST   /devices                 GET /devices/{code}            DELETE /devices/{code}
GET    /info
GET    /home
GET    /movies                  GET /movies?genre=&cursor=     GET /movies/{id}
GET    /series                  GET /series?genre=&cursor=     GET /series/{id}
GET    /channels                GET /channels/{id}
GET    /playback/{id}           PUT /playback/{id}/progress
GET    /search?q=&scope=
PUT    /favorites/{id}          DELETE /favorites/{id}
```

## Types

### `Card` — un seul type, rempli selon l'écran

Obligatoires : `id`, `kind`, `title`. Tout le reste est optionnel et absent quand l'écran ne s'en sert pas.

```json
{
  "id": "tmdb:movie:603", "kind": "movie", "title": "Matrix", "poster": "https://…/img/w500/abc.jpg",
  "max_quality": "4K", "dynamic_range": "DV", "languages": ["VF", "VOSTFR"],

  "backdrop": "https://…", "progress": { "position": 4520, "duration": 8280 }, "episode": { "season": 2, "number": 4, "title": "…" },

  "year": 1999, "rating": 8.2, "genres": ["Science-fiction"], "hint": "VOSTFR seul", "added_at": "2026-09-20T04:10:00Z",

  "original_title": "The Matrix", "end_year": null, "overview": "…", "runtime": 136, "certification": "12+",
  "cast": [ { "name": "Keanu Reeves", "role": "Neo" } ], "director": "Lana Wachowski", "trailer": "https://…",
  "has_tmdb": true, "provider_category": null, "raw_title": null,
  "versions": [Version], "is_favorite": false,
  "seasons": [Season], "current_episode": { "season": 2, "number": 4, "title": "…" }
}
```

| Bloc | Champs | Qui les remplit |
|---|---|---|
| base | `id` `kind` `title` `poster` `max_quality` `dynamic_range` `languages` | toutes les listes |
| reprise | `backdrop` `progress` `episode` | rangée Reprendre de `/home` |
| grille | `year` `rating` `genres` `hint` `added_at` | `/movies`, `/series`, `/search` |
| fiche | `original_title` `end_year` `overview` `runtime` `certification` `cast` `director` `trailer` `has_tmdb` `provider_category` `raw_title` `versions` `is_favorite` `progress.finished` | `/movies/{id}`, `/series/{id}` |
| série | `seasons` (avec épisodes) `current_episode` | `/series/{id}` |

### `Version`, `Source`, `Provider`

```json
{ "id": "vf-4k-dv", "language": "VF", "quality": "4K", "dynamic_range": "DV",
  "sources": [
    { "id": "src-3f9a1c02", "container": "MKV", "stream_url": "https://kanstrimi.crafters.dev/movie/u/p/12345.mkv",
      "provider": { "id": "xtream-a", "name": "Fournisseur A", "kind": "xtream" }, "origin": "Films 4K UHD" }
  ] }
```

Sources dans l'ordre serveur, la première par défaut. `stream_url` opaque, jamais mise en cache, relue à chaque lecture. `provider.kind` ∈ `xtream` · `local` · … ; `origin` est la catégorie chez ce fournisseur.

*Implémentation :* `stream_url` est un lien signé `{base}/api/v1/stream/{source}?d=<code>&e=<expiration>&s=<signature>`, lié à l'appareil, valable 24 h, sans jeton (VLC n'envoie pas d'en-tête) ; le serveur répond `302` vers le fournisseur, `401` si le lien est falsifié, expiré ou l'appareil dissocié. `Source.id` est `src-i…` (film, chaîne) ou `src-e…` (épisode), jamais un identifiant fournisseur.

### `Season`, `Episode`

```json
{ "number": 2, "title": "Saison 2", "year": 2025,
  "episodes": [
    { "id": "tmdb:tv:20000:s02e04", "season": 2, "number": 4, "title": "Sans retour", "overview": "…", "runtime": 55,
      "still": "https://…", "air_date": "2025-03-22T00:00:00Z",
      "versions": [Version], "progress": { "position": 1140, "duration": 3060, "finished": false } }
  ] }
```

### `Channel`

```json
{ "id": "live:natgeo-wild", "name": "Nat Geo Wild HD", "number": 20, "logo": "https://…",
  "max_quality": "HD", "has_epg": true, "is_favorite": false,
  "versions": [Version],
  "now":  { "title": "Animals and Nature", "start": "…", "end": "…", "overview": "…" },
  "next": { "title": "…", "start": "…", "end": "…" } }
```

`now` et `next` ne sont présents que dans `GET /channels/{id}` ; ils valent `null` tant que l'EPG n'est pas importé en base (bloc 2 du backlog).

## Écran par écran

### Appairage — `POST /devices`, `GET /devices/{code}`

Sans jeton. Le code à 6 caractères, valable 10 min, reste l'identifiant de l'appareil après validation.

```json
POST /devices          → 201 { "code": "K7Q4MZ", "expires_at": "2026-09-26T21:24:00Z", "url": "https://kanstrimi.crafters.dev/admin/pair/K7Q4MZ" }
GET  /devices/K7Q4MZ   → { "status": "pending" }
                       → { "status": "approved", "token": "dvc_8f2c…", "device_name": "Salon" }
                       → { "status": "expired" }
```

L'app sonde toutes les 2 s ; expiré, elle redemande un code seule. Jeton et code vont en Keychain. Le jeton n'est remis qu'une fois : le sondage suivant répond `expired`, ce qui ne concerne pas une app qui s'est arrêtée de sonder à `approved`.

### Déjà appairé, au lancement

`GET /info` et `GET /home` en parallèle avec le jeton. `200` → onglets ; `401` → retour au QR avec « Cet Apple TV a été dissocié » ; injoignable → onglets sur le dernier accueil en cache, bandeau Réessayer. Le premier appel après un redémarrage du serveur déverrouille le coffre via la clé enveloppée par le jeton, sans que l'app le sache.

### Réglages — `GET /info`, `DELETE /devices/{code}`

```json
GET /info → { "server_version": "0.9.3", "counts": { "movies": 35219, "series": 22174, "channels": 722 },
              "last_import": "2026-09-26T02:10:00Z", "tmdb_rate": 0.97,
              "catalog_languages": ["VF", "VOSTFR", "VO"], "default_language_order": ["VF", "VOSTFR", "VO"] }
DELETE /devices/{code} → 204   (« Dissocier cet Apple TV », seulement le sien)
```

Le reste des Réglages est local (nom reçu à l'appairage, URL compilée, préférences de lecture).

### Accueil — `GET /home`

Un appel, à chaque affichage de l'onglet et sur Réessayer. Le serveur décide de l'ordre et de la présence des rangées ; une rangée inconnue s'affiche quand même. Réponse écrite sur disque pour le mode hors ligne.

```json
{
  "hero": { "card": Card, "tagline": "FILM · NOUVEAUTÉ", "overview": "…", "runtime": 127, "certification": "12+", "versions": [Version] },
  "rows": [
    { "id": "resume",        "kind": "resume",        "title": "Reprendre",       "cards": [Card + backdrop, progress, episode] },
    { "id": "recent-movies", "kind": "recent_movies", "title": "Films récents",   "cards": [Card] },
    { "id": "recent-series", "kind": "recent_series", "title": "Séries récentes", "cards": [Card] },
    { "id": "favorites",     "kind": "favorites",     "title": "Ma liste",        "cards": [Card] }
  ],
  "generated_at": "2026-09-26T21:14:00Z"
}
```

Le hero porte ses `versions` : *Lecture* part sans autre appel. Une carte Reprendre appelle `GET /playback/{id}`. Les autres ouvrent la fiche.

### Direct — `GET /channels`, `GET /channels/{id}`

Trois colonnes : catégories avec compte, chaînes de la catégorie, aperçu et programme de la chaîne focalisée.

```json
GET /channels      → [ { "id": "sport", "name": "Sport", "channels": [Channel] } ]
GET /channels/{id} → Channel + now + next     (au focus, cache 1 min ; bandeau du lecteur direct)
```

« Récentes » (local à l'app) et « Favoris » (`is_favorite`) sont deux catégories virtuelles en tête. Le zapping ▲▼ suit la liste de la catégorie courante.

### Films, Séries — `GET /movies`, `GET /series`

Des rangées par genre, vingt cartes chacune, comme sur l'accueil. Le serveur décide des rangées (« Nouveautés » en tête, puis les genres TMDB présents).

```json
GET /movies → [ { "id": "thriller", "name": "Thriller", "total": 4120, "movies": [Card × 20] } ]
GET /series → [ { "id": "drame",    "name": "Drame",    "total": 987,  "series": [Card × 20] } ]
```

« Voir tout » d'une rangée, si `total` dépasse les cartes reçues, et selon les mesures de performance :

```json
GET /movies?genre=thriller&sort=recent&cursor=   → { "items": [Card], "next_cursor": "…" | null }
```

Paramètres : `sort` (`recent`, `title`, `year`, `rating`, `latest_episodes` pour les séries), `language`, `min_quality`, `dynamic_range`, `vf_available=1`, `cursor`, `limit`.

*Implémentation :* la présence d'un paramètre quelconque bascule en mode liste ; `genre` est l'`id` d'une rangée (`recent` pour « Nouveautés ») ; `cursor` est opaque (base64 de la clé de tri et de l'identifiant) ; `limit` 30 par défaut, 100 au plus ; `latest_episodes` se comporte comme `recent` tant que la date du dernier épisode n'est pas suivie. `min_quality` et `dynamic_range` invalides répondent `bad_request`.

### Fiche film — `GET /movies/{id}`

La `Card` complète, avec `versions` et leurs `stream_url` : *Lecture* part sans autre appel, le moteur choisit localement. `progress.finished` donne *Revoir*. Sans TMDB : `has_tmdb: false`, `provider_category` et `raw_title` renseignés.

### Fiche série — `GET /series/{id}`

La `Card` complète avec `end_year`, `seasons[].episodes[]` (versions, sources, progression de chaque épisode, tout en un appel), `current_episode` pour le bouton principal et `progress` de cet épisode, `versions` = agrégat langue × qualité de la série, sans sources, pour « Langue de la série ». Aucun appel au changement de saison. L'épisode suivant est calculé par l'app depuis les saisons reçues.

### Lecteur — `GET /playback/{id}`, `PUT /playback/{id}/progress`

Un seul chemin pour film, épisode et chaîne ; l'identifiant dit lequel.

```json
GET /playback/{id} → { "versions": [Version], "resume_at": 1140, "duration": 3060,
                       "next": { "id": "tmdb:tv:20000:s02e05", "title": "Marée haute", "season": 2, "number": 5, "runtime": 51,
                                 "languages": ["VOSTFR"], "max_quality": "4K", "dynamic_range": "HDR", "still": "https://…" } }
```

| | `versions` | `resume_at` / `duration` | `next` |
|---|---|---|---|
| film | oui | oui | null |
| épisode | oui | oui | l'épisode suivant, saison suivante comprise |
| chaîne | oui | null | null |

Appelé par Reprendre (accueil), Lecture (recherche), *Réessayer* du dialogue d'échec (URL fraîche), et dès le début d'un épisode pour préparer `next`. Depuis une fiche, rien : les versions sont déjà là.

```json
PUT /playback/{id}/progress   { "position": 1170, "duration": 3060 }   → 204
```

Toutes les 30 s, à la pause, à la sortie, au changement de version ; idempotent, le dernier gagne ; le serveur dérive « vu » à 90 %. Hors ligne, file locale rejouée au retour. Audio et sous-titres viennent de VLC, pas de l'API.

### Recherche — `GET /search?q=&scope=`

`scope` ∈ `all` · `movies` · `series` · `live`. Déclenchée après 300 ms sans frappe, la précédente annulée.

```json
{ "query": "heures", "best": Card, "movies": [Card], "series": [Card], "live": [Card kind=live] }
```

### Favoris — `PUT` / `DELETE /favorites/{id}`

Bascule « Ma liste » depuis une fiche ou une chaîne. `204`.
