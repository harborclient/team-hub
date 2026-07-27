import { describe, expect, it } from 'vitest';
import { createStubDatabase } from '#/db/stubDatabase.js';
import { authHeader, createProtectedTestApp } from '#/server/routes/test/createTestApp.js';
import { sampleAttribution } from '#/server/routes/test/sampleAttribution.js';

const sampleDocument = {
  id: 'document-1',
  collectionId: 'collection-1',
  name: 'README.md',
  content: '# Hello',
  folderId: null,
  sortOrder: 0,
  createdAt: new Date('2026-01-04T00:00:00.000Z'),
  updatedAt: new Date('2026-01-05T00:00:00.000Z'),
  ...sampleAttribution,
  marker: null
};

describe('document routes', () => {
  it('creates a collection document in a collection', async () => {
    const db = createStubDatabase();
    db.saveDocument.mockResolvedValue(sampleDocument);
    const app = await createProtectedTestApp({ db, withValidAuth: true });

    const response = await app.inject({
      method: 'POST',
      url: '/collections/collection-1/documents',
      headers: authHeader(),
      payload: {
        name: 'README.md',
        content: '# Hello'
      }
    });

    expect(response.statusCode).toBe(200);
    expect(db.saveDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        collectionId: 'collection-1',
        name: 'README.md',
        content: '# Hello'
      }),
      'user-1'
    );

    await app.close();
  });

  it('returns 403 when deleting a document created by another user', async () => {
    const db = createStubDatabase();
    db.findDocumentById.mockResolvedValue({ ...sampleDocument, createdByUserId: 'other-user' });
    const app = await createProtectedTestApp({ db, withValidAuth: true });

    const response = await app.inject({
      method: 'DELETE',
      url: '/documents/document-1',
      headers: authHeader()
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'Forbidden' });
    expect(db.deleteDocument).not.toHaveBeenCalled();

    await app.close();
  });

  it('returns 403 when deleting a document with no creator attribution', async () => {
    const db = createStubDatabase();
    db.findDocumentById.mockResolvedValue({ ...sampleDocument, createdByUserId: null });
    const app = await createProtectedTestApp({ db, withValidAuth: true });

    const response = await app.inject({
      method: 'DELETE',
      url: '/documents/document-1',
      headers: authHeader()
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'Forbidden' });
    expect(db.deleteDocument).not.toHaveBeenCalled();

    await app.close();
  });

  it('deletes a collection document by id', async () => {
    const db = createStubDatabase();
    db.findDocumentById.mockResolvedValue(sampleDocument);
    db.deleteDocument.mockResolvedValue(undefined);
    const app = await createProtectedTestApp({ db, withValidAuth: true });

    const response = await app.inject({
      method: 'DELETE',
      url: '/documents/document-1',
      headers: authHeader()
    });

    expect(response.statusCode).toBe(204);
    expect(db.deleteDocument).toHaveBeenCalledWith('document-1', 'user-1');

    await app.close();
  });
});
