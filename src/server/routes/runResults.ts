import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { IDatabase } from '#/db/IDatabase.js';
import {
  canDeleteRunResult,
  canListRunResults,
  canUseDataApi
} from '#/server/auth/accessControl.js';
import { handleDbError } from '#/server/routes/errors.js';
import { denyUnlessAllowed, requireAuthenticatedUser } from '#/server/routes/authorize.js';
import { errorResponseSchema, idParamSchema } from '#/server/routes/schemas/common.js';
import {
  createRunResultBodySchema,
  emptyResponseSchema,
  listRunResultsResponseSchema,
  runResultDetailSchema,
  serializeRunResult,
  serializeRunResultDetail
} from '#/server/routes/schemas/entities.js';

/**
 * Registers bearer-protected run result routes.
 *
 * @param app - Encapsulated Fastify scope with auth applied.
 * @param db - Database used to persist run result snapshots.
 */
export async function registerRunResultRoutes(app: FastifyInstance, db: IDatabase): Promise<void> {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.route({
    method: 'GET',
    url: '/run-results',
    schema: {
      response: {
        200: listRunResultsResponseSchema
      }
    },
    /**
     * Lists run results saved by the authenticated user token.
     */
    handler: async (request, reply) => {
      try {
        const user = requireAuthenticatedUser(request);
        if (denyUnlessAllowed(reply, canListRunResults(user))) {
          return;
        }

        const runResults = await db.listRunResultsForUser(user.id);
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
    method: 'POST',
    url: '/run-results',
    schema: {
      body: createRunResultBodySchema,
      response: {
        200: runResultDetailSchema,
        400: errorResponseSchema
      }
    },
    /**
     * Saves a standalone run result snapshot.
     */
    handler: async (request, reply) => {
      try {
        const user = requireAuthenticatedUser(request);
        if (denyUnlessAllowed(reply, canUseDataApi(user))) {
          return;
        }

        const record = await db.createRunResult(request.body, user.id);
        return reply.send(serializeRunResultDetail(record));
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
    url: '/run-results/:id',
    schema: {
      params: idParamSchema,
      response: {
        200: runResultDetailSchema,
        404: errorResponseSchema
      }
    },
    /**
     * Loads a run result snapshot by id for shared deep links.
     */
    handler: async (request, reply) => {
      try {
        const user = requireAuthenticatedUser(request);
        if (denyUnlessAllowed(reply, canUseDataApi(user))) {
          return;
        }

        const record = await db.findRunResultById(request.params.id);
        if (!record) {
          void reply.code(404).send({ error: 'Run result not found' });
          return;
        }

        return reply.send(serializeRunResultDetail(record));
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
    url: '/run-results/:id',
    schema: {
      params: idParamSchema,
      response: {
        204: emptyResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema
      }
    },
    /**
     * Deletes a run result saved by the authenticated user when permitted.
     */
    handler: async (request, reply) => {
      try {
        const user = requireAuthenticatedUser(request);
        if (denyUnlessAllowed(reply, canUseDataApi(user))) {
          return;
        }

        const record = await db.findRunResultById(request.params.id);
        if (!record) {
          void reply.code(404).send({ error: 'Run result not found' });
          return;
        }

        if (denyUnlessAllowed(reply, canDeleteRunResult(user, record))) {
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
}
