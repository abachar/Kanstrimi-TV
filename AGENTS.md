# Kanstrimi

Système de streaming **personnel et mono-utilisateur**. Il se branche sur un fournisseur
**Xtream Codes**, importe son catalogue, le nettoie, l'enrichit via **TMDB**, et le
rediffuse vers des applications de salon.

Principe directeur : **le serveur ne relaie jamais la vidéo**. Il sert des métadonnées et
répond en `302` vers le flux d'origine. La bande passante vidéo ne le traverse pas.

```
Fournisseur Xtream ──► server/ ──► Postgres (catalogue filtré + enrichi)
                          │
                          ├──► API Xtream-compatible ──► TiviMate, IPTV Smarters…
                          ├──► API REST (à venir)     ──► tvOS/, Fire TV
                          └──► 302 ────────────────────► le flux vidéo, en direct
```

## Les deux dossiers

### `server/` — implémenté, en service

Node 22 + Hono + Postgres/Drizzle, admin rendue côté serveur (Hono JSX + HTMX +
Bootstrap 5). Compilé par esbuild en un bundle autonome pour la production.

Il expose aujourd'hui une **API Xtream-compatible** (`player_api.php`, `get.php`,
`xmltv.php`, redirections de flux) : n'importe quel player IPTV du marché s'y connecte
comme à un vrai serveur Xtream. Le traitement se fait en trois étapes indépendantes —
lire la source, appliquer les filtres, enrichir via TMDB.

👉 **Lire `server/CLAUDE.md` avant toute modification** : conventions, modèle de
sécurité (chiffrement des secrets, coffre en RAM) et pièges.

### `tvOS/` — spécification seule, aucun code

`tvOS/README.md` décrit l'application Apple TV visée : écran d'accueil, catalogue,
lecture, reprise, favoris, recherche vocale, sélection de variante langue/qualité.
Elle consommera une API REST maison (`/api/v1/...`) que le serveur **n'expose pas
encore** — voir le bloc 3 de `server/BACKLOG.md`.

## Le cahier des charges diverge de l'implémentation

`docs/cahier-des-charges.md` est le cahier des charges fonctionnel d'origine. Plusieurs de ses
choix techniques ont été abandonnés à l'usage — ne pas le prendre pour la description
du code existant :

| Cahier des charges | Réalité de `server/` |
|---|---|
| Serveur en **Rust**, admin **Askama** | Node + Hono, admin Hono JSX + HTMX |
| API **REST** pour les clients | API **Xtream-compatible** ; le REST reste à écrire |
| Groupement des variantes, organisation par IA | pas encore implémentés (`server/BACKLOG.md`) |

Les *fonctionnalités* décrites dans le cahier des charges restent la cible ; c'est la
pile technique qui a changé.

## Conventions

- **Français** dans l'interface, les messages d'erreur, les journaux et les commits ;
  anglais dans les commentaires de code.
- Les décisions structurantes sont consignées dans `server/CLAUDE.md`, pas ici.
- `_Old/`, `.foreman/`, les notes `_*.md` et les données locales sont hors dépôt.

## Chercher l'inspiration dans `_Old/`

`_Old/` contient les tentatives précédentes du même projet. **Hors dépôt** (3,3 Go,
exclu par `.gitignore`) mais présent sur le disque : c'est une mine pour retrouver une
idée d'architecture, un algorithme ou une maquette déjà éprouvés. Ne rien y modifier,
ne rien y committer — on y lit, on y copie.

| Dossier | Ce qu'on y trouve |
|---|---|
| `_Old/_Kanstrimi TV/` | Application **tvOS en Swift** la plus aboutie (Xcode + Pods, `ARCHITECTURE.md`, `CHANGELOG.md`, collection Bruno pour l'API). La référence pour écrire `tvOS/`. |
| `_Old/Kanstrimi TV/` | Une itération tvOS antérieure (Carthage). |
| `_Old/kanstrimi/` | Un serveur **Node + Drizzle** et un dossier `tvos`, avec son `CLAUDE.md`. |
| `_Old/kk/` | Un serveur **Rust** (Cargo) avec des specs `openspec`. Son backlog a servi de base à `server/BACKLOG.md`. |
| `_Old/Icons/` | Icônes de l'application, toutes tailles. |

Réflexe utile : avant d'implémenter une fonctionnalité listée dans `server/BACKLOG.md`
(groupement des variantes, API REST, collections IA), regarder si une version existe
déjà dans `_Old/` — l'algorithme de groupement et le matching TMDB y ont déjà été
écrits au moins une fois.
