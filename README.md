# Kanstrimi

Système de streaming **personnel et mono-utilisateur**. Il se branche sur **un** fournisseur
Xtream Codes, importe son catalogue, le nettoie, l'enrichit via **TMDB** et le sert à
l'app Apple TV maison.

Principe directeur : **le serveur ne relaie jamais la vidéo**. Il sert des métadonnées et
répond `302` vers le flux d'origine ; les identifiants du fournisseur ne sortent jamais du serveur.

```
Fournisseur Xtream ──► server/ ──► Postgres (catalogue filtré, enrichi, groupé)
                          │
                          ├──► API REST /api/v1 + images ──► tvOS/
                          └──► 302 ──────────────────────► le flux vidéo, en direct
```

## Composants

| Dossier | Rôle | Pile | Doc |
|---|---|---|---|
| `server/` | Import, filtrage, enrichissement, groupement des variantes, diffusion, admin web | Node 22, Hono, Postgres + Drizzle, Hono JSX + HTMX + Bootstrap 5 | [`server/README.md`](server/README.md) |
| `tvOS/` | Client natif Apple TV 4K, consomme `/api/v1` | SwiftUI, Swift 6, tvOS 27, VLCKit 4 | [`tvOS/README.md`](tvOS/README.md) |

Le contrat entre les deux est le code : `server/src/app/api/types.ts` côté serveur,
`tvOS/kanstrimi/Contract/` côté app, et les fixtures JSON de `tvOS/kanstrimi/Client/Fixtures/`.

## Conventions communes

- **Français** dans l'interface, les messages d'erreur, les journaux, les commits et la doc ;
  **anglais** dans les commentaires de code.
- Chaque dossier porte ses décisions structurantes dans son `README.md`.
- `_Old/` (hors dépôt, ignoré par git) contient les tentatives précédentes du projet et la
  sauvegarde de l'ancienne documentation (`_Old/docs-2026-09-27/` : cahier des charges,
  backlog, flow tvOS, étude VLCKit, contrat API, maquettes UX). On y lit, on n'y écrit pas.

## Décisions figées

- **Un seul client : l'app tvOS.** L'API Xtream-compatible pour les players du marché
  (TiviMate, Smarters…) était un prototype ; elle a été retirée le 2026-09-27.
- Pas de multi-utilisateur, pas de multi-fournisseur, un seul mot de passe (admin web et
  compte client IPTV).
- Abandonné : Rust + Askama, SQLite, client Fire TV, AVPlayer côté tvOS (le fournisseur
  ne sert pas de HLS ; VLCKit lit tout).
