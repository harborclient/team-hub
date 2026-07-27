import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { IDatabase } from '#/db/IDatabase.js';
import {
  canAccessCollection,
  canDeleteDocument,
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
  documentRecordSchema,
  emptyResponseSchema,
  listDocumentsResponseSchema,
  moveDocumentBodySchema,
  reorderDocumentsBodySchema,
  saveDocumentBodySchema,
  serializeDocument,
  updateSaveDocumentBodySchema
} from '#/server/routes/schemas/entities.js';

/**
 * Registers bearer-protected collection document CRUD, reorder, and move routes.
 *
 * @param app - Encapsulated Fastify scope with auth applied.
 * @param db - Database used to persist collection documents.
 */
export async function registerDocumentRoutes(app: FastifyInstance, db: IDatabase): Promise<void> {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.route({
    method: 'GET',
    url: '/collections/:collectionId/documents',
    schema: {
      params: collectionIdParamSchema,
      response: {
        200: listDocumentsResponseSchema
      }
    },
    /**
     * Lists collection documents in a collection.
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
    method: 'POST',
    url: '/collections/:collectionId/documents',
    schema: {
      params: collectionIdParamSchema,
      body: saveDocumentBodySchema,
      response: {
        200: documentRecordSchema,
        400: errorResponseSchema,
        404: errorResponseSchema
      }
    },
    /**
     * Creates a new collection document in a collection.
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

        const document = await db.saveDocument(
          {
            collectionId: request.params.collectionId,
            name: request.body.name,
            content: request.body.content,
            folderId: request.body.folderId ?? null,
            marker: request.body.marker
          },
          user.id
        );
        return reply.send(serializeDocument(document));
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
    url: '/documents/:id',
    schema: {
      params: idParamSchema,
      body: updateSaveDocumentBodySchema,
      response: {
        200: documentRecordSchema,
        400: errorResponseSchema,
        404: errorResponseSchema
      }
    },
    /**
     * Updates an existing collection document by id.
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

        const document = await db.saveDocument(
          {
            id: request.params.id,
            collectionId: request.body.collectionId,
            name: request.body.name,
            content: request.body.content,
            folderId: request.body.folderId ?? null,
            marker: request.body.marker
          },
          user.id
        );
        return reply.send(serializeDocument(document));
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
    url: '/documents/:id',
    schema: {
      params: idParamSchema,
      response: {
        204: emptyResponseSchema,
        404: errorResponseSchema
      }
    },
    /**
     * Deletes a collection document by id.
     */
    handler: async (request, reply) => {
      try {
        const user = requireAuthenticatedUser(request);
        const existingDocument = await db.findDocumentById(request.params.id);
        if (!existingDocument) {
          return reply.code(404).send({ error: 'Document not found' });
        }

        if (denyUnlessAllowed(reply, canDeleteDocument(user, existingDocument))) {
          return;
        }

        await db.deleteDocument(request.params.id, user.id);
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
    url: '/collections/:collectionId/documents/reorder',
    schema: {
      params: collectionIdParamSchema,
      body: reorderDocumentsBodySchema,
      response: {
        204: emptyResponseSchema,
        404: errorResponseSchema
      }
    },
    /**
     * Reorders collection documents within a folder or collection root.
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

        await db.reorderDocuments(
          request.params.collectionId,
          request.body.folderId,
          request.body.orderedDocumentIds,
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
    url: '/documents/:id/move',
    schema: {
      params: idParamSchema,
      body: moveDocumentBodySchema,
      response: {
        204: emptyResponseSchema,
        404: errorResponseSchema
      }
    },
    /**
     * Moves a collection document to another folder or collection root index.
     */
    handler: async (request, reply) => {
      try {
        const user = requireAuthenticatedUser(request);
        const existingDocument = await db.findDocumentById(request.params.id);
        if (!existingDocument) {
          return reply.code(404).send({ error: 'Document not found' });
        }

        if (
          denyUnlessAllowed(
            reply,
            canUseDataApi(user) && canAccessCollection(user, existingDocument.collectionId)
          )
        ) {
          return;
        }

        await db.moveDocument(
          request.params.id,
          request.body.folderId,
          request.body.index,
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
}
