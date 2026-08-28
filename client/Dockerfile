# syntax=docker/dockerfile:1
#
# Build context is the REPOSITORY ROOT (the client depends on @savoney/shared):
#   docker build -f client/Dockerfile .

FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY client/package.json ./client/
COPY server/package.json ./server/
RUN npm ci --workspace @savoney/client --workspace @savoney/shared --include-workspace-root

COPY shared ./shared
COPY client ./client
RUN npm run build --workspace @savoney/shared \
 && npm run build --workspace @savoney/client

# ---------- runtime ----------
FROM nginx:1.29-alpine AS runtime

COPY client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/client/dist /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
