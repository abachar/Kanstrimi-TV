# KANSTRIMI — Cahier des Charges Fonctionnel

*Streaming intelligent enrichi par les métadonnées*

---

## Table des matières

1. [Introduction](#1-introduction)
2. [Description générale du système](#2-description-générale-du-système)
3. [Exigences fonctionnelles](#3-exigences-fonctionnelles)
4. [Interface d'administration](#4-interface-dadministration)
5. [Interfaces clients natives](#5-interfaces-clients-natives)
6. [Exigences non fonctionnelles](#6-exigences-non-fonctionnelles)
7. [Contraintes techniques](#7-contraintes-techniques)
8. [Glossaire](#8-glossaire)

---

## 1. Introduction

### 1.1 Contexte du projet

Kanstrimi est un système de streaming personnel et open source conçu pour se connecter à un serveur compatible Xtream Codes, enrichir automatiquement les métadonnées du contenu via TMDB (The Movie Database), organiser intelligemment le catalogue grâce à l'intelligence artificielle, et diffuser le contenu vers des applications natives sur Apple TV (tvOS) et Amazon Fire TV Stick.

Le projet répond au besoin d'une expérience de streaming unifiée, esthétique et intelligente, à partir d'une source Xtream Codes, avec un enrichissement média de qualité professionnelle.

### 1.2 Objectifs

- Fournir une interface de streaming moderne et native sur tvOS et Fire TV Stick.
- Enrichir automatiquement toutes les métadonnées (affiches, synopsis, genres, notes) via l'API TMDB.
- Grouper intelligemment les variantes d'un même contenu (langues, qualités) en une seule entrée.
- Organiser et catégoriser le contenu via IA (classement, recommandations).
- Offrir une expérience fluide : reprise de lecture, favoris, recherche avancée.
- Déployer le serveur en local (NAS, Raspberry Pi) pour un contrôle total des données.
- Proposer une interface d'administration intégrée directement dans le serveur via Askama.

### 1.3 Public cible

Utilisation personnelle mono-utilisateur. Le système est conçu pour un utilisateur unique qui gère et consomme son propre contenu de streaming.

### 1.4 Périmètre

| Inclus dans le périmètre | Hors périmètre |
|---|---|
| Serveur backend en Rust avec admin intégré (Askama) | Gestion multi-utilisateurs |
| Application native tvOS | Système de facturation / monétisation |
| Application Fire TV Stick | Application iOS / Android mobile |
| Connexion à un serveur Xtream Codes unique | Support de plusieurs serveurs Xtream Codes simultanés |
| Enrichissement TMDB | Support de protocoles autres qu'Xtream Codes |
| Groupement des variantes (langues, qualités) | Transcodage vidéo côté serveur |
| Organisation IA du contenu | Proxy de flux vidéo côté serveur |
| Streaming en lien direct (pas de proxy) | CDN ou distribution de contenu |

---

## 2. Description générale du système

### 2.1 Architecture globale

Kanstrimi adopte une architecture client-serveur composée de trois composants principaux :

| Composant | Technologie | Rôle |
|---|---|---|
| **Serveur (Backend)** | Rust (Axum) + Askama | API REST, enrichissement TMDB, IA, groupement variantes, pages d'administration intégrées |
| **Client tvOS** | Swift / SwiftUI | Interface native Apple TV, lecture vidéo, navigation du catalogue, cache images local |
| **Client Fire TV** | Kotlin / Jetpack Compose for TV | Interface native Fire TV Stick, lecture vidéo, navigation, cache images local |

L'interface d'administration n'est pas une application séparée : elle est intégrée directement dans le serveur Rust via le moteur de templates Askama, sous forme de pages HTML rendues côté serveur.

### 2.2 Flux de données principal

1. L'utilisateur configure le serveur Xtream Codes via les pages d'administration intégrées.
2. Le serveur Kanstrimi interroge l'API Xtream Codes et récupère la liste des chaînes, films, séries et données EPG.
3. Le module de groupement identifie les variantes d'un même contenu (langues : FR, IT, EN… et qualités : SD, HD, 4K…) et les regroupe en une seule entrée avec plusieurs pistes disponibles.
4. Le module d'enrichissement interroge l'API TMDB pour associer affiches, synopsis, genres, notes et métadonnées complètes à chaque contenu groupé.
5. Le module IA analyse et organise le contenu : catégorisation, suggestions de regroupement.
6. Les applications clientes (tvOS / Fire TV) interrogent l'API REST du serveur Kanstrimi pour afficher le catalogue enrichi.
7. Pour la lecture, le serveur fournit le lien de streaming direct vers le serveur Xtream Codes. Les applications clientes accèdent au flux directement, sans proxy.

### 2.3 Flux de groupement des variantes

Lors de la synchronisation, un même contenu apparaît souvent en plusieurs variantes sur le serveur Xtream Codes (par exemple : « The Matrix FR HD », « The Matrix IT 4K », « The Matrix EN SD »). Le serveur Kanstrimi détecte ces variantes et les regroupe :

1. Les titres bruts sont nettoyés et normalisés (suppression des tags de langue, qualité, etc.).
2. Les contenus partageant le même titre nettoyé (et/ou le même identifiant TMDB après enrichissement) sont regroupés en une seule entrée.
3. Chaque entrée groupée conserve la liste de ses variantes avec leurs attributs : langue, qualité, URL de streaming.
4. Côté client, l'utilisateur voit un seul contenu et peut choisir la variante (langue/qualité) au moment de la lecture.

---

## 3. Exigences fonctionnelles

### 3.1 Gestion du serveur Xtream Codes

#### 3.1.1 Connexion et authentification

- Configuration du serveur unique via URL, nom d'utilisateur et mot de passe.
- Vérification automatique de la connectivité et de la validité des identifiants.
- Affichage du statut du serveur (actif, expiré, hors ligne).
- Synchronisation périodique configurable (intervalle défini par l'utilisateur).

#### 3.1.2 Récupération du contenu

- Import des catégories de chaînes TV en direct (Live TV).
- Import du catalogue de films (VOD).
- Import du catalogue de séries (saisons et épisodes).
- Import des données EPG (guide électronique des programmes).
- Gestion des erreurs de synchronisation avec journalisation.

#### 3.1.3 Groupement des variantes

- Détection automatique des variantes d'un même contenu (même film/série/chaîne en différentes langues et qualités).
- Nettoyage et normalisation des titres pour identifier les correspondances.
- Regroupement des variantes en une seule entrée dans le catalogue.
- Conservation de chaque variante avec ses attributs : langue (FR, EN, IT, DE…), qualité (SD, HD, FHD, 4K), URL de streaming directe.
- Après enrichissement TMDB, consolidation des groupes par identifiant TMDB commun.
- Possibilité de corriger manuellement un groupement incorrect via l'administration.

### 3.2 Enrichissement des métadonnées via TMDB

#### 3.2.1 Matching automatique

- Recherche automatique sur TMDB à partir du titre nettoyé du contenu groupé.
- Algorithme de correspondance floue (fuzzy matching) pour gérer les titres approximatifs.
- Possibilité de correction manuelle du matching via les pages d'administration.
- Cache local des métadonnées TMDB (texte uniquement) sur le serveur.

#### 3.2.2 Données enrichies

Pour chaque contenu matché, les données suivantes sont récupérées et stockées :

| Catégorie | Données | Usage |
|---|---|---|
| Visuels | URLs des affiches (poster), backdrops, logos | Transmises aux clients qui les cachent localement |
| Texte | Synopsis, titre original, tagline | Fiche détaillée |
| Classification | Genres, mots-clés, certification | Filtrage et organisation |
| Notes | Note TMDB, nombre de votes | Tri et recommandations |
| Production | Année, durée, réalisateur, acteurs | Recherche et filtrage |
| Séries | Nombre de saisons, épisodes, statut | Navigation séries |

### 3.3 Organisation intelligente par IA

#### 3.3.1 Fonctionnalités IA

- Catégorisation automatique du contenu en collections thématiques (ex : « Thrillers des années 90 », « Comédies françaises »).
- Suggestion de contenu similaire (« Si vous avez aimé... »).
- Nettoyage et normalisation des titres (suppression d'artéfacts, caractères parasites).

#### 3.3.2 Configuration IA

- Support de modèles locaux via Ollama (recommandé pour un déploiement local).
- Support optionnel d'APIs cloud (OpenAI, Anthropic) via clé API configurable.
- Configuration du modèle et des paramètres via les pages d'administration.
- Mode dégradé sans IA (le système fonctionne même sans module IA configuré).

### 3.4 Lecture et expérience utilisateur

#### 3.4.1 Lecture vidéo

- Lecture de flux en direct (Live TV) avec support EPG en temps réel.
- Lecture de contenus VOD (films, épisodes de séries).
- Support des formats courants : HLS, MPEG-TS.
- Contrôles de lecture : pause, avance/retour ±10 secondes, barre de progression.
- Sélection de la variante (langue et qualité) avant ou pendant la lecture.
- Sélection de la piste audio et des sous-titres si disponibles dans le flux.
- Le client se connecte directement au serveur Xtream Codes pour la lecture (lien direct fourni par l'API Kanstrimi, pas de proxy).

#### 3.4.2 Reprise de lecture (Continue Watching)

- Sauvegarde automatique de la position de lecture à intervalles réguliers.
- Section « Continuer à regarder » sur l'écran d'accueil.
- Reprise de lecture au même point sur n'importe quel client (tvOS ou Fire TV).
- Marquage automatique comme « vu » lorsque le contenu est terminé (≥ 90% de progression).

#### 3.4.3 Favoris et listes personnalisées

- Ajout/suppression de contenu aux favoris en un clic.
- Création de listes personnalisées nommées (ex : « À regarder ce week-end »).
- Synchronisation des favoris et listes entre tous les clients.

#### 3.4.4 Recherche et filtrage avancé

- Recherche textuelle rapide sur le titre, les acteurs, le réalisateur.
- Filtrage par : genre, année, note minimale, durée, type (film/série/live).
- Tri par : pertinence, date d'ajout, note, titre alphabétique.
- Recherche vocale via la télécommande Siri Remote (tvOS).

---

## 4. Interface d'administration

L'interface d'administration est composée de pages HTML rendues côté serveur via le moteur de templates Askama, directement intégrées dans le binaire Rust. Il n'y a pas d'application front-end séparée.

### 4.1 Dashboard

- Vue d'ensemble : nombre de chaînes, films, séries, statut du serveur Xtream.
- Dernière synchronisation et prochaine synchronisation planifiée.
- Statistiques d'enrichissement TMDB (taux de matching, contenus non matchés).
- Statistiques de groupement (nombre de groupes, variantes par groupe).
- Indicateurs de santé du système (CPU, mémoire, espace disque).

### 4.2 Configuration du serveur Xtream

- Formulaire de configuration : URL, nom d'utilisateur, mot de passe.
- Test de connexion en un clic.
- Forcer une synchronisation manuelle.
- Configuration de l'intervalle de synchronisation.
- Journal des synchronisations (succès, erreurs, durée).

### 4.3 Gestion du contenu

- Navigation et recherche dans le catalogue complet.
- Visualisation des groupes de variantes et de leurs pistes (langue/qualité).
- Correction manuelle du groupement (séparer ou fusionner des variantes).
- Correction manuelle du matching TMDB (recherche et association).
- Gestion des collections IA (valider, modifier, supprimer).
- Masquage de contenu indésirable.

### 4.4 Configuration générale

- Configuration de la clé API TMDB.
- Configuration du module IA (Ollama local, API cloud, modèle utilisé).
- Paramètres de cache métadonnées (durée de rétention).
- Paramètres réseau (port du serveur).
- Sauvegarde et restauration de la configuration.

---

## 5. Interfaces clients natives

### 5.1 Application tvOS (Apple TV)

#### 5.1.1 Écran d'accueil

- Bannière rotative mettant en avant du contenu (tendances, nouveautés, collections IA).
- Section « Continuer à regarder ».
- Section « Récemment ajouté ».
- Sections dynamiques générées par l'IA (collections thématiques).
- Accès rapide aux favoris et listes personnalisées.

#### 5.1.2 Navigation

- Onglets principaux : Accueil, Live TV, Films, Séries, Recherche.
- Grille EPG pour la TV en direct.
- Navigation par genre, année, ou collection.
- Fiche détaillée du contenu (backdrop, synopsis, casting, bande-annonce si disponible).
- Sélection de la variante (langue/qualité) sur la fiche détaillée ou au lancement de la lecture.
- Support complet de la Siri Remote (navigation, recherche vocale).

#### 5.1.3 Cache images local

- Les images TMDB (posters, backdrops) sont téléchargées et cachées localement sur l'Apple TV.
- Cache mémoire LRU pour les images récemment affichées.
- Cache disque persistant pour éviter de re-télécharger les images.
- Taille du cache disque limitée avec éviction automatique (LRU).

### 5.2 Application Fire TV Stick

L'application Fire TV Stick offre une expérience fonctionnellement identique à l'application tvOS, adaptée à la plateforme Amazon :

- Interface Kotlin / Jetpack Compose for TV.
- Support de la télécommande Fire TV (navigation D-pad, recherche vocale Alexa).
- Mêmes fonctionnalités : accueil, catalogue, lecture, favoris, reprise de lecture, sélection de variante.
- Cache images local (mémoire + disque) identique à tvOS.
- Optimisation pour les performances limitées du Fire TV Stick (gestion mémoire, lazy loading).

---

## 6. Exigences non fonctionnelles

### 6.1 Performance

| Critère | Objectif |
|---|---|
| Démarrage de la lecture vidéo | < 3 secondes |
| Temps de réponse API (catalogue) | < 200 ms |
| Synchronisation initiale (1000 contenus) | < 5 minutes |
| Enrichissement TMDB (1000 contenus) | < 15 minutes |
| Empreinte mémoire serveur (repos) | < 100 Mo RAM |
| Empreinte mémoire serveur (actif) | < 256 Mo RAM |

### 6.2 Compatibilité matérielle

| Plateforme | Version minimale | Matériel cible |
|---|---|---|
| Serveur Rust | Linux ARMv7+ / x86_64 | Raspberry Pi 4+, NAS (Synology, QNAP) |
| tvOS | tvOS 17.0+ | Apple TV HD, Apple TV 4K |
| Fire TV | Fire OS 7+ | Fire TV Stick 4K, Fire TV Stick 4K Max |

### 6.3 Sécurité

- Communication chiffrée entre clients et serveur (HTTPS / TLS via reverse proxy).
- Les identifiants Xtream Codes sont stockés de manière chiffrée sur le serveur.
- Les clés API (TMDB, IA) sont stockées de manière sécurisée.
- Accès aux pages d'administration protégé par un mot de passe (ou token).

### 6.4 Fiabilité et résilience

- Le système doit fonctionner sans interruption 24/7 sur du matériel domestique.
- Mode dégradé si TMDB est inaccessible (affichage des données brutes Xtream Codes).
- Mode dégradé si le module IA est indisponible (organisation manuelle).
- Journalisation complète pour le diagnostic.

### 6.5 Stockage

- Base de données embarquée (SQLite) pour minimiser les dépendances.
- Cache des métadonnées TMDB (texte) sur le serveur.
- Cache des images TMDB sur chaque client (tvOS et Fire TV), pas sur le serveur.
- Estimation du stockage serveur : environ 100 Mo pour 10 000 contenus enrichis (métadonnées uniquement, sans images).

---

## 7. Contraintes techniques

### 7.1 API Xtream Codes

Le serveur se connecte à un seul serveur Xtream Codes, qui expose les endpoints suivants :

- `player_api.php?username=X&password=Y` — Authentification et informations du compte.
- `player_api.php?action=get_live_categories` — Catégories de chaînes TV.
- `player_api.php?action=get_live_streams` — Liste des chaînes.
- `player_api.php?action=get_vod_categories` — Catégories VOD.
- `player_api.php?action=get_vod_streams` — Liste des films.
- `player_api.php?action=get_series` — Liste des séries.
- `xmltv.php?username=X&password=Y` — Données EPG au format XMLTV.

### 7.2 API TMDB

L'enrichissement utilise l'API v3 de TMDB (`https://api.themoviedb.org/3`). Une clé API gratuite est nécessaire. Le rate limiting TMDB (environ 50 requêtes par seconde par IP) doit être respecté avec un système de throttling côté serveur.

### 7.3 Streaming en lien direct

Les applications clientes reçoivent l'URL de streaming directe vers le serveur Xtream Codes via l'API Kanstrimi. Le serveur Kanstrimi n'agit pas comme proxy de flux. Les clients doivent avoir un accès réseau direct au serveur Xtream Codes.

### 7.4 Déploiement

- Le serveur doit être distribué sous forme de binaire statique précompilé (ARM + x86_64) et d'image Docker.
- L'interface d'administration est embarquée dans le binaire (templates Askama compilés).
- Configuration via fichier TOML ou variables d'environnement.
- Procédure d'installation simple (un seul binaire, pas de dépendances système).

---

## 8. Glossaire

| Terme | Définition |
|---|---|
| **Xtream Codes** | Système de gestion de flux de streaming IPTV, exposant une API standardisée pour la distribution de contenu vidéo. |
| **TMDB** | The Movie Database — base de données communautaire de métadonnées sur les films et séries, accessible via une API REST gratuite. |
| **EPG** | Electronic Program Guide — guide électronique des programmes TV, fournissant les horaires et descriptions des émissions. |
| **VOD** | Video On Demand — contenu vidéo disponible à la demande (films, séries), par opposition à la diffusion en direct. |
| **HLS** | HTTP Live Streaming — protocole de streaming adaptatif développé par Apple, découpant la vidéo en segments HTTP. |
| **Variante** | Version d'un même contenu différant par la langue (FR, EN, IT…) et/ou la qualité (SD, HD, 4K). Le système les regroupe en une seule entrée. |
| **Askama** | Moteur de templates Rust compilé à la compilation, générant du HTML performant directement intégré dans le binaire serveur. |
| **Ollama** | Outil open source permettant d'exécuter des modèles de langage (LLM) en local sur son propre matériel. |
| **tvOS** | Système d'exploitation Apple pour l'Apple TV, basé sur iOS. |
| **Fire OS** | Système d'exploitation Amazon basé sur Android, utilisé sur les appareils Fire TV. |
