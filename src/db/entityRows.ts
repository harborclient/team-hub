import type {
  AuthConfig,
  BodyType,
  CollectionRecord,
  EnvironmentRecord,
  FolderRecord,
  RunResultKind,
  RunResultRecord,
  SnippetRecord,
  SnippetScope,
  HttpMethod,
  KeyValue,
  SavedRequestRecord,
  DocumentRecord,
  Variable
} from '#/db/types.js';
import { defaultAuth, normalizeAuth, normalizeVariable } from '#/db/types.js';
import { readSidebarMarker } from '#/db/sidebarMarker.js';

/**
 * Parses a JSON string, returning a fallback value on failure.
 *
 * @param value - Raw JSON text.
 * @param fallback - Value returned when parsing fails.
 * @returns Parsed value or fallback.
 */
function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/**
 * Parses auth JSON from a database row, falling back to defaultAuth when absent or invalid.
 *
 * @param value - Raw auth column from storage.
 * @returns Normalized AuthConfig.
 */
function readAuth(value: string): AuthConfig {
  return normalizeAuth(parseJson(value, defaultAuth()));
}

/**
 * Parses and normalizes variable rows from storage.
 *
 * @param value - Raw variables JSON text.
 * @returns Normalized Variable array.
 */
function readVariables(value: string): Variable[] {
  return parseJson<Partial<Variable>[]>(value, []).map(normalizeVariable);
}

/**
 * SQL row shape returned by relational backends for the collections table.
 */
export interface CollectionSqlRow {
  /**
   * Primary key identifier.
   */
  id: string;

  /**
   * Display name column.
   */
  name: string;

  /**
   * JSON-encoded variables column.
   */
  variables: string;

  /**
   * JSON-encoded headers column.
   */
  headers: string;

  /**
   * JSON-encoded auth column.
   */
  auth: string;

  /**
   * Pre-request script column.
   */
  pre_request_script: string;

  /**
   * Post-request script column.
   */
  post_request_script: string;

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
   * Deletion lock column.
   */
  deletion_locked: boolean;

  /**
   * Optional sidebar marker column.
   */
  marker: string | null;
}

/**
 * SQL row shape returned by relational backends for the environments table.
 */
export interface EnvironmentSqlRow {
  /**
   * Primary key identifier.
   */
  id: string;

  /**
   * Display name column.
   */
  name: string;

  /**
   * JSON-encoded variables column.
   */
  variables: string;

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
   * Deletion lock column.
   */
  deletion_locked: boolean;

  /**
   * Optional sidebar marker column.
   */
  marker: string | null;
}

/**
 * SQL row shape returned by relational backends for the snippets table.
 */
export interface SnippetSqlRow {
  /**
   * Primary key identifier.
   */
  id: string;

  /**
   * Display name column.
   */
  name: string;

  /**
   * JavaScript source column.
   */
  code: string;

  /**
   * Execution scope column.
   */
  scope: string;

  /**
   * Sidebar ordering column.
   */
  sort_order: number;

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
   * Deletion lock column.
   */
  deletion_locked: boolean;
}

/**
 * SQL row shape returned by relational backends for the folders table.
 */
export interface FolderSqlRow {
  /**
   * Primary key identifier.
   */
  id: string;

  /**
   * Parent collection identifier column.
   */
  collection_id: string;

  /**
   * Optional parent folder identifier column.
   */
  parent_folder_id: string | null;

  /**
   * Display name column.
   */
  name: string;

  /**
   * Sort order column.
   */
  sort_order: number;

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
   * Optional sidebar marker column.
   */
  marker: string | null;
}

/**
 * SQL row shape returned by relational backends for the requests table.
 */
export interface RequestSqlRow {
  /**
   * Primary key identifier.
   */
  id: string;

  /**
   * Parent collection identifier column.
   */
  collection_id: string;

  /**
   * Optional parent folder identifier column.
   */
  folder_id: string | null;

  /**
   * Display name column.
   */
  name: string;

  /**
   * HTTP method column.
   */
  method: string;

  /**
   * Request URL column.
   */
  url: string;

  /**
   * JSON-encoded headers column.
   */
  headers: string;

  /**
   * JSON-encoded params column.
   */
  params: string;

  /**
   * JSON-encoded auth column.
   */
  auth: string;

  /**
   * Request body column.
   */
  body: string;

  /**
   * Body type column.
   */
  body_type: string;

  /**
   * Pre-request script column.
   */
  pre_request_script: string;

  /**
   * Post-request script column.
   */
  post_request_script: string;

  /**
   * Comment column.
   */
  comment: string;

  /**
   * Sort order column.
   */
  sort_order: number;

  /**
   * Creation timestamp column.
   */
  created_at: Date;

  /**
   * Last-updated timestamp column.
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
   * Optional sidebar marker column.
   */
  marker: string | null;
}

/**
 * SQL row shape returned by relational backends for the documents table.
 */
export interface DocumentSqlRow {
  /**
   * Primary key identifier.
   */
  id: string;

  /**
   * Parent collection identifier column.
   */
  collection_id: string;

  /**
   * Optional parent folder identifier column.
   */
  folder_id: string | null;

  /**
   * Display name column.
   */
  name: string;

  /**
   * Markdown body content column.
   */
  content: string;

  /**
   * Sort order column.
   */
  sort_order: number;

  /**
   * Creation timestamp column.
   */
  created_at: Date;

  /**
   * Last-updated timestamp column.
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
   * Optional sidebar marker column.
   */
  marker: string | null;
}

/**
 * Maps a snake_case SQL row to the shared {@link CollectionRecord} shape.
 *
 * @param row - Database row from collections.
 * @returns Normalized collection record for application code.
 */
export function mapCollectionSqlRow(row: CollectionSqlRow): CollectionRecord {
  return {
    id: row.id,
    name: row.name,
    variables: readVariables(row.variables),
    headers: parseJson<KeyValue[]>(row.headers, []),
    auth: readAuth(row.auth),
    preRequestScript: row.pre_request_script,
    postRequestScript: row.post_request_script,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.created_at,
    createdByUserId: row.created_by_user_id ?? null,
    updatedByUserId: row.updated_by_user_id ?? null,
    deletionLocked: Boolean(row.deletion_locked),
    marker: readSidebarMarker(row.marker)
  };
}

/**
 * Maps a snake_case SQL row to the shared {@link EnvironmentRecord} shape.
 *
 * @param row - Database row from environments.
 * @returns Normalized environment record for application code.
 */
export function mapEnvironmentSqlRow(row: EnvironmentSqlRow): EnvironmentRecord {
  return {
    id: row.id,
    name: row.name,
    variables: readVariables(row.variables),
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.created_at,
    createdByUserId: row.created_by_user_id ?? null,
    updatedByUserId: row.updated_by_user_id ?? null,
    deletionLocked: Boolean(row.deletion_locked),
    marker: readSidebarMarker(row.marker)
  };
}

/**
 * Parses a stored snippet scope string into a {@link SnippetScope}.
 *
 * @param value - Scope value read from the database.
 * @returns Validated snippet scope.
 * @throws {Error} When the stored scope is not recognized.
 */
function parseSnippetScope(value: string): SnippetScope {
  if (value === 'pre-request' || value === 'post-request' || value === 'any') {
    return value;
  }

  throw new Error(`Invalid snippet scope: ${value}`);
}

/**
 * Maps a snake_case SQL row to the shared {@link SnippetRecord} shape.
 *
 * @param row - Database row from snippets.
 * @returns Normalized snippet record for application code.
 */
export function mapSnippetSqlRow(row: SnippetSqlRow): SnippetRecord {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    scope: parseSnippetScope(row.scope),
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.created_at,
    createdByUserId: row.created_by_user_id ?? null,
    updatedByUserId: row.updated_by_user_id ?? null,
    deletionLocked: Boolean(row.deletion_locked)
  };
}

/**
 * SQL row shape for persisted run results.
 */
export interface RunResultSqlRow {
  id: string;
  kind: RunResultKind;
  label: string;
  collection_name: string | null;
  request_name: string | null;
  summary_passed: number;
  summary_failed: number;
  summary_skipped: number;
  payload: string;
  created_at: Date;
  created_by_user_id: string | null;
}

/**
 * Maps a snake_case SQL row to the shared {@link RunResultRecord} shape.
 *
 * @param row - Database row from run_results.
 * @returns Normalized run result record for application code.
 */
export function mapRunResultSqlRow(row: RunResultSqlRow): RunResultRecord {
  return {
    id: row.id,
    kind: row.kind,
    label: row.label,
    collectionName: row.collection_name,
    requestName: row.request_name,
    summary: {
      passed: row.summary_passed,
      failed: row.summary_failed,
      skipped: row.summary_skipped
    },
    payload: parseJson<Record<string, unknown>>(row.payload, {}),
    createdAt: row.created_at,
    createdByUserId: row.created_by_user_id ?? null
  };
}

/**
 * Maps a snake_case SQL row to the shared {@link FolderRecord} shape.
 *
 * @param row - Database row from folders.
 * @returns Normalized folder record for application code.
 */
export function mapFolderSqlRow(row: FolderSqlRow): FolderRecord {
  return {
    id: row.id,
    collectionId: row.collection_id,
    parentFolderId: row.parent_folder_id,
    name: row.name,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.created_at,
    createdByUserId: row.created_by_user_id ?? null,
    updatedByUserId: row.updated_by_user_id ?? null,
    marker: readSidebarMarker(row.marker)
  };
}

/**
 * Maps a snake_case SQL row to the shared {@link SavedRequestRecord} shape.
 *
 * @param row - Database row from requests.
 * @returns Normalized saved request record for application code.
 */
export function mapRequestSqlRow(row: RequestSqlRow): SavedRequestRecord {
  return {
    id: row.id,
    collectionId: row.collection_id,
    folderId: row.folder_id,
    name: row.name,
    method: row.method as HttpMethod,
    url: row.url,
    headers: parseJson<KeyValue[]>(row.headers, []),
    params: parseJson<KeyValue[]>(row.params, []),
    auth: readAuth(row.auth),
    body: row.body,
    bodyType: row.body_type as BodyType,
    preRequestScript: row.pre_request_script,
    postRequestScript: row.post_request_script,
    comment: row.comment,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdByUserId: row.created_by_user_id ?? null,
    updatedByUserId: row.updated_by_user_id ?? null,
    marker: readSidebarMarker(row.marker)
  };
}

/**
 * Maps a snake_case SQL row to the shared {@link DocumentRecord} shape.
 *
 * @param row - Database row from documents.
 * @returns Normalized document record for application code.
 */
export function mapDocumentSqlRow(row: DocumentSqlRow): DocumentRecord {
  return {
    id: row.id,
    collectionId: row.collection_id,
    folderId: row.folder_id,
    name: row.name,
    content: row.content,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdByUserId: row.created_by_user_id ?? null,
    updatedByUserId: row.updated_by_user_id ?? null,
    marker: readSidebarMarker(row.marker)
  };
}
