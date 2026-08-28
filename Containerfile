# syntax=docker/dockerfile:1
# ---------------------------------------------------------------- deps
# Debian/glibc rather than alpine: this app does a lot of outbound HTTP (Xtream,
# api.themoviedb.org, image.tmdb.org) and musl's resolver is a known source of
# intermittent EAI_AGAIN under concurrency. No native module needs compiling.
FROM docker.io/library/node:22-bookworm-slim AS deps
WORKDIR /app

# npm ci runs here, on the target platform, so esbuild's postinstall (pulled in by
# tsx, a *runtime* dependency) fetches @esbuild/linux-x64. Never add --ignore-scripts.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ---------------------------------------------------------------- runtime
FROM docker.io/library/node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/var/lib/kanstrimi

WORKDIR /app

COPY --from=deps --chown=node:node /app/node_modules ./node_modules
# There is no build step (tsconfig has noEmit): tsx transpiles the sources at startup,
# and tsconfig.json carries the "@/*" path alias tsx needs to resolve imports.
COPY --chown=node:node package.json tsconfig.json ./
COPY --chown=node:node src ./src
COPY --chown=node:node drizzle ./drizzle
COPY --chown=node:node scripts ./scripts

# The mount point must exist and belong to uid 1000: podman copies this ownership onto
# an empty named volume on first mount. Without it the TMDB cache fails with EACCES.
RUN mkdir -p /var/lib/kanstrimi/images && chown -R node:node /var/lib/kanstrimi

USER node
EXPOSE 3000

# 200 = database reachable. The "vault locked" state is reported in the JSON body and
# deliberately does not affect the status code.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Direct exec, not `npm start`: npm as PID 1 does not forward SIGTERM, which would
# defeat the graceful shutdown in src/server.ts.
CMD ["node", "--import", "tsx", "src/server.ts"]
