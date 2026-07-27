import type {
  ApiTokenRecord,
  AuditEntityType,
  AuditLogRecord,
  CollectionRecord,
  EnvironmentRecord,
  FolderRecord,
  InvitationRecord,
  SnippetRecord,
  LlmUsageRecord,
  LlmUsageLogRecord,
  RunResultRecord,
  SavedRequestRecord,
  DocumentRecord,
  UserRecord
} from '#/db/types.js';
import type {
  FirestoreApiTokenDocument,
  FirestoreAuditLogDocument,
  FirestoreCollectionDocument,
  FirestoreEnvironmentDocument,
  FirestoreInvitationDocument,
  FirestoreSnippetDocument,
  FirestoreFolderDocument,
  FirestoreLlmUsageDocument,
  FirestoreLlmUsageLogDocument,
  FirestoreRequestDocument,
  FirestoreDocumentDocument,
  FirestoreRunResultDocument,
  FirestoreUserDocument
} from '#/db/firestore/types.js';
import { readSidebarMarker } from '#/db/sidebarMarker.js';

/**
 * Parses a stored entity type string into a typed {@link AuditEntityType}.
 *
 * @param value - Entity type from storage.
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
 * Maps a Firestore document to the shared {@link InvitationRecord} shape.
 *
 * @param id - Document identifier.
 * @param data - Stored invitation fields.
 * @returns Normalized invitation record for application code.
 */
export function mapFirestoreInvitation(
  id: string,
  data: FirestoreInvitationDocument
): InvitationRecord {
  return {
    id,
    userId: data.userId,
    codeHash: data.codeHash,
    codePrefix: data.codePrefix,
    expiresAt: data.expiresAt,
    redeemedAt: data.redeemedAt,
    revokedAt: data.revokedAt,
    createdAt: data.createdAt,
    createdByUserId: data.createdByUserId ?? null,
    updatedByUserId: data.updatedByUserId ?? null
  };
}

/**
 * Maps a Firestore document to the shared {@link ApiTokenRecord} shape.
 *
 * @param id - Document identifier.
 * @param data - Stored token fields.
 * @returns Normalized token record for application code.
 */
export function mapFirestoreApiToken(id: string, data: FirestoreApiTokenDocument): ApiTokenRecord {
  if (!data.userId) {
    throw new Error(`API token ${id} is missing a userId`);
  }

  return {
    id,
    userId: data.userId,
    name: data.name,
    tokenHash: data.tokenHash,
    tokenPrefix: data.tokenPrefix,
    createdAt: data.createdAt,
    lastUsedAt: data.lastUsedAt,
    revokedAt: data.revokedAt,
    createdByUserId: data.createdByUserId ?? null,
    updatedByUserId: data.updatedByUserId ?? null
  };
}

/**
 * Maps a Firestore document to the shared {@link UserRecord} shape.
 *
 * @param id - Document identifier.
 * @param data - Stored user fields.
 * @returns Normalized user record for application code.
 */
export function mapFirestoreUser(id: string, data: FirestoreUserDocument): UserRecord {
  return {
    id,
    name: data.name,
    role: data.role,
    collectionAccess: data.collectionAccess,
    environmentAccess: data.environmentAccess,
    snippetAccess: data.snippetAccess ?? [],
    llmAccess: data.llmAccess ?? false,
    llmModels: data.llmModels ?? [],
    llmMonthlyTokenLimit: data.llmMonthlyTokenLimit ?? null,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    createdByUserId: data.createdByUserId ?? null,
    updatedByUserId: data.updatedByUserId ?? null
  };
}

/**
 * Maps a Firestore document to the shared {@link LlmUsageRecord} shape.
 *
 * @param id - Document identifier.
 * @param data - Stored LLM usage fields.
 * @returns Normalized usage record for application code.
 */
export function mapFirestoreLlmUsage(id: string, data: FirestoreLlmUsageDocument): LlmUsageRecord {
  return {
    id,
    userId: data.userId,
    period: data.period,
    promptTokens: data.promptTokens,
    completionTokens: data.completionTokens,
    totalTokens: data.totalTokens,
    updatedAt: data.updatedAt
  };
}

/**
 * Maps a Firestore document to the shared {@link LlmUsageLogRecord} shape.
 *
 * @param id - Document identifier.
 * @param data - Stored LLM usage log fields.
 * @returns Normalized usage log record for application code.
 */
export function mapFirestoreLlmUsageLog(
  id: string,
  data: FirestoreLlmUsageLogDocument
): LlmUsageLogRecord {
  return {
    id,
    userId: data.userId,
    apiTokenId: data.apiTokenId,
    period: data.period,
    model: data.model,
    provider: data.provider as LlmUsageLogRecord['provider'],
    promptTokens: data.promptTokens,
    completionTokens: data.completionTokens,
    totalTokens: data.totalTokens,
    isNewTurn: data.isNewTurn,
    hadToolCalls: data.hadToolCalls,
    messageCount: data.messageCount,
    createdAt: data.createdAt
  };
}

/**
 * Maps a Firestore document to the shared {@link CollectionRecord} shape.
 *
 * @param id - Document identifier.
 * @param data - Stored collection fields.
 * @returns Normalized collection record for application code.
 */
export function mapFirestoreCollection(
  id: string,
  data: FirestoreCollectionDocument
): CollectionRecord {
  return {
    id,
    name: data.name,
    variables: data.variables,
    headers: data.headers,
    auth: data.auth,
    preRequestScript: data.preRequestScript,
    postRequestScript: data.postRequestScript,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt ?? data.createdAt,
    createdByUserId: data.createdByUserId ?? null,
    updatedByUserId: data.updatedByUserId ?? null,
    deletionLocked: data.deletionLocked ?? false,
    marker: readSidebarMarker(data.marker)
  };
}

/**
 * Maps a Firestore document to the shared {@link EnvironmentRecord} shape.
 *
 * @param id - Document identifier.
 * @param data - Stored environment fields.
 * @returns Normalized environment record for application code.
 */
export function mapFirestoreEnvironment(
  id: string,
  data: FirestoreEnvironmentDocument
): EnvironmentRecord {
  return {
    id,
    name: data.name,
    variables: data.variables,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt ?? data.createdAt,
    createdByUserId: data.createdByUserId ?? null,
    updatedByUserId: data.updatedByUserId ?? null,
    deletionLocked: data.deletionLocked ?? false,
    marker: readSidebarMarker(data.marker)
  };
}

/**
 * Maps a Firestore document to the shared {@link SnippetRecord} shape.
 *
 * @param id - Document identifier.
 * @param data - Stored snippet fields.
 * @returns Normalized snippet record for application code.
 */
export function mapFirestoreSnippet(id: string, data: FirestoreSnippetDocument): SnippetRecord {
  return {
    id,
    name: data.name,
    code: data.code,
    scope: data.scope,
    sortOrder: data.sortOrder,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt ?? data.createdAt,
    createdByUserId: data.createdByUserId ?? null,
    updatedByUserId: data.updatedByUserId ?? null,
    deletionLocked: data.deletionLocked ?? false
  };
}

/**
 * Maps a Firestore document to the shared {@link FolderRecord} shape.
 *
 * @param id - Document identifier.
 * @param data - Stored folder fields.
 * @returns Normalized folder record for application code.
 */
export function mapFirestoreFolder(id: string, data: FirestoreFolderDocument): FolderRecord {
  return {
    id,
    collectionId: data.collectionId,
    parentFolderId: data.parentFolderId ?? null,
    name: data.name,
    sortOrder: data.sortOrder,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt ?? data.createdAt,
    createdByUserId: data.createdByUserId ?? null,
    updatedByUserId: data.updatedByUserId ?? null,
    marker: readSidebarMarker(data.marker)
  };
}

/**
 * Maps a Firestore document to the shared {@link SavedRequestRecord} shape.
 *
 * @param id - Document identifier.
 * @param data - Stored request fields.
 * @returns Normalized saved request record for application code.
 */
export function mapFirestoreRequest(
  id: string,
  data: FirestoreRequestDocument
): SavedRequestRecord {
  return {
    id,
    collectionId: data.collectionId,
    folderId: data.folderId,
    name: data.name,
    method: data.method as SavedRequestRecord['method'],
    url: data.url,
    headers: data.headers,
    params: data.params,
    auth: data.auth,
    body: data.body,
    bodyType: data.bodyType as SavedRequestRecord['bodyType'],
    preRequestScript: data.preRequestScript,
    postRequestScript: data.postRequestScript,
    comment: data.comment,
    sortOrder: data.sortOrder,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    createdByUserId: data.createdByUserId ?? null,
    updatedByUserId: data.updatedByUserId ?? null,
    marker: readSidebarMarker(data.marker)
  };
}

/**
 * Maps a Firestore document to the shared {@link DocumentRecord} shape.
 *
 * @param id - Document identifier.
 * @param data - Stored collection document fields.
 * @returns Normalized document record for application code.
 */
export function mapFirestoreDocument(id: string, data: FirestoreDocumentDocument): DocumentRecord {
  return {
    id,
    collectionId: data.collectionId,
    folderId: data.folderId,
    name: data.name,
    content: data.content,
    sortOrder: data.sortOrder,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    createdByUserId: data.createdByUserId ?? null,
    updatedByUserId: data.updatedByUserId ?? null,
    marker: readSidebarMarker(data.marker)
  };
}

/**
 * Maps a Firestore document to the shared {@link RunResultRecord} shape.
 *
 * @param id - Document identifier.
 * @param data - Stored run result fields.
 * @returns Normalized run result record for application code.
 */
export function mapFirestoreRunResult(
  id: string,
  data: FirestoreRunResultDocument
): RunResultRecord {
  return {
    id,
    kind: data.kind,
    label: data.label,
    collectionName: data.collectionName,
    requestName: data.requestName,
    summary: data.summary,
    payload: data.payload,
    createdAt: data.createdAt,
    createdByUserId: data.createdByUserId ?? null
  };
}

/**
 * Maps a Firestore document to the shared {@link AuditLogRecord} shape.
 *
 * @param id - Document identifier.
 * @param data - Stored audit log fields.
 * @returns Normalized audit log record for application code.
 */
export function mapFirestoreAuditLog(id: string, data: FirestoreAuditLogDocument): AuditLogRecord {
  return {
    id,
    userId: data.userId,
    userName: data.userName,
    action: data.action,
    entityType: parseAuditEntityType(data.entityType),
    entityId: data.entityId,
    createdAt: data.createdAt,
    metadata: data.metadata
  };
}

/**
 * Returns nullable attribution fields with defaults for legacy Firestore documents.
 *
 * @param createdByUserId - Stored creating user id, if any.
 * @param updatedByUserId - Stored updating user id, if any.
 * @returns Normalized attribution pair.
 */
export function normalizeAttributionFields(
  createdByUserId: string | null | undefined,
  updatedByUserId: string | null | undefined
): { createdByUserId: string | null; updatedByUserId: string | null } {
  return {
    createdByUserId: createdByUserId ?? null,
    updatedByUserId: updatedByUserId ?? null
  };
}
