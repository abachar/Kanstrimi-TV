# Kanstrimi tvOS

*Application native Apple TV pour le streaming intelligent*

---

## Table des matières

1. [Présentation](#1-présentation)
2. [Écran d'accueil](#2-écran-daccueil)
3. [Navigation et catalogue](#3-navigation-et-catalogue)
4. [Lecture vidéo](#4-lecture-vidéo)
5. [Reprise de lecture](#5-reprise-de-lecture)
6. [Favoris et listes personnalisées](#6-favoris-et-listes-personnalisées)
7. [Recherche et filtrage](#7-recherche-et-filtrage)
8. [Cache images](#8-cache-images)
9. [Compatibilité](#9-compatibilité)

---

## 1. Présentation

L'application Kanstrimi tvOS est le client natif Apple TV du système Kanstrimi. Elle offre une interface de streaming moderne et fluide, alimentée par le catalogue enrichi du serveur Kanstrimi. L'application se connecte à l'API REST du serveur pour afficher le contenu, et accède directement au serveur Xtream Codes pour la lecture vidéo (pas de proxy).

---

## 2. Écran d'accueil

- **Bannière rotative** mettant en avant du contenu : tendances, nouveautés, collections thématiques générées par l'IA.
- **Continuer à regarder** : reprendre les contenus en cours de visionnage exactement là où on s'est arrêté.
- **Récemment ajouté** : les derniers contenus ajoutés au catalogue.
- **Collections thématiques IA** : sections dynamiques générées automatiquement (ex : « Thrillers des années 90 », « Comédies françaises »).
- **Accès rapide** aux favoris et listes personnalisées.

---

## 3. Navigation et catalogue

### Onglets principaux

| Onglet | Contenu |
|---|---|
| **Accueil** | Bannière, continuer à regarder, collections, récemment ajouté |
| **Live TV** | Chaînes en direct avec grille EPG |
| **Films** | Catalogue complet des films VOD |
| **Séries** | Catalogue des séries (saisons et épisodes) |
| **Recherche** | Recherche textuelle et vocale |

### Fiche détaillée du contenu

Chaque contenu dispose d'une fiche riche affichant :

- Image de fond (backdrop) et affiche.
- Synopsis complet.
- Casting (réalisateur, acteurs).
- Genres, année, durée, note TMDB.
- Bande-annonce (si disponible).
- **Sélection de la variante** : choix de la langue (FR, EN, IT…) et de la qualité (SD, HD, 4K) avant ou pendant la lecture.

### Modes de navigation

- Navigation par genre, année ou collection.
- Grille EPG interactive pour la TV en direct.
- Support complet de la **Siri Remote** (navigation tactile, recherche vocale).

---

## 4. Lecture vidéo

- Lecture de flux en direct (Live TV) avec support EPG en temps réel.
- Lecture de contenus VOD (films, épisodes de séries).
- Support des formats HLS et MPEG-TS.
- **Contrôles de lecture** : pause, avance/retour ±10 secondes, barre de progression.
- **Sélection de variante** : choix de la langue et de la qualité au lancement ou en cours de lecture.
- **Pistes audio et sous-titres** : sélection parmi les pistes disponibles dans le flux.
- Démarrage de la lecture en moins de 3 secondes.

---

## 5. Reprise de lecture

- Sauvegarde automatique de la position de lecture à intervalles réguliers.
- Section « Continuer à regarder » visible sur l'écran d'accueil.
- Reprise au même point, même si le visionnage a été commencé sur un autre client (Fire TV).
- Marquage automatique comme « vu » lorsque le contenu est terminé (≥ 90% de progression).

---

## 6. Favoris et listes personnalisées

- Ajout/suppression de contenu aux favoris en un clic.
- Création de listes personnalisées nommées (ex : « À regarder ce week-end »).
- Synchronisation des favoris et listes entre tous les clients (tvOS et Fire TV).

---

## 7. Recherche et filtrage

- **Recherche textuelle** rapide sur le titre, les acteurs, le réalisateur.
- **Recherche vocale** via la Siri Remote.
- **Filtrage** par : genre, année, note minimale, durée, type (film/série/live).
- **Tri** par : pertinence, date d'ajout, note, titre alphabétique.

---

## 8. Cache images

Les images du catalogue (affiches, backdrops) sont gérées localement pour garantir une navigation fluide :

- Cache mémoire (LRU) pour les images récemment affichées.
- Cache disque persistant pour éviter de re-télécharger les images.
- Taille du cache disque limitée avec éviction automatique (LRU).

---

## 9. Compatibilité

| Version minimale | Matériel supporté |
|---|---|
| tvOS 17.0+ | Apple TV HD, Apple TV 4K |
