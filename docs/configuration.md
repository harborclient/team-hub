# Configuration

Team Hub reads a YAML file named `server.yaml` (by default in the current working directory). Override the path with `-c` / `--config` on any CLI subcommand. See [CLI — Global options](./cli.md#global-options).

Copy the example file to get started:

```bash
cp server.yaml.example server.yaml
```

The canonical example at the repository root is [`server.yaml.example`](https://github.com/harborclient/team-hub/blob/main/server.yaml.example).

## Sections overview

| Section   | Required | Live reload | Notes                                                 |
| --------- | -------- | ----------- | ----------------------------------------------------- |
| `server`  | Yes      | No          | Changes to `host` or `port` require a process restart |
| `db`      | Yes      | Yes         | Reconnects when the raw `db` mapping changes          |
| `redis`   | Yes      | Yes         | Reconnects when the raw `redis` mapping changes       |
| `logging` | No       | No          | Applied at process startup; restart after changes     |
| `llm`     | No       | Yes         | Omit to disable hub-proxied LLM routes                |
| `plugins` | No       | Yes         | Omit to return empty plugin source lists              |
| `docs`    | No       | Yes         | Optional path to the documentation search index       |

Reload triggers while `team-hub start` is running:

- `SIGHUP` to the start process
- `POST /admin/config/reload` (admin bearer token required)

See [Deploy — Reload config without restarting](./deploy.md#reload-config-without-restarting) for details and response shape.

## server

HTTP listen settings for the Team Hub API.

| Key    | Type                      | Required | Default | Description                                |
| ------ | ------------------------- | -------- | ------- | ------------------------------------------ |
| `port` | integer or numeric string | Yes      | —       | TCP port (1–65535)                         |
| `host` | string                    | Yes      | —       | Bind address (e.g. `127.0.0.1`, `0.0.0.0`) |

```yaml
server:
  port: 8787
  host: 127.0.0.1
```

## db

Database backend. Set `driver` to `postgres`, `mysql`, or `firestore`. Driver-specific fields are validated when the server connects.

### Postgres

| Key        | Type                      | Required | Description                       |
| ---------- | ------------------------- | -------- | --------------------------------- |
| `driver`   | `postgres`                | Yes      | Database driver                   |
| `host`     | string                    | Yes      | Database host or Unix socket path |
| `port`     | integer or numeric string | Yes      | Database port (1–65535)           |
| `user`     | string                    | Yes      | Database user                     |
| `password` | string                    | Yes      | Database password (may be empty)  |
| `database` | string                    | Yes      | Database name                     |

```yaml
db:
  driver: postgres
  host: 127.0.0.1
  port: 5432
  user: harbor
  password: harbor
  database: harbor
```

### MySQL

Same fields as Postgres; use `driver: mysql` and the appropriate port (typically `3306`).

```yaml
db:
  driver: mysql
  host: 127.0.0.1
  port: 3306
  user: harbor
  password: harbor
  database: harbor
```

### Firestore

| Key           | Type        | Required | Description                             |
| ------------- | ----------- | -------- | --------------------------------------- |
| `driver`      | `firestore` | Yes      | Database driver                         |
| `projectId`   | string      | Yes      | GCP project id                          |
| `keyFilename` | string      | No       | Path to a service account JSON key file |

```yaml
db:
  driver: firestore
  projectId: my-gcp-project
  keyFilename: /path/to/service-account.json
```

When `keyFilename` is omitted, Firestore uses Application Default Credentials (workload identity, `GOOGLE_APPLICATION_CREDENTIALS`, etc.).

## redis

Redis is required for authentication throttling. Protected routes return **503** when Redis is unreachable. See [Authentication](./auth.md).

| Key             | Type                             | Required | Default | Description                         |
| --------------- | -------------------------------- | -------- | ------- | ----------------------------------- |
| `host`          | string                           | Yes      | —       | Redis host                          |
| `port`          | integer or numeric string        | Yes      | —       | Redis port (1–65535)                |
| `password`      | string                           | No       | —       | Redis AUTH password                 |
| `db`            | integer (0–15) or numeric string | No       | `0`     | Redis logical database index        |
| `keyPrefix`     | string                           | No       | —       | Prefix for throttle keys            |
| `maxFailures`   | integer or numeric string        | No       | `10`    | Failed auth attempts before block   |
| `windowSeconds` | integer or numeric string        | No       | `900`   | Sliding window for failure counting |
| `blockSeconds`  | integer or numeric string        | No       | `900`   | Block duration after threshold      |

```yaml
redis:
  host: 127.0.0.1
  port: 6380
  password: redis-secret
  keyPrefix: team-hub:
  maxFailures: 10
  windowSeconds: 900
  blockSeconds: 900
```

## logging

Optional request and error logging via [Winston](https://github.com/winstonjs/winston). Applied when the process starts; restart `team-hub start` after changes.

| Key       | Type                                | Required | Default | Description                                |
| --------- | ----------------------------------- | -------- | ------- | ------------------------------------------ |
| `level`   | `debug`, `info`, `warn`, or `error` | No       | `info`  | Minimum severity written to transports     |
| `file`    | string                              | No       | —       | Log file path; omit to disable file output |
| `console` | boolean                             | No       | `true`  | When true, also write logs to the terminal |

Every HTTP request is logged at **debug** level (method, URL, IP, request id). Unhandled request errors are logged at **error** level. Set `level: debug` to see request logs; use `info` or higher to suppress them while still logging errors.

```yaml
logging:
  level: debug
  file: /var/log/team-hub.log
  console: true
```

## llm

Optional hub-proxied LLM access. Omit this section to disable LLM routes. At least one provider `apiKey` is required when the section is present. User access and monthly token limits are configured via the CLI — see [LLM](./llm.md).

| Key                       | Type         | Required | Description                                                                        |
| ------------------------- | ------------ | -------- | ---------------------------------------------------------------------------------- |
| `providers.openai.apiKey` | string       | No\*     | OpenAI API key                                                                     |
| `providers.claude.apiKey` | string       | No\*     | Anthropic API key                                                                  |
| `providers.gemini.apiKey` | string       | No\*     | Google Gemini API key                                                              |
| `models`                  | string array | No       | Allow-list of model ids; omit to offer all catalog models whose provider has a key |
| `mcp`                     | array        | No       | Hub MCP servers the agent may call during chat steps (see below)                   |

\* At least one provider entry with a non-empty `apiKey` is required.

### llm.mcp

Optional MCP servers Team Hub connects to during `POST /llm/chat/step`. Tools from these servers are merged into the provider request and executed on the hub; HarborClient never sees hub MCP tool names or results directly.

| Key       | Type            | Required | Description                             |
| --------- | --------------- | -------- | --------------------------------------- |
| `name`    | string          | Yes      | Display name for logs                   |
| `url`     | string          | Yes      | MCP server URL (Streamable HTTP or SSE) |
| `headers` | object or array | No       | HTTP headers sent with MCP requests     |

`headers` accepts any of these shapes (they normalize to key/value pairs):

- Object map: `{ "x-api-key": "..." }`
- Array of single-key objects: `[{ "x-api-key": "..." }]`
- One nested array level: `- [ { "x-api-key": "..." } ]`

```yaml
llm:
  providers:
    openai:
      apiKey: sk-...
  models:
    - gpt-4o
  mcp:
    - name: Exa
      url: https://mcp.exa.ai/mcp
      headers:
        - [{ 'x-api-key': 'your-exa-key' }]
```

Supported model ids when using the default catalog:

| Provider | Model ids                                                 |
| -------- | --------------------------------------------------------- |
| `openai` | `gpt-4o`, `gpt-4o-mini`                                   |
| `claude` | `claude-3-5-sonnet-20241022`, `claude-3-5-haiku-20241022` |
| `gemini` | `gemini-1.5-pro`, `gemini-1.5-flash`                      |

```yaml
llm:
  providers:
    openai:
      apiKey: sk-...
    claude:
      apiKey: sk-ant-...
  models:
    - gpt-4o
    - claude-3-5-sonnet-20241022
```

## plugins

Optional plugin source URLs for HarborClient. Omit this section to return empty lists. Authenticated HarborClient instances merge these read-only endpoints into Settings → Plugins.

| Key        | Type      | Required | Description                   |
| ---------- | --------- | -------- | ----------------------------- |
| `catalogs` | URL array | No       | Plugin catalog JSON URLs      |
| `trusted`  | URL array | No       | Trusted plugin list JSON URLs |

Each entry must be a valid HTTP or HTTPS URL.

```yaml
plugins:
  catalogs:
    - https://harborclient.com/plugin_catalog.json
  trusted:
    - https://harborclient.com/plugins/trusted.json
```

## docs

Optional documentation vector search settings for hub-native `search_docs`. Omit this section to use the Docker default path `/app/data/docsSearchIndex.json` and other built-in fallbacks.

| Key               | Type   | Required | Description                                              |
| ----------------- | ------ | -------- | -------------------------------------------------------- |
| `searchIndexPath` | string | No       | Path to serialized `docsSearchIndex.json` (Orama export) |

Rebuild the index in the harborclient repository with `pnpm index-docs`. The Docker image fetches the latest published index at build time; see [Deploy — Documentation index](./deploy.md#documentation-index).

```yaml
docs:
  searchIndexPath: /app/data/docsSearchIndex.json
```

Hub-native docs search also requires `llm.providers.openai.apiKey`. Without OpenAI or a readable index file, `search_docs` is removed from hub chat tool lists.

## Docker environment variables

The all-in-one Docker image renders `/etc/team-hub/server.yaml` from environment variables on first boot (when the file is missing or empty). Restarts preserve an existing file; mount a host `server.yaml` to survive container recreation. The CLI does not read `TEAM_HUB_CONFIG`; pass `-c /etc/team-hub/server.yaml` explicitly.

| Variable                   | Default                          | Maps to           |
| -------------------------- | -------------------------------- | ----------------- |
| `TEAM_HUB_HOST`            | `127.0.0.1`                      | `server.host`     |
| `TEAM_HUB_PORT`            | `8787`                           | `server.port`     |
| `TEAM_HUB_DB_DRIVER`       | `postgres`                       | `db.driver`       |
| `TEAM_HUB_DB_HOST`         | `127.0.0.1`                      | `db.host`         |
| `TEAM_HUB_DB_PORT`         | `5432`                           | `db.port`         |
| `TEAM_HUB_DB_USER`         | `harbor`                         | `db.user`         |
| `TEAM_HUB_DB_PASSWORD`     | `harbor`                         | `db.password`     |
| `TEAM_HUB_DB_DATABASE`     | `harbor`                         | `db.database`     |
| `TEAM_HUB_REDIS_HOST`      | `127.0.0.1`                      | `redis.host`      |
| `TEAM_HUB_REDIS_PORT`      | `6379`                           | `redis.port`      |
| `TEAM_HUB_LOGGING_LEVEL`   | `info`                           | `logging.level`   |
| `TEAM_HUB_LOGGING_FILE`    | `/var/log/team-hub/team-hub.log` | `logging.file`    |
| `TEAM_HUB_LOGGING_CONSOLE` | `true`                           | `logging.console` |

`llm` and `plugins` are not generated from environment variables in the default template. Mount a custom `server.yaml` or extend deployment tooling for those sections. Logging applies at process startup — restart the container after changing logging env vars. See [Deploy](./deploy.md).

## Related docs

- [Setup](./setup.md) — install, migrate, and start the server
- [Deploy](./deploy.md) — Docker image, hosting guides, config reload, and env var reference
- [Authentication](./auth.md) — bearer tokens and Redis throttling
- [LLM](./llm.md) — user access and usage limits
