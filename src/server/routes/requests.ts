import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { IDatabase } from '#/db/IDatabase.js';
import {
  canAccessCollection,
  canDeleteRequest,
  canUseDataApi
} from '#/server/auth/accessControl.js';
import { handleDbError } from '#/server/routes/errors.js';
import { denyUnlessAllowed, requireAuthenticatedUser } from '#/server/routes/authorize.js';
import {
  collectionIdParamSchema,
  errorResponseSchema,
  idParamSchema
} from '#/server/routes/schemas/common.js';
import {
  emptyResponseSchema,
  listRequestsResponseSchema,
  moveRequestBodySchema,
  reorderRequestsBodySchema,
  savedRequestRecordSchema,
  saveRequestBodySchema,
  serializeSavedRequest,
  updateSaveRequestBodySchema
} from '#/server/routes/schemas/entities.js';

/**
 * Registers bearer-protected saved request CRUD, reorder, and move routes.
 *
 * @param app - Encapsulated Fastify scope with auth applied.
 * @param db - Database used to persist saved requests.
 */
export async function registerRequestRoutes(app: FastifyInstance, db: IDatabase): Promise<void> {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.route({
    method: 'GET',
    url: '/collections/:collectionId/requests',
    schema: {
      params: collectionIdParamSchema,
      response: {
        200: listRequestsResponseSchema
      }
    },
    /**
     * Lists saved requests in a collection.
     */
    handler: async (request, reply) => {
      try {
        const user = requireAuthenticatedUser(request);
        if (
          denyUnlessAllowed(
            reply,
            canUseDataApi(user) && canAccessCollection(user, request.params.collectionId)
          )
        ) {
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
    method: 'POST',
    url: '/collections/:collectionId/requests',
    schema: {
      params: collectionIdParamSchema,
      body: saveRequestBodySchema,
      response: {
        200: savedRequestRecordSchema,
        400: errorResponseSchema,
        404: errorResponseSchema
      }
    },
    /**
     * Creates a new saved request in a collection.
     */
    handler: async (request, reply) => {
      try {
        const user = requireAuthenticatedUser(request);
        if (
          denyUnlessAllowed(
            reply,
            canUseDataApi(user) && canAccessCollection(user, request.params.collectionId)
          )
        ) {
          return;
        }

        const savedRequest = await db.saveRequest(
          {
            collectionId: request.params.collectionId,
            name: request.body.name,
            method: request.body.method,
            url: request.body.url,
            headers: request.body.headers,
            params: request.body.params,
            auth: request.body.auth,
            body: request.body.body,
            bodyType: request.body.bodyType,
            preRequestScript: request.body.preRequestScript,
            postRequestScript: request.body.postRequestScript,
            comment: request.body.comment,
            folderId: request.body.folderId ?? null,
            marker: request.body.marker
          },
          user.id
        );
        return reply.send(serializeSavedRequest(savedRequest));
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
    url: '/requests/:id',
    schema: {
      params: idParamSchema,
      body: updateSaveRequestBodySchema,
      response: {
        200: savedRequestRecordSchema,
        400: errorResponseSchema,
        404: errorResponseSchema
      }
    },
    /**
     * Updates an existing saved request by id.
     */
    handler: async (request, reply) => {
      try {
        const user = requireAuthenticatedUser(request);
        if (
          denyUnlessAllowed(
            reply,
            canUseDataApi(user) && canAccessCollection(user, request.body.collectionId)
          )
        ) {
          return;
        }

        const savedRequest = await db.saveRequest(
          {
            id: request.params.id,
            collectionId: request.body.collectionId,
            name: request.body.name,
            method: request.body.method,
            url: request.body.url,
            headers: request.body.headers,
            params: request.body.params,
            auth: request.body.auth,
            body: request.body.body,
            bodyType: request.body.bodyType,
            preRequestScript: request.body.preRequestScript,
            postRequestScript: request.body.postRequestScript,
            comment: request.body.comment,
            folderId: request.body.folderId ?? null,
            marker: request.body.marker
          },
          user.id
        );
        return reply.send(serializeSavedRequest(savedRequest));
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
    url: '/requests/:id',
    schema: {
      params: idParamSchema,
      response: {
        204: emptyResponseSchema,
        404: errorResponseSchema
      }
    },
    /**
     * Deletes a saved request by id.
     */
    handler: async (request, reply) => {
      try {
        const user = requireAuthenticatedUser(request);
        const existingRequest = await db.findRequestById(request.params.id);
        if (!existingRequest) {
          return reply.code(404).send({ error: 'Request not found' });
        }

        if (denyUnlessAllowed(reply, canDeleteRequest(user, existingRequest))) {
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
    method: 'PUT',
    url: '/collections/:collectionId/requests/reorder',
    schema: {
      params: collectionIdParamSchema,
      body: reorderRequestsBodySchema,
      response: {
        204: emptyResponseSchema,
        404: errorResponseSchema
      }
    },
    /**
     * Reorders saved requests within a folder or collection root.
     */
    handler: async (request, reply) => {
      try {
        const user = requireAuthenticatedUser(request);
        if (
          denyUnlessAllowed(
            reply,
            canUseDataApi(user) && canAccessCollection(user, request.params.collectionId)
          )
        ) {
          return;
        }

        await db.reorderRequests(
          request.params.collectionId,
          request.body.folderId,
          request.body.orderedRequestIds,
          user.id
        );
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
    url: '/requests/:id/move',
    schema: {
      params: idParamSchema,
      body: moveRequestBodySchema,
      response: {
        204: emptyResponseSchema,
        404: errorResponseSchema
      }
    },
    /**
     * Moves a saved request to another folder or collection root index.
     */
    handler: async (request, reply) => {
      try {
        const user = requireAuthenticatedUser(request);
        const existingRequest = await db.findRequestById(request.params.id);
        if (!existingRequest) {
          return reply.code(404).send({ error: 'Request not found' });
        }

        if (
          denyUnlessAllowed(
            reply,
            canUseDataApi(user) && canAccessCollection(user, existingRequest.collectionId)
          )
        ) {
          return;
        }

        await db.moveRequest(request.params.id, request.body.folderId, request.body.index, user.id);
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
