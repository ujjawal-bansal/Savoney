# syntax=docker/dockerfile:1
#
# Build context is the REPOSITORY ROOT, not server/ — the API depends on the
# @savoney/shared workspace, which lives outside this directory.
#   docker build -f server/Dockerfile .

# ---------- deps ----------
FROM node:22-alpine AS deps
WORKDIR /app

# Copy only manifests first. This layer is cached and only invalidated when a
# dependency actually changes, so ordinary source edits skip a full reinstall.
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY server/package.json ./server/
COPY client/package.json ./client/

# `npm ci` installs exactly the lockfile. @node-rs/argon2 resolves a prebuilt
# linux-musl binary here, so no build toolchain is needed in the image.
RUN npm ci --workspace @savoney/server --workspace @savoney/shared --include-workspace-root

# ---------- build ----------
FROM deps AS build
WORKDIR /app
COPY shared ./shared
COPY server ./server
RUN npm run build --workspace @savoney/shared \
 && npm run build --workspace @savoney/server

# ---------- production dependencies ----------
FROM deps AS prod-deps
WORKDIR /app
# Drop devDependencies from the tree that ships.
RUN npm prune --omit=dev --workspace @savoney/server --workspace @savoney/shared --include-workspace-root

# ---------- runtime ----------
FROM node:22-alpine AS runtime
WORKDIR /app

# tini reaps zombies and forwards signals, so SIGTERM actually reaches Node and
# the graceful-shutdown path in server.ts runs on `docker stop`.
RUN apk add --no-cache tini

ENV NODE_ENV=production
ENV PORT=4000

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/server/node_modules ./server/node_modules
COPY --from=build /app/shared/dist ./shared/dist
COPY --from=build /app/shared/package.json ./shared/package.json
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/package.json ./server/package.json
COPY package.json ./

# Never run as root: a container escape should not land on uid 0.
USER node

EXPOSE 4000

# Readiness reflects database connectivity, so an orchestrator stops routing to
# an instance that cannot serve rather than restarting a healthy process.
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server/dist/server.js"]
