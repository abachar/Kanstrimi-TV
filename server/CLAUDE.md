# Kanstrimi Server

Sous-dossier `server/` du dépôt (racine = `Kanstrimi TV/`, qui contient aussi `tvOS/`). La CI est à la racine dans `.github/workflows/build.yml` et cible `./server`.

Node 22+ · Hono · Postgres + Drizzle · admin en Hono JSX + HTMX + Bootstrap 5 via CDN (pas de React, pas de Tailwind, pas de build, **aucun CSS ni JS maison** — uniquement les classes Bootstrap).

- `npm run dev` (watch, tsx). Production : `npm run build` (esbuild → `dist/`, tout bundlé) puis `node dist/server.js`. `tsx` est une devDependency : il ne tourne jamais en production.
- `npm run typecheck`, `npm run test` (vitest ; les tests `*.db.test.ts` exigent un Postgres de test : `TEST_DATABASE_URL` ou `kanstrimi_test` en local, migré par `src/test/global-setup.ts`, jamais la base de dev), `npm run db:migrate` (migrateur runtime `src/db/migrate.ts`), `npm run db:generate` (drizzle-kit, après modification de `schema.ts`)
- Traitement = 4 étapes indépendantes (`src/lib/jobs/jobs.ts`) : `source` (lecture Xtream → DB, puis filtres) · `filters` · `enrich` (TMDB) · `group` (variantes → `contents`, sans réseau, relancée en fin de `source` et de `enrich`) ; `epg` à part. Le cron enchaîne source → enrich. Pas d'orchestrateur : chaque étape se relance seule depuis le dashboard.
- Groupement (`src/lib/grouping/`) : `tags.ts` est **la** grammaire des noms (`cleanTitle` de `tmdb/match.ts` n'en est qu'un réexport) ; un `item` = une variante jouable, `contents.key` = identité exposée (`tmdb:movie:603`, `fallback:movie:<slug>:<année>`, `live:<marché>-<slug>`), jamais `contents.id`. Les mises à jour massives passent par `unnest()` avec le template postgres-js (`client`), pas `sql` de Drizzle qui éclate les tableaux.
- Routes Xtream : `src/routes/xtream.ts`. Admin : `src/admin/{index,views,layout}.tsx`. Métier : `src/lib/**` (indépendant du framework).
- Alias `@/` → `src/`. Les vues JSX rendent en HTML côté serveur ; interactivité minimale via attributs `hx-*`.
- Backlog des fonctionnalités à porter : `BACKLOG.md`.
- Secrets : mot de passe unique (hash bcrypt dans `.env`), clé AES dérivée en RAM (`src/lib/auth/vault.ts`), chiffrement transparent dans `settings.ts` (`SECRET_KEYS`). Serveur verrouillé après reboot jusqu'à la première requête authentifiée. Mode redirect uniquement.
- Déploiement : `Containerfile` + `.github/workflows/build.yml` → ghcr.io, cible Fedora CoreOS (podman Quadlet) derrière Caddy. Plan complet dans `~/.claude/plans/`.
- Ne jamais journaliser une URL brute : le mot de passe circule dans les query strings et les chemins de flux. Utiliser `requestLogger()` de `src/lib/http-log.ts`.
