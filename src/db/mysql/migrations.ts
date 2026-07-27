import { DEFAULT_AUTH_JSON } from '#/db/types.js';

/**
 * DDL for creating the api_tokens table when absent.
 */
export const API_TOKENS_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS api_tokens (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NULL,
  name VARCHAR(255) NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  token_prefix VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL,
  last_used_at DATETIME NULL,
  revoked_at DATETIME NULL,
  created_by_user_id VARCHAR(36) NULL,
  updated_by_user_id VARCHAR(36) NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
)
`.trim();

/**
 * DDL for creating the collections table when absent.
 */
export const COLLECTIONS_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS collections (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  variables LONGTEXT NOT NULL,
  headers LONGTEXT NOT NULL,
  auth LONGTEXT NOT NULL,
  pre_request_script LONGTEXT NOT NULL,
  post_request_script LONGTEXT NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  created_by_user_id VARCHAR(36) NULL,
  updated_by_user_id VARCHAR(36) NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
)
`.trim();

/**
 * DDL for creating the environments table when absent.
 */
export const ENVIRONMENTS_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS environments (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  variables LONGTEXT NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  created_by_user_id VARCHAR(36) NULL,
  updated_by_user_id VARCHAR(36) NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
)
`.trim();

/**
 * DDL for creating the snippets table when absent.
 */
export const SNIPPETS_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS snippets (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  code LONGTEXT NOT NULL,
  scope VARCHAR(32) NOT NULL DEFAULT 'any',
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  created_by_user_id VARCHAR(36) NULL,
  updated_by_user_id VARCHAR(36) NULL,
  deletion_locked TINYINT(1) NOT NULL DEFAULT 0,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
)
`.trim();

/**
 * DDL for creating the folders table when absent.
 */
export const FOLDERS_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS folders (
  id VARCHAR(36) PRIMARY KEY,
  collection_id VARCHAR(36) NOT NULL,
  parent_folder_id VARCHAR(36) NULL,
  name VARCHAR(255) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  created_by_user_id VARCHAR(36) NULL,
  updated_by_user_id VARCHAR(36) NULL,
  FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_folder_id) REFERENCES folders(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
)
`.trim();

/**
 * DDL for creating the requests table when absent.
 */
export const REQUESTS_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS requests (
  id VARCHAR(36) PRIMARY KEY,
  collection_id VARCHAR(36) NOT NULL,
  folder_id VARCHAR(36) NULL,
  name VARCHAR(255) NOT NULL,
  method VARCHAR(16) NOT NULL DEFAULT 'GET',
  url LONGTEXT NOT NULL,
  headers LONGTEXT NOT NULL,
  params LONGTEXT NOT NULL,
  auth LONGTEXT NOT NULL,
  body LONGTEXT NOT NULL,
  body_type VARCHAR(32) NOT NULL DEFAULT 'none',
  pre_request_script LONGTEXT NOT NULL,
  post_request_script LONGTEXT NOT NULL,
  comment LONGTEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  created_by_user_id VARCHAR(36) NULL,
  updated_by_user_id VARCHAR(36) NULL,
  FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
  FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
)
`.trim();

/**
 * DDL for creating the documents table when absent.
 */
export const DOCUMENTS_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS documents (
  id VARCHAR(36) PRIMARY KEY,
  collection_id VARCHAR(36) NOT NULL,
  folder_id VARCHAR(36) NULL,
  name VARCHAR(255) NOT NULL,
  content LONGTEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  created_by_user_id VARCHAR(36) NULL,
  updated_by_user_id VARCHAR(36) NULL,
  FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
  FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
)
`.trim();

/**
 * DDL for creating the users table when absent.
 */
export const USERS_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  role VARCHAR(16) NOT NULL,
  collection_access LONGTEXT NOT NULL,
  environment_access LONGTEXT NOT NULL,
  snippet_access LONGTEXT NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  created_by_user_id VARCHAR(36) NULL,
  updated_by_user_id VARCHAR(36) NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
)
`.trim();

/**
 * DDL for creating the audit_log table when absent.
 */
export const AUDIT_LOG_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS audit_log (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NULL,
  user_name VARCHAR(255) NULL,
  action VARCHAR(16) NOT NULL,
  entity_type VARCHAR(32) NOT NULL,
  entity_id VARCHAR(36) NOT NULL,
  created_at DATETIME NOT NULL,
  metadata LONGTEXT NOT NULL
)
`.trim();

/**
 * Adds the owning user reference to api_tokens when upgrading existing databases.
 */
export const API_TOKENS_USER_ID_MIGRATION_SQL = `
ALTER TABLE api_tokens
  ADD COLUMN IF NOT EXISTS user_id VARCHAR(36) NULL
`.trim();

/**
 * Adds user attribution columns to api_tokens when upgrading existing databases.
 */
export const API_TOKENS_ATTRIBUTION_MIGRATION_SQL = `
ALTER TABLE api_tokens
  ADD COLUMN IF NOT EXISTS created_by_user_id VARCHAR(36) NULL,
  ADD COLUMN IF NOT EXISTS updated_by_user_id VARCHAR(36) NULL
`.trim();

/**
 * Adds user attribution and updated_at to collections when upgrading existing databases.
 */
export const COLLECTIONS_ATTRIBUTION_MIGRATION_SQL = `
ALTER TABLE collections
  ADD COLUMN IF NOT EXISTS updated_at DATETIME NULL,
  ADD COLUMN IF NOT EXISTS created_by_user_id VARCHAR(36) NULL,
  ADD COLUMN IF NOT EXISTS updated_by_user_id VARCHAR(36) NULL
`.trim();

/**
 * Adds user attribution and updated_at to environments when upgrading existing databases.
 */
export const ENVIRONMENTS_ATTRIBUTION_MIGRATION_SQL = `
ALTER TABLE environments
  ADD COLUMN IF NOT EXISTS updated_at DATETIME NULL,
  ADD COLUMN IF NOT EXISTS created_by_user_id VARCHAR(36) NULL,
  ADD COLUMN IF NOT EXISTS updated_by_user_id VARCHAR(36) NULL
`.trim();

/**
 * Adds user attribution and updated_at to folders when upgrading existing databases.
 */
export const FOLDERS_ATTRIBUTION_MIGRATION_SQL = `
ALTER TABLE folders
  ADD COLUMN IF NOT EXISTS updated_at DATETIME NULL,
  ADD COLUMN IF NOT EXISTS created_by_user_id VARCHAR(36) NULL,
  ADD COLUMN IF NOT EXISTS updated_by_user_id VARCHAR(36) NULL
`.trim();

/**
 * Adds nested-folder ancestry to existing folder tables.
 */
export const FOLDERS_PARENT_MIGRATION_SQL = `
ALTER TABLE folders
  ADD COLUMN IF NOT EXISTS parent_folder_id VARCHAR(36) NULL
`.trim();

/**
 * Adds user attribution columns to requests when upgrading existing databases.
 */
export const REQUESTS_ATTRIBUTION_MIGRATION_SQL = `
ALTER TABLE requests
  ADD COLUMN IF NOT EXISTS created_by_user_id VARCHAR(36) NULL,
  ADD COLUMN IF NOT EXISTS updated_by_user_id VARCHAR(36) NULL
`.trim();

/**
 * Adds user attribution columns to users when upgrading existing databases.
 */
export const USERS_ATTRIBUTION_MIGRATION_SQL = `
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS created_by_user_id VARCHAR(36) NULL,
  ADD COLUMN IF NOT EXISTS updated_by_user_id VARCHAR(36) NULL
`.trim();

/**
 * Backfills updated_at on collections from created_at for upgraded databases.
 */
export const COLLECTIONS_BACKFILL_UPDATED_AT_SQL = `
UPDATE collections SET updated_at = created_at WHERE updated_at IS NULL
`.trim();

/**
 * Backfills updated_at on environments from created_at for upgraded databases.
 */
export const ENVIRONMENTS_BACKFILL_UPDATED_AT_SQL = `
UPDATE environments SET updated_at = created_at WHERE updated_at IS NULL
`.trim();

/**
 * Backfills updated_at on folders from created_at for upgraded databases.
 */
export const FOLDERS_BACKFILL_UPDATED_AT_SQL = `
UPDATE folders SET updated_at = created_at WHERE updated_at IS NULL
`.trim();

/**
 * Adds LLM access columns to users when upgrading existing databases.
 */
export const USERS_LLM_MIGRATION_SQL = `
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS llm_access TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS llm_models LONGTEXT NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS llm_monthly_token_limit INT NULL
`.trim();

/**
 * DDL for creating the llm_usage table when absent.
 */
export const LLM_USAGE_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS llm_usage (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  period VARCHAR(7) NOT NULL,
  prompt_tokens INT NOT NULL DEFAULT 0,
  completion_tokens INT NOT NULL DEFAULT 0,
  total_tokens INT NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY llm_usage_user_period (user_id, period),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
)
`.trim();

/**
 * DDL for creating the llm_usage_log table when absent.
 */
export const LLM_USAGE_LOG_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS llm_usage_log (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  api_token_id VARCHAR(36) NULL,
  period VARCHAR(7) NOT NULL,
  model VARCHAR(255) NOT NULL,
  provider VARCHAR(32) NOT NULL,
  prompt_tokens INT NOT NULL,
  completion_tokens INT NOT NULL,
  total_tokens INT NOT NULL,
  is_new_turn BOOLEAN NOT NULL DEFAULT FALSE,
  had_tool_calls BOOLEAN NOT NULL DEFAULT FALSE,
  message_count INT NOT NULL,
  created_at DATETIME NOT NULL,
  INDEX llm_usage_log_user_created_at_idx (user_id, created_at),
  INDEX llm_usage_log_period_idx (period),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (api_token_id) REFERENCES api_tokens(id) ON DELETE SET NULL
)
`.trim();

/**
 * Default LLM models JSON for MySQL user inserts on upgraded databases.
 */
export const MYSQL_DEFAULT_LLM_MODELS_JSON = '[]';

/**
 * Default auth JSON for MySQL collection/request inserts.
 */
export const MYSQL_DEFAULT_AUTH_JSON = DEFAULT_AUTH_JSON;

/**
 * Adds deletion lock columns to collections when upgrading existing databases.
 */
export const COLLECTIONS_DELETION_LOCKED_MIGRATION_SQL = `
ALTER TABLE collections
  ADD COLUMN IF NOT EXISTS deletion_locked TINYINT(1) NOT NULL DEFAULT 0;
`.trim();

/**
 * Adds deletion lock columns to environments when upgrading existing databases.
 */
export const ENVIRONMENTS_DELETION_LOCKED_MIGRATION_SQL = `
ALTER TABLE environments
  ADD COLUMN IF NOT EXISTS deletion_locked TINYINT(1) NOT NULL DEFAULT 0;
`.trim();

/**
 * Adds snippet access column to users when upgrading existing databases.
 */
export const USERS_SNIPPET_ACCESS_MIGRATION_SQL = `
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS snippet_access LONGTEXT NOT NULL DEFAULT '[]';
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
  id VARCHAR(36) PRIMARY KEY,
  kind VARCHAR(64) NOT NULL,
  label VARCHAR(512) NOT NULL,
  collection_name VARCHAR(512),
  request_name VARCHAR(512),
  summary_passed INT NOT NULL DEFAULT 0,
  summary_failed INT NOT NULL DEFAULT 0,
  summary_skipped INT NOT NULL DEFAULT 0,
  payload LONGTEXT NOT NULL,
  created_at DATETIME NOT NULL,
  created_by_user_id VARCHAR(36),
  INDEX run_results_created_idx (created_at)
)
`.trim();

/**
 * DDL for creating the user_invitations table when absent.
 */
export const USER_INVITATIONS_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS user_invitations (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  code_hash CHAR(64) NOT NULL UNIQUE,
  code_prefix VARCHAR(32) NOT NULL,
  expires_at DATETIME NOT NULL,
  redeemed_at DATETIME,
  revoked_at DATETIME,
  created_at DATETIME NOT NULL,
  created_by_user_id VARCHAR(36),
  updated_by_user_id VARCHAR(36),
  INDEX user_invitations_user_id_idx (user_id),
  INDEX user_invitations_expires_at_idx (expires_at),
  CONSTRAINT user_invitations_user_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT user_invitations_created_by_fk FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT user_invitations_updated_by_fk FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
)
`.trim();

/**
 * Tables carrying an optional sidebar marker column.
 */
const MARKER_TABLES = ['collections', 'folders', 'requests', 'documents', 'environments'] as const;

/**
 * Builds the legacy `color` to `marker` column rename for a table.
 *
 * Databases predating the marker rename store the value in a `color` column;
 * renaming in place keeps existing assignments. Uses the same conditional DDL
 * extension as the rest of this file, so it requires MariaDB.
 *
 * @param table - Table whose legacy column is renamed.
 * @returns Idempotent rename statement.
 */
function buildMarkerRenameSql(table: string): string {
  return `ALTER TABLE ${table} RENAME COLUMN IF EXISTS color TO marker`;
}

/**
 * Builds the sidebar marker column addition for a table.
 *
 * @param table - Table receiving the sidebar marker column.
 * @returns Idempotent add-column statement.
 */
function buildMarkerAddSql(table: string): string {
  return `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS marker TEXT`;
}

/**
 * Sidebar marker migrations, renaming legacy columns before adding missing ones
 * so an upgrade never lands on a table holding both `color` and `marker`.
 */
export const MARKER_MIGRATIONS_SQL = [
  ...MARKER_TABLES.map(buildMarkerRenameSql),
  ...MARKER_TABLES.map(buildMarkerAddSql)
];

/**
 * Ordered MySQL migrations applied by {@link MysqlDatabase.migrate}.
 */
export const MYSQL_MIGRATIONS = [
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
  ...MARKER_MIGRATIONS_SQL
];
