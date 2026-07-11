# API Endpoints

Team Hub exposes a JSON HTTP API for shared collections, environments, snippets, folders, saved requests, and collection documents. Public routes include `GET /health`, `GET /join`, and the invitation preview/redeem endpoints documented below. All other routes require a valid bearer token — see [Authentication](./auth.md).

## Overview

- **Base URL:** `http://127.0.0.1:8788` (default from `server.yaml`)
- **Content-Type:** `application/json` for request and response bodies
- **Protected routes:** `Authorization: Bearer hbk_...`

Example authenticated request:

```bash
curl -s http://127.0.0.1:8788/collections \
  -H "Authorization: Bearer hbk_your_token_here"
```

## Conventions

### Timestamps

Date fields in responses are ISO 8601 strings (for example `"2026-01-01T00:00:00.000Z"`).

### Errors

Failed requests return a JSON body:

```json
{ "error": "Human-readable message" }
```

| Status | When                                                 |
| ------ | ---------------------------------------------------- |
| `400`  | Validation failure or missing required field         |
| `401`  | Missing, malformed, unknown, or revoked bearer token |
| `404`  | Entity not found                                     |

### Empty responses

Routes that return `204 No Content` send a `null` body.

### Shared types

These shapes appear in multiple request and response payloads.

**Variable** — collection or environment variable:

```json
{ "key": "baseUrl", "value": "https://api.example.com", "defaultValue": "", "share": false }
```

**KeyValue** — header or query parameter with enable toggle:

```json
{ "key": "Accept", "value": "application/json", "enabled": true }
```

**AuthConfig** — authorization on collections and saved requests:

```json
{
  "type": "none",
  "basic": { "username": "", "password": "" },
  "bearer": { "token": "" }
}
```

`type` is one of `none`, `basic`, or `bearer`.

**BodyType** — saved request body format: `none`, `json`, `text`, `multipart`, or `urlencoded`.

**HTTP methods** for saved requests: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`.

## Health

### GET /health

Public health check for load balancers and HarborClient connectivity probes. No authentication required.

**Response `200`:**

```json
{ "status": "ok", "version": "0.1.0" }
```

```bash
curl -s http://127.0.0.1:8788/health
```

### GET /join

Public HTML landing page for Team Hub onboarding invitations. No authentication required.

The page renders invitation details from the query string (`url`, `name`, `role`, `exp`, optional `hub`, optional `access`). The one-time invitation secret must appear in the URL fragment (`#code=hbi_...`) so it is not sent to the server or stored in proxy access logs.

HarborClient administrators generate HTTPS invite links from the desktop app. Recipients click the link in a browser, review the invitation details, and launch HarborClient with a `harborclient://team-hub/join?...` deep link.

## Authentication

### GET /auth/session

Returns the authenticated user account, API token metadata, and derived capability flags. Requires a valid bearer token.

Use this route to discover whether a token belongs to a `user` or `admin` account and which API surfaces it may call. HarborClient can probe this endpoint when saving a team hub connection to gate administration UI.

**Response `200`:**

```json
{
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "alice",
    "role": "user"
  },
  "token": {
    "id": "660e8400-e29b-41d4-a716-446655440001",
    "prefix": "hbk_AbCd1234"
  },
  "capabilities": {
    "dataApi": true,
    "managementApi": false,
    "llm": true
  }
}
```

| Capability      | `user` role                        | `admin` role |
| --------------- | ---------------------------------- | ------------ |
| `dataApi`       | `true`                             | `false`      |
| `managementApi` | `false`                            | `true`       |
| `llm`           | `true` when `llmAccess` is enabled | `false`      |

**Response `401`:** Missing, malformed, unknown, or revoked bearer token.

```bash
curl -s http://127.0.0.1:8788/auth/session \
  -H "Authorization: Bearer hbk_your_token_here"
```

## Administration

Management routes require an `admin`-role bearer token. `user`-role tokens receive **403 Forbidden**.

### GET /admin/users

Lists user accounts on the Team Hub server. The internal `system` account used for migrations and CLI attribution is omitted.

**Response `200`:**

```json
{
  "users": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "alice",
      "role": "user",
      "collectionAccess": ["*"],
      "environmentAccess": ["*"],
      "llmAccess": true,
      "llmModels": ["*"],
      "llmMonthlyTokenLimit": 100000,
      "createdAt": "2026-01-01T00:00:00.000Z",
      "updatedAt": "2026-01-01T00:00:00.000Z",
      "warnings": []
    }
  ]
}
```

Each user entry includes a `warnings` array. When stored access lists reference collection, environment, or LLM model ids that no longer exist on the hub, warnings describe the stale references (for example `Unknown collection id "deleted-col".`). An empty array means all referenced ids are valid.

**Response `403`:** Authenticated `user`-role token.

**Response `401`:** Missing, malformed, unknown, or revoked bearer token.

```bash
curl -s http://127.0.0.1:8788/admin/users \
  -H "Authorization: Bearer hbk_your_admin_token_here"
```

### PUT /admin/users/:id

Updates a user account. The internal `system` account cannot be modified (403).

**Request body** (all fields optional):

```json
{
  "name": "alice",
  "role": "user",
  "collectionAccess": ["*"],
  "environmentAccess": ["*"],
  "llmAccess": true,
  "llmModels": ["*"],
  "llmMonthlyTokenLimit": 100000
}
```

**Response `200`:** Updated user record (same shape as a user entry in `GET /admin/users`, excluding the `warnings` field).

**Response `400`:** Invalid access list (for example wildcard combined with specific ids), unknown collection/environment/LLM model id in a submitted access list, or invalid user name. Example:

```json
{ "error": "Unknown collection id: missing-col." }
```

Only access lists explicitly included in the request body are validated against `GET /admin/collections`, `GET /admin/environments`, and `GET /admin/llm/models`. Partial updates that omit access fields leave existing stored access unchanged, even when those stored ids are stale.

**Response `403`:** Authenticated `user`-role token, or attempt to modify the `system` account.

**Response `404`:** Unknown user id.

```bash
curl -s -X PUT http://127.0.0.1:8788/admin/users/550e8400-e29b-41d4-a716-446655440000 \
  -H "Authorization: Bearer hbk_your_admin_token_here" \
  -H "Content-Type: application/json" \
  -d '{"name":"alice-renamed"}'
```

### DELETE /admin/users/:id

Deletes a user account and permanently removes all of their API tokens. The internal `system` account cannot be deleted (403).

**Response `204`:** User deleted.

**Response `403`:** Authenticated `user`-role token, or attempt to delete the `system` account.

**Response `404`:** Unknown user id.

```bash
curl -s -X DELETE http://127.0.0.1:8788/admin/users/550e8400-e29b-41d4-a716-446655440000 \
  -H "Authorization: Bearer hbk_your_admin_token_here"
```

### POST /admin/users

Creates a user account and an initial API bearer token. The plaintext token secret is returned once in the response and is not stored on the server.

**Request body:**

```json
{
  "name": "alice",
  "role": "user",
  "collectionAccess": ["*"],
  "environmentAccess": ["*"],
  "llmAccess": false,
  "llmModels": [],
  "llmMonthlyTokenLimit": null
}
```

**Response `201`:**

```json
{
  "user": { "id": "...", "name": "alice", "role": "user", "...": "..." },
  "token": {
    "id": "...",
    "userId": "...",
    "name": "alice",
    "tokenPrefix": "hbk_AbCd1234",
    "createdAt": "2026-01-01T00:00:00.000Z",
    "lastUsedAt": null,
    "revokedAt": null
  },
  "secret": "hbk_..."
}
```

**Response `400`:** Invalid access lists, duplicate name, or unknown resource ids.

**Response `403`:** Authenticated `user`-role token.

```bash
curl -s -X POST http://127.0.0.1:8788/admin/users \
  -H "Authorization: Bearer hbk_your_admin_token_here" \
  -H "Content-Type: application/json" \
  -d '{"name":"alice","role":"user","collectionAccess":["*"],"environmentAccess":["*"]}'
```

### GET /admin/tokens

Lists all API bearer tokens across user accounts (metadata only; never includes secrets).

**Response `200`:**

```json
{
  "tokens": [
    {
      "id": "770e8400-e29b-41d4-a716-446655440002",
      "userId": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Desktop",
      "tokenPrefix": "hbk_AbCd1234",
      "createdAt": "2026-01-01T00:00:00.000Z",
      "lastUsedAt": null,
      "revokedAt": null
    }
  ]
}
```

**Response `403`:** Authenticated `user`-role token.

```bash
curl -s http://127.0.0.1:8788/admin/tokens \
  -H "Authorization: Bearer hbk_your_admin_token_here"
```

### POST /admin/users/:id/tokens

Creates an additional API bearer token for an existing user account. The plaintext secret is returned once.

**Request body:**

```json
{ "name": "Desktop" }
```

**Response `201`:**

```json
{
  "token": {
    "id": "...",
    "userId": "...",
    "name": "Desktop",
    "tokenPrefix": "hbk_AbCd1234",
    "createdAt": "2026-01-01T00:00:00.000Z",
    "lastUsedAt": null,
    "revokedAt": null
  },
  "secret": "hbk_..."
}
```

**Response `403`:** Authenticated `user`-role token, or attempt to create a token for the `system` account.

**Response `404`:** Unknown user id.

```bash
curl -s -X POST http://127.0.0.1:8788/admin/users/550e8400-e29b-41d4-a716-446655440000/tokens \
  -H "Authorization: Bearer hbk_your_admin_token_here" \
  -H "Content-Type: application/json" \
  -d '{"name":"Desktop"}'
```

### DELETE /admin/tokens/:id

Permanently deletes an API bearer token by id. Tokens owned by the internal `system` account cannot be deleted (403).

**Response `204`:** Token deleted.

**Response `403`:** Authenticated `user`-role token, or attempt to delete a `system` account token.

**Response `404`:** Unknown token id.

```bash
curl -s -X DELETE http://127.0.0.1:8788/admin/tokens/770e8400-e29b-41d4-a716-446655440002 \
  -H "Authorization: Bearer hbk_your_admin_token_here"
```

### GET /admin/collections

Lists all collections as lightweight `{ id, name, deletionLocked }` records for operator user management.

**Response `200`:**

```json
{
  "collections": [
    { "id": "550e8400-e29b-41d4-a716-446655440000", "name": "Shared API", "deletionLocked": false }
  ]
}
```

**Response `403`:** Authenticated `user`-role token.

```bash
curl -s http://127.0.0.1:8788/admin/collections \
  -H "Authorization: Bearer hbk_your_admin_token_here"
```

### PUT /admin/collections/:id

Updates admin configuration for a collection. Currently supports toggling `deletionLocked` to prevent non-admin users from deleting the collection.

**Request body:**

```json
{ "deletionLocked": true }
```

**Response `200`:**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Shared API",
  "deletionLocked": true
}
```

**Response `403`:** Authenticated `user`-role token.

**Response `404`:** Unknown collection id.

### DELETE /admin/collections/:id

Deletes a collection and all nested folders and requests. Admins may delete regardless of `deletionLocked`.

**Response `204`:** Collection deleted.

**Response `403`:** Authenticated `user`-role token.

**Response `404`:** Unknown collection id.

### GET /admin/collections/:collectionId/documents

Lists collection documents in a collection for operator inspection.

**Response `200`:**

```json
{
  "documents": [
    /* document records */
  ]
}
```

**Response `403`:** Authenticated `user`-role token.

**Response `404`:** Unknown collection id.

### GET /admin/environments

Lists all environments as lightweight `{ id, name, deletionLocked }` records for operator user management.

**Response `200`:**

```json
{
  "environments": [
    { "id": "660e8400-e29b-41d4-a716-446655440001", "name": "Production", "deletionLocked": false }
  ]
}
```

**Response `403`:** Authenticated `user`-role token.

```bash
curl -s http://127.0.0.1:8788/admin/environments \
  -H "Authorization: Bearer hbk_your_admin_token_here"
```

### PUT /admin/environments/:id

Updates admin configuration for an environment. Currently supports toggling `deletionLocked` to prevent non-admin users from deleting the environment.

**Request body:**

```json
{ "deletionLocked": true }
```

**Response `200`:**

```json
{
  "id": "660e8400-e29b-41d4-a716-446655440001",
  "name": "Production",
  "deletionLocked": true
}
```

**Response `403`:** Authenticated `user`-role token.

**Response `404`:** Unknown environment id.

### DELETE /admin/environments/:id

Deletes an environment. Admins may delete regardless of `deletionLocked`.

**Response `204`:** Environment deleted.

**Response `403`:** Authenticated `user`-role token.

**Response `404`:** Unknown environment id.

### GET /admin/snippets

Lists all snippets as lightweight `{ id, name, deletionLocked }` records for operator user management.

**Response `200`:**

```json
{
  "snippets": [
    { "id": "770e8400-e29b-41d4-a716-446655440001", "name": "Auth helper", "deletionLocked": false }
  ]
}
```

**Response `403`:** Authenticated `user`-role token.

### PUT /admin/snippets/:id

Updates admin configuration for a snippet. Currently supports toggling `deletionLocked`.

**Request body:**

```json
{ "deletionLocked": true }
```

**Response `200`:** Updated snippet admin metadata.

**Response `403`:** Authenticated `user`-role token.

**Response `404`:** Unknown snippet id.

### DELETE /admin/snippets/:id

Deletes a snippet. Admins may delete regardless of `deletionLocked`.

**Response `204`:** Snippet deleted.

**Response `403`:** Authenticated `user`-role token.

**Response `404`:** Unknown snippet id.

### GET /admin/llm/models

Lists all hub-offered LLM models from `server.yaml` for operator user management. Unlike `GET /llm/models`, this route is not filtered by the authenticated admin's own model access list.

**Response `200`:** Same shape as `GET /llm/models`.

**Response `403`:** Authenticated `user`-role token.

**Response `503`:** LLM support is not configured on this Team Hub.

```bash
curl -s http://127.0.0.1:8788/admin/llm/models \
  -H "Authorization: Bearer hbk_your_admin_token_here"
```

### POST /admin/config/reload

Re-reads `server.yaml` and applies reloadable sections (`db`, `redis`, `llm`, `plugins`) without restarting the process. Changes to `server.host` or `server.port` are reported as `restart-required` and are not applied live.

**Auth:** Bearer token required (`admin` role).

**Response `200`:** Reload attempted; see per-section `status` values (`reloaded`, `unchanged`, `failed`, `restart-required`).

**Response `400`:** Config file missing or invalid; nothing was changed. Includes `fatalError`.

**Response `403`:** Authenticated `user`-role token.

```bash
curl -s -X POST http://127.0.0.1:8788/admin/config/reload \
  -H "Authorization: Bearer hbk_your_admin_token_here"
```

Example response:

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

## Collections

Collections are top-level workspaces that hold folders, saved requests, and collection-scoped defaults (variables, headers, scripts, auth).

**Collection record:**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Shared API",
  "variables": [],
  "headers": [],
  "auth": {
    "type": "none",
    "basic": { "username": "", "password": "" },
    "bearer": { "token": "" }
  },
  "preRequestScript": "",
  "postRequestScript": "",
  "createdAt": "2026-01-01T00:00:00.000Z"
}
```

### GET /collections

Lists all collections ordered by name. Results are filtered by the authenticated user's collection access list. `admin`-role tokens receive the full catalog but cannot mutate collections or read nested folders and requests.

**Auth:** Bearer token required.

**Response `200`:**

```json
{
  "collections": [
    /* collection records */
  ]
}
```

```bash
curl -s http://127.0.0.1:8788/collections \
  -H "Authorization: Bearer hbk_your_token_here"
```

### POST /collections

Creates a new collection with the given display name.

**Auth:** Bearer token required.

**Request body:**

```json
{ "name": "Shared API" }
```

**Response `200`:** Collection record.

**Response `400`:** Validation error (for example empty name).

```bash
curl -s -X POST http://127.0.0.1:8788/collections \
  -H "Authorization: Bearer hbk_your_token_here" \
  -H "Content-Type: application/json" \
  -d '{"name":"Shared API"}'
```

### PUT /collections/:id

Updates a collection's name, variables, headers, scripts, and auth defaults.

**Auth:** Bearer token required.

**Request body:**

```json
{
  "name": "Shared API",
  "variables": [],
  "headers": [],
  "preRequestScript": "",
  "postRequestScript": "",
  "auth": { "type": "none", "basic": { "username": "", "password": "" }, "bearer": { "token": "" } }
}
```

**Response `200`:** Updated collection record.

**Response `400`:** Validation error.

**Response `404`:** Collection not found.

### DELETE /collections/:id

Deletes a collection and all nested folders and saved requests. Only the user who created the collection may delete it via this route.

**Auth:** Bearer token required.

**Response `204`:** No content.

**Response `403`:** Collection has `deletionLocked: true` (message: `Deletion is locked for this collection.`), or the authenticated user did not create the collection (`{ "error": "Forbidden" }`).

**Response `404`:** Collection not found.

## Environments

Environments hold named variable sets used across requests.

**Environment record:**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440001",
  "name": "Production",
  "variables": [],
  "createdAt": "2026-01-01T00:00:00.000Z",
  "deletionLocked": false
}
```

### GET /environments

Lists all environments ordered by name. Results are filtered by the authenticated user's environment access list. `admin`-role tokens receive the full catalog but cannot mutate environments.

**Auth:** Bearer token required.

**Response `200`:**

```json
{
  "environments": [
    /* environment records */
  ]
}
```

```bash
curl -s http://127.0.0.1:8788/environments \
  -H "Authorization: Bearer hbk_your_token_here"
```

### POST /environments

Creates a new environment with the given display name.

**Auth:** Bearer token required.

**Request body:**

```json
{ "name": "Production" }
```

**Response `200`:** Environment record.

**Response `400`:** Validation error.

```bash
curl -s -X POST http://127.0.0.1:8788/environments \
  -H "Authorization: Bearer hbk_your_token_here" \
  -H "Content-Type: application/json" \
  -d '{"name":"Production"}'
```

### PUT /environments/:id

Updates an environment's name and variables.

**Auth:** Bearer token required.

**Request body:**

```json
{
  "name": "Production",
  "variables": [
    { "key": "baseUrl", "value": "https://api.example.com", "defaultValue": "", "share": false }
  ]
}
```

**Response `200`:** Updated environment record.

**Response `400`:** Validation error.

**Response `404`:** Environment not found.

### DELETE /environments/:id

Deletes an environment by id.

**Auth:** Bearer token required.

**Response `204`:** No content.

**Response `403`:** Environment has `deletionLocked: true` (message: `Deletion is locked for this environment.`).

**Response `404`:** Environment not found.

## Snippets

Snippets hold reusable JavaScript for pre-request and post-request scripts.

**Snippet record:**

```json
{
  "id": "770e8400-e29b-41d4-a716-446655440001",
  "name": "Auth helper",
  "code": "console.log('ok');",
  "scope": "pre-request",
  "sortOrder": 0,
  "createdAt": "2026-01-01T00:00:00.000Z",
  "updatedAt": "2026-01-01T00:00:00.000Z",
  "createdByUserId": "user-id",
  "updatedByUserId": "user-id",
  "deletionLocked": false
}
```

`scope` is one of `pre-request`, `post-request`, or `any`.

### GET /snippets

Lists all snippets ordered by `sortOrder` then name. Results are filtered by the authenticated user's snippet access list. `admin`-role tokens receive the full catalog but cannot mutate snippets.

**Auth:** Bearer token required.

**Response `200`:**

```json
{
  "snippets": [
    /* snippet records */
  ]
}
```

### POST /snippets

Creates a new snippet. Requires wildcard snippet access.

**Auth:** Bearer token required.

**Request body:**

```json
{
  "name": "Auth helper",
  "code": "console.log('ok');",
  "scope": "pre-request"
}
```

**Response `200`:** Snippet record.

**Response `400`:** Validation error.

### PUT /snippets/:id

Updates a snippet's name, code, scope, and sort order.

**Auth:** Bearer token required.

**Request body:**

```json
{
  "name": "Auth helper",
  "code": "console.log('ok');",
  "scope": "any",
  "sortOrder": 1
}
```

**Response `200`:** Updated snippet record.

**Response `400`:** Validation error.

**Response `404`:** Snippet not found.

### DELETE /snippets/:id

Deletes a snippet by id.

**Auth:** Bearer token required.

**Response `204`:** No content.

**Response `403`:** Snippet has `deletionLocked: true` (message: `Deletion is locked for this snippet.`).

**Response `404`:** Snippet not found.

Folders organize saved requests within a collection.

**Folder record:**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440002",
  "collectionId": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Users",
  "sortOrder": 0,
  "createdAt": "2026-01-01T00:00:00.000Z"
}
```

### GET /collections/:collectionId/folders

Lists folders in a collection ordered by sort order, then name.

**Auth:** Bearer token required.

**Response `200`:**

```json
{
  "folders": [
    /* folder records */
  ]
}
```

```bash
curl -s http://127.0.0.1:8788/collections/550e8400-e29b-41d4-a716-446655440000/folders \
  -H "Authorization: Bearer hbk_your_token_here"
```

### POST /collections/:collectionId/folders

Creates a folder in the given collection.

**Auth:** Bearer token required.

**Request body:**

```json
{ "name": "Users" }
```

**Response `200`:** Folder record.

**Response `400`:** Validation error.

```bash
curl -s -X POST http://127.0.0.1:8788/collections/550e8400-e29b-41d4-a716-446655440000/folders \
  -H "Authorization: Bearer hbk_your_token_here" \
  -H "Content-Type: application/json" \
  -d '{"name":"Users"}'
```

### PATCH /folders/:id

Renames a folder by id.

**Auth:** Bearer token required.

**Request body:**

```json
{ "name": "User Management" }
```

**Response `200`:** Updated folder record.

**Response `400`:** Validation error.

**Response `404`:** Folder not found.

### DELETE /folders/:id

Deletes a folder and all saved requests inside it.

**Auth:** Bearer token required.

**Response `204`:** No content.

**Response `404`:** Folder not found.

### PUT /collections/:collectionId/folders/reorder

Reorders folders within a collection.

**Auth:** Bearer token required.

**Request body:**

```json
{
  "orderedFolderIds": [
    "550e8400-e29b-41d4-a716-446655440002",
    "550e8400-e29b-41d4-a716-446655440003"
  ]
}
```

**Response `204`:** No content.

**Response `404`:** Collection or folder not found.

## Requests

Saved requests store HTTP method, URL, headers, params, body, scripts, and optional folder placement.

**Saved request record:**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440004",
  "collectionId": "550e8400-e29b-41d4-a716-446655440000",
  "name": "List users",
  "method": "GET",
  "url": "https://api.example.com/users",
  "headers": [],
  "params": [],
  "auth": {
    "type": "none",
    "basic": { "username": "", "password": "" },
    "bearer": { "token": "" }
  },
  "body": "",
  "bodyType": "none",
  "preRequestScript": "",
  "postRequestScript": "",
  "comment": "",
  "folderId": null,
  "sortOrder": 0,
  "createdAt": "2026-01-01T00:00:00.000Z",
  "updatedAt": "2026-01-01T00:00:00.000Z"
}
```

`folderId` is `null` when the request lives at the collection root.

### GET /collections/:collectionId/requests

Lists saved requests in a collection.

**Auth:** Bearer token required.

**Response `200`:**

```json
{
  "requests": [
    /* saved request records */
  ]
}
```

```bash
curl -s http://127.0.0.1:8788/collections/550e8400-e29b-41d4-a716-446655440000/requests \
  -H "Authorization: Bearer hbk_your_token_here"
```

### POST /collections/:collectionId/requests

Creates a new saved request in a collection.

**Auth:** Bearer token required.

**Request body:**

```json
{
  "name": "List users",
  "method": "GET",
  "url": "https://api.example.com/users",
  "headers": [],
  "params": [],
  "auth": {
    "type": "none",
    "basic": { "username": "", "password": "" },
    "bearer": { "token": "" }
  },
  "body": "",
  "bodyType": "none",
  "preRequestScript": "",
  "postRequestScript": "",
  "comment": "",
  "folderId": null
}
```

`folderId` is optional; omit it or set `null` for the collection root.

**Response `200`:** Saved request record.

**Response `400`:** Validation error.

**Response `404`:** Collection or folder not found.

```bash
curl -s -X POST http://127.0.0.1:8788/collections/550e8400-e29b-41d4-a716-446655440000/requests \
  -H "Authorization: Bearer hbk_your_token_here" \
  -H "Content-Type: application/json" \
  -d '{"name":"List users","method":"GET","url":"https://api.example.com/users","headers":[],"params":[],"auth":{"type":"none","basic":{"username":"","password":""},"bearer":{"token":""}},"body":"","bodyType":"none","preRequestScript":"","postRequestScript":"","comment":""}'
```

### PUT /requests/:id

Updates an existing saved request by id.

**Auth:** Bearer token required.

**Request body:** Same fields as `POST`, plus required `collectionId`:

```json
{
  "collectionId": "550e8400-e29b-41d4-a716-446655440000",
  "name": "List users",
  "method": "GET",
  "url": "https://api.example.com/users",
  "headers": [],
  "params": [],
  "auth": {
    "type": "none",
    "basic": { "username": "", "password": "" },
    "bearer": { "token": "" }
  },
  "body": "",
  "bodyType": "none",
  "preRequestScript": "",
  "postRequestScript": "",
  "comment": "",
  "folderId": null
}
```

**Response `200`:** Updated saved request record.

**Response `400`:** Validation error.

**Response `404`:** Request, collection, or folder not found.

### DELETE /requests/:id

Deletes a saved request by id. Only the user who created the request may delete it via this route.

**Auth:** Bearer token required.

**Response `204`:** No content.

**Response `403`:** The authenticated user did not create the request (`{ "error": "Forbidden" }`).

**Response `404`:** Request not found.

### PUT /collections/:collectionId/requests/reorder

Reorders saved requests within a folder or the collection root.

**Auth:** Bearer token required.

**Request body:**

```json
{
  "folderId": null,
  "orderedRequestIds": [
    "550e8400-e29b-41d4-a716-446655440004",
    "550e8400-e29b-41d4-a716-446655440005"
  ]
}
```

Set `folderId` to `null` to reorder requests at the collection root.

**Response `204`:** No content.

**Response `404`:** Collection, folder, or request not found.

### PUT /requests/:id/move

Moves a single saved request to another folder or a specific index at the collection root.

**Auth:** Bearer token required.

**Request body:**

```json
{
  "folderId": "550e8400-e29b-41d4-a716-446655440002",
  "index": 0
}
```

Set `folderId` to `null` to move the request to the collection root at `index`.

**Response `204`:** No content.

**Response `404`:** Request or folder not found.

## Documents

Collection documents store markdown files attached to a collection or folder (for example `README.md`).

**Document record:**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440006",
  "collectionId": "550e8400-e29b-41d4-a716-446655440000",
  "name": "README.md",
  "content": "# API notes",
  "folderId": null,
  "sortOrder": 0,
  "createdAt": "2026-01-01T00:00:00.000Z",
  "updatedAt": "2026-01-01T00:00:00.000Z"
}
```

`folderId` is `null` when the document lives at the collection root.

### GET /collections/:collectionId/documents

Lists collection documents in a collection.

**Auth:** Bearer token required.

**Response `200`:**

```json
{
  "documents": [
    /* document records */
  ]
}
```

```bash
curl -s http://127.0.0.1:8788/collections/550e8400-e29b-41d4-a716-446655440000/documents \
  -H "Authorization: Bearer hbk_your_token_here"
```

### POST /collections/:collectionId/documents

Creates a new collection document in a collection.

**Auth:** Bearer token required.

**Request body:**

```json
{
  "name": "README.md",
  "content": "# API notes",
  "folderId": null
}
```

**Response `200`:** Created document record.

**Response `400`:** Validation error.

**Response `404`:** Collection or folder not found.

```bash
curl -s -X POST http://127.0.0.1:8788/collections/550e8400-e29b-41d4-a716-446655440000/documents \
  -H "Authorization: Bearer hbk_your_token_here" \
  -H "Content-Type: application/json" \
  -d '{"name":"README.md","content":"# API notes"}'
```

### PUT /documents/:id

Updates an existing collection document by id.

**Auth:** Bearer token required.

**Request body:**

```json
{
  "collectionId": "550e8400-e29b-41d4-a716-446655440000",
  "name": "README.md",
  "content": "# Updated notes",
  "folderId": null
}
```

**Response `200`:** Updated document record.

**Response `400`:** Validation error.

**Response `404`:** Document, collection, or folder not found.

### DELETE /documents/:id

Deletes a collection document by id. Only the user who created the document may delete it via this route.

**Auth:** Bearer token required.

**Response `204`:** No content.

**Response `403`:** The authenticated user did not create the document (`{ "error": "Forbidden" }`).

**Response `404`:** Document not found.

### PUT /collections/:collectionId/documents/reorder

Reorders collection documents within a folder or the collection root.

**Auth:** Bearer token required.

**Request body:**

```json
{
  "folderId": null,
  "orderedDocumentIds": [
    "550e8400-e29b-41d4-a716-446655440006",
    "550e8400-e29b-41d4-a716-446655440007"
  ]
}
```

Set `folderId` to `null` to reorder documents at the collection root.

**Response `204`:** No content.

**Response `404`:** Collection, folder, or document not found.

### PUT /documents/:id/move

Moves a single collection document to another folder or a specific index at the collection root.

**Auth:** Bearer token required.

**Request body:**

```json
{
  "folderId": "550e8400-e29b-41d4-a716-446655440002",
  "index": 0
}
```

Set `folderId` to `null` to move the document to the collection root at `index`.

**Response `204`:** No content.

**Response `404`:** Document or folder not found.

## LLM routes

Hub-proxied LLM routes require bearer authentication and a user account with `llmAccess` enabled. When the `llm` section is absent from `server.yaml`, these routes return `503`.

See [LLM Proxy](./llm.md) for configuration and CLI management.

### `GET /llm/models`

Lists hub-offered models the authenticated user may use.

**Auth:** Bearer token required.

**Response `200`:**

```json
{
  "models": [
    {
      "id": "gpt-4o",
      "label": "GPT-4o",
      "provider": "openai"
    }
  ],
  "capabilities": {
    "openai": true
  }
}
```

`capabilities.openai` is `true` when `llm.providers.openai.apiKey` is configured. HarborClient uses this flag for the **OpenAI** service badge and to enable hub-native documentation search (`search_docs`).

**Response `403`:** User lacks LLM access or the route is forbidden.

**Response `503`:** LLM support is not configured on the hub.

### `GET /llm/usage`

Returns the authenticated user's current monthly token usage.

**Auth:** Bearer token required.

**Response `200`:**

```json
{
  "period": "2026-06",
  "totalTokens": 12345,
  "limit": 100000
}
```

`limit` is `null` when the user has no monthly cap.

### `POST /llm/chat/step`

Runs one stateless LLM completion step using hub-configured provider keys.

**Auth:** Bearer token required.

**Request body:**

```json
{
  "model": "gpt-4o",
  "messages": [{ "role": "user", "content": "Hello" }],
  "systemPrompt": "You are HarborClient assistant.",
  "tools": []
}
```

**Response `200`:**

```json
{
  "content": "Hi there.",
  "toolCalls": [
    {
      "id": "call_1",
      "name": "list_collections",
      "arguments": "{}"
    }
  ],
  "usage": {
    "promptTokens": 10,
    "completionTokens": 5,
    "totalTokens": 15
  }
}
```

**Response `402`:** Monthly token limit reached for a new user turn.

**Response `403`:** User lacks LLM access or the requested model is not allowed.

**Response `503`:** LLM support is not configured on the hub.

## Plugin sources

Team Hubs can declare plugin marketplace catalog and trusted-publisher URLs in `server.yaml` under the optional `plugins` section. HarborClient merges these into **Settings → Plugins** as read-only endpoints for connected users.

Configure in `server.yaml`:

```yaml
plugins:
  catalogs:
    - https://harborclient.com/plugin_catalog.json
  trusted:
    - https://harborclient.com/plugins/trusted.json
```

### `GET /plugins/sources`

Returns plugin catalog and trusted-publisher URLs configured on this Team Hub.

**Auth:** Bearer token required (any authenticated user).

**Response `200`:**

```json
{
  "catalogs": ["https://harborclient.com/plugin_catalog.json"],
  "trusted": ["https://harborclient.com/plugins/trusted.json"]
}
```

When the `plugins` section is omitted from `server.yaml`, both arrays are empty.
