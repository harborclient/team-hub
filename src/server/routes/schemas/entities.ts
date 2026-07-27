import { z } from 'zod/v4';
import type {
  CollectionRecord,
  EnvironmentRecord,
  FolderRecord,
  DocumentRecord,
  RunResultRecord,
  SavedRequestRecord,
  SnippetRecord
} from '#/db/types.js';
import {
  authConfigSchema,
  bodyTypeSchema,
  httpMethodSchema,
  keyValueSchema,
  timestampSchema,
  variableSchema
} from '#/server/routes/schemas/common.js';

/**
 * Optional sidebar marker accepted in create/update request bodies.
 */
export const sidebarMarkerBodySchema = z.union([z.string().trim().min(1), z.null()]).optional();

/**
 * JSON shape for a persisted collection record.
 */
export const collectionRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  variables: z.array(variableSchema),
  headers: z.array(keyValueSchema),
  auth: authConfigSchema,
  preRequestScript: z.string(),
  postRequestScript: z.string(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  createdByUserId: z.string().nullable(),
  updatedByUserId: z.string().nullable(),
  deletionLocked: z.boolean(),
  marker: z.string().nullable()
});

/**
 * JSON shape for a persisted environment record.
 */
export const environmentRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  variables: z.array(variableSchema),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  createdByUserId: z.string().nullable(),
  updatedByUserId: z.string().nullable(),
  deletionLocked: z.boolean(),
  marker: z.string().nullable()
});

/**
 * Valid execution scopes for persisted snippets.
 */
export const snippetScopeSchema = z.enum(['pre-request', 'post-request', 'any']);

/**
 * JSON shape for a persisted snippet record.
 */
export const snippetRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string(),
  scope: snippetScopeSchema,
  sortOrder: z.number().int(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  createdByUserId: z.string().nullable(),
  updatedByUserId: z.string().nullable(),
  deletionLocked: z.boolean()
});

/**
 * JSON shape for a persisted folder record.
 */
export const folderRecordSchema = z.object({
  id: z.string(),
  collectionId: z.string(),
  parentFolderId: z.string().nullable(),
  name: z.string(),
  sortOrder: z.number().int(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  createdByUserId: z.string().nullable(),
  updatedByUserId: z.string().nullable(),
  marker: z.string().nullable()
});

/**
 * JSON shape for a persisted saved request record.
 */
export const savedRequestRecordSchema = z.object({
  id: z.string(),
  collectionId: z.string(),
  name: z.string(),
  method: httpMethodSchema,
  url: z.string(),
  headers: z.array(keyValueSchema),
  params: z.array(keyValueSchema),
  auth: authConfigSchema,
  body: z.string(),
  bodyType: bodyTypeSchema,
  preRequestScript: z.string(),
  postRequestScript: z.string(),
  comment: z.string(),
  folderId: z.string().nullable(),
  sortOrder: z.number().int(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  createdByUserId: z.string().nullable(),
  updatedByUserId: z.string().nullable(),
  marker: z.string().nullable()
});

/**
 * Request body for creating a collection.
 */
export const createCollectionBodySchema = z.object({
  name: z.string().trim().min(1),
  marker: sidebarMarkerBodySchema
});

/**
 * Request body for updating a collection.
 */
export const updateCollectionBodySchema = z.object({
  name: z.string().trim().min(1),
  variables: z.array(variableSchema),
  headers: z.array(keyValueSchema),
  preRequestScript: z.string(),
  postRequestScript: z.string(),
  auth: authConfigSchema,
  marker: sidebarMarkerBodySchema
});

/**
 * Request body for creating an environment.
 */
export const createEnvironmentBodySchema = z.object({
  name: z.string().trim().min(1),
  marker: sidebarMarkerBodySchema
});

/**
 * Request body for updating an environment.
 */
export const updateEnvironmentBodySchema = z.object({
  name: z.string().trim().min(1),
  variables: z.array(variableSchema),
  marker: sidebarMarkerBodySchema
});

/**
 * Request body for creating a snippet.
 */
export const createSnippetBodySchema = z.object({
  name: z.string().trim().min(1),
  code: z.string().default(''),
  scope: snippetScopeSchema.default('any')
});

/**
 * Request body for updating a snippet.
 *
 * Sort order is not included: HarborClient's snippet update flow only
 * manages name/code/scope, so the server preserves the existing sort order.
 */
export const updateSnippetBodySchema = z.object({
  name: z.string().trim().min(1),
  code: z.string(),
  scope: snippetScopeSchema
});

/**
 * Request body for creating a folder.
 */
export const createFolderBodySchema = z.object({
  name: z.string().trim().min(1),
  parentFolderId: z.string().nullable().optional(),
  marker: sidebarMarkerBodySchema
});

/**
 * Request body for renaming a folder.
 */
export const renameFolderBodySchema = z.object({
  name: z.string().trim().min(1),
  marker: sidebarMarkerBodySchema
});

/**
 * Request body for reordering folders within a collection.
 */
export const reorderFoldersBodySchema = z.object({
  parentFolderId: z.string().nullable(),
  orderedFolderIds: z.array(z.string().trim().min(1))
});

/**
 * Request body for moving a folder to another parent.
 */
export const moveFolderBodySchema = z.object({
  parentFolderId: z.string().nullable(),
  sortOrder: z.number().int().min(0).optional()
});

/**
 * Request body for creating or updating a saved request.
 */
export const saveRequestBodySchema = z.object({
  name: z.string().trim().min(1),
  method: httpMethodSchema,
  url: z.string(),
  headers: z.array(keyValueSchema),
  params: z.array(keyValueSchema),
  auth: authConfigSchema,
  body: z.string(),
  bodyType: bodyTypeSchema,
  preRequestScript: z.string(),
  postRequestScript: z.string(),
  comment: z.string(),
  folderId: z.string().nullable().optional(),
  marker: sidebarMarkerBodySchema
});

/**
 * Request body for updating an existing saved request.
 */
export const updateSaveRequestBodySchema = saveRequestBodySchema.extend({
  collectionId: z.string().trim().min(1)
});

/**
 * Request body for reordering requests within a folder or collection root.
 */
export const reorderRequestsBodySchema = z.object({
  folderId: z.string().nullable(),
  orderedRequestIds: z.array(z.string().trim().min(1))
});

/**
 * Request body for moving a request to another folder or root index.
 */
export const moveRequestBodySchema = z.object({
  folderId: z.string().nullable(),
  index: z.number().int().min(0)
});

/**
 * List response wrapper for collections.
 */
export const listCollectionsResponseSchema = z.object({
  collections: z.array(collectionRecordSchema)
});

/**
 * List response wrapper for environments.
 */
export const listEnvironmentsResponseSchema = z.object({
  environments: z.array(environmentRecordSchema)
});

/**
 * List response wrapper for snippets.
 */
export const listSnippetsResponseSchema = z.object({
  snippets: z.array(snippetRecordSchema)
});

/**
 * List response wrapper for folders.
 */
export const listFoldersResponseSchema = z.object({
  folders: z.array(folderRecordSchema)
});

/**
 * List response wrapper for saved requests.
 */
export const listRequestsResponseSchema = z.object({
  requests: z.array(savedRequestRecordSchema)
});

/**
 * JSON shape for a persisted collection document record.
 */
export const documentRecordSchema = z.object({
  id: z.string(),
  collectionId: z.string(),
  name: z.string(),
  content: z.string(),
  folderId: z.string().nullable(),
  sortOrder: z.number().int(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  createdByUserId: z.string().nullable(),
  updatedByUserId: z.string().nullable(),
  marker: z.string().nullable()
});

/**
 * Request body for creating or updating a collection document.
 */
export const saveDocumentBodySchema = z.object({
  name: z.string().trim().min(1),
  content: z.string(),
  folderId: z.string().nullable().optional(),
  marker: sidebarMarkerBodySchema
});

/**
 * Request body for updating an existing collection document.
 */
export const updateSaveDocumentBodySchema = saveDocumentBodySchema.extend({
  collectionId: z.string().trim().min(1)
});

/**
 * Request body for reordering documents within a folder or collection root.
 */
export const reorderDocumentsBodySchema = z.object({
  folderId: z.string().nullable(),
  orderedDocumentIds: z.array(z.string().trim().min(1))
});

/**
 * Request body for moving a document to another folder or root index.
 */
export const moveDocumentBodySchema = z.object({
  folderId: z.string().nullable(),
  index: z.number().int().min(0)
});

/**
 * List response wrapper for collection documents.
 */
export const listDocumentsResponseSchema = z.object({
  documents: z.array(documentRecordSchema)
});

/**
 * Empty JSON body schema for 204 No Content responses.
 */
export const emptyResponseSchema = z.null();

/**
 * Serializes a collection record for JSON responses.
 *
 * @param record - Collection record from the database layer.
 * @returns Collection with ISO timestamp strings.
 */
export function serializeCollection(record: CollectionRecord) {
  return {
    ...record,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

/**
 * Serializes an environment record for JSON responses.
 *
 * @param record - Environment record from the database layer.
 * @returns Environment with ISO timestamp strings.
 */
export function serializeEnvironment(record: EnvironmentRecord) {
  return {
    ...record,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

/**
 * Serializes a snippet record for JSON responses.
 *
 * @param record - Snippet record from the database layer.
 * @returns Snippet with ISO timestamp strings.
 */
export function serializeSnippet(record: SnippetRecord) {
  return {
    ...record,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

/**
 * Serializes a folder record for JSON responses.
 *
 * @param record - Folder record from the database layer.
 * @returns Folder with ISO timestamp strings.
 */
export function serializeFolder(record: FolderRecord) {
  return {
    ...record,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

/**
 * Serializes a saved request record for JSON responses.
 *
 * @param record - Saved request record from the database layer.
 * @returns Saved request with ISO timestamp strings.
 */
export function serializeSavedRequest(record: SavedRequestRecord) {
  return {
    ...record,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

/**
 * Serializes a collection document record for JSON responses.
 *
 * @param record - Document record from the database layer.
 * @returns Document with ISO timestamp strings.
 */
export function serializeDocument(record: DocumentRecord) {
  return {
    ...record,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

/**
 * JSON shape for a persisted run result list record.
 */
export const runResultRecordSchema = z.object({
  id: z.string(),
  kind: z.enum(['collection-run-results', 'request-run-results']),
  label: z.string(),
  collectionName: z.string().nullable(),
  requestName: z.string().nullable(),
  summary: z.object({
    passed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative()
  }),
  createdAt: timestampSchema,
  createdByUserId: z.string().nullable()
});

/**
 * JSON shape for a run result detail response including payload.
 */
export const runResultDetailSchema = runResultRecordSchema.extend({
  payload: z.record(z.string(), z.unknown())
});

/**
 * Request body schema for `POST /run-results`.
 */
export const createRunResultBodySchema = z.object({
  label: z.string().trim().min(1).optional(),
  payload: z.record(z.string(), z.unknown())
});

/**
 * List response wrapper for run results.
 */
export const listRunResultsResponseSchema = z.object({
  runResults: z.array(runResultRecordSchema)
});

/**
 * Serializes a run result record for JSON list responses.
 *
 * @param record - Run result record from the database layer.
 * @returns Run result metadata without the stored payload body.
 */
export function serializeRunResult(record: RunResultRecord) {
  return {
    id: record.id,
    kind: record.kind,
    label: record.label,
    collectionName: record.collectionName,
    requestName: record.requestName,
    summary: record.summary,
    createdAt: record.createdAt.toISOString(),
    createdByUserId: record.createdByUserId
  };
}

/**
 * Serializes a run result record for JSON detail responses.
 *
 * @param record - Run result record from the database layer.
 * @returns Run result metadata plus the stored payload body.
 */
export function serializeRunResultDetail(record: RunResultRecord) {
  return {
    ...serializeRunResult(record),
    payload: record.payload
  };
}
