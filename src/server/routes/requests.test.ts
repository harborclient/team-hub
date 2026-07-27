import { describe, expect, it } from 'vitest';
import { createStubDatabase } from '#/db/stubDatabase.js';
import { defaultAuth } from '#/db/types.js';
import { authHeader, createProtectedTestApp } from '#/server/routes/test/createTestApp.js';
import { sampleAttribution } from '#/server/routes/test/sampleAttribution.js';

const sampleRequest = {
  id: 'request-1',
  collectionId: 'collection-1',
  name: 'Get health',
  method: 'GET' as const,
  url: '/health',
  headers: [],
  params: [],
  auth: defaultAuth(),
  body: '',
  bodyType: 'none' as const,
  preRequestScript: '',
  postRequestScript: '',
  comment: '',
  folderId: null,
  sortOrder: 0,
  createdAt: new Date('2026-01-04T00:00:00.000Z'),
  updatedAt: new Date('2026-01-05T00:00:00.000Z'),
  ...sampleAttribution,
  marker: null
};

describe('request routes', () => {
  it('creates a saved request in a collection', async () => {
    const db = createStubDatabase();
    db.saveRequest.mockResolvedValue(sampleRequest);
    const app = await createProtectedTestApp({ db, withValidAuth: true });

    const response = await app.inject({
      method: 'POST',
      url: '/collections/collection-1/requests',
      headers: authHeader(),
      payload: {
        name: 'Get health',
        method: 'GET',
        url: '/health',
        headers: [],
        params: [],
        auth: defaultAuth(),
        body: '',
        bodyType: 'none',
        preRequestScript: '',
        postRequestScript: '',
        comment: ''
      }
    });

    expect(response.statusCode).toBe(200);
    expect(db.saveRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        collectionId: 'collection-1',
        name: 'Get health'
      }),
      'user-1'
    );

    await app.close();
  });

  it('returns 403 when deleting a request created by another user', async () => {
    const db = createStubDatabase();
    db.findRequestById.mockResolvedValue({ ...sampleRequest, createdByUserId: 'other-user' });
    const app = await createProtectedTestApp({ db, withValidAuth: true });

    const response = await app.inject({
      method: 'DELETE',
      url: '/requests/request-1',
      headers: authHeader()
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'Forbidden' });
    expect(db.deleteRequest).not.toHaveBeenCalled();

    await app.close();
  });

  it('returns 403 when deleting a request with no creator attribution', async () => {
    const db = createStubDatabase();
    db.findRequestById.mockResolvedValue({ ...sampleRequest, createdByUserId: null });
    const app = await createProtectedTestApp({ db, withValidAuth: true });

    const response = await app.inject({
      method: 'DELETE',
      url: '/requests/request-1',
      headers: authHeader()
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'Forbidden' });
    expect(db.deleteRequest).not.toHaveBeenCalled();

    await app.close();
  });

  it('deletes a saved request by id', async () => {
    const db = createStubDatabase();
    db.findRequestById.mockResolvedValue(sampleRequest);
    db.deleteRequest.mockResolvedValue(undefined);
    const app = await createProtectedTestApp({ db, withValidAuth: true });

    const response = await app.inject({
      method: 'DELETE',
      url: '/requests/request-1',
      headers: authHeader()
    });

    expect(response.statusCode).toBe(204);
    expect(db.deleteRequest).toHaveBeenCalledWith('request-1', 'user-1');

    await app.close();
  });
});
