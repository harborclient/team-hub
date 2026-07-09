# Deploy

Team Hub ships as an all-in-one Docker image: **Nginx** (public entrypoint), the **Team Hub API**, **Postgres** (default database), and **Redis** (authentication throttling). The image listens on `$PORT` (default `8080`), which works on managed platforms that inject a port at runtime and on a plain VPS where you map host port `8080` to the container.

For local development without the full image, you can still run Postgres and Redis via [`docker compose up -d`](../docker-compose.yml) and start Team Hub on the host — see [Setup](./setup.md).

## Hosting options

Pick a hosting guide for your environment:

- [Google Cloud Run](#google-cloud-run) — serverless deploy with managed Postgres and Redis for production
- [VPS](#vps) — self-hosted Linux server with persistent Docker volumes (OVH and other providers)

More hosting guides may be added over time.

## What is in the container

| Process  | Default bind     | Purpose                       |
| -------- | ---------------- | ----------------------------- |
| Nginx    | `$PORT` (`8080`) | Reverse proxy to Team Hub     |
| Team Hub | `127.0.0.1:8787` | Fastify API                   |
| Postgres | `127.0.0.1:5432` | Database (bundled by default) |
| Redis    | `127.0.0.1:6379` | Auth throttling store         |

On startup the entrypoint:

1. Initializes bundled Postgres on first boot (creates the `harbor` user and database).
2. Renders `/etc/team-hub/server.yaml` from environment variables on first boot (skips if the file already exists).
3. Runs `team-hub migrate`, then `team-hub start`.
4. Starts Nginx on `$PORT`.

Health checks should use `GET /health` (proxied through Nginx).

### Bundled vs managed services

The default image starts Postgres and Redis inside the container. That is convenient for demos, smoke tests, and self-hosted Docker with a persistent volume.

For production, you can either mount a volume for bundled Postgres (typical on a [VPS](#vps)) or disable bundled services and point Team Hub at external Postgres and Redis (required on [Google Cloud Run](#google-cloud-run), where container storage is ephemeral).

## Local smoke test

Run the image locally before deploying to any host:

```bash
docker build -t team-hub:local .

docker run --rm -p 8080:8080 \
  -e TEAM_HUB_DB_PASSWORD=harbor \
  team-hub:local
```

In another terminal:

```bash
curl -s http://127.0.0.1:8080/health
```

Expect JSON like `{"status":"ok","version":"..."}`.

Note: each fresh container gets a new Postgres data directory unless you mount a volume:

```bash
docker run --rm -p 8080:8080 \
  -v team-hub-pgdata:/var/lib/postgresql/data \
  team-hub:local
```

After the container is running, use the CLI to create an admin user — see [Using the CLI in the container](#using-the-cli-in-the-container).

## Documentation index

The Docker image bundles HarborClient documentation for hub-native `search_docs`. During `docker build`, the Dockerfile downloads `docsSearchIndex.json` from the harborclient repository (override with build arg `DOCS_INDEX_URL`) and copies it to `/app/data/docsSearchIndex.json`.

When harborclient updates the index on `main`, CI dispatches `docs-index-updated` to this repository so operators can rebuild and redeploy the hub image with fresh docs. Configure `HUB_DEPLOY_PAT` in the harborclient repository and ensure this repository's deploy workflow listens for that event.

For self-hosted deployments without rebuilding the image, mount an updated index file and point `docs.searchIndexPath` in `server.yaml` at the mount path.

## Google Cloud Run

Deploy Team Hub to [Google Cloud Run](https://cloud.google.com/run) when you want a managed, scale-to-zero HTTP service. Cloud Run container storage is **ephemeral** — bundled Postgres data is lost when the revision is redeployed or the instance is recycled. Use bundled services only for evaluation; for production, disable them and use **Cloud SQL** (Postgres) and **Memorystore** (Redis).

### Prerequisites

- Docker installed locally
- A GCP project with billing enabled
- [`gcloud`](https://cloud.google.com/sdk/docs/install) CLI authenticated to your project
- An Artifact Registry repository (or legacy Container Registry)

Enable required APIs:

```bash
gcloud services enable run.googleapis.com artifactregistry.googleapis.com
```

Create an Artifact Registry repo (once per project/region):

```bash
gcloud artifacts repositories create team-hub \
  --repository-format=docker \
  --location=REGION
```

### Build and push the image

From the repository root:

```bash
export PROJECT_ID=your-gcp-project
export REGION=us-central1
export IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/team-hub/team-hub:latest"

docker build -t "${IMAGE}" .
docker push "${IMAGE}"
```

Configure Docker to authenticate with Artifact Registry if needed:

```bash
gcloud auth configure-docker "${REGION}-docker.pkg.dev"
```

### Quick start (evaluation)

Deploy with bundled Postgres and Redis for a quick trial. **Do not rely on this for production data** — use managed services instead.

```bash
gcloud run deploy team-hub \
  --image "${IMAGE}" \
  --region "${REGION}" \
  --port 8080 \
  --memory 2Gi \
  --cpu 2 \
  --min-instances 1 \
  --allow-unauthenticated
```

- `--min-instances 1` keeps one warm instance so bundled Postgres is less likely to restart mid-session. Data is still not durable across redeploys.
- Omit `--allow-unauthenticated` if the service should require authentication at the Cloud Run / IAP layer.

After deploy, open the service URL and verify health:

```bash
curl -s "$(gcloud run services describe team-hub --region "${REGION}" --format='value(status.url)')/health"
```

### Production

For production, point Team Hub at managed Postgres and Redis and disable the bundled processes.

#### Environment variables

| Variable                  | Production value              | Notes                  |
| ------------------------- | ----------------------------- | ---------------------- |
| `TEAM_HUB_START_POSTGRES` | `false`                       | Use Cloud SQL          |
| `TEAM_HUB_START_REDIS`    | `false`                       | Use Memorystore        |
| `TEAM_HUB_DB_HOST`        | Cloud SQL host or socket path | See Cloud SQL section  |
| `TEAM_HUB_DB_PORT`        | `5432`                        |                        |
| `TEAM_HUB_DB_USER`        | your DB user                  |                        |
| `TEAM_HUB_DB_PASSWORD`    | from Secret Manager           |                        |
| `TEAM_HUB_DB_DATABASE`    | your database name            |                        |
| `TEAM_HUB_REDIS_HOST`     | Memorystore IP                | Requires VPC connector |
| `TEAM_HUB_REDIS_PORT`     | `6379`                        |                        |

Store secrets in [Secret Manager](https://cloud.google.com/secret-manager) and mount them on the Cloud Run service rather than passing passwords on the command line.

Example deploy with external services (adjust hostnames and secret references):

```bash
gcloud run deploy team-hub \
  --image "${IMAGE}" \
  --region "${REGION}" \
  --port 8080 \
  --memory 1Gi \
  --cpu 1 \
  --min-instances 1 \
  --set-env-vars "TEAM_HUB_START_POSTGRES=false,TEAM_HUB_START_REDIS=false,TEAM_HUB_DB_HOST=/cloudsql/PROJECT:REGION:INSTANCE,TEAM_HUB_DB_USER=teamhub,TEAM_HUB_DB_DATABASE=teamhub,TEAM_HUB_REDIS_HOST=10.0.0.5" \
  --set-secrets "TEAM_HUB_DB_PASSWORD=teamhub-db-password:latest" \
  --add-cloudsql-instances "PROJECT:REGION:INSTANCE" \
  --vpc-connector "projects/PROJECT/locations/REGION/connectors/CONNECTOR"
```

#### Cloud SQL (Postgres)

1. Create a Cloud SQL Postgres instance.
2. Create a database and user for Team Hub.
3. Attach the instance to Cloud Run with `--add-cloudsql-instances`.
4. Set `TEAM_HUB_DB_HOST` to the Unix socket path `/cloudsql/PROJECT:REGION:INSTANCE` (Cloud Run mounts this automatically when the instance is attached).

Run migrations before serving traffic. Options:

- Deploy once with a [Cloud Run Job](https://cloud.google.com/run/docs/create-jobs) that runs `node dist/cli.js -c /etc/team-hub/server.yaml migrate` with the same env and Cloud SQL attachment.
- Run migrate from a one-off `docker run` on a machine that can reach the database.

#### Memorystore (Redis)

Team Hub requires Redis for [authentication throttling](./auth.md). Protected routes return **503** when Redis is unreachable.

1. Create a Memorystore for Redis instance in the same VPC region.
2. Configure a [Serverless VPC Access connector](https://cloud.google.com/vpc/docs/configure-serverless-vpc-access).
3. Attach the connector to the Cloud Run service and set `TEAM_HUB_REDIS_HOST` to the instance IP.

#### Firestore (alternative database)

To use Firestore instead of Postgres, set `TEAM_HUB_DB_DRIVER=firestore` and mount a service account key (or use workload identity). You still need Redis. See `server.yaml.example` at the repository root for the Firestore config shape; map fields to env vars or mount a custom `server.yaml` at `/etc/team-hub/server.yaml` via a volume (advanced).

#### LLM provider keys

Optional LLM proxy settings are not generated from env vars in the default template. For hub-proxied LLM access, mount a config file with an `llm` section or extend deployment tooling. See [LLM](./llm.md) and `server.yaml.example` at the repository root.

### Admin commands

On Cloud Run there is no long-lived shell to `exec` into. Run admin commands with a [Cloud Run Job](https://cloud.google.com/run/docs/create-jobs) or a one-off task using the same image, environment variables, and secrets as the service — for example `node /app/dist/cli.js -c /etc/team-hub/server.yaml migrate` or `user create`.

### Cloud Run troubleshooting

#### Container exits during startup

Check Cloud Run logs. Common causes:

- **Insufficient memory** — bundled Postgres + Redis + Node need at least **2 GiB** for evaluation deploys.
- **Postgres init failure** — without a volume, first boot should still succeed but data is ephemeral.

#### Migration errors

- Ensure the database user can create tables.
- For Cloud SQL, confirm the Cloud SQL Auth proxy / Unix socket attachment is configured.

#### Stale data after redeploy

Expected when using bundled Postgres. Switch to Cloud SQL for durable storage.

## VPS

Run Team Hub on a plain Linux VPS when you want a simple, always-on server with persistent storage. The bundled Postgres and Redis processes are a good fit on a VPS **when you mount a Docker volume** for `/var/lib/postgresql/data` — unlike Cloud Run, data survives container restarts and image updates.

The steps below use a generic Debian or Ubuntu VPS. [OVHcloud](https://www.ovhcloud.com/) is a common choice; their [Docker install guide](https://docs.ovhcloud.com/en/guides/bare-metal-cloud/virtual-private-servers/install-docker-on-vps) matches the checklist here.

### Overview

On a VPS you typically:

1. Install Docker on the host.
2. Build the Team Hub image on the server (or copy a pre-built image).
3. Run the container with a named volume, restart policy, and a strong database password.
4. Open the HTTP port in the host firewall.
5. Create an admin user via `docker exec`.

This guide covers HTTP on port `8080` only. Add a reverse proxy and TLS on the host in a follow-up if you need HTTPS.

### Prerequisites

- A VPS with at least **2 GiB RAM** (bundled Postgres, Redis, and Node need headroom)
- SSH access with a user that has `sudo` privileges
- Debian 11/12 or Ubuntu 22.04 and later

### Install Docker

Follow your provider's guide or the [OVHcloud: Install Docker and Docker Compose on a VPS](https://docs.ovhcloud.com/en/guides/bare-metal-cloud/virtual-private-servers/install-docker-on-vps) tutorial. These instructions are for Ubuntu 22.04.

Summary:

1. Update the system: `sudo apt update && sudo apt upgrade -y`
2. Install dependencies: `sudo apt install -y ca-certificates curl gnupg`
3. Add Docker's official GPG key and apt repository (Debian or Ubuntu variant from the guide).

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y ca-certificates curl gnupg

sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  -o /etc/apt/keyrings/docker.asc

sudo chmod a+r /etc/apt/keyrings/docker.asc

sudo tee /etc/apt/sources.list.d/docker.sources > /dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF

sudo apt update
```

4. Install Docker Engine and the Compose plugin:

```bash
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

5. Add your user to the `docker` group so you can run Docker without `sudo`:

```bash
sudo usermod -aG docker $USER
newgrp docker
```

Avoid running routine Docker commands with `sudo` — root-owned files in volumes can cause permission errors later.

Verify:

```bash
docker --version
docker compose version
sudo docker run hello-world
```

### Build the image

There is no published container registry image yet — build from source on the VPS (or build locally and transfer the image with `docker save` / `docker load`).

On the VPS:

```bash
git clone https://github.com/harborclient/team-hub.git
cd team-hub
docker build -t team-hub:latest .
```

### Run Team Hub

Start the container in the background with a persistent volume and restart policy:

```bash
docker run -d \
  --name team-hub \
  --restart unless-stopped \
  -p 80:8080 \
  -v team-hub-pgdata:/var/lib/postgresql/data \
  -e TEAM_HUB_DB_PASSWORD='6l9gN8CUeRySg5fssEra9E' \
  team-hub:latest
```

- `--restart unless-stopped` brings the container back after a host reboot.
- The named volume keeps Postgres data across container recreates. See [Local smoke test](#local-smoke-test) for how volumes work.
- Set `TEAM_HUB_DB_PASSWORD` to a strong secret before exposing the service publicly.

Check logs during first boot (migrations and Postgres init can take 30–60 seconds):

```bash
docker logs -f team-hub
```

### Verify and create users

Confirm health from the VPS or your workstation (replace `VPS_IP`):

```bash
curl -s http://VPS_IP/health
```

Expect JSON like `{"status":"ok","version":"..."}`.

Team Hub has no default users — create an admin account first, then add `user`-role accounts for HarborClient desktop clients.

#### Create an admin

Create the first admin account for operator tasks (management API, further user administration). Replace `ops` with the display name you want.

The command creates the user, issues an initial API bearer token, and prints the one-time `hbk_…` secret. **Copy the token immediately**; it will not be shown again.

```bash
docker exec -it team-hub \
  node /app/dist/cli.js -c /etc/team-hub/server.yaml user create --name ops --role admin
```

Example output:

```text
Created user "ops" (<user-id>) with role admin.
...
Store this token now; it will not be shown again:
hbk_...
```

#### Create a user

Create a `user`-role account for a HarborClient desktop client. Replace `alice` with the team member's display name. Use `--collection-access` and `--environment-access` to scope what they can sync; `*` grants all resources of that type.

```bash
docker exec -it team-hub \
  node /app/dist/cli.js -c /etc/team-hub/server.yaml user create --name alice --role user \
  --collection-access '*' --environment-access '*'
```

The command prints a one-time `hbk_…` bearer token — give it to the team member for their HarborClient team hub connection. Store it immediately; it will not be shown again.

Confirm accounts exist:

```bash
docker exec -it team-hub \
  node /app/dist/cli.js -c /etc/team-hub/server.yaml user list
```

Connect HarborClient to your Team Hub URL (for the example above, `http://VPS_IP` on port `80`). See [Create an admin user](#create-an-admin-user), [Authentication](./auth.md), and [CLI — user create](./cli.md#user-create) for access scoping, additional tokens, and other admin tasks.

### Persistence and backups

The `team-hub-pgdata` volume survives `docker stop`, `docker rm`, and image rebuilds as long as you reuse the same volume name in `docker run`.

For disaster recovery:

- Enable provider snapshots if available (for example OVH VPS snapshots).
- Periodically back up the volume data or use `pg_dump` from inside the container.

### Firewall

Allow inbound HTTP to the mapped port. On Ubuntu with UFW (for the example above, host port `80`):

```bash
sudo ufw allow 80/tcp
sudo ufw enable
sudo ufw status
```

If your provider has a network firewall in their control panel (OVH included), open the same port there. Clients reach Team Hub at `http://VPS_IP` until you add TLS.

### Updates

To deploy a new version while keeping data:

```bash
cd team-hub
git pull
docker build -t team-hub:latest .
docker stop team-hub
docker rm team-hub
docker run -d \
  --name team-hub \
  --restart unless-stopped \
  -p 80:8080 \
  -v team-hub-pgdata:/var/lib/postgresql/data \
  -e TEAM_HUB_DB_PASSWORD='choose-a-strong-password' \
  team-hub:latest
```

The entrypoint runs migrations on each start, so schema updates apply automatically.

### Edit configuration

The running config file is `/etc/team-hub/server.yaml` inside the container. On **first boot** (when the file is missing or empty), the entrypoint generates it from environment variables. After that, edits inside the container are kept across `docker restart`. To reset the file from env vars, set `TEAM_HUB_FORCE_CONFIG_GENERATE=true` on the next start.

Open the file with `nano` (included in the image):

```bash
docker exec -it team-hub nano /etc/team-hub/server.yaml
```

In `nano`: edit the YAML, then press `Ctrl+O` to save, `Enter` to confirm, and `Ctrl+X` to exit.

See [Configuration](./configuration.md) and [`server.yaml.example`](https://github.com/harborclient/team-hub/blob/main/server.yaml.example) for valid sections and keys. Common VPS edits include adding an `llm:` block or changing `logging.level`.

Apply changes without recreating the container:

- **`db`**, **`redis`**, **`llm`**, **`plugins`** — reload while Team Hub is running (replace `hbk_…` with an admin token):

  ```bash
  docker exec team-hub curl -s -X POST http://127.0.0.1:8787/admin/config/reload \
    -H "Authorization: Bearer hbk_your_admin_token_here"
  ```

- **`logging`** or **`server.host` / `server.port`** — restart the Team Hub process:

  ```bash
  docker exec team-hub /docker/restart-team-hub.sh
  ```

See [Reload config without restarting](#reload-config-without-restarting) for the full reload behavior and response shape.

**Persist config across container recreation:** bind-mount a host file so edits survive `docker rm` and image rebuilds:

```bash
docker run -d \
  --name team-hub \
  --restart unless-stopped \
  -p 80:8080 \
  -v team-hub-pgdata:/var/lib/postgresql/data \
  -v /path/on/host/server.yaml:/etc/team-hub/server.yaml \
  -e TEAM_HUB_DB_PASSWORD='choose-a-strong-password' \
  team-hub:latest
```

Copy `server.yaml.example` to the host path and adjust it before the first run. The entrypoint skips template generation when the mounted file already exists.

For settings covered by `TEAM_HUB_*` env vars (`db`, `redis`, logging defaults), you can also pass those in `docker run` instead of editing YAML. Set `TEAM_HUB_FORCE_CONFIG_GENERATE=true` once if you need to regenerate the file from env vars.

### VPS troubleshooting

#### Connection refused from outside the VPS

- Confirm the container is running: `docker ps`
- Check UFW and the provider network firewall allow port `8080`.
- Verify Nginx is listening: `curl -s http://127.0.0.1:8080/health` on the VPS itself.

#### Container exits during startup

Check `docker logs team-hub`. Bundled Postgres + Redis + Node need at least **2 GiB** RAM.

#### Postgres init or permission errors

Ensure `PGDATA` (`/var/lib/postgresql/data`) is on a writable volume. If you previously ran Docker with `sudo`, fix volume ownership or recreate the volume.

## Using the CLI in the container

Administration commands (`user`, `migrate`, `collection`, and so on) run through the same CLI as a host install. In the Docker image, a few details differ from [Setup](./setup.md).

### Where the config file lives

At startup the entrypoint **generates** the config at `/etc/team-hub/server.yaml`. There is no `server.yaml` in `/app` (the app working directory). The running server is started with that path explicitly.

The CLI does **not** read the `TEAM_HUB_CONFIG` environment variable. You must pass the config path with `-c` / `--config`, or the CLI looks for `server.yaml` in the current directory and fails with “config file not found”.

Verify the generated config inside a running container:

```bash
docker exec CONTAINER cat /etc/team-hub/server.yaml
```

### How to invoke the CLI

The `team-hub` binary is not on `PATH` in the image. From your host, run the built CLI inside the container with `docker exec` (replace `CONTAINER` with the container name or id from `docker ps`):

```bash
docker exec -it CONTAINER \
  node /app/dist/cli.js -c /etc/team-hub/server.yaml <subcommand> [options]
```

Example:

```bash
docker exec -it team-hub \
  node /app/dist/cli.js -c /etc/team-hub/server.yaml user list
```

Omit `-it` for non-interactive one-shot commands (scripts, CI).

If you open a shell inside the container (`docker exec -it CONTAINER bash`), run the same Node command directly:

```bash
node /app/dist/cli.js -c /etc/team-hub/server.yaml <subcommand> [options]
```

Or change to `/app` and use a relative path:

```bash
cd /app
node dist/cli.js -c /etc/team-hub/server.yaml user list
```

Optional alias for an interactive session:

```bash
alias team-hub='node /app/dist/cli.js -c /etc/team-hub/server.yaml'
team-hub user list
```

**Put global flags before the subcommand.** `-c` is a root-level option, not a subcommand option:

```bash
# Correct
docker exec -it CONTAINER \
  node /app/dist/cli.js -c /etc/team-hub/server.yaml user list

# Wrong — "unknown option '-c'"
docker exec -it CONTAINER \
  node /app/dist/cli.js user list -c /etc/team-hub/server.yaml
```

See [CLI](./cli.md) for all subcommands and options.

### Reload config without restarting

Team Hub can reload `server.yaml` while the `start` process is running. Reloadable sections are applied on a **best-effort** basis: each section is evaluated independently, and failures in one section do not roll back changes already applied to other sections.

| Section                       | Live reload? | Notes                                                         |
| ----------------------------- | ------------ | ------------------------------------------------------------- |
| `db`                          | Yes          | Reconnects when the raw `db` mapping changes                  |
| `redis`                       | Yes          | Reconnects when the raw `redis` mapping changes               |
| `llm`                         | Yes          | Applied immediately                                           |
| `plugins`                     | Yes          | Applied immediately                                           |
| `logging`                     | No           | Applied at process startup; restart after changes             |
| `server.host` / `server.port` | No           | Reported as `restart-required`; restart the process to rebind |

**Triggers:**

```bash
# Signal the running start process (inside the container or on the host)
kill -HUP "$(pgrep -f 'dist/cli.js.* start')"

# Admin API (requires an admin-role bearer token)
curl -s -X POST http://127.0.0.1:8788/admin/config/reload \
  -H "Authorization: Bearer hbk_your_admin_token_here"
```

Both triggers re-read the same config path passed to `team-hub -c … start`. When the file is missing or invalid YAML, nothing is changed and the reload returns a fatal error.

Example reload response:

```json
{
  "sections": [
    { "section": "db", "status": "unchanged" },
    { "section": "redis", "status": "unchanged" },
    { "section": "llm", "status": "reloaded" },
    { "section": "plugins", "status": "reloaded" },
    { "section": "server", "status": "unchanged" }
  ]
}
```

Possible `status` values per section: `reloaded`, `unchanged`, `failed`, `restart-required`. When the config file itself cannot be loaded, the response includes `fatalError` and an empty `sections` array.

### Restart the server after config changes

Use a full process restart when you change `server.host` or `server.port`, or when you prefer a clean boot after large infrastructure changes.

| Scenario                                               | Action                                                                                     |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Edited `/etc/team-hub/server.yaml` (e.g. added `llm:`) | Prefer `kill -HUP …` or `POST /admin/config/reload`; restart only if bind settings changed |
| Changed Docker env vars (`TEAM_HUB_DB_*`, etc.)        | `docker restart CONTAINER` from the host — entrypoint **regenerates** yaml from env        |
| Full stack restart (Postgres, Redis, Nginx, Team Hub)  | `docker restart CONTAINER`                                                                 |

The image includes a restart helper (no `pkill` required — the slim image does not ship `procps`):

```bash
# Inside the container
/docker/restart-team-hub.sh
# or:
restart-team-hub

# From your host
docker exec CONTAINER /docker/restart-team-hub.sh
```

The script sends `SIGTERM` to the running Team Hub `start` process. Supervisord respawns it, runs `migrate`, then `start` with the current config. Nginx, Postgres, and Redis are **not** restarted.

Verify after restart:

```bash
curl -s http://127.0.0.1:8080/health
```

### Create an admin user

After the container is healthy (`GET /health` returns `{"status":"ok",...}`), create the first admin account:

```bash
docker exec -it CONTAINER \
  node /app/dist/cli.js -c /etc/team-hub/server.yaml user create --name ops --role admin
```

List users to confirm and copy the user id:

```bash
docker exec -it CONTAINER \
  node /app/dist/cli.js -c /etc/team-hub/server.yaml user list
```

Create an API token for HarborClient (replace `USER_ID` with the id from `user list`):

```bash
docker exec -it CONTAINER \
  node /app/dist/cli.js -c /etc/team-hub/server.yaml user token create USER_ID --name desktop
```

See [Authentication](./auth.md) for token usage and [CLI — Examples](./cli.md#examples) for other admin tasks.

## Post-deploy administration

Most day-two tasks use the CLI patterns above: always pass `-c /etc/team-hub/server.yaml` before the subcommand, and invoke `node /app/dist/cli.js` from `/app`. After editing config, [restart Team Hub](#restart-the-server-after-config-changes) before expecting new settings to apply. Common follow-ups after creating a user:

- `user token create` — issue bearer tokens for HarborClient
- `user token list` / `user token revoke` — manage tokens
- `collection list` — inspect synced collections

See [CLI](./cli.md) and [Authentication](./auth.md) for full reference.

## Health checks

Nginx listens on `$PORT` and proxies to Team Hub's `GET /health` endpoint.

Use `/health` for manual checks and uptime monitoring. The response includes `status: "ok"` and the application version.

## Environment variable reference

| Variable                         | Default                          | Description                                                                |
| -------------------------------- | -------------------------------- | -------------------------------------------------------------------------- |
| `PORT`                           | `8080`                           | Nginx listen port (some platforms inject this at runtime)                  |
| `NGINX_SERVER_NAME`              | `_`                              | Nginx `server_name` (catch-all `_`; set to your hostname for named vhosts) |
| `TEAM_HUB_PORT`                  | `8787`                           | Internal Team Hub port                                                     |
| `TEAM_HUB_HOST`                  | `127.0.0.1`                      | Team Hub bind address                                                      |
| `TEAM_HUB_CONFIG`                | `/etc/team-hub/server.yaml`      | Config file path (generated on first boot if missing)                      |
| `TEAM_HUB_FORCE_CONFIG_GENERATE` | `false`                          | When `true`, overwrite an existing config from env vars                    |
| `TEAM_HUB_START_POSTGRES`        | `true`                           | Start bundled Postgres                                                     |
| `TEAM_HUB_START_REDIS`           | `true`                           | Start bundled Redis                                                        |
| `TEAM_HUB_DB_DRIVER`             | `postgres`                       | `postgres`, `mysql`, or `firestore`                                        |
| `TEAM_HUB_DB_HOST`               | `127.0.0.1`                      | Database host                                                              |
| `TEAM_HUB_DB_PORT`               | `5432`                           | Database port                                                              |
| `TEAM_HUB_DB_USER`               | `harbor`                         | Database user                                                              |
| `TEAM_HUB_DB_PASSWORD`           | `harbor`                         | Database password                                                          |
| `TEAM_HUB_DB_DATABASE`           | `harbor`                         | Database name                                                              |
| `TEAM_HUB_REDIS_HOST`            | `127.0.0.1`                      | Redis host                                                                 |
| `TEAM_HUB_REDIS_PORT`            | `6379`                           | Redis port                                                                 |
| `TEAM_HUB_LOGGING_LEVEL`         | `info`                           | Log level (`debug`, `info`, `warn`, `error`)                               |
| `TEAM_HUB_LOGGING_FILE`          | `/var/log/team-hub/team-hub.log` | Log file path                                                              |
| `TEAM_HUB_LOGGING_CONSOLE`       | `true`                           | Write logs to the terminal                                                 |

Logging env vars are applied at process startup. Restart the container after changing them.

## Troubleshooting

Platform-specific issues are covered under [Cloud Run troubleshooting](#cloud-run-troubleshooting) and [VPS troubleshooting](#vps-troubleshooting).

### Container exits during startup

Check `docker logs CONTAINER` or your platform's log viewer. Common causes:

- **Insufficient memory** — bundled Postgres + Redis + Node need at least **2 GiB**.
- **Postgres init failure** — ensure `PGDATA` (`/var/lib/postgresql/data`) is writable.

### `GET /health` fails or connection refused

- Confirm the service listens on `$PORT` (8080).
- Wait for startup: migrations and Postgres init can take 30–60 seconds on cold start.

### Protected API routes return 503

Redis is required for auth throttling. Verify Redis is running (bundled) or reachable (external Redis). See [Authentication](./auth.md).

### Config file not found

The CLI defaults to `server.yaml` in the current directory. In the container the generated config is at `/etc/team-hub/server.yaml`. Pass it explicitly **before** the subcommand:

```bash
node /app/dist/cli.js -c /etc/team-hub/server.yaml user list
```

If `/etc/team-hub/server.yaml` itself is missing, the container likely failed during startup — check `docker logs CONTAINER`.

### Migration errors

- Ensure the database user can create tables.
- Run `team-hub migrate` manually with the same config the server uses.

## Related docs

- [Setup](./setup.md) — install and run on the host
- [Authentication](./auth.md) — bearer tokens and Redis throttling
- [CLI](./cli.md) — users, tokens, collections
- `server.yaml.example` at the repository root — example config file
- [Configuration](./configuration.md) — full `server.yaml` reference
