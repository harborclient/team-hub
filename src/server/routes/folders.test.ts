import { describe, expect, it } from 'vitest';
import { createStubDatabase } from '#/db/stubDatabase.js';
import { authHeader, createProtectedTestApp } from '#/server/routes/test/createTestApp.js';
import { sampleAttribution } from '#/server/routes/test/sampleAttribution.js';

const sampleFolder = {
  id: 'folder-1',
  collectionId: 'collection-1',
  parentFolderId: null,
  name: 'Auth',
  sortOrder: 0,
  createdAt: new Date('2026-01-03T00:00:00.000Z'),
  updatedAt: new Date('2026-01-03T00:00:00.000Z'),
  ...sampleAttribution,
  marker: null
};

describe('folder routes', () => {
  it('creates a folder in a collection', async () => {
    const db = createStubDatabase();
    db.createFolder.mockResolvedValue(sampleFolder);
    const app = await createProtectedTestApp({ db, withValidAuth: true });

    const response = await app.inject({
      method: 'POST',
      url: '/collections/collection-1/folders',
      headers: authHeader(),
      payload: { name: 'Auth', parentFolderId: 'folder-parent' }
    });

    expect(response.statusCode).toBe(200);
    expect(db.createFolder).toHaveBeenCalledWith('collection-1', 'Auth', 'user-1', 'folder-parent');
    expect(response.json().name).toBe('Auth');

    await app.close();
  });

  it('reorders folders within a collection', async () => {
    const db = createStubDatabase();
    db.reorderFolders.mockResolvedValue(undefined);
    const app = await createProtectedTestApp({ db, withValidAuth: true });

    const response = await app.inject({
      method: 'PUT',
      url: '/collections/collection-1/folders/reorder',
      headers: authHeader(),
      payload: { parentFolderId: 'folder-parent', orderedFolderIds: ['folder-2', 'folder-1'] }
    });

    expect(response.statusCode).toBe(204);
    expect(db.reorderFolders).toHaveBeenCalledWith(
      'collection-1',
      'folder-parent',
      ['folder-2', 'folder-1'],
      'user-1'
    );

    await app.close();
  });

  it('moves a folder to a new parent and sibling position', async () => {
    const db = createStubDatabase();
    db.findFolderById.mockResolvedValue(sampleFolder);
    db.moveFolder.mockResolvedValue({
      ...sampleFolder,
      parentFolderId: 'folder-parent',
      sortOrder: 1
    });
    const app = await createProtectedTestApp({ db, withValidAuth: true });

    const response = await app.inject({
      method: 'PUT',
      url: '/folders/folder-1/move',
      headers: authHeader(),
      payload: { parentFolderId: 'folder-parent', sortOrder: 1 }
    });

    expect(response.statusCode).toBe(200);
    expect(db.moveFolder).toHaveBeenCalledWith('folder-1', 'folder-parent', 1, 'user-1');
    expect(response.json()).toEqual(
      expect.objectContaining({ id: 'folder-1', parentFolderId: 'folder-parent', sortOrder: 1 })
    );

    await app.close();
  });

  it('passes sidebar marker through folder rename', async () => {
    const db = createStubDatabase();
    db.findFolderById.mockResolvedValue(sampleFolder);
    db.renameFolder.mockResolvedValue({ ...sampleFolder, marker: '#0f2e56' });
    const app = await createProtectedTestApp({ db, withValidAuth: true });

    const response = await app.inject({
      method: 'PATCH',
      url: '/folders/folder-1',
      headers: authHeader(),
      payload: { name: 'Auth', marker: '#0f2e56' }
    });

    expect(response.statusCode).toBe(200);
    expect(db.renameFolder).toHaveBeenCalledWith('folder-1', 'Auth', 'user-1', '#0f2e56');
    expect(response.json().marker).toBe('#0f2e56');

    await app.close();
  });
});
