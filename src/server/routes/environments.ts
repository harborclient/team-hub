import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { IDatabase } from '#/db/IDatabase.js';
import {
  canAccessEnvironment,
  canCreateEnvironment,
  canListEnvironments,
  canUseDataApi,
  filterAccessibleEnvironments
} from '#/server/auth/accessControl.js';
import { DeletionLockedError } from '#/db/deletionLockedError.js';
import { handleDbError } from '#/server/routes/errors.js';
import { denyUnlessAllowed, requireAuthenticatedUser } from '#/server/routes/authorize.js';
import { errorResponseSchema, idParamSchema } from '#/server/routes/schemas/common.js';
import {
  createEnvironmentBodySchema,
  emptyResponseSchema,
  environmentRecordSchema,
  listEnvironmentsResponseSchema,
  serializeEnvironment,
  updateEnvironmentBodySchema
} from '#/server/routes/schemas/entities.js';

/**
 * Registers bearer-protected environment CRUD routes.
 *
 * @param app - Encapsulated Fastify scope with auth applied.
 * @param db - Database used to persist environments.
 */
export async function registerEnvironmentRoutes(
  app: FastifyInstance,
  db: IDatabase
): Promise<void> {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.route({
    method: 'GET',
    url: '/environments',
    schema: {
      response: {
        200: listEnvironmentsResponseSchema
      }
    },
    /**
     * Lists all environments ordered by name.
     */
    handler: async (request, reply) => {
      try {
        const user = requireAuthenticatedUser(request);
        if (denyUnlessAllowed(reply, canListEnvironments(user))) {
          return;
        }

        const environments = await db.listEnvironments();
        return reply.send({
          environments: filterAccessibleEnvironments(user, environments).map((environment) =>
            serializeEnvironment(environment)
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
    url: '/environments',
    schema: {
      body: createEnvironmentBodySchema,
      response: {
        200: environmentRecordSchema,
        400: errorResponseSchema
      }
    },
    /**
     * Creates a new environment with the given display name.
     */
    handler: async (request, reply) => {
      try {
        const user = requireAuthenticatedUser(request);
        if (denyUnlessAllowed(reply, canUseDataApi(user) && canCreateEnvironment(user))) {
          return;
        }

        const environment = await db.createEnvironment(request.body.name, user.id);
        return reply.send(serializeEnvironment(environment));
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
    url: '/environments/:id',
    schema: {
      params: idParamSchema,
      body: updateEnvironmentBodySchema,
      response: {
        200: environmentRecordSchema,
        400: errorResponseSchema,
        404: errorResponseSchema
      }
    },
    /**
     * Updates an environment's name and variables.
     */
    handler: async (request, reply) => {
      try {
        const user = requireAuthenticatedUser(request);
        if (
          denyUnlessAllowed(
            reply,
            canUseDataApi(user) && canAccessEnvironment(user, request.params.id)
          )
        ) {
          return;
        }

        const environment = await db.updateEnvironment(
          request.params.id,
          request.body.name,
          request.body.variables,
          user.id,
          request.body.marker
        );
        return reply.send(serializeEnvironment(environment));
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
    url: '/environments/:id',
    schema: {
      params: idParamSchema,
      response: {
        204: emptyResponseSchema,
        404: errorResponseSchema
      }
    },
    /**
     * Deletes an environment by id.
     */
    handler: async (request, reply) => {
      try {
        const user = requireAuthenticatedUser(request);
        if (
          denyUnlessAllowed(
            reply,
            canUseDataApi(user) && canAccessEnvironment(user, request.params.id)
          )
        ) {
          return;
        }

        const environment = await db.findEnvironmentById(request.params.id);
        if (!environment) {
          void reply.code(404).send({ error: 'Environment not found' });
          return;
        }

        if (environment.deletionLocked) {
          throw new DeletionLockedError('environment');
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
}
