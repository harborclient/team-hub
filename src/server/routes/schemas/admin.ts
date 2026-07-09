import { z } from 'zod/v4';
import type { ApiTokenRecord, UserRecord } from '#/db/types.js';
import { userRoleSchema } from '#/server/routes/schemas/auth.js';
import { timestampSchema } from '#/server/routes/schemas/common.js';
import { listLlmModelsResponseSchema } from '#/server/routes/schemas/llm.js';
import {
  createSnippetBodySchema,
  runResultRecordSchema,
  snippetRecordSchema,
  snippetScopeSchema
} from '#/server/routes/schemas/entities.js';

/**
 * Lightweight id/name pair returned by admin resource list routes.
 */
export const adminResourceOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  deletionLocked: z.boolean()
});

/**
 * Response body schema for admin collection/environment configuration updates.
 */
export const adminEntityConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  deletionLocked: z.boolean()
});

/**
 * Request body schema for `PUT /admin/collections/:id`.
 */
export const updateAdminCollectionBodySchema = z.object({
  deletionLocked: z.boolean()
});

/**
 * Request body schema for `PUT /admin/environments/:id`.
 */
export const updateAdminEnvironmentBodySchema = z.object({
  deletionLocked: z.boolean()
});

/**
 * Request body schema for `PUT /admin/snippets/:id`.
 */
export const updateAdminSnippetBodySchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    code: z.string().optional(),
    scope: snippetScopeSchema.optional(),
    deletionLocked: z.boolean().optional()
  })
  .superRefine((body, ctx) => {
    const hasContentFields =
      body.name !== undefined || body.code !== undefined || body.scope !== undefined;
    const hasFullContent =
      body.name !== undefined && body.code !== undefined && body.scope !== undefined;

    if (hasContentFields && !hasFullContent) {
      ctx.addIssue({
        code: 'custom',
        message: 'name, code, and scope must be provided together'
      });
    }

    if (!hasContentFields && body.deletionLocked === undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'Provide snippet content (name, code, scope) and/or deletionLocked'
      });
    }
  });

/**
 * Request body schema for `POST /admin/snippets`.
 */
export const createAdminSnippetBodySchema = createSnippetBodySchema;

/**
 * Response body schema for `GET /admin/collections`.
 */
export const listAdminCollectionsResponseSchema = z.object({
  collections: z.array(adminResourceOptionSchema)
});

/**
 * Response body schema for `GET /admin/environments`.
 */
export const listAdminEnvironmentsResponseSchema = z.object({
  environments: z.array(adminResourceOptionSchema)
});

/**
 * Response body schema for `GET /admin/snippets`.
 */
export const listAdminSnippetsResponseSchema = z.object({
  snippets: z.array(snippetRecordSchema)
});

/**
 * Response body schema for admin run result listing.
 */
export const listAdminRunResultsResponseSchema = z.object({
  runResults: z.array(runResultRecordSchema)
});

/**
 * Response body schema for admin snippet create and content updates.
 */
export const adminSnippetRecordSchema = snippetRecordSchema;

/**
 * Response body schema for `GET /admin/llm/models`.
 */
export const listAdminLlmModelsResponseSchema = listLlmModelsResponseSchema;
export const hubUserRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: userRoleSchema,
  collectionAccess: z.array(z.string()),
  environmentAccess: z.array(z.string()),
  snippetAccess: z.array(z.string()),
  llmAccess: z.boolean(),
  llmModels: z.array(z.string()),
  llmMonthlyTokenLimit: z.number().int().nonnegative().nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema
});

/**
 * User record returned by `GET /admin/users`, including stale access warnings.
 */
export const adminUserListEntrySchema = hubUserRecordSchema.extend({
  warnings: z.array(z.string())
});

/**
 * Response body schema for `GET /admin/users`.
 */
export const listAdminUsersResponseSchema = z.object({
  users: z.array(adminUserListEntrySchema)
});

/**
 * Request body schema for `PUT /admin/users/:id`.
 */
export const updateAdminUserBodySchema = z.object({
  name: z.string().trim().min(1).optional(),
  role: userRoleSchema.optional(),
  collectionAccess: z.array(z.string()).optional(),
  environmentAccess: z.array(z.string()).optional(),
  snippetAccess: z.array(z.string()).optional(),
  llmAccess: z.boolean().optional(),
  llmModels: z.array(z.string()).optional(),
  llmMonthlyTokenLimit: z.number().int().nonnegative().nullable().optional()
});

/**
 * Request body schema for `POST /admin/users`.
 */
export const createAdminUserBodySchema = z.object({
  name: z.string().trim().min(1),
  role: userRoleSchema,
  collectionAccess: z.array(z.string()).optional(),
  environmentAccess: z.array(z.string()).optional(),
  snippetAccess: z.array(z.string()).optional(),
  llmAccess: z.boolean().optional(),
  llmModels: z.array(z.string()).optional(),
  llmMonthlyTokenLimit: z.number().int().nonnegative().nullable().optional()
});

/**
 * API token metadata returned by admin token routes (never includes the secret hash).
 */
export const hubApiTokenRecordSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  tokenPrefix: z.string(),
  createdAt: timestampSchema,
  lastUsedAt: timestampSchema.nullable(),
  revokedAt: timestampSchema.nullable()
});

/**
 * Response body schema for `POST /admin/users`.
 */
export const createAdminUserResponseSchema = z.object({
  user: hubUserRecordSchema,
  token: hubApiTokenRecordSchema,
  secret: z.string()
});

/**
 * Request body schema for `POST /admin/users/:id/tokens`.
 */
export const createAdminTokenBodySchema = z.object({
  name: z.string().trim().min(1)
});

/**
 * Response body schema for `POST /admin/users/:id/tokens`.
 */
export const createdApiTokenResponseSchema = z.object({
  token: hubApiTokenRecordSchema,
  secret: z.string()
});

/**
 * Response body schema for `GET /admin/tokens`.
 */
export const listAdminTokensResponseSchema = z.object({
  tokens: z.array(hubApiTokenRecordSchema)
});

/**
 * Per-section outcome reported by config reload routes.
 */
export const reloadConfigSectionResultSchema = z.object({
  section: z.enum(['db', 'redis', 'llm', 'plugins', 'docs', 'server']),
  status: z.enum(['reloaded', 'unchanged', 'failed', 'restart-required']),
  error: z.string().optional()
});

/**
 * Response body schema for `POST /admin/config/reload`.
 */
export const reloadConfigResponseSchema = z.object({
  sections: z.array(reloadConfigSectionResultSchema),
  fatalError: z.string().optional()
});

/**
 * Serializes a user record for JSON management API responses.
 *
 * @param user - User record from the database layer.
 * @returns User with ISO timestamp strings.
 */
export function serializeHubUser(user: UserRecord) {
  return {
    id: user.id,
    name: user.name,
    role: user.role,
    collectionAccess: user.collectionAccess,
    environmentAccess: user.environmentAccess,
    snippetAccess: user.snippetAccess,
    llmAccess: user.llmAccess,
    llmModels: user.llmModels,
    llmMonthlyTokenLimit: user.llmMonthlyTokenLimit,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString()
  };
}

/**
 * Serializes an API token record for JSON management API responses.
 *
 * @param token - Token record from the database layer.
 * @returns Token metadata with ISO timestamp strings.
 */
export function serializeApiToken(token: ApiTokenRecord) {
  return {
    id: token.id,
    userId: token.userId,
    name: token.name,
    tokenPrefix: token.tokenPrefix,
    createdAt: token.createdAt.toISOString(),
    lastUsedAt: token.lastUsedAt ? token.lastUsedAt.toISOString() : null,
    revokedAt: token.revokedAt ? token.revokedAt.toISOString() : null
  };
}
