import { describe, expect, it } from 'vitest';
import { createStubDatabase } from '#/db/stubDatabase.js';
import { defaultAuth } from '#/db/types.js';
import {
  authHeader,
  createProtectedTestApp,
  sampleUserRecord,
  validBearerToken
} from '#/server/routes/test/createTestApp.js';
import { sampleAttribution } from '#/server/routes/test/sampleAttribution.js';

const sampleCollection = {
  id: 'collection-1',
  name: 'Shared API',
  variables: [],
  headers: [],
  auth: defaultAuth(),
  preRequestScript: '',
  postRequestScript: '',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  ...sampleAttribution,
  deletionLocked: false,
  marker: null
};

describe('collection routes', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const db = createStubDatabase();
    const app = await createProtectedTestApp({ db, withValidAuth: true });

    const response = await app.inject({
      method: 'GET',
      url: '/collections'
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('lists collections with a valid bearer token', async () => {
    const db = createStubDatabase();
    db.listCollections.mockResolvedValue([sampleCollection]);
    const app = await createProtectedTestApp({ db, withValidAuth: true });

    const response = await app.inject({
      method: 'GET',
      url: '/collections',
      headers: authHeader()
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      collections: [
        {
          ...sampleCollection,
          createdAt: sampleCollection.createdAt.toISOString(),
          updatedAt: sampleCollection.updatedAt.toISOString()
        }
      ]
    });
    expect(db.findActiveApiTokenByHash).toHaveBeenCalledWith(expect.any(String));

    await app.close();
  });

  it('creates a collection with a valid bearer token', async () => {
    const db = createStubDatabase();
    db.createCollection.mockResolvedValue(sampleCollection);
    const app = await createProtectedTestApp({ db, withValidAuth: true });

    const response = await app.inject({
      method: 'POST',
      url: '/collections',
      headers: authHeader(),
      payload: { name: 'Shared API' }
    });

    expect(response.statusCode).toBe(200);
    expect(db.createCollection).toHaveBeenCalledWith('Shared API', 'user-1');
    expect(response.json().name).toBe('Shared API');

    await app.close();
  });

  it('returns all collections for admin users on GET /collections', async () => {
    const db = createStubDatabase();
    db.listCollections.mockResolvedValue([sampleCollection]);
    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      user: {
        ...sampleUserRecord,
        role: 'admin',
        collectionAccess: [],
        environmentAccess: []
      }
    });

    const response = await app.inject({
      method: 'GET',
      url: '/collections',
      headers: authHeader()
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      collections: [
        {
          ...sampleCollection,
          createdAt: sampleCollection.createdAt.toISOString(),
          updatedAt: sampleCollection.updatedAt.toISOString()
        }
      ]
    });

    await app.close();
  });

  it('returns 403 for admin users on mutating collection routes', async () => {
    const db = createStubDatabase();
    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      user: {
        ...sampleUserRecord,
        role: 'admin',
        collectionAccess: [],
        environmentAccess: []
      }
    });

    const response = await app.inject({
      method: 'POST',
      url: '/collections',
      headers: authHeader(),
      payload: { name: 'Shared API' }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'Forbidden' });

    await app.close();
  });

  it('returns 403 when deleting a deletion-locked collection as a user', async () => {
    const db = createStubDatabase();
    db.findCollectionById.mockResolvedValue({ ...sampleCollection, deletionLocked: true });
    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      user: {
        ...sampleUserRecord,
        collectionAccess: ['collection-1'],
        environmentAccess: ['env-1']
      }
    });

    const response = await app.inject({
      method: 'DELETE',
      url: '/collections/collection-1',
      headers: authHeader()
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'Deletion is locked for this collection.' });
    expect(db.deleteCollection).not.toHaveBeenCalled();

    await app.close();
  });

  it('returns 403 when deleting a collection created by another user', async () => {
    const db = createStubDatabase();
    db.findCollectionById.mockResolvedValue({
      ...sampleCollection,
      createdByUserId: 'other-user'
    });
    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      user: {
        ...sampleUserRecord,
        collectionAccess: ['collection-1'],
        environmentAccess: ['env-1']
      }
    });

    const response = await app.inject({
      method: 'DELETE',
      url: '/collections/collection-1',
      headers: authHeader()
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'Forbidden' });
    expect(db.deleteCollection).not.toHaveBeenCalled();

    await app.close();
  });

  it('returns 403 when deleting a collection with no creator attribution', async () => {
    const db = createStubDatabase();
    db.findCollectionById.mockResolvedValue({ ...sampleCollection, createdByUserId: null });
    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      user: {
        ...sampleUserRecord,
        collectionAccess: ['collection-1'],
        environmentAccess: ['env-1']
      }
    });

    const response = await app.inject({
      method: 'DELETE',
      url: '/collections/collection-1',
      headers: authHeader()
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'Forbidden' });
    expect(db.deleteCollection).not.toHaveBeenCalled();

    await app.close();
  });

  it('deletes an unlocked collection for an authorized user', async () => {
    const db = createStubDatabase();
    db.findCollectionById.mockResolvedValue(sampleCollection);
    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      user: {
        ...sampleUserRecord,
        collectionAccess: ['collection-1'],
        environmentAccess: ['env-1']
      }
    });

    const response = await app.inject({
      method: 'DELETE',
      url: '/collections/collection-1',
      headers: authHeader()
    });

    expect(response.statusCode).toBe(204);
    expect(db.deleteCollection).toHaveBeenCalledWith('collection-1', 'user-1');

    await app.close();
  });

  it('filters collections for scoped users', async () => {
    const db = createStubDatabase();
    db.listCollections.mockResolvedValue([
      sampleCollection,
      { ...sampleCollection, id: 'collection-2', name: 'Other API' }
    ]);
    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      user: {
        ...sampleUserRecord,
        collectionAccess: ['collection-1'],
        environmentAccess: ['env-1']
      }
    });

    const response = await app.inject({
      method: 'GET',
      url: '/collections',
      headers: authHeader()
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().collections).toHaveLength(1);
    expect(response.json().collections[0].id).toBe('collection-1');

    await app.close();
  });

  it('returns 404 when updating a missing collection', async () => {
    const db = createStubDatabase();
    db.updateCollection.mockRejectedValue(new Error('Collection not found'));
    const app = await createProtectedTestApp({ db, withValidAuth: true });

    const response = await app.inject({
      method: 'PUT',
      url: '/collections/missing-id',
      headers: authHeader(),
      payload: {
        name: 'Updated',
        variables: [],
        headers: [],
        preRequestScript: '',
        postRequestScript: '',
        auth: defaultAuth()
      }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'Collection not found' });

    await app.close();
  });

  it('passes sidebar marker through collection updates', async () => {
    const db = createStubDatabase();
    db.updateCollection.mockResolvedValue({ ...sampleCollection, marker: '#32D2E2' });
    const app = await createProtectedTestApp({ db, withValidAuth: true });

    const response = await app.inject({
      method: 'PUT',
      url: '/collections/collection-1',
      headers: authHeader(),
      payload: {
        name: 'Shared API',
        variables: [],
        headers: [],
        preRequestScript: '',
        postRequestScript: '',
        auth: defaultAuth(),
        marker: '#32D2E2'
      }
    });

    expect(response.statusCode).toBe(200);
    expect(db.updateCollection).toHaveBeenCalledWith(
      'collection-1',
      'Shared API',
      [],
      [],
      '',
      '',
      defaultAuth(),
      'user-1',
      '#32D2E2'
    );
    expect(response.json().marker).toBe('#32D2E2');

    await app.close();
  });
});

describe('collection routes auth token', () => {
  it('accepts the configured bearer token', async () => {
    const db = createStubDatabase();
    db.listCollections.mockResolvedValue([]);
    const app = await createProtectedTestApp({ db, withValidAuth: true });

    const response = await app.inject({
      method: 'GET',
      url: '/collections',
      headers: { authorization: `Bearer ${validBearerToken}` }
    });

    expect(response.statusCode).toBe(200);
    await app.close();
  });
});
