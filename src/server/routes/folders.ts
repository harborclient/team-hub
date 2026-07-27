import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { IDatabase } from '#/db/IDatabase.js';
import { canAccessCollection, canUseDataApi } from '#/server/auth/accessControl.js';
import { handleDbError } from '#/server/routes/errors.js';
import { denyUnlessAllowed, requireAuthenticatedUser } from '#/server/routes/authorize.js';
import {
  collectionIdParamSchema,
  errorResponseSchema,
  idParamSchema
} from '#/server/routes/schemas/common.js';
import {
  createFolderBodySchema,
  emptyResponseSchema,
  folderRecordSchema,
  listFoldersResponseSchema,
  moveFolderBodySchema,
  renameFolderBodySchema,
  reorderFoldersBodySchema,
  serializeFolder
} from '#/server/routes/schemas/entities.js';

/**
 * Registers bearer-protected folder CRUD and reorder routes.
 *
 * @param app - Encapsulated Fastify scope with auth applied.
 * @param db - Database used to persist folders.
 */
export async function registerFolderRoutes(app: FastifyInstance, db: IDatabase): Promise<void> {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.route({
    method: 'GET',
    url: '/collections/:collectionId/folders',
    schema: {
      params: collectionIdParamSchema,
      response: {
        200: listFoldersResponseSchema
      }
    },
    /**
     * Lists folders in a collection ordered by sort order then name.
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
    method: 'POST',
    url: '/collections/:collectionId/folders',
    schema: {
      params: collectionIdParamSchema,
      body: createFolderBodySchema,
      response: {
        200: folderRecordSchema,
        400: errorResponseSchema
      }
    },
    /**
     * Creates a folder in the given collection.
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

        const folder = await db.createFolder(
          request.params.collectionId,
          request.body.name,
          user.id,
          request.body.parentFolderId
        );
        return reply.send(serializeFolder(folder));
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
    url: '/folders/:id/move',
    schema: {
      params: idParamSchema,
      body: moveFolderBodySchema,
      response: {
        200: folderRecordSchema,
        400: errorResponseSchema,
        404: errorResponseSchema
      }
    },
    /**
     * Moves a folder to another parent or collection root.
     */
    handler: async (request, reply) => {
      try {
        const user = requireAuthenticatedUser(request);
        const existingFolder = await db.findFolderById(request.params.id);
        if (!existingFolder) {
          return reply.code(404).send({ error: 'Folder not found' });
        }
        if (
          denyUnlessAllowed(
            reply,
            canUseDataApi(user) && canAccessCollection(user, existingFolder.collectionId)
          )
        ) {
          return;
        }

        const folder = await db.moveFolder(
          request.params.id,
          request.body.parentFolderId,
          request.body.sortOrder,
          user.id
        );
        return reply.send(serializeFolder(folder));
      } catch (error) {
        if (handleDbError(reply, error)) {
          return;
        }
        throw error;
      }
    }
  });

  routes.route({
    method: 'PATCH',
    url: '/folders/:id',
    schema: {
      params: idParamSchema,
      body: renameFolderBodySchema,
      response: {
        200: folderRecordSchema,
        400: errorResponseSchema,
        404: errorResponseSchema
      }
    },
    /**
     * Renames a folder by id.
     */
    handler: async (request, reply) => {
      try {
        const user = requireAuthenticatedUser(request);
        const existingFolder = await db.findFolderById(request.params.id);
        if (!existingFolder) {
          return reply.code(404).send({ error: 'Folder not found' });
        }

        if (
          denyUnlessAllowed(
            reply,
            canUseDataApi(user) && canAccessCollection(user, existingFolder.collectionId)
          )
        ) {
          return;
        }

        const folder = await db.renameFolder(
          request.params.id,
          request.body.name,
          user.id,
          request.body.marker
        );
        return reply.send(serializeFolder(folder));
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
    url: '/folders/:id',
    schema: {
      params: idParamSchema,
      response: {
        204: emptyResponseSchema,
        404: errorResponseSchema
      }
    },
    /**
     * Deletes a folder and all requests inside it.
     */
    handler: async (request, reply) => {
      try {
        const user = requireAuthenticatedUser(request);
        const existingFolder = await db.findFolderById(request.params.id);
        if (!existingFolder) {
          return reply.code(404).send({ error: 'Folder not found' });
        }

        if (
          denyUnlessAllowed(
            reply,
            canUseDataApi(user) && canAccessCollection(user, existingFolder.collectionId)
          )
        ) {
          return;
        }

        await db.deleteFolder(request.params.id, user.id);
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
    url: '/collections/:collectionId/folders/reorder',
    schema: {
      params: collectionIdParamSchema,
      body: reorderFoldersBodySchema,
      response: {
        204: emptyResponseSchema,
        404: errorResponseSchema
      }
    },
    /**
     * Reorders folders within a collection.
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

        await db.reorderFolders(
          request.params.collectionId,
          request.body.parentFolderId,
          request.body.orderedFolderIds,
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
