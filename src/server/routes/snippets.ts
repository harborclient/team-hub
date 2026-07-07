import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { IDatabase } from '#/db/IDatabase.js';
import {
  canAccessSnippet,
  canCreateSnippet,
  canListSnippets,
  canUseDataApi,
  filterAccessibleSnippets
} from '#/server/auth/accessControl.js';
import { DeletionLockedError } from '#/db/deletionLockedError.js';
import { handleDbError } from '#/server/routes/errors.js';
import { denyUnlessAllowed, requireAuthenticatedUser } from '#/server/routes/authorize.js';
import { errorResponseSchema, idParamSchema } from '#/server/routes/schemas/common.js';
import {
  createSnippetBodySchema,
  emptyResponseSchema,
  listSnippetsResponseSchema,
  serializeSnippet,
  snippetRecordSchema,
  updateSnippetBodySchema
} from '#/server/routes/schemas/entities.js';

/**
 * Registers bearer-protected snippet CRUD routes.
 *
 * @param app - Encapsulated Fastify scope with auth applied.
 * @param db - Database used to persist snippets.
 */
export async function registerSnippetRoutes(app: FastifyInstance, db: IDatabase): Promise<void> {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.route({
    method: 'GET',
    url: '/snippets',
    schema: {
      response: {
        200: listSnippetsResponseSchema
      }
    },
    /**
     * Lists all snippets ordered by sort order then name.
     */
    handler: async (request, reply) => {
      try {
        const user = requireAuthenticatedUser(request);
        if (denyUnlessAllowed(reply, canListSnippets(user))) {
          return;
        }

        const snippets = await db.listSnippets();
        return reply.send({
          snippets: filterAccessibleSnippets(user, snippets).map((snippet) =>
            serializeSnippet(snippet)
          )
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
    url: '/snippets',
    schema: {
      body: createSnippetBodySchema,
      response: {
        200: snippetRecordSchema,
        400: errorResponseSchema
      }
    },
    /**
     * Creates a new snippet with the given display name and content.
     */
    handler: async (request, reply) => {
      try {
        const user = requireAuthenticatedUser(request);
        if (denyUnlessAllowed(reply, canUseDataApi(user) && canCreateSnippet(user))) {
          return;
        }

        const snippet = await db.createSnippet(
          request.body.name,
          request.body.code,
          request.body.scope,
          user.id
        );
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
    url: '/snippets/:id',
    schema: {
      params: idParamSchema,
      body: updateSnippetBodySchema,
      response: {
        200: snippetRecordSchema,
        400: errorResponseSchema,
        404: errorResponseSchema
      }
    },
    /**
     * Updates a snippet's name, code, and scope. Sort order is preserved.
     */
    handler: async (request, reply) => {
      try {
        const user = requireAuthenticatedUser(request);
        if (
          denyUnlessAllowed(reply, canUseDataApi(user) && canAccessSnippet(user, request.params.id))
        ) {
          return;
        }

        const snippet = await db.updateSnippet(
          request.params.id,
          request.body.name,
          request.body.code,
          request.body.scope,
          user.id
        );
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
    method: 'DELETE',
    url: '/snippets/:id',
    schema: {
      params: idParamSchema,
      response: {
        204: emptyResponseSchema,
        404: errorResponseSchema
      }
    },
    /**
     * Deletes a snippet by id.
     */
    handler: async (request, reply) => {
      try {
        const user = requireAuthenticatedUser(request);
        if (
          denyUnlessAllowed(reply, canUseDataApi(user) && canAccessSnippet(user, request.params.id))
        ) {
          return;
        }

        const snippet = await db.findSnippetById(request.params.id);
        if (!snippet) {
          void reply.code(404).send({ error: 'Snippet not found' });
          return;
        }

        if (snippet.deletionLocked) {
          throw new DeletionLockedError('snippet');
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
}
