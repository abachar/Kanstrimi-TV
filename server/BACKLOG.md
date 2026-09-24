# Kanstrimi Server — Backlog

*Fonctionnalités reprises de l'ancien serveur Rust (`_Old/kk/`, Axum + SQLite), à porter sur ce serveur Hono.*

Statuts : `[ ]` à faire · `[~]` en cours · `[x]` terminé. Priorité : P0 bloquant · P1 MVP · P2 V1 · P3 nice to have.

---

## 1 — Groupement des variantes (P1)

Un même contenu existe en plusieurs variantes chez le fournisseur (« The Matrix FR HD », « The Matrix EN 4K »…). Les regrouper en une seule entrée.

- [ ] Extraction des tags langue (FR, EN, IT, DE, VOSTFR…) et qualité (SD, HD, FHD, 4K) depuis le nom (`src/lib/grouping/tags.ts`)
- [ ] Schéma : table `content_groups` + colonne `group_id` sur `items` ; chaque variante garde langue / qualité / stream_id
- [ ] Regroupement automatique sur titre nettoyé + année, exécuté à chaque sync
- [ ] Consolidation des groupes par identifiant TMDB après enrichissement (deux groupes → même `tmdb_id` = fusion)
- [ ] Admin `/admin/catalog` : visualiser les variantes d'un groupe, fusionner / séparer manuellement
- [ ] Exposer une seule entrée par groupe dans `get_vod_streams` / `get_series` avec la meilleure variante par défaut (ou variantes en `get_vod_info`)

## 2 — EPG en base (P2)

Aujourd'hui `xmltv.php` est relayé ; l'ancien serveur importait le XMLTV.

- [ ] Parser XMLTV (fast-xml-parser) → table `epg_programs` (channel_id, start, stop, title, description)
- [ ] Import après chaque sync, purge des programmes passés
- [ ] `xmltv.php` généré depuis la base, limité aux chaînes visibles (règles + masquage)
- [ ] `get_short_epg` / `get_simple_data_table` servis depuis la base (now + next)

## 3 — API REST pour les apps maison (P2)

API propre pour l'app tvOS, en complément de l'API Xtream. Préfixe `/api/v1`.

- [ ] `GET /api/v1/movies` : pagination offset/limit, filtres `genre`, `year`, `rating_min`, `search`, tri `title|year|rating|added_at`
- [ ] `GET /api/v1/series`, `GET /api/v1/series/{id}` (saisons/épisodes), `GET /api/v1/series/{id}/seasons/{num}`
- [ ] `GET /api/v1/live` (groupées par catégorie), `GET /api/v1/live/{id}/epg` (now + next)
- [ ] `GET /api/v1/content/{id}/variants`, `GET /api/v1/stream/{variant_id}` → URL directe ou 302
- [ ] `GET /api/v1/search?q=` : recherche full-text (Postgres `tsvector`) sur titre, acteurs, réalisateur ; résultats mixtes typés
- [ ] Authentification par le compte client (username/password ou token)

## 4 — Progression, favoris, accueil (P2)

- [ ] Table `watch_progress` (content_id, position, duration, updated_at) ; `POST /api/v1/progress`
- [ ] `GET /api/v1/continue-watching` : progression entre 5 % et 90 %
- [ ] Table `favorites` ; `POST /api/v1/favorites/{content_id}` (toggle), `GET /api/v1/favorites`
- [ ] `GET /api/v1/home` : sections « Continuer à regarder », « Récemment ajouté », « Tendances » (TMDB populaires), collections thématiques

## 5 — Métadonnées TMDB étendues (P3)

Déjà fait : poster, backdrop, synopsis, genres, note, casting, bande-annonce. Manque :

- [ ] Logos, titre original, tagline, mots-clés, certification, nombre de votes
- [ ] Séries : nombre de saisons / épisodes, statut (en cours / terminée)
- [ ] Enrichissement saison / épisode (titres, synopsis, stills)
- [ ] Statistiques d'enrichissement dans le dashboard : taux de matching, liste des non-matchés
- [ ] Bouton stop de l'enrichissement en cours

## 6 — Organisation par IA (P3)

- [ ] Interface `AiProvider` (`generate()`, `isAvailable()`) : implémentations Ollama (local), OpenAI, Anthropic
- [ ] Collections thématiques générées par LLM à partir du catalogue + métadonnées (tables `collections`, `collection_items`) ; ≥ 5 collections pour 500+ contenus, 5–30 éléments chacune
- [ ] Nettoyage de titres par IA en batch (50 titres → titres propres + année) avant matching TMDB
- [ ] Suggestions « Si vous avez aimé… »
- [ ] Mode dégradé : sans IA, collections basées sur les genres TMDB
- [ ] Admin : validation / édition / suppression des collections ; configuration du provider et du modèle

## 7 — Admin & exploitation (P2)

- [ ] Dashboard : statistiques de groupement (groupes, variantes/groupe), indicateurs système (CPU, RAM, disque)
- [ ] Recherche dans le catalogue admin (incl. recherche TMDB pour association manuelle — déjà partiel via `tmdb-assign`)
- [ ] Paramètres : durée de rétention du cache métadonnées, sauvegarde / restauration de la configuration
- [ ] Journal des événements enrichi (durée, erreurs par étape)

## 8 — Sécurité & déploiement (P1)

- [x] Chiffrement des secrets en base (clé TMDB, identifiants Xtream) en AES-256-GCM — clé dérivée du mot de passe admin, gardée en RAM (`src/lib/auth/vault.ts`)
- [~] `Containerfile` multi-stage (esbuild, bundle autonome) publié sur ghcr.io — amd64 seulement, arm64 à ajouter
- [ ] `docker-compose.yml` d'exemple (app + Postgres + volume `DATA_DIR`)
- [ ] Endpoint `GET /admin/api/metrics` (CPU, RAM, disque)

---

## Dépendances

```
1 Groupement ──→ 3 API REST (variants) ──→ 4 Progression / accueil
2 EPG ─────────→ 3 API REST (live/epg)
5 TMDB étendu ─→ 6 IA
8 Sécurité : indépendant, à faire avant mise en production
```
