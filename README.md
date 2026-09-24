# Kanstrimi

Serveur de streaming **personnel et mono-utilisateur**. Il se branche sur un fournisseur
**Xtream Codes**, importe son catalogue, le nettoie avec des règles, l'enrichit via
**TMDB**, et le rediffuse aux applications de salon (TiviMate, IPTV Smarters, et à terme
une app Apple TV maison).

Principe directeur : **le serveur ne relaie jamais la vidéo**. Il sert des métadonnées et
répond `302` vers le flux d'origine. La bande passante vidéo ne le traverse pas.

```
Fournisseur Xtream ──► server/ ──► Postgres (catalogue filtré + enrichi)
                          │
                          ├──► API Xtream-compatible ──► TiviMate, IPTV Smarters…
                          ├──► API REST (à venir)     ──► tvOS/
                          └──► 302 ────────────────────► le flux vidéo, en direct
```

## Ce qui existe aujourd'hui

`server/` est en service. Node 22, Hono, Postgres + Drizzle, admin rendue côté serveur
(Hono JSX + HTMX + Bootstrap 5), compilée par esbuild en un bundle autonome.

| Fonction | État |
|---|---|
| Import du catalogue Xtream (live, films, séries, catégories) | fait |
| Règles de filtrage regex (masquer / liste blanche), masquage manuel par élément ou catégorie | fait |
| Enrichissement TMDB (affiche, fond, synopsis, genres, note, casting, bande-annonce) avec correction manuelle | fait |
| API Xtream-compatible : `player_api.php`, `get.php`, `xmltv.php`, redirections de flux, cache images | fait |
| Admin : tableau de bord, catalogue par catégorie ou en liste, règles, journaux, paramètres ; utilisable sur mobile | fait |
| Planification cron (sync et EPG), 3 étapes relançables indépendamment | fait |
| Secrets chiffrés en base, coffre en RAM déverrouillé par le mot de passe | fait |
| Image conteneur publiée sur ghcr.io par GitHub Actions | fait |
| Groupement des variantes (langue, qualité) en une seule entrée | à faire |
| EPG importé en base, `xmltv.php` limité aux chaînes visibles | à faire |
| API REST `/api/v1` pour les apps maison, reprise de lecture, favoris | à faire |
| Collections organisées par IA | à faire |
| Application tvOS, seul client maison prévu | spécifiée, aucun code |

Le détail est dans `server/BACKLOG.md`.

## Démarrage

```bash
cd server
cp .env.example .env                       # DATABASE_URL, SESSION_SECRET, DATA_DIR
npm run hash-password -- <mot-de-passe>    # → ADMIN_PASSWORD_HASH dans .env
npm install
npm run db:migrate
npm run dev                                # http://localhost:3000/admin
```

Dans l'admin : **Paramètres** pour l'URL et les identifiants Xtream, le compte client des
apps et la clé TMDB, puis **Tableau de bord → Tout enchaîner**.

## Brancher une application IPTV

Dans TiviMate, IPTV Smarters ou tout player Xtream :

| Champ | Valeur |
|---|---|
| URL du serveur | `http://<ip-du-serveur>:3000` |
| Utilisateur | le compte client défini dans Paramètres (`admin` par défaut) |
| Mot de passe | le mot de passe admin |

Le player voit le catalogue filtré et enrichi. À la lecture, il reçoit un `302` vers le
flux du fournisseur : les identifiants Xtream ne sont jamais transmis aux apps.

## Sécurité

Un seul mot de passe, stocké en hash bcrypt dans `.env`. Les identifiants Xtream et la clé
TMDB sont chiffrés en base (AES-256-GCM) avec une clé dérivée de ce mot de passe et gardée
en RAM. **Après un redémarrage, le serveur est verrouillé** jusqu'à la première requête
authentifiée. Le protocole Xtream fait circuler le mot de passe en clair dans les URL :
réserver l'usage au réseau local ou passer derrière HTTPS.

## Déploiement

`server/Containerfile` construit une image `linux/amd64` publiée sur
`ghcr.io/<owner>/kanstrimi` par `.github/workflows/build.yml`. Cible : Fedora CoreOS avec
podman et systemd Quadlet, derrière un reverse proxy Caddy. Les migrations s'appliquent au
démarrage. `DATA_DIR` ne contient qu'un cache reconstructible (images TMDB, `epg.xml`) :
seule la base est à sauvegarder.

## Organisation du dépôt

```
server/     le serveur, implémenté et en service
  README.md     démarrage, API exposée, structure du code, déploiement
  CLAUDE.md     conventions et pièges, à lire avant toute modification
  BACKLOG.md    fonctionnalités restant à porter
tvOS/       spécification de l'application Apple TV, aucun code
docs/       cahier des charges fonctionnel, vivant : exigences et leur état
AGENTS.md   description du projet pour les agents de code
```

`docs/cahier-des-charges.md` liste les exigences fonctionnelles avec leur état, et renvoie au
bloc de `server/BACKLOG.md` pour ce qui reste à faire.

## Conventions

Français dans l'interface, les journaux, les messages d'erreur et les commits ; anglais
dans les commentaires de code. Les décisions structurantes sont consignées dans
`server/CLAUDE.md`.
