# syntax=docker/dockerfile:1

FROM node:24-bookworm-slim AS builder

WORKDIR /app

RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json tsup.config.ts ./
COPY src ./src

RUN pnpm build
RUN pnpm prune --prod

ARG DOCS_INDEX_URL=https://raw.githubusercontent.com/harborclient/harborclient/main/resources/docsSearchIndex.json
RUN mkdir -p /app/data \
  && curl -fsSL -o /app/data/docsSearchIndex.json "${DOCS_INDEX_URL}"

FROM node:24-bookworm-slim AS runtime

WORKDIR /app

RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    gettext-base \
    nano \
    nginx \
    postgresql \
    postgresql-contrib \
    redis-server \
    supervisor \
  && rm -rf /var/lib/apt/lists/* \
  && rm -f /etc/nginx/sites-enabled/default

ENV PORT=8080 \
  NGINX_SERVER_NAME=_ \
  TEAM_HUB_PORT=8787 \
  TEAM_HUB_HOST=127.0.0.1 \
  TEAM_HUB_CONFIG=/etc/team-hub/server.yaml \
  TEAM_HUB_START_POSTGRES=true \
  TEAM_HUB_START_REDIS=true \
  TEAM_HUB_DB_DRIVER=postgres \
  TEAM_HUB_DB_HOST=127.0.0.1 \
  TEAM_HUB_DB_PORT=5432 \
  TEAM_HUB_DB_USER=harbor \
  TEAM_HUB_DB_PASSWORD=harbor \
  TEAM_HUB_DB_DATABASE=harbor \
  TEAM_HUB_REDIS_HOST=127.0.0.1 \
  TEAM_HUB_REDIS_PORT=6379 \
  TEAM_HUB_LOGGING_LEVEL=info \
  TEAM_HUB_LOGGING_FILE=/var/log/team-hub/team-hub.log \
  TEAM_HUB_LOGGING_CONSOLE=true \
  PGDATA=/var/lib/postgresql/data

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/data/docsSearchIndex.json /app/data/docsSearchIndex.json

COPY docker/entrypoint.sh /docker/entrypoint.sh
COPY docker/start-team-hub.sh /docker/start-team-hub.sh
COPY docker/restart-team-hub.sh /docker/restart-team-hub.sh
COPY docker/server.yaml.template /docker/server.yaml.template
COPY docker/nginx.conf.template /docker/nginx.conf.template

RUN chmod +x /docker/entrypoint.sh /docker/start-team-hub.sh /docker/restart-team-hub.sh \
  && ln -sf /docker/restart-team-hub.sh /usr/local/bin/restart-team-hub \
  && mkdir -p /etc/team-hub /var/lib/postgresql/data /var/log/team-hub /var/run/team-hub /app/data \
  && chown -R postgres:postgres /var/lib/postgresql/data

EXPOSE 8080

ENTRYPOINT ["/docker/entrypoint.sh"]
