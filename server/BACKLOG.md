# Kanstrimi Server — Backlog

*Fonctionnalités reprises de l'ancien serveur Rust (`_Old/kk/`, Axum + SQLite), à porter sur ce serveur Hono.*

Statuts : `[ ]` à faire · `[~]` en cours · `[x]` terminé. Priorité : P0 bloquant · P1 MVP · P2 V1 · P3 nice to have.

---

## 1 — Groupement des variantes (P1)

Un même contenu existe en plusieurs variantes chez le fournisseur (« The Matrix FR HD », « The Matrix EN 4K »…). Les regrouper en une seule entrée.

- [x] Extraction des tags langue, qualité, HDR/DV, marché et année depuis le nom et la catégorie (`src/lib/grouping/tags.ts`, corpus de 200 noms réels figé dans les tests)
- [x] Schéma : table `contents` (clé texte stable `tmdb:movie:603`, `fallback:movie:<slug>:<année>`, `live:<marché>-<slug>`) + colonnes de variante sur `items` (`content_id`, `lang`, `quality`, `dynamic_range`…)
- [x] Étape `group` (4ᵉ job, sans réseau, ~12 s pour 100 000 entrées) : relancée après chaque `source` et chaque `enrich`, champs de carte recopiés depuis `tmdb_cache`, agrégats et visibilité
- [x] Consolidation par identifiant TMDB : la clé *est* l'identifiant TMDB dès que le matching est vérifié ; un repli `fallback:` migre seul vers sa clé `tmdb:`
- [x] Admin `/admin/catalog?view=groups` : variantes d'un contenu, séparer / fusionner (par `key_override`), retour à l'automatique
- ~~Exposer une seule entrée par groupe dans `get_vod_streams`~~ — abandonné : l'API Xtream est figée, le groupement ne sert que le REST
- [x] Enrichissement : l'identifiant TMDB envoyé par le fournisseur est vérifié par similarité de titre avant d'être accepté ; un appel de détails par identifiant distinct, 20 en parallèle

## 2 — EPG en base (P2)

Aujourd'hui `xmltv.php` est relayé ; l'ancien serveur importait le XMLTV.

- [ ] Parser XMLTV (fast-xml-parser) → table `epg_programs` (channel_id, start, stop, title, description)
- [ ] Import après chaque sync, purge des programmes passés
- [ ] `xmltv.php` généré depuis la base, limité aux chaînes visibles (règles + masquage)
- [ ] `get_short_epg` / `get_simple_data_table` servis depuis la base (now + next)

## 3 — API REST pour les apps maison (P2) — fait

API propre pour l'app tvOS, en complément de l'API Xtream. Préfixe `/api/v1`, contrat arrêté
dans `docs/api-v1-tvos.md` (il fait foi), code dans `src/lib/rest/` et `src/routes/api.ts`.

- [x] Appairage sans clavier : `POST /devices` (code 6 caractères, 10 min, limité), page admin `/admin/pair/{code}`, `GET /devices/{code}` sondé par la TV, `DELETE /devices/{code}` ; jeton d'appareil haché, révocable dans l'admin « Appareils » ; clé du coffre enveloppée par le jeton (premier appel après redémarrage = coffre déverrouillé)
- [x] `GET /info`, `GET /home`
- [x] `GET /movies`, `GET /series` en rangées par genre, puis `?genre=&sort=&cursor=` avec filtres langue / qualité / dynamique / VF
- [x] `GET /movies/{id}`, `GET /series/{id}` (saisons et épisodes fusionnés à travers les variantes, versions × sources, progression)
- [x] `GET /channels`, `GET /channels/{id}` (`now` / `next` à `null` tant que le bloc 2 n'existe pas)
- [x] `GET /playback/{id}` (film, épisode avec le suivant, chaîne), `PUT /playback/{id}/progress`
- [x] `GET /search?q=&scope=` : `tsvector` sans accents sur titre, titre original, casting, réalisateur
- [x] `GET /stream/{source}` : lien signé lié à l'appareil, 24 h, `302` vers le fournisseur
- [ ] Tri `latest_episodes` réellement basé sur le dernier épisode ajouté (`last_modified` amont) ; aujourd'hui identique à `recent`
- [ ] Plusieurs sources (second compte Xtream, fichiers locaux) : `Source.provider` est déjà dans le contrat, une seule implémentation `xtream`

## 4 — Progression, favoris, accueil (P2) — fait

- [x] Table `watch_progress` (clé texte du contenu ou de l'épisode, position, durée, « vu » dérivé à 90 %) ; `PUT /playback/{id}/progress`, idempotent
- [x] Rangée « Reprendre » de `/home` : entre 5 % et 90 %, dernière lecture d'abord
- [x] Table `favorites` ; `PUT` / `DELETE /favorites/{id}` ; rangée « Ma liste »
- [x] `GET /home` : hero, Reprendre, Films récents, Séries récentes, Ma liste
- [ ] « Tendances » (TMDB populaires) et collections thématiques (bloc 6)

## 5 — Métadonnées TMDB étendues (P3)

Déjà fait : poster, backdrop, synopsis, genres, note, casting, bande-annonce. Manque :

- [~] Titre original, tagline et certification exposés dans `get_vod_info` / `get_series_info` ; manquent logos, mots-clés, nombre de votes
- [x] Séries : nombre de saisons / épisodes, statut (en cours / terminée) — `seriesInfo` dans `src/lib/api/catalog.ts`
- [~] Saisons enrichies (nom, synopsis, affiche) depuis les détails TMDB ; épisodes toujours bruts
- [x] Statistiques d'enrichissement dans le dashboard (taux, associés, non trouvés, en attente) ; non-matchés listés via le filtre « TMDB introuvable » du catalogue
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
- [x] Recherche dans le catalogue admin, recherche TMDB et association manuelle (`tmdb-search`, `tmdb-assign`)
- [ ] Paramètres : durée de rétention du cache métadonnées, sauvegarde / restauration de la configuration
- [x] Journal des exécutions avec durée, statistiques par étape et message d'erreur

## 8 — Sécurité & déploiement (P1)

- [x] Chiffrement des secrets en base (clé TMDB, identifiants Xtream) en AES-256-GCM — clé dérivée du mot de passe admin, gardée en RAM (`src/lib/auth/vault.ts`)
- [~] `Containerfile` multi-stage (esbuild, bundle autonome) publié sur ghcr.io — amd64 seulement, arm64 à ajouter
- [ ] `docker-compose.yml` d'exemple (app + Postgres + volume `DATA_DIR`)
- [ ] Endpoint `GET /admin/api/metrics` (CPU, RAM, disque)

---

## Dépendances

```
1 Groupement ──→ 3 API REST ──→ 4 Progression / accueil   (faits)
2 EPG ─────────→ 3 API REST : now / next de /channels/{id}
5 TMDB étendu ─→ 6 IA
8 Sécurité : indépendant, à faire avant mise en production
```
