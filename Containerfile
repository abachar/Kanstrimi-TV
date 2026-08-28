# syntax=docker/dockerfile:1
# ---------------------------------------------------------------- build
# Debian/glibc rather than alpine: this app does a lot of outbound HTTP (Xtream,
# api.themoviedb.org, image.tmdb.org) and musl's resolver is a known source of
# intermittent EAI_AGAIN under concurrency. No native module needs compiling.
FROM docker.io/library/node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
# esbuild bundles every dependency into dist/: the runtime image ships no
# node_modules at all, and no TypeScript is transpiled at start-up.
RUN npm run build

# ---------------------------------------------------------------- runtime
FROM docker.io/library/node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/var/lib/kanstrimi

WORKDIR /app

# Plain JavaScript plus the SQL migrations, which are data files read at run time
# (dist/db/migrate.js resolves ../../drizzle relative to itself).
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node drizzle ./drizzle

# The mount point must exist and belong to uid 1000: podman copies this ownership
# onto an empty named volume on first mount. Without it the TMDB image cache and
# epg.xml fail with EACCES.
RUN mkdir -p /var/lib/kanstrimi/images && chown -R node:node /var/lib/kanstrimi

USER node
EXPOSE 3000

# 200 = database reachable. The "vault locked" state is reported in the JSON body
# and deliberately does not affect the status code, otherwise every restart would
# leave the container unhealthy until a player connects.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Direct exec, never `npm start`: npm as PID 1 does not forward SIGTERM, which
# would defeat the graceful shutdown in src/server.ts.
CMD ["node", "--enable-source-maps", "dist/server.js"]
