import type { AuditAction, AuditEntityType, AuditLogRecord } from '#/db/types.js';

/**
 * SQL row shape returned by relational backends for the audit_log table.
 */
export interface AuditLogSqlRow {
  /**
   * Primary key identifier.
   */
  id: string;

  /**
   * Acting user identifier column, when known.
   */
  user_id: string | null;

  /**
   * Snapshot of the acting user's display name at write time.
   */
  user_name: string | null;

  /**
   * CRUD or structural action performed.
   */
  action: string;

  /**
   * Entity kind affected by the action.
   */
  entity_type: string;

  /**
   * Identifier of the affected entity.
   */
  entity_id: string;

  /**
   * When the action was recorded.
   */
  created_at: Date;

  /**
   * JSON-encoded optional context for the action.
   */
  metadata: string;
}

/**
 * Parses a stored audit action string into a typed {@link AuditAction}.
 *
 * @param value - Action column from storage.
 * @returns Validated audit action.
 * @throws {Error} When the stored action is not recognized.
 */
function parseAuditAction(value: string): AuditAction {
  if (
    value === 'create' ||
    value === 'update' ||
    value === 'delete' ||
    value === 'reorder' ||
    value === 'move'
  ) {
    return value;
  }

  throw new Error(`Invalid audit action: ${value}`);
}

/**
 * Parses a stored entity type string into a typed {@link AuditEntityType}.
 *
 * @param value - Entity type column from storage.
 * @returns Validated entity type.
 * @throws {Error} When the stored entity type is not recognized.
 */
function parseAuditEntityType(value: string): AuditEntityType {
  if (
    value === 'user' ||
    value === 'api_token' ||
    value === 'invitation' ||
    value === 'collection' ||
    value === 'environment' ||
    value === 'snippet' ||
    value === 'folder' ||
    value === 'request' ||
    value === 'document' ||
    value === 'run_result'
  ) {
    return value;
  }

  throw new Error(`Invalid audit entity type: ${value}`);
}

/**
 * Parses optional JSON metadata from an audit log row.
 *
 * @param value - Raw metadata column text.
 * @returns Parsed metadata object, or null when empty or invalid.
 */
function parseAuditMetadata(value: string): Record<string, unknown> | null {
  if (!value || value === '{}') {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed != null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * Maps a snake_case SQL row to the shared {@link AuditLogRecord} shape.
 *
 * @param row - Database row from audit_log.
 * @returns Normalized audit log record for application code.
 */
export function mapAuditLogSqlRow(row: AuditLogSqlRow): AuditLogRecord {
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    action: parseAuditAction(row.action),
    entityType: parseAuditEntityType(row.entity_type),
    entityId: row.entity_id,
    createdAt: row.created_at,
    metadata: parseAuditMetadata(row.metadata)
  };
}

/**
 * Serializes optional audit metadata for SQL storage.
 *
 * @param metadata - Context object to persist, or null when none.
 * @returns JSON string suitable for a TEXT column.
 */
export function serializeAuditMetadata(metadata: Record<string, unknown> | null): string {
  return JSON.stringify(metadata ?? {});
}

/**
 * Input describing a single audit log entry to persist.
 */
export interface RecordAuditInput {
  /**
   * Acting user identifier.
   */
  userId: string;

  /**
   * Snapshot of the acting user's display name.
   */
  userName: string | null;

  /**
   * Action performed on the entity.
   */
  action: AuditAction;

  /**
   * Kind of entity affected.
   */
  entityType: AuditEntityType;

  /**
   * Identifier of the affected entity.
   */
  entityId: string;

  /**
   * Optional structured context for the action.
   */
  metadata?: Record<string, unknown> | null;
}
