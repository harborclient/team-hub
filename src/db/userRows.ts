import type { UserRecord, UserRole } from '#/db/types.js';

/**
 * SQL row shape returned by relational backends for the users table.
 */
export interface UserSqlRow {
  /**
   * Primary key identifier.
   */
  id: string;

  /**
   * Unique display name column.
   */
  name: string;

  /**
   * Role column (`admin` or `user`).
   */
  role: string;

  /**
   * JSON-encoded collection access list column.
   */
  collection_access: string;

  /**
   * JSON-encoded environment access list column.
   */
  environment_access: string;

  /**
   * JSON-encoded snippet access list column.
   */
  snippet_access: string;

  /**
   * Creation timestamp column.
   */
  created_at: Date;

  /**
   * Last update timestamp column.
   */
  updated_at: Date;

  /**
   * Creating user identifier column.
   */
  created_by_user_id: string | null;

  /**
   * Last updating user identifier column.
   */
  updated_by_user_id: string | null;

  /**
   * Whether LLM access is enabled for the account.
   */
  llm_access: boolean;

  /**
   * JSON-encoded LLM model access list column.
   */
  llm_models: string;

  /**
   * Monthly token limit column, or null for unlimited.
   */
  llm_monthly_token_limit: number | null;
}

/**
 * Parses a stored role string into a {@link UserRole}.
 *
 * @param role - Role value read from the database.
 * @returns Validated user role.
 * @throws {Error} When the stored role is not recognized.
 */
function parseUserRole(role: string): UserRole {
  if (role === 'admin' || role === 'user') {
    return role;
  }

  throw new Error(`Invalid user role: ${role}`);
}

/**
 * Parses a JSON-encoded access list column from SQL storage.
 *
 * @param value - JSON array string from the database.
 * @returns Parsed access id list.
 */
function parseAccessList(value: string | null | undefined): string[] {
  if (value == null || value === '') {
    return [];
  }

  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || !parsed.every((entry) => typeof entry === 'string')) {
    throw new Error('Invalid access list JSON in users table');
  }

  return parsed;
}

/**
 * Maps a snake_case SQL row to the shared {@link UserRecord} shape.
 *
 * @param row - Database row from users.
 * @returns Normalized user record for application code.
 */
export function mapUserSqlRow(row: UserSqlRow): UserRecord {
  return {
    id: row.id,
    name: row.name,
    role: parseUserRole(row.role),
    collectionAccess: parseAccessList(row.collection_access),
    environmentAccess: parseAccessList(row.environment_access),
    snippetAccess: parseAccessList(row.snippet_access),
    llmAccess: Boolean(row.llm_access),
    llmModels: parseAccessList(row.llm_models),
    llmMonthlyTokenLimit: row.llm_monthly_token_limit,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdByUserId: row.created_by_user_id ?? null,
    updatedByUserId: row.updated_by_user_id ?? null
  };
}

/**
 * Serializes an access list for SQL storage.
 *
 * @param access - Collection or environment access ids.
 * @returns JSON string suitable for a TEXT column.
 */
export function serializeAccessList(access: string[]): string {
  return JSON.stringify(access);
}

/**
 * Column list for SELECT queries against the users table.
 */
export const USER_SELECT_COLUMNS = `id, name, role, collection_access, environment_access, snippet_access, llm_access, llm_models, llm_monthly_token_limit, created_at, updated_at, created_by_user_id, updated_by_user_id`;

/**
 * Column list for SELECT queries against the collections table.
 */
export const COLLECTION_SELECT_COLUMNS = `id, name, variables, headers, auth, pre_request_script, post_request_script, created_at, updated_at, created_by_user_id, updated_by_user_id, deletion_locked, marker`;

/**
 * Column list for SELECT queries against the environments table.
 */
export const ENVIRONMENT_SELECT_COLUMNS = `id, name, variables, created_at, updated_at, created_by_user_id, updated_by_user_id, deletion_locked, marker`;

/**
 * Column list for SELECT queries against the snippets table.
 */
export const SNIPPET_SELECT_COLUMNS = `id, name, code, scope, sort_order, created_at, updated_at, created_by_user_id, updated_by_user_id, deletion_locked`;

/**
 * Column list for SELECT queries against the folders table.
 */
export const FOLDER_SELECT_COLUMNS = `id, collection_id, parent_folder_id, name, sort_order, created_at, updated_at, created_by_user_id, updated_by_user_id, marker`;

/**
 * Column list for SELECT queries against the requests table.
 */
export const REQUEST_SELECT_COLUMNS = `id, collection_id, folder_id, name, method, url, headers, params, auth, body, body_type, pre_request_script, post_request_script, comment, sort_order, created_at, updated_at, created_by_user_id, updated_by_user_id, marker`;

/**
 * Column list for SELECT queries against the documents table.
 */
export const DOCUMENT_SELECT_COLUMNS = `id, collection_id, folder_id, name, content, sort_order, created_at, updated_at, created_by_user_id, updated_by_user_id, marker`;

/**
 * Column list for SELECT queries against the api_tokens table.
 */
export const API_TOKEN_SELECT_COLUMNS = `id, user_id, name, token_hash, token_prefix, created_at, last_used_at, revoked_at, created_by_user_id, updated_by_user_id`;

/**
 * Column list for SELECT queries against the audit_log table.
 */
export const AUDIT_LOG_SELECT_COLUMNS = `id, user_id, user_name, action, entity_type, entity_id, created_at, metadata`;
