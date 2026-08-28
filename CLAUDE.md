# Kanstrimi Server

Node 22+ · Hono · Postgres + Drizzle · admin en Hono JSX + HTMX + Bootstrap 5 via CDN (pas de React, pas de Tailwind, pas de build, **aucun CSS ni JS maison** — uniquement les classes Bootstrap).

- `npm run dev` (watch) / `npm run start` — `node --env-file-if-exists=.env --import tsx src/server.ts`. En conteneur : `node --import tsx src/server.ts` (jamais `npm start` : npm en PID 1 ne relaie pas SIGTERM).
- `npm run typecheck`, `npm run test` (vitest), `npm run db:migrate` (migrateur runtime `src/db/migrate.ts`, pas `drizzle-kit`)
- Traitement = 3 étapes indépendantes (`src/lib/jobs/jobs.ts`) : `source` (lecture Xtream → DB, puis filtres) · `filters` · `enrich` (TMDB) ; `epg` à part. Le cron enchaîne source → enrich. Pas d'orchestrateur : chaque étape se relance seule depuis le dashboard.
- Routes Xtream : `src/routes/xtream.ts`. Admin : `src/admin/{index,views,layout}.tsx`. Métier : `src/lib/**` (indépendant du framework).
- Alias `@/` → `src/`. Les vues JSX rendent en HTML côté serveur ; interactivité minimale via attributs `hx-*`.
- Backlog des fonctionnalités à porter : `BACKLOG.md`.
- Secrets : mot de passe unique (hash bcrypt dans `.env`), clé AES dérivée en RAM (`src/lib/auth/vault.ts`), chiffrement transparent dans `settings.ts` (`SECRET_KEYS`). Serveur verrouillé après reboot jusqu'à la première requête authentifiée. Mode redirect uniquement.
- Déploiement : `Containerfile` + `.github/workflows/build.yml` → ghcr.io, cible Fedora CoreOS (podman Quadlet) derrière Caddy. Plan complet dans `~/.claude/plans/`.
- Ne jamais journaliser une URL brute : le mot de passe circule dans les query strings et les chemins de flux. Utiliser `requestLogger()` de `src/lib/http-log.ts`.
