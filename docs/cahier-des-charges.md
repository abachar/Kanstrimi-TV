# Kanstrimi — Cahier des charges fonctionnel

*Document vivant. Il dit ce que le système doit faire et où il en est ; le découpage en
tâches est dans `server/BACKLOG.md`, la description du code dans `server/README.md`.*

Statuts : ✅ fait et en service · 🔜 prévu (numéro du bloc dans `server/BACKLOG.md`) ·
⏸ non planifié · ❌ abandonné. Mis à jour le 2026-09-25.

---

## 1. Le projet

Système de streaming **personnel et mono-utilisateur**. Il se branche sur **un** fournisseur
Xtream Codes, importe son catalogue, le nettoie, l'enrichit via TMDB et le rediffuse aux
applications de salon : players IPTV du marché et, à terme, une app Apple TV maison. Il tourne en permanence sur une machine domestique.

Trois principes non négociables :

1. **Le serveur ne relaie jamais la vidéo.** Il sert des métadonnées et répond `302` vers
   le flux d'origine.
2. **Les identifiants du fournisseur ne sortent jamais du serveur.** Les apps se connectent
   au serveur avec un compte client ; le serveur seul parle au fournisseur.
3. **Un seul utilisateur, un seul mot de passe.** Pas de comptes, pas de facturation, pas
   de multi-fournisseur.

| Composant | Rôle | Pile | État |
|---|---|---|---|
| `server/` | Import, filtrage, enrichissement, diffusion, admin | Node 22, Hono, Postgres + Drizzle, admin Hono JSX + HTMX + Bootstrap 5 | ✅ |
| Players IPTV du marché | Consomment l'API Xtream-compatible | TiviMate, IPTV Smarters… | ✅ validé |
| `tvOS/` | Client natif Apple TV, consomme l'API REST | Swift, VLCKit | 🔜 spécifié, aucun code |
| Fire TV | Client natif Amazon | — | ❌ abandonné, tvOS seul client maison |

---

## 2. Source Xtream

| Exigence | État |
|---|---|
| Configuration URL / utilisateur / mot de passe, test de connexion en un clic | ✅ |
| Import des catégories, chaînes live, films, séries ; suppression des éléments disparus | ✅ |
| Identifiants fournisseur traités comme du **texte opaque** et non uniques : dédoublonnage à l'import | ✅ |
| Synchronisation planifiée (cron), relance manuelle, journal des exécutions avec statistiques | ✅ |
| EPG : téléchargement du XMLTV amont, servi tel quel | ✅ |
| EPG importé en base, filtré aux chaînes visibles, `get_short_epg` servi localement | 🔜 bloc 2 |

## 3. Nettoyage et organisation du catalogue

| Exigence | État |
|---|---|
| Règles de filtrage regex sur le nom ou la catégorie : masquer ce qui matche, ou ne garder que ce qui matche par type ; ordre, activation, prévisualisation | ✅ |
| Masquage manuel d'un élément ou d'une catégorie entière, réversible, sans écraser l'effet d'une règle | ✅ |
| Réapplication des règles à chaque import, sans réseau | ✅ |
| Nettoyage du titre (tags langue et qualité, année) pour le matching | ✅ |
| **Groupement des variantes** : « The Matrix FR HD » et « The Matrix EN 4K » deviennent une entrée avec plusieurs pistes (langue, qualité) ; fusion par identifiant TMDB après enrichissement ; fusion et séparation manuelles dans l'admin | 🔜 bloc 1 |
| Collections thématiques et suggestions générées par IA (Ollama local ou API cloud), mode dégradé sans IA | 🔜 bloc 6 |

## 4. Enrichissement TMDB

| Exigence | État |
|---|---|
| Matching automatique des films et séries sur titre nettoyé + année, correction manuelle (recherche, association, retrait) | ✅ |
| Cache local des métadonnées texte, par langue | ✅ |
| Cache local des images, servi aux apps sous l'URL du serveur | ✅ |
| Affiche, fond, synopsis, genres, note, casting, réalisateur, bande-annonce, certification, pays, durée, saisons | ✅ |
| Logos, titre original, tagline, mots-clés, nombre de votes, statut et compte d'épisodes des séries | 🔜 bloc 5 |
| Enrichissement au niveau saison et épisode | 🔜 bloc 5 |
| Réinitialisation du matching automatique en conservant les associations manuelles | ✅ |

## 5. Diffusion aux applications

### 5.1 API Xtream-compatible — ✅ en service, figée

`player_api.php`, `get.php` (M3U), `xmltv.php`, redirections `/live|movie|series/…` en
`302`, images en cache. Tout player Xtream du marché s'y connecte avec le compte client et
le mot de passe unique. Un élément masqué disparaît des listes **et** répond `404` à la
lecture. Validée de bout en bout en production ; sa forme de réponse ne change plus sans
décision explicite.

### 5.2 API REST `/api/v1` — 🔜 bloc 3

Pour les clients maison. Films, séries avec saisons et épisodes, live groupé par catégorie
avec EPG, variantes d'un contenu, URL de lecture, recherche plein texte (titre, acteurs,
réalisateur), filtres genre / année / note, tri. Authentifiée par le compte client.

## 6. Expérience de visionnage (clients maison)

| Exigence | État |
|---|---|
| Lecture live et VOD ; le fournisseur ne sert pas de HLS, donc moteur VLCKit côté tvOS | 🔜 `tvOS/ETUDE.md` |
| Choix de la variante (langue, qualité) sur la fiche ou au lancement | 🔜 dépend du bloc 1 |
| Reprise de lecture : position sauvegardée, « Continuer à regarder », marqué vu à 90 % | 🔜 bloc 4 |
| Favoris et listes nommées | 🔜 bloc 4 |
| Écran d'accueil : reprise, récemment ajouté, tendances, collections | 🔜 bloc 4 |
| Recherche vocale Siri Remote | 🔜 `tvOS/README.md` |
| Cache images local sur le client (mémoire + disque, éviction LRU) | 🔜 `tvOS/README.md` |

## 7. Administration — ✅

Rendue côté serveur, utilisable au téléphone comme au bureau, accessible (labels,
ARIA, cibles tactiles).

| Écran | Contenu |
|---|---|
| Tableau de bord | Trois étapes relançables (source, filtres, TMDB) plus EPG et enchaînement complet ; compteurs par type ; état de l'enrichissement ; identifiants à saisir dans les apps ; activité récente |
| Catalogue | Par catégorie (chargement à la demande) ou en liste ; recherche ; filtres visibilité et statut TMDB ; interrupteur de visibilité ; correction TMDB |
| Règles | Création, édition, ordre, activation, prévisualisation des correspondances |
| Journaux | Historique des exécutions avec durée et statistiques |
| Paramètres | Source Xtream, compte client, URL publique, cron, TMDB, réinitialisation du matching |

Reste 🔜 bloc 7 : indicateurs système (CPU, RAM, disque), statistiques de groupement,
sauvegarde et restauration de la configuration.

## 8. Sécurité — ✅

- Un seul mot de passe : admin web **et** compte client IPTV. Stocké uniquement en hash
  bcrypt dans l'environnement.
- Identifiants Xtream et clé TMDB chiffrés en base (AES-256-GCM) avec une clé dérivée du
  mot de passe, gardée en RAM. Rien de déchiffrable sur disque.
- Après un redémarrage, le serveur est **verrouillé** jusqu'à la première requête
  authentifiée ; l'API Xtream répond dès qu'un player se connecte.
- Le protocole Xtream fait circuler le mot de passe en clair dans les URL : usage sur
  réseau local ou derrière HTTPS uniquement. Le serveur ne journalise jamais une URL brute.

## 9. Exploitation — ✅

- Image conteneur `linux/amd64` construite par GitHub Actions, publiée sur ghcr.io ;
  configuration entièrement par variables d'environnement ; migrations au démarrage.
- Déployé en podman rootless, piloté par systemd (Quadlet), derrière Caddy pour le TLS,
  mise à jour automatique à chaque publication.
- Seule la base Postgres est à sauvegarder ; images et EPG sont un cache reconstructible.
- Crons évalués en heure locale : le fuseau du conteneur doit être fixé.
- 🔜 bloc 8 : image `arm64`.

## 10. Objectifs de performance

Cibles d'origine, non mesurées formellement. Ordre de grandeur observé en production le
2026-09-25 : 70 000 films et 20 000 séries servis en moins de 400 ms par appel.

| Critère | Cible |
|---|---|
| Démarrage de la lecture | < 3 s |
| Réponse API catalogue | < 200 ms par page (⚠️ l'API Xtream renvoie tout d'un bloc, sans pagination) |
| Import initial de 100 000 éléments | < 5 min |
| Mémoire du conteneur | < 256 Mo |

---

## Glossaire

| Terme | Sens ici |
|---|---|
| **Xtream Codes** | Protocole IPTV de fait : `player_api.php`, `get.php`, `xmltv.php`, URLs de flux `/live|movie|series/<user>/<pass>/<id>.<ext>`. |
| **TMDB** | The Movie Database, source des métadonnées films et séries. |
| **Variante** | Même contenu en plusieurs langues ou qualités chez le fournisseur ; à regrouper en une entrée. |
| **Compte client** | Utilisateur que les apps saisissent, associé au mot de passe unique. |
| **Coffre** | Clé de chiffrement dérivée du mot de passe, en RAM ; « verrouillé » tant qu'aucune requête authentifiée n'est passée depuis le démarrage. |
| **302** | Réponse de redirection : le player reçoit l'URL du flux d'origine et s'y connecte lui-même. |
