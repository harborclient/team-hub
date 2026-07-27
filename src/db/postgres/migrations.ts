import { DEFAULT_AUTH_JSON } from '#/db/types.js';

/**
 * DDL for creating the api_tokens table when absent.
 */
export const API_TOKENS_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS api_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  token_prefix TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL
);
`.trim();

/**
 * DDL for creating the collections table when absent.
 */
export const COLLECTIONS_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS collections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  variables TEXT NOT NULL DEFAULT '[]',
  headers TEXT NOT NULL DEFAULT '[]',
  auth TEXT NOT NULL DEFAULT '${DEFAULT_AUTH_JSON.replace(/'/g, "''")}',
  pre_request_script TEXT NOT NULL DEFAULT '',
  post_request_script TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL
);
`.trim();

/**
 * DDL for creating the environments table when absent.
 */
export const ENVIRONMENTS_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS environments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  variables TEXT NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL
);
`.trim();

/**
 * DDL for creating the snippets table when absent.
 */
export const SNIPPETS_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS snippets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL DEFAULT '',
  scope TEXT NOT NULL DEFAULT 'any' CHECK (scope IN ('pre-request', 'post-request', 'any')),
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  deletion_locked BOOLEAN NOT NULL DEFAULT FALSE
);
`.trim();

/**
 * DDL for creating the folders table when absent.
 */
export const FOLDERS_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL,
  parent_folder_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
);
`.trim();

/**
 * DDL for creating the requests table when absent.
 */
export const REQUESTS_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL,
  folder_id TEXT,
  name TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'GET',
  url TEXT NOT NULL DEFAULT '',
  headers TEXT NOT NULL DEFAULT '[]',
  params TEXT NOT NULL DEFAULT '[]',
  auth TEXT NOT NULL DEFAULT '${DEFAULT_AUTH_JSON.replace(/'/g, "''")}',
  body TEXT NOT NULL DEFAULT '',
  body_type TEXT NOT NULL DEFAULT 'none',
  pre_request_script TEXT NOT NULL DEFAULT '',
  post_request_script TEXT NOT NULL DEFAULT '',
  comment TEXT NOT NULL DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
  FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE
);
`.trim();

/**
 * DDL for creating the documents table when absent.
 */
export const DOCUMENTS_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL,
  folder_id TEXT,
  name TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
  FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE
);
`.trim();

/**
 * DDL for creating the users table when absent.
 */
export const USERS_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
  collection_access TEXT NOT NULL DEFAULT '[]',
  environment_access TEXT NOT NULL DEFAULT '[]',
  snippet_access TEXT NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL
);
`.trim();

/**
 * DDL for creating the audit_log table when absent.
 */
export const AUDIT_LOG_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  user_name TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}'
);
`.trim();

/**
 * Adds the owning user reference to api_tokens when upgrading existing databases.
 */
export const API_TOKENS_USER_ID_MIGRATION_SQL = `
ALTER TABLE api_tokens
  ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
`.trim();

/**
 * Adds user attribution columns to api_tokens when upgrading existing databases.
 */
export const API_TOKENS_ATTRIBUTION_MIGRATION_SQL = `
ALTER TABLE api_tokens
  ADD COLUMN IF NOT EXISTS created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
`.trim();

/**
 * Adds user attribution and updated_at to collections when upgrading existing databases.
 */
export const COLLECTIONS_ATTRIBUTION_MIGRATION_SQL = `
ALTER TABLE collections
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
`.trim();

/**
 * Adds user attribution and updated_at to environments when upgrading existing databases.
 */
export const ENVIRONMENTS_ATTRIBUTION_MIGRATION_SQL = `
ALTER TABLE environments
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
`.trim();

/**
 * Adds user attribution and updated_at to folders when upgrading existing databases.
 */
export const FOLDERS_ATTRIBUTION_MIGRATION_SQL = `
ALTER TABLE folders
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
`.trim();

/**
 * Adds nested-folder ancestry to existing folder tables.
 */
export const FOLDERS_PARENT_MIGRATION_SQL = `
ALTER TABLE folders
  ADD COLUMN IF NOT EXISTS parent_folder_id TEXT REFERENCES folders(id) ON DELETE CASCADE;
`.trim();

/**
 * Adds user attribution columns to requests when upgrading existing databases.
 */
export const REQUESTS_ATTRIBUTION_MIGRATION_SQL = `
ALTER TABLE requests
  ADD COLUMN IF NOT EXISTS created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
`.trim();

/**
 * Adds user attribution columns to users when upgrading existing databases.
 */
export const USERS_ATTRIBUTION_MIGRATION_SQL = `
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
`.trim();

/**
 * Backfills updated_at on collections from created_at for upgraded databases.
 */
export const COLLECTIONS_BACKFILL_UPDATED_AT_SQL = `
UPDATE collections SET updated_at = created_at WHERE updated_at IS NULL;
`.trim();

/**
 * Backfills updated_at on environments from created_at for upgraded databases.
 */
export const ENVIRONMENTS_BACKFILL_UPDATED_AT_SQL = `
UPDATE environments SET updated_at = created_at WHERE updated_at IS NULL;
`.trim();

/**
 * Backfills updated_at on folders from created_at for upgraded databases.
 */
export const FOLDERS_BACKFILL_UPDATED_AT_SQL = `
UPDATE folders SET updated_at = created_at WHERE updated_at IS NULL;
`.trim();

/**
 * Adds LLM access columns to users when upgrading existing databases.
 */
export const USERS_LLM_MIGRATION_SQL = `
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS llm_access BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS llm_models TEXT NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS llm_monthly_token_limit INT;
`.trim();

/**
 * DDL for creating the llm_usage table when absent.
 */
export const LLM_USAGE_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS llm_usage (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  prompt_tokens INT NOT NULL DEFAULT 0,
  completion_tokens INT NOT NULL DEFAULT 0,
  total_tokens INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (user_id, period)
);
`.trim();

/**
 * DDL for creating the llm_usage_log table when absent.
 */
export const LLM_USAGE_LOG_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS llm_usage_log (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  api_token_id TEXT REFERENCES api_tokens(id) ON DELETE SET NULL,
  period TEXT NOT NULL,
  model TEXT NOT NULL,
  provider TEXT NOT NULL,
  prompt_tokens INT NOT NULL,
  completion_tokens INT NOT NULL,
  total_tokens INT NOT NULL,
  is_new_turn BOOLEAN NOT NULL DEFAULT FALSE,
  had_tool_calls BOOLEAN NOT NULL DEFAULT FALSE,
  message_count INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS llm_usage_log_user_created_at_idx ON llm_usage_log (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS llm_usage_log_period_idx ON llm_usage_log (period);
`.trim();

/**
 * Adds deletion lock columns to collections when upgrading existing databases.
 */
export const COLLECTIONS_DELETION_LOCKED_MIGRATION_SQL = `
ALTER TABLE collections
  ADD COLUMN IF NOT EXISTS deletion_locked BOOLEAN NOT NULL DEFAULT FALSE;
`.trim();

/**
 * Adds deletion lock columns to environments when upgrading existing databases.
 */
export const ENVIRONMENTS_DELETION_LOCKED_MIGRATION_SQL = `
ALTER TABLE environments
  ADD COLUMN IF NOT EXISTS deletion_locked BOOLEAN NOT NULL DEFAULT FALSE;
`.trim();

/**
 * Adds snippet access column to users when upgrading existing databases.
 */
export const USERS_SNIPPET_ACCESS_MIGRATION_SQL = `
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS snippet_access TEXT NOT NULL DEFAULT '[]';
`.trim();

/**
 * Adds snippet access for user accounts that have collection wildcard access but no snippet access.
 */
export const USERS_SNIPPET_ACCESS_BACKFILL_SQL = `
UPDATE users
SET snippet_access = '["*"]'
WHERE role = 'user'
  AND snippet_access = '[]'
  AND collection_access LIKE '%"*"%';
`.trim();

/**
 * DDL for creating the run_results table when absent.
 */
export const RUN_RESULTS_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS run_results (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('collection-run-results', 'request-run-results')),
  label TEXT NOT NULL,
  collection_name TEXT,
  request_name TEXT,
  summary_passed INT NOT NULL DEFAULT 0,
  summary_failed INT NOT NULL DEFAULT 0,
  summary_skipped INT NOT NULL DEFAULT 0,
  payload TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS run_results_created_idx ON run_results (created_at DESC);
`.trim();

/**
 * SQL migration creating the user_invitations table for onboarding links.
 */
export const USER_INVITATIONS_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS user_invitations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash CHAR(64) NOT NULL UNIQUE,
  code_prefix TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  redeemed_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS user_invitations_user_id_idx ON user_invitations (user_id);
CREATE INDEX IF NOT EXISTS user_invitations_expires_at_idx ON user_invitations (expires_at);
`.trim();

/**
 * Builds the sidebar marker column migration for a table.
 *
 * Runs as a single statement so it works under both the simple and extended
 * query protocols, and stays idempotent across restarts. Databases predating
 * the marker rename carry the value in a `color` column, which is renamed in
 * place so existing assignments survive the upgrade.
 *
 * @param table - Table receiving the sidebar marker column.
 * @returns Idempotent PL/pgSQL migration statement.
 */
function buildMarkerMigrationSql(table: string): string {
  return `
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = '${table}' AND column_name = 'color'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = '${table}' AND column_name = 'marker'
  ) THEN
    ALTER TABLE ${table} RENAME COLUMN color TO marker;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = '${table}' AND column_name = 'marker'
  ) THEN
    ALTER TABLE ${table} ADD COLUMN marker TEXT;
  END IF;
END $$;
`.trim();
}

/**
 * Adds the sidebar marker column to collections, renaming a legacy `marker` column.
 */
export const COLLECTIONS_MARKER_MIGRATION_SQL = buildMarkerMigrationSql('collections');

/**
 * Adds the sidebar marker column to folders, renaming a legacy `marker` column.
 */
export const FOLDERS_MARKER_MIGRATION_SQL = buildMarkerMigrationSql('folders');

/**
 * Adds the sidebar marker column to requests, renaming a legacy `marker` column.
 */
export const REQUESTS_MARKER_MIGRATION_SQL = buildMarkerMigrationSql('requests');

/**
 * Adds the sidebar marker column to documents, renaming a legacy `marker` column.
 */
export const DOCUMENTS_MARKER_MIGRATION_SQL = buildMarkerMigrationSql('documents');

/**
 * Adds the sidebar marker column to environments, renaming a legacy `marker` column.
 */
export const ENVIRONMENTS_MARKER_MIGRATION_SQL = buildMarkerMigrationSql('environments');

/**
 * Ordered Postgres migrations applied by {@link PostgresDatabase.migrate}.
 */
export const POSTGRES_MIGRATIONS = [
  USERS_MIGRATION_SQL,
  API_TOKENS_MIGRATION_SQL,
  COLLECTIONS_MIGRATION_SQL,
  ENVIRONMENTS_MIGRATION_SQL,
  SNIPPETS_MIGRATION_SQL,
  FOLDERS_MIGRATION_SQL,
  REQUESTS_MIGRATION_SQL,
  DOCUMENTS_MIGRATION_SQL,
  AUDIT_LOG_MIGRATION_SQL,
  API_TOKENS_USER_ID_MIGRATION_SQL,
  API_TOKENS_ATTRIBUTION_MIGRATION_SQL,
  COLLECTIONS_ATTRIBUTION_MIGRATION_SQL,
  ENVIRONMENTS_ATTRIBUTION_MIGRATION_SQL,
  FOLDERS_ATTRIBUTION_MIGRATION_SQL,
  FOLDERS_PARENT_MIGRATION_SQL,
  REQUESTS_ATTRIBUTION_MIGRATION_SQL,
  USERS_ATTRIBUTION_MIGRATION_SQL,
  COLLECTIONS_BACKFILL_UPDATED_AT_SQL,
  ENVIRONMENTS_BACKFILL_UPDATED_AT_SQL,
  FOLDERS_BACKFILL_UPDATED_AT_SQL,
  USERS_LLM_MIGRATION_SQL,
  LLM_USAGE_MIGRATION_SQL,
  LLM_USAGE_LOG_MIGRATION_SQL,
  COLLECTIONS_DELETION_LOCKED_MIGRATION_SQL,
  ENVIRONMENTS_DELETION_LOCKED_MIGRATION_SQL,
  USERS_SNIPPET_ACCESS_MIGRATION_SQL,
  USERS_SNIPPET_ACCESS_BACKFILL_SQL,
  RUN_RESULTS_MIGRATION_SQL,
  USER_INVITATIONS_MIGRATION_SQL,
  COLLECTIONS_MARKER_MIGRATION_SQL,
  FOLDERS_MARKER_MIGRATION_SQL,
  REQUESTS_MARKER_MIGRATION_SQL,
  DOCUMENTS_MARKER_MIGRATION_SQL,
  ENVIRONMENTS_MARKER_MIGRATION_SQL
];
