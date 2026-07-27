import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { IDatabase } from '#/db/IDatabase.js';
import {
  canAccessCollection,
  canCreateCollection,
  canDeleteCollection,
  canListCollections,
  canUseDataApi,
  filterAccessibleCollections
} from '#/server/auth/accessControl.js';
import { DeletionLockedError } from '#/db/deletionLockedError.js';
import { handleDbError } from '#/server/routes/errors.js';
import { denyUnlessAllowed, requireAuthenticatedUser } from '#/server/routes/authorize.js';
import { errorResponseSchema, idParamSchema } from '#/server/routes/schemas/common.js';
import {
  collectionRecordSchema,
  createCollectionBodySchema,
  emptyResponseSchema,
  listCollectionsResponseSchema,
  serializeCollection,
  updateCollectionBodySchema
} from '#/server/routes/schemas/entities.js';

/**
 * Registers bearer-protected collection CRUD routes.
 *
 * @param app - Encapsulated Fastify scope with auth applied.
 * @param db - Database used to persist collections.
 */
export async function registerCollectionRoutes(app: FastifyInstance, db: IDatabase): Promise<void> {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.route({
    method: 'GET',
    url: '/collections',
    schema: {
      response: {
        200: listCollectionsResponseSchema
      }
    },
    /**
     * Lists all collections ordered by name.
     */
    handler: async (request, reply) => {
      try {
        const user = requireAuthenticatedUser(request);
        if (denyUnlessAllowed(reply, canListCollections(user))) {
          return;
        }

        const collections = await db.listCollections();
        return reply.send({
          collections: filterAccessibleCollections(user, collections).map((collection) =>
            serializeCollection(collection)
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
    url: '/collections',
    schema: {
      body: createCollectionBodySchema,
      response: {
        200: collectionRecordSchema,
        400: errorResponseSchema
      }
    },
    /**
     * Creates a new collection with the given display name.
     */
    handler: async (request, reply) => {
      try {
        const user = requireAuthenticatedUser(request);
        if (denyUnlessAllowed(reply, canUseDataApi(user) && canCreateCollection(user))) {
          return;
        }

        const collection = await db.createCollection(request.body.name, user.id);
        return reply.send(serializeCollection(collection));
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
    url: '/collections/:id',
    schema: {
      params: idParamSchema,
      body: updateCollectionBodySchema,
      response: {
        200: collectionRecordSchema,
        400: errorResponseSchema,
        404: errorResponseSchema
      }
    },
    /**
     * Updates a collection's metadata and defaults.
     */
    handler: async (request, reply) => {
      try {
        const user = requireAuthenticatedUser(request);
        if (
          denyUnlessAllowed(
            reply,
            canUseDataApi(user) && canAccessCollection(user, request.params.id)
          )
        ) {
          return;
        }

        const collection = await db.updateCollection(
          request.params.id,
          request.body.name,
          request.body.variables,
          request.body.headers,
          request.body.preRequestScript,
          request.body.postRequestScript,
          request.body.auth,
          user.id,
          request.body.marker
        );
        return reply.send(serializeCollection(collection));
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
    url: '/collections/:id',
    schema: {
      params: idParamSchema,
      response: {
        204: emptyResponseSchema,
        404: errorResponseSchema
      }
    },
    /**
     * Deletes a collection and all nested folders and requests.
     */
    handler: async (request, reply) => {
      try {
        const user = requireAuthenticatedUser(request);
        const collection = await db.findCollectionById(request.params.id);
        if (!collection) {
          void reply.code(404).send({ error: 'Collection not found' });
          return;
        }

        if (collection.deletionLocked) {
          throw new DeletionLockedError('collection');
        }

        if (denyUnlessAllowed(reply, canDeleteCollection(user, collection))) {
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
}
