import type { FastifyInstance, FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { IDatabase } from '#/db/IDatabase.js';
import type { UserRole } from '#/db/types.js';
import { isSystemUser } from '#/db/systemUsers.js';
import {
  buildAccessCatalogIds,
  buildAccessListWarnings,
  buildAdminUserCreateInput,
  buildAdminUserUpdateInput,
  validateSubmittedAccessLists
} from '#/server/admin/userValidation.js';
import { canUseManagementApi } from '#/server/auth/accessControl.js';
import { generateApiToken } from '#/server/auth/apiTokens.js';
import { generateInvitation, resolveInvitationExpiresAt } from '#/server/auth/invitations.js';
import { getHubLlmCapabilities, listHubOfferedModels } from '#/server/llm/models.js';
import { handleDbError, handleValidationError } from '#/server/routes/errors.js';
import { denyUnlessAllowed, requireAuthenticatedUser } from '#/server/routes/authorize.js';
import {
  createAdminTokenBodySchema,
  createAdminUserBodySchema,
  createAdminUserResponseSchema,
  createAdminSnippetBodySchema,
  createdApiTokenResponseSchema,
  adminEntityConfigSchema,
  adminSnippetRecordSchema,
  hubUserRecordSchema,
  listAdminCollectionsResponseSchema,
  listAdminEnvironmentsResponseSchema,
  listAdminLlmModelsResponseSchema,
  listAdminSnippetsResponseSchema,
  listAdminRunResultsResponseSchema,
  listAdminTokensResponseSchema,
  listAdminUsersResponseSchema,
  reloadConfigResponseSchema,
  serializeApiToken,
  serializeHubUser,
  updateAdminCollectionBodySchema,
  updateAdminEnvironmentBodySchema,
  updateAdminSnippetBodySchema,
  updateAdminUserBodySchema
} from '#/server/routes/schemas/admin.js';
import {
  createAdminInvitedUserBodySchema,
  createAdminInvitationResponseSchema,
  listAdminInvitationsResponseSchema,
  serializeHubInvitation
} from '#/server/routes/schemas/invitations.js';
import {
  errorResponseSchema,
  idParamSchema,
  collectionIdParamSchema
} from '#/server/routes/schemas/common.js';
import {
  emptyResponseSchema,
  listDocumentsResponseSchema,
  listFoldersResponseSchema,
  listRequestsResponseSchema,
  serializeDocument,
  serializeFolder,
  serializeRunResult,
  serializeSavedRequest,
  serializeSnippet
} from '#/server/routes/schemas/entities.js';
import type { LlmConfig } from '#/config/llmConfig.js';
import type { ReloadResult } from '#/server/runtimeContext.js';

/**
 * Options for registering management routes.
 */
export interface RegisterAdminRoutesOptions {
  /**
   * Database used to read user accounts and entity metadata.
   */
  db: IDatabase;

  /**
   * Returns the current normalized LLM configuration from server.yaml.
   */
  getLlm: () => LlmConfig | null;

  /**
   * Reloads server.yaml and returns a per-section report.
   */
  reloadConfig: () => Promise<ReloadResult>;
}

/**
 * Sends a 503 response when LLM support is not configured on the hub.
 *
 * @param reply - Fastify reply used to short-circuit the handler.
 */
function sendLlmUnavailable(reply: FastifyReply): FastifyReply {
  return reply.code(503).send({
    error: 'LLM support is not configured on this Team Hub.'
  });
}

/**
 * Returns 403 when the target account is the internal system user.
 *
 * @param reply - Fastify reply used to send error payloads.
 * @param existing - User record being updated or deleted.
 * @param systemUserId - Cached system user id from the database, when known.
 * @returns True when the request was denied and a response was sent.
 */
function denySystemUserTarget(
  reply: Parameters<typeof denyUnlessAllowed>[0],
  existing: { id: string; name: string },
  systemUserId: string | null
): boolean {
  if (!isSystemUser(existing, systemUserId)) {
    return false;
  }

  void reply.code(403).send(errorResponseSchema.parse({ error: 'Forbidden' }));
  return true;
}

/**
 * Returns 403 when the target account is the authenticated operator.
 *
 * @param reply - Fastify reply used to send error payloads.
 * @param targetUserId - User id from the route parameter.
 * @param actorUserId - Authenticated operator performing the action.
 * @returns True when the request was denied and a response was sent.
 */
function denySelfUserTarget(
  reply: Parameters<typeof denyUnlessAllowed>[0],
  targetUserId: string,
  actorUserId: string
): boolean {
  if (targetUserId !== actorUserId) {
    return false;
  }

  void reply.code(403).send(errorResponseSchema.parse({ error: 'Forbidden' }));
  return true;
}

/**
 * Returns 403 when an operator attempts to change their own role.
 *
 * @param reply - Fastify reply used to send error payloads.
 * @param targetUserId - User id from the route parameter.
 * @param actorUserId - Authenticated operator performing the action.
 * @param existingRole - Current role stored for the target account.
 * @param requestedRole - Role from the request body, when provided.
 * @returns True when the request was denied and a response was sent.
 */
function denySelfRoleChange(
  reply: Parameters<typeof denyUnlessAllowed>[0],
  targetUserId: string,
  actorUserId: string,
  existingRole: UserRole,
  requestedRole: UserRole | undefined
): boolean {
  if (targetUserId !== actorUserId) {
    return false;
  }

  if (requestedRole === undefined || requestedRole === existingRole) {
    return false;
  }

  void reply.code(403).send(errorResponseSchema.parse({ error: 'Forbidden' }));
  return true;
}

/**
 * Registers bearer-protected management routes for operator accounts.
 *
 * @param app - Encapsulated Fastify scope with auth applied.
 * @param options - Database and LLM configuration.
 */
export async function registerAdminRoutes(
  app: FastifyInstance,
  options: RegisterAdminRoutesOptions
): Promise<void> {
  const { db, getLlm, reloadConfig } = options;
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.route({
    method: 'GET',
    url: '/admin/users',
    schema: {
      response: {
        200: listAdminUsersResponseSchema,
        403: errorResponseSchema
      }
    },
    /**
     * Lists all user accounts for operator administration.
     */
    handler: async (request, reply) => {
      try {
        const user = requireAuthenticatedUser(request);
        if (denyUnlessAllowed(reply, canUseManagementApi(user))) {
          return;
        }

        const systemUserId = db.getSystemUserId();
        const llm = getLlm();
        const [users, collections, environments, snippets] = await Promise.all([
          db.listUsers(),
          db.listCollections(),
          db.listEnvironments(),
          db.listSnippets()
        ]);
        const catalogs = buildAccessCatalogIds(
          collections,
          environments,
          snippets,
          llm ? listHubOfferedModels(llm).map((model) => model.id) : null
        );

        return reply.send({
          users: users
            .filter((record) => !isSystemUser(record, systemUserId))
            .map((record) => ({
              ...serializeHubUser(record),
              warnings: buildAccessListWarnings(
                {
                  collectionAccess: record.collectionAccess,
                  environmentAccess: record.environmentAccess,
                  snippetAccess: record.snippetAccess,
                  llmModels: record.llmModels
                },
                catalogs
              )
            }))
        });
      } catch (error) {
        if (handleDbError(reply, error)) {
          return;
        }

        throw error;
      }
    }
  });

  routes.route({
    method: 'POST',
    url: '/admin/users',
    schema: {
      body: createAdminUserBodySchema,
      response: {
        201: createAdminUserResponseSchema,
        400: errorResponseSchema,
        403: errorResponseSchema
      }
    },
    /**
     * Creates a user account and an initial API bearer token.
     */
    handler: async (request, reply) => {
      try {
        const user = requireAuthenticatedUser(request);
        if (denyUnlessAllowed(reply, canUseManagementApi(user))) {
          return;
        }

        const input = buildAdminUserCreateInput(request.body);
        const llm = getLlm();
        const [collections, environments, snippets] = await Promise.all([
          db.listCollections(),
          db.listEnvironments(),
          db.listSnippets()
        ]);
        const catalogs = buildAccessCatalogIds(
          collections,
          environments,
          snippets,
          llm ? listHubOfferedModels(llm).map((model) => model.id) : null
        );
        validateSubmittedAccessLists(
          {
            role: request.body.role,
            collectionAccess: request.body.collectionAccess,
            environmentAccess: request.body.environmentAccess,
            snippetAccess: request.body.snippetAccess,
            llmModels: request.body.llmModels
          },
          catalogs
        );

        const created = await db.createUser(input, user.id);
        const { record, secret } = generateApiToken(created.id, created.name);
        await db.createApiToken(record, user.id);

        return reply.code(201).send({
          user: serializeHubUser(created),
          token: serializeApiToken(record),
          secret
        });
      } catch (error) {
        if (handleValidationError(reply, error) || handleDbError(reply, error)) {
          return;
        }

        throw error;
      }
    }
  });

  routes.route({
    method: 'POST',
    url: '/admin/invited-users',
    schema: {
      body: createAdminInvitedUserBodySchema,
      response: {
        201: createAdminInvitationResponseSchema,
        400: errorResponseSchema,
        403: errorResponseSchema
      }
    },
    /**
     * Creates a user account and a single-use onboarding invitation without issuing an API token.
     */
    handler: async (request, reply) => {
      try {
        const user = requireAuthenticatedUser(request);
        if (denyUnlessAllowed(reply, canUseManagementApi(user))) {
          return;
        }

        const input = buildAdminUserCreateInput(request.body);
        const llm = getLlm();
        const [collections, environments, snippets] = await Promise.all([
          db.listCollections(),
          db.listEnvironments(),
          db.listSnippets()
        ]);
        const catalogs = buildAccessCatalogIds(
          collections,
          environments,
          snippets,
          llm ? listHubOfferedModels(llm).map((model) => model.id) : null
        );
        validateSubmittedAccessLists(
          {
            role: request.body.role,
            collectionAccess: request.body.collectionAccess,
            environmentAccess: request.body.environmentAccess,
            snippetAccess: request.body.snippetAccess,
            llmModels: request.body.llmModels
          },
          catalogs
        );

        const userId = randomUUID();
        const expiresAt = resolveInvitationExpiresAt(request.body.expiresInHours);
        const { record: invitation, secret } = generateInvitation(userId, user.id, expiresAt);
        const created = await db.createInvitedUser(userId, input, invitation, user.id);

        return reply.code(201).send({
          user: serializeHubUser(created.user),
          invitation: serializeHubInvitation(created.invitation),
          secret
        });
      } catch (error) {
        if (handleValidationError(reply, error) || handleDbError(reply, error)) {
          return;
        }

        throw error;
      }
    }
  });

  routes.route({
    method: 'POST',
    url: '/admin/users/:id/invitations',
    schema: {
      params: idParamSchema,
      body: createAdminInvitedUserBodySchema.pick({ expiresInHours: true }),
      response: {
        201: createAdminInvitationResponseSchema,
        400: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema
      }
    },
    /**
     * Issues a replacement onboarding invitation for an existing user account.
     */
    handler: async (request, reply) => {
      try {
        const admin = requireAuthenticatedUser(request);
        if (denyUnlessAllowed(reply, canUseManagementApi(admin))) {
          return;
        }

        const existing = await db.findUserById(request.params.id);
        if (!existing) {
          return reply.code(404).send({ error: 'User not found' });
        }

        if (denySystemUserTarget(reply, existing, db.getSystemUserId())) {
          return;
        }

        const expiresAt = resolveInvitationExpiresAt(request.body.expiresInHours);
        const { record: invitation, secret } = generateInvitation(existing.id, admin.id, expiresAt);
        await db.createInvitation(invitation, admin.id);

        return reply.code(201).send({
          user: serializeHubUser(existing),
          invitation: serializeHubInvitation(invitation),
          secret
        });
      } catch (error) {
        if (handleDbError(reply, error)) {
          return;
        }

        throw error;
      }
    }
  });

  routes.route({
    method: 'GET',
    url: '/admin/invitations',
    schema: {
      response: {
        200: listAdminInvitationsResponseSchema,
        403: errorResponseSchema
      }
    },
    /**
     * Lists onboarding invitations for operator review and recovery.
     */
    handler: async (request, reply) => {
      try {
        const user = requireAuthenticatedUser(request);
        if (denyUnlessAllowed(reply, canUseManagementApi(user))) {
          return;
        }

        const invitations = await db.listInvitations();
        return reply.send({
          invitations: invitations.map((invitation) => serializeHubInvitation(invitation))
        });
      } catch (error) {
        if (handleDbError(reply, error)) {
          return;
        }

        throw error;
      }
    }
  });

  routes.route({
    method: 'DELETE',
    url: '/admin/invitations/:id',
    schema: {
      params: idParamSchema,
      response: {
        204: emptyResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema
      }
    },
    /**
     * Revokes a pending onboarding invitation so it can no longer be redeemed.
     */
    handler: async (request, reply) => {
      try {
        const user = requireAuthenticatedUser(request);
        if (denyUnlessAllowed(reply, canUseManagementApi(user))) {
          return;
        }

        const revoked = await db.revokeInvitation(request.params.id, user.id);
        if (!revoked) {
          return reply.code(404).send({ error: 'Invitation not found or not revocable.' });
        }

        return reply.code(204).send(null);
      } catch (error) {
        if (handleDbError(reply, error)) {
          return;
        }

        throw error;
      }
    }
  });

  routes.route({
    method: 'GET',
    url: '/admin/collections',
    schema: {
      response: {
        200: listAdminCollectionsResponseSchema,
        403: errorResponseSchema
      }
    },
    /**
     * Lists all collections for operator user management.
     */
    handler: async (request, reply) => {
      try {
        const user = requireAuthenticatedUser(request);
        if (denyUnlessAllowed(reply, canUseManagementApi(user))) {
          return;
        }

        const collections = await db.listCollections();
        return reply.send({
          collections: collections.map((collection) => ({
            id: collection.id,
            name: collection.name,
            deletionLocked: collection.deletionLocked
          }))
        });
      } catch (error) {
        if (handleDbError(reply, error)) {
          return;
        }

        throw error;
      }
    }
  });

  routes.route({
    method: 'GET',
    url: '/admin/collections/:collectionId/folders',
    schema: {
      params: collectionIdParamSchema,
      response: {
        200: listFoldersResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema
      }
    },
    /**
     * Lists folders in a collection for operator inspection.
     */
    handler: async (request, reply) => {
      try {
        const user = requireAuthenticatedUser(request);
        if (denyUnlessAllowed(reply, canUseManagementApi(user))) {
          return;
        }

        const collection = await db.findCollectionById(request.params.collectionId);
        if (!collection) {
          void reply.code(404).send({ error: 'Collection not found' });
          return;
        }

        const folders = await db.listFolders(request.params.collectionId);
        return reply.send({
          folders: folders.map((folder) => serializeFolder(folder))
        });
      } catch (error) {
        if (handleDbError(reply, error)) {
          return;
        }

        throw error;
      }
    }
  });

  routes.route({
    method: 'GET',
    url: '/admin/collections/:collectionId/requests',
    schema: {
      params: collectionIdParamSchema,
      response: {
        200: listRequestsResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema
      }
    },
    /**
     * Lists saved requests in a collection for operator inspection.
     */
    handler: async (request, reply) => {
      try {
        const user = requireAuthenticatedUser(request);
        if (denyUnlessAllowed(reply, canUseManagementApi(user))) {
          return;
        }

        const collection = await db.findCollectionById(request.params.collectionId);
        if (!collection) {
          void reply.code(404).send({ error: 'Collection not found' });
          return;
        }

        const requests = await db.listRequests(request.params.collectionId);
        return reply.send({
          requests: requests.map((savedRequest) => serializeSavedRequest(savedRequest))
        });
      } catch (error) {
        if (handleDbError(reply, error)) {
          return;
        }

        throw error;
      }
    }
  });

  routes.route({
    method: 'GET',
    url: '/admin/collections/:collectionId/documents',
    schema: {
      params: collectionIdParamSchema,
      response: {
        200: listDocumentsResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema
      }
    },
    /**
     * Lists collection documents in a collection for operator inspection.
     */
    handler: async (request, reply) => {
      try {
        const user = requireAuthenticatedUser(request);
        if (denyUnlessAllowed(reply, canUseManagementApi(user))) {
          return;
        }

        const collection = await db.findCollectionById(request.params.collectionId);
        if (!collection) {
          void reply.code(404).send({ error: 'Collection not found' });
          return;
        }

        const documents = await db.listDocuments(request.params.collectionId);
        return reply.send({
          documents: documents.map((document) => serializeDocument(document))
        });
      } catch (error) {
        if (handleDbError(reply, error)) {
          return;
        }

        throw error;
      }
    }
  });

  routes.route({
    method: 'GET',
    url: '/admin/environments',
    schema: {
      response: {
        200: listAdminEnvironmentsResponseSchema,
        403: errorResponseSchema
      }
    },
    /**
     * Lists all environments for operator user management.
     */
    handler: async (request, reply) => {
      try {
        const user = requireAuthenticatedUser(request);
        if (denyUnlessAllowed(reply, canUseManagementApi(user))) {
          return;
        }

        const environments = await db.listEnvironments();
        return reply.send({
          environments: environments.map((environment) => ({
            id: environment.id,
            name: environment.name,
            deletionLocked: environment.deletionLocked
          }))
        });
      } catch (error) {
        if (handleDbError(reply, error)) {
          return;
        }

        throw error;
      }
    }
  });

  routes.route({
    method: 'GET',
    url: '/admin/snippets',
    schema: {
      response: {
        200: listAdminSnippetsResponseSchema,
        403: errorResponseSchema
      }
    },
    /**
     * Lists all snippets for operator user management.
     */
    handler: async (request, reply) => {
      try {
        const user = requireAuthenticatedUser(request);
        if (denyUnlessAllowed(reply, canUseManagementApi(user))) {
          return;
        }

        const snippets = await db.listSnippets();
        return reply.send({
          snippets: snippets.map((snippet) => serializeSnippet(snippet))
        });
      } catch (error) {
        if (handleDbError(reply, error)) {
          return;
        }

        throw error;
      }
    }
  });

  routes.route({
    method: 'POST',
    url: '/admin/snippets',
    schema: {
      body: createAdminSnippetBodySchema,
      response: {
        201: adminSnippetRecordSchema,
        403: errorResponseSchema
      }
    },
    /**
     * Creates a snippet through the management API.
     */
    handler: async (request, reply) => {
      try {
        const user = requireAuthenticatedUser(request);
        if (denyUnlessAllowed(reply, canUseManagementApi(user))) {
          return;
        }

        const snippet = await db.createSnippet(
          request.body.name,
          request.body.code,
          request.body.scope,
          user.id
        );
        return reply.code(201).send(serializeSnippet(snippet));
      } catch (error) {
        if (handleDbError(reply, error)) {
          return;
        }

        throw error;
      }
    }
  });

  routes.route({
    method: 'DELETE',
    url: '/admin/collections/:id',
    schema: {
      params: idParamSchema,
      response: {
        204: emptyResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema
      }
    },
    /**
     * Deletes a collection regardless of deletion lock state.
     */
    handler: async (request, reply) => {
      try {
        const user = requireAuthenticatedUser(request);
        if (denyUnlessAllowed(reply, canUseManagementApi(user))) {
          return;
        }

        const collection = await db.findCollectionById(request.params.id);
        if (!collection) {
          void reply.code(404).send({ error: 'Collection not found' });
          return;
        }

        await db.deleteCollection(request.params.id, user.id);
        return reply.code(204).send(null);
      } catch (error) {
        if (handleDbError(reply, error)) {
          return;
        }

        throw error;
      }
    }
  });

  routes.route({
    method: 'DELETE',
    url: '/admin/requests/:id',
    schema: {
      params: idParamSchema,
      response: {
        204: emptyResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema
      }
    },
    /**
     * Deletes a saved request regardless of collection access lists.
     */
    handler: async (request, reply) => {
      try {
        const user = requireAuthenticatedUser(request);
        if (denyUnlessAllowed(reply, canUseManagementApi(user))) {
          return;
        }

        const existingRequest = await db.findRequestById(request.params.id);
        if (!existingRequest) {
          void reply.code(404).send({ error: 'Request not found' });
          return;
        }

        await db.deleteRequest(request.params.id, user.id);
        return reply.code(204).send(null);
      } catch (error) {
        if (handleDbError(reply, error)) {
          return;
        }

        throw error;
      }
    }
  });

  routes.route({
    method: 'DELETE',
    url: '/admin/snippets/:id',
    schema: {
      params: idParamSchema,
      response: {
        204: emptyResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema
      }
    },
    /**
     * Deletes a snippet regardless of deletion lock state.
     */
    handler: async (request, reply) => {
      try {
        const user = requireAuthenticatedUser(request);
        if (denyUnlessAllowed(reply, canUseManagementApi(user))) {
          return;
        }

        const snippet = await db.findSnippetById(request.params.id);
        if (!snippet) {
          void reply.code(404).send({ error: 'Snippet not found' });
          return;
        }

        await db.deleteSnippet(request.params.id, user.id);
        return reply.code(204).send(null);
      } catch (error) {
        if (handleDbError(reply, error)) {
          return;
        }

        throw error;
      }
    }
  });

  routes.route({
    method: 'GET',
    url: '/admin/run-results',
    schema: {
      response: {
        200: listAdminRunResultsResponseSchema,
        403: errorResponseSchema
      }
    },
    /**
     * Lists all run results for operator management.
     */
    handler: async (request, reply) => {
      try {
        const user = requireAuthenticatedUser(request);
        if (denyUnlessAllowed(reply, canUseManagementApi(user))) {
          return;
        }

        const runResults = await db.listAllRunResults();
        return reply.send({
          runResults: runResults.map((record) => serializeRunResult(record))
        });
      } catch (error) {
        if (handleDbError(reply, error)) {
          return;
        }

        throw error;
      }
    }
  });

  routes.route({
    method: 'DELETE',
    url: '/admin/run-results/:id',
    schema: {
      params: idParamSchema,
      response: {
        204: emptyResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema
      }
    },
    /**
     * Deletes a run result regardless of creator ownership.
     */
    handler: async (request, reply) => {
      try {
        const user = requireAuthenticatedUser(request);
        if (denyUnlessAllowed(reply, canUseManagementApi(user))) {
          return;
        }

        const record = await db.findRunResultById(request.params.id);
        if (!record) {
          void reply.code(404).send({ error: 'Run result not found' });
          return;
        }

        await db.deleteRunResult(request.params.id, user.id);
        return reply.code(204).send(null);
      } catch (error) {
        if (handleDbError(reply, error)) {
          return;
        }

        throw error;
      }
    }
  });

  routes.route({
    method: 'PUT',
    url: '/admin/snippets/:id',
    schema: {
      params: idParamSchema,
      body: updateAdminSnippetBodySchema,
      response: {
        200: adminSnippetRecordSchema,
        403: errorResponseSchema,
        404: errorResponseSchema
      }
    },
    /**
     * Updates snippet content and/or admin configuration.
     */
    handler: async (request, reply) => {
      try {
        const user = requireAuthenticatedUser(request);
        if (denyUnlessAllowed(reply, canUseManagementApi(user))) {
          return;
        }

        const existing = await db.findSnippetById(request.params.id);
        if (!existing) {
          void reply.code(404).send({ error: 'Snippet not found' });
          return;
        }

        let snippet = existing;
        const { name, code, scope, deletionLocked } = request.body;

        if (name !== undefined && code !== undefined && scope !== undefined) {
          snippet = await db.updateSnippet(request.params.id, name, code, scope, user.id);
        }

        if (deletionLocked !== undefined) {
          snippet = await db.setSnippetDeletionLocked(request.params.id, deletionLocked, user.id);
        }

        return reply.send(serializeSnippet(snippet));
      } catch (error) {
        if (handleDbError(reply, error)) {
          return;
        }

        throw error;
      }
    }
  });

  routes.route({
    method: 'PUT',
    url: '/admin/collections/:id',
    schema: {
      params: idParamSchema,
      body: updateAdminCollectionBodySchema,
      response: {
        200: adminEntityConfigSchema,
        403: errorResponseSchema,
        404: errorResponseSchema
      }
    },
    /**
     * Updates admin configuration for a collection.
     */
    handler: async (request, reply) => {
      try {
        const user = requireAuthenticatedUser(request);
        if (denyUnlessAllowed(reply, canUseManagementApi(user))) {
          return;
        }

        const collection = await db.setCollectionDeletionLocked(
          request.params.id,
          request.body.deletionLocked,
          user.id
        );

        return reply.send({
          id: collection.id,
          name: collection.name,
          deletionLocked: collection.deletionLocked
        });
      } catch (error) {
        if (handleDbError(reply, error)) {
          return;
        }

        throw error;
      }
    }
  });

  routes.route({
    method: 'DELETE',
    url: '/admin/environments/:id',
    schema: {
      params: idParamSchema,
      response: {
        204: emptyResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema
      }
    },
    /**
     * Deletes an environment regardless of deletion lock state.
     */
    handler: async (request, reply) => {
      try {
        const user = requireAuthenticatedUser(request);
        if (denyUnlessAllowed(reply, canUseManagementApi(user))) {
          return;
        }

        const environment = await db.findEnvironmentById(request.params.id);
        if (!environment) {
          void reply.code(404).send({ error: 'Environment not found' });
          return;
        }

        await db.deleteEnvironment(request.params.id, user.id);
        return reply.code(204).send(null);
      } catch (error) {
        if (handleDbError(reply, error)) {
          return;
        }

        throw error;
      }
    }
  });

  routes.route({
    method: 'PUT',
    url: '/admin/environments/:id',
    schema: {
      params: idParamSchema,
      body: updateAdminEnvironmentBodySchema,
      response: {
        200: adminEntityConfigSchema,
        403: errorResponseSchema,
        404: errorResponseSchema
      }
    },
    /**
     * Updates admin configuration for an environment.
     */
    handler: async (request, reply) => {
      try {
        const user = requireAuthenticatedUser(request);
        if (denyUnlessAllowed(reply, canUseManagementApi(user))) {
          return;
        }

        const environment = await db.setEnvironmentDeletionLocked(
          request.params.id,
          request.body.deletionLocked,
          user.id
        );

        return reply.send({
          id: environment.id,
          name: environment.name,
          deletionLocked: environment.deletionLocked
        });
      } catch (error) {
        if (handleDbError(reply, error)) {
          return;
        }

        throw error;
      }
    }
  });

  routes.route({
    method: 'GET',
    url: '/admin/llm/models',
    schema: {
      response: {
        200: listAdminLlmModelsResponseSchema,
        403: errorResponseSchema,
        503: errorResponseSchema
      }
    },
    /**
     * Lists all hub-offered LLM models for operator user management.
     */
    handler: async (request, reply) => {
      const llm = getLlm();
      if (!llm) {
        return sendLlmUnavailable(reply);
      }

      const user = requireAuthenticatedUser(request);
      if (denyUnlessAllowed(reply, canUseManagementApi(user))) {
        return;
      }

      const models = listHubOfferedModels(llm).map((model) => ({
        id: model.id,
        label: model.label,
        provider: model.provider
      }));

      return reply.send({ models, capabilities: getHubLlmCapabilities(llm) });
    }
  });

  routes.route({
    method: 'PUT',
    url: '/admin/users/:id',
    schema: {
      params: idParamSchema,
      body: updateAdminUserBodySchema,
      response: {
        200: hubUserRecordSchema,
        400: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema
      }
    },
    /**
     * Updates a user account for operator administration.
     */
    handler: async (request, reply) => {
      try {
        const user = requireAuthenticatedUser(request);
        if (denyUnlessAllowed(reply, canUseManagementApi(user))) {
          return;
        }

        const systemUserId = db.getSystemUserId();
        const existing = await db.findUserById(request.params.id);
        if (!existing) {
          void reply.code(404).send(errorResponseSchema.parse({ error: 'User not found' }));
          return;
        }

        if (denySystemUserTarget(reply, existing, systemUserId)) {
          return;
        }

        if (
          denySelfRoleChange(reply, request.params.id, user.id, existing.role, request.body.role)
        ) {
          return;
        }

        const input = buildAdminUserUpdateInput(existing, request.body);
        const role = request.body.role ?? existing.role;
        const llm = getLlm();
        const [collections, environments, snippets] = await Promise.all([
          db.listCollections(),
          db.listEnvironments(),
          db.listSnippets()
        ]);
        const catalogs = buildAccessCatalogIds(
          collections,
          environments,
          snippets,
          llm ? listHubOfferedModels(llm).map((model) => model.id) : null
        );
        validateSubmittedAccessLists(
          {
            role,
            collectionAccess: request.body.collectionAccess,
            environmentAccess: request.body.environmentAccess,
            snippetAccess: request.body.snippetAccess,
            llmModels: request.body.llmModels
          },
          catalogs
        );

        const updated = await db.updateUser(request.params.id, input, user.id);
        return reply.send(serializeHubUser(updated));
      } catch (error) {
        if (handleValidationError(reply, error) || handleDbError(reply, error)) {
          return;
        }

        throw error;
      }
    }
  });

  routes.route({
    method: 'DELETE',
    url: '/admin/users/:id',
    schema: {
      params: idParamSchema,
      response: {
        204: emptyResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema
      }
    },
    /**
     * Deletes a user account and removes all of their API tokens.
     */
    handler: async (request, reply) => {
      try {
        const user = requireAuthenticatedUser(request);
        if (denyUnlessAllowed(reply, canUseManagementApi(user))) {
          return;
        }

        const systemUserId = db.getSystemUserId();
        const existing = await db.findUserById(request.params.id);
        if (!existing) {
          void reply.code(404).send(errorResponseSchema.parse({ error: 'User not found' }));
          return;
        }

        if (denySystemUserTarget(reply, existing, systemUserId)) {
          return;
        }

        if (denySelfUserTarget(reply, request.params.id, user.id)) {
          return;
        }

        await db.deleteUser(request.params.id, user.id);
        return reply.code(204).send(null);
      } catch (error) {
        if (handleDbError(reply, error)) {
          return;
        }

        throw error;
      }
    }
  });

  routes.route({
    method: 'GET',
    url: '/admin/tokens',
    schema: {
      response: {
        200: listAdminTokensResponseSchema,
        403: errorResponseSchema
      }
    },
    /**
     * Lists all API bearer tokens for operator administration.
     */
    handler: async (request, reply) => {
      try {
        const user = requireAuthenticatedUser(request);
        if (denyUnlessAllowed(reply, canUseManagementApi(user))) {
          return;
        }

        const tokens = await db.listApiTokens();
        return reply.send({
          tokens: tokens.map((record) => serializeApiToken(record))
        });
      } catch (error) {
        if (handleDbError(reply, error)) {
          return;
        }

        throw error;
      }
    }
  });

  routes.route({
    method: 'POST',
    url: '/admin/users/:id/tokens',
    schema: {
      params: idParamSchema,
      body: createAdminTokenBodySchema,
      response: {
        201: createdApiTokenResponseSchema,
        400: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema
      }
    },
    /**
     * Creates an additional API bearer token for a user account.
     */
    handler: async (request, reply) => {
      try {
        const user = requireAuthenticatedUser(request);
        if (denyUnlessAllowed(reply, canUseManagementApi(user))) {
          return;
        }

        const systemUserId = db.getSystemUserId();
        const existing = await db.findUserById(request.params.id);
        if (!existing) {
          void reply.code(404).send(errorResponseSchema.parse({ error: 'User not found' }));
          return;
        }

        if (denySystemUserTarget(reply, existing, systemUserId)) {
          return;
        }

        const { record, secret } = generateApiToken(existing.id, request.body.name);
        await db.createApiToken(record, user.id);

        return reply.code(201).send({
          token: serializeApiToken(record),
          secret
        });
      } catch (error) {
        if (handleDbError(reply, error)) {
          return;
        }

        throw error;
      }
    }
  });

  routes.route({
    method: 'DELETE',
    url: '/admin/tokens/:id',
    schema: {
      params: idParamSchema,
      response: {
        204: emptyResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema
      }
    },
    /**
     * Permanently deletes an API bearer token by id.
     */
    handler: async (request, reply) => {
      try {
        const user = requireAuthenticatedUser(request);
        if (denyUnlessAllowed(reply, canUseManagementApi(user))) {
          return;
        }

        const systemUserId = db.getSystemUserId();
        const existing = await db.findApiTokenById(request.params.id);
        if (!existing) {
          void reply.code(404).send(errorResponseSchema.parse({ error: 'Token not found' }));
          return;
        }

        const owner = await db.findUserById(existing.userId);
        if (owner && denySystemUserTarget(reply, owner, systemUserId)) {
          return;
        }

        const deleted = await db.deleteApiToken(request.params.id, user.id);
        if (!deleted) {
          void reply.code(404).send(errorResponseSchema.parse({ error: 'Token not found' }));
          return;
        }

        return reply.code(204).send(null);
      } catch (error) {
        if (handleDbError(reply, error)) {
          return;
        }

        throw error;
      }
    }
  });

  routes.route({
    method: 'POST',
    url: '/admin/config/reload',
    schema: {
      response: {
        200: reloadConfigResponseSchema,
        400: reloadConfigResponseSchema,
        403: errorResponseSchema
      }
    },
    /**
     * Re-reads server.yaml and applies reloadable config sections on a best-effort basis.
     */
    handler: async (request, reply) => {
      const user = requireAuthenticatedUser(request);
      if (denyUnlessAllowed(reply, canUseManagementApi(user))) {
        return;
      }

      const result = await reloadConfig();
      if (result.fatalError) {
        return reply.code(400).send(result);
      }

      return reply.send(result);
    }
  });
}
