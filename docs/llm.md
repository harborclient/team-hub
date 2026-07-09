# LLM Proxy

Team Hub can proxy LLM requests so desktop clients never receive provider API keys. Keys are configured in `server.yaml`; user access and monthly token limits are managed via the CLI.

## Configuration

Add an optional `llm` section to `server.yaml`:

```yaml
llm:
  providers:
    openai:
      apiKey: sk-...
    claude:
      apiKey: sk-ant-...
    gemini:
      apiKey: ...
  models:
    - gpt-4o
    - claude-3-5-sonnet-20241022
    - gemini-1.5-pro
  mcp:
    - name: Exa
      url: https://mcp.exa.ai/mcp
      headers:
        - [{ 'x-api-key': 'your-exa-key' }]
```

When `models` is omitted, every catalog model whose provider has a configured key is offered.

### Hub MCP servers

Add an optional `mcp` array under `llm` to connect Team Hub to remote MCP servers (for example [Exa](https://exa.ai)). During each chat step the hub merges those tools into the provider request, executes hub MCP tool calls server-side, and only returns client-side tool calls to HarborClient. Reload `server.yaml` with SIGHUP or `POST /admin/config/reload` to pick up MCP changes.

## User access

Grant LLM access when creating or updating a user:

```bash
team-hub user create \
  --name alice \
  --role user \
  --collection-access '*' \
  --environment-access '*' \
  --llm-access \
  --llm-model '*' \
  --llm-monthly-tokens 100000
```

| Flag                       | Purpose                                  |
| -------------------------- | ---------------------------------------- |
| `--llm-access`             | Enable hub-proxied LLM routes            |
| `--llm-model <id>`         | Allowed model id or `*` (repeatable)     |
| `--llm-monthly-tokens <n>` | Monthly token limit (omit for unlimited) |

Use `team-hub user update <id> --no-llm-access` to revoke access.

## Agent loop

HarborClient keeps orchestrating client-side tools locally. Each LLM completion step is sent to `POST /llm/chat/step`. The hub forwards tool definitions and the system prompt to the provider. When `llm.mcp` is configured, the hub also merges hub MCP tools, executes those tool calls server-side in a bounded loop, and returns only passthrough (HarborClient) tool calls in the response.

### Hub-native documentation search

When HarborClient's AI assistant calls `search_docs`, the request normally runs in the desktop app using a **local** OpenAI API key and a bundled Orama index. Team Hub users typically have no local key — the hub holds provider credentials instead.

Team Hub can execute `search_docs` **server-side** when both of the following are true:

1. `llm.providers.openai.apiKey` is configured in `server.yaml`.
2. A serialized documentation index (`docsSearchIndex.json`) is available on disk (see [Configuration — docs](./configuration.md#docs) and [Deploy — Documentation index](./deploy.md#documentation-index)).

The hub embeds the query with `text-embedding-3-small` (1536 dimensions) using its OpenAI key, runs vector search over the index, and feeds results back into the agent loop without returning a passthrough tool call to HarborClient.

When OpenAI or the index is missing, the hub **strips** `search_docs` from merged tool definitions so the model cannot call it. `GET /llm/models` advertises hub OpenAI availability via `capabilities.openai`; HarborClient shows an **OpenAI** service badge and disables docs search for hub chats when that flag is false.

The index schema and embedding constants must stay in lockstep with harborclient's `scripts/index-docs.mjs` and `src/main/docs/docsSearch.ts`.

## Monthly limits

Token usage is tracked per UTC calendar month. When a user exceeds their limit, new user messages are rejected with `402`. In-flight tool loops may finish because continuation steps (last message role `tool`) are still accepted.

## Usage logging

Team Hub stores LLM usage in two places:

| Store           | Purpose                                                            |
| --------------- | ------------------------------------------------------------------ |
| `llm_usage`     | Monthly rollup per user for limits and `team-hub user list` totals |
| `llm_usage_log` | Per-request audit trail for each successful `POST /llm/chat/step`  |

Each log row records the user, API token (when present), UTC month, model, provider, token counts, whether the step started a new user turn, whether tool calls were returned, message count, and completion timestamp. Message content is not stored.

Inspect log entries from the CLI:

```bash
team-hub llm list
```

## Endpoints

See [API Endpoints — LLM](./endpoints.md#llm-routes) for request and response shapes.
