import { describe, expect, it } from 'vitest';
import { createStubDatabase } from '#/db/stubDatabase.js';
import {
  authHeader,
  createProtectedTestApp,
  sampleUserRecord
} from '#/server/routes/test/createTestApp.js';
import { sampleAttribution } from '#/server/routes/test/sampleAttribution.js';

const sampleEnvironment = {
  id: 'env-1',
  name: 'Production',
  variables: [],
  createdAt: new Date('2026-01-02T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  ...sampleAttribution,
  deletionLocked: false,
  marker: null
};

describe('environment routes', () => {
  it('lists environments with a valid bearer token', async () => {
    const db = createStubDatabase();
    db.listEnvironments.mockResolvedValue([sampleEnvironment]);
    const app = await createProtectedTestApp({ db, withValidAuth: true });

    const response = await app.inject({
      method: 'GET',
      url: '/environments',
      headers: authHeader()
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      environments: [
        {
          ...sampleEnvironment,
          createdAt: sampleEnvironment.createdAt.toISOString(),
          updatedAt: sampleEnvironment.updatedAt.toISOString()
        }
      ]
    });

    await app.close();
  });

  it('creates an environment with a valid bearer token', async () => {
    const db = createStubDatabase();
    db.createEnvironment.mockResolvedValue(sampleEnvironment);
    const app = await createProtectedTestApp({ db, withValidAuth: true });

    const response = await app.inject({
      method: 'POST',
      url: '/environments',
      headers: authHeader(),
      payload: { name: 'Production' }
    });

    expect(response.statusCode).toBe(200);
    expect(db.createEnvironment).toHaveBeenCalledWith('Production', 'user-1');
    expect(response.json().id).toBe('env-1');

    await app.close();
  });

  it('returns all environments for admin users on GET /environments', async () => {
    const db = createStubDatabase();
    db.listEnvironments.mockResolvedValue([sampleEnvironment]);
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
      url: '/environments',
      headers: authHeader()
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      environments: [
        {
          ...sampleEnvironment,
          createdAt: sampleEnvironment.createdAt.toISOString(),
          updatedAt: sampleEnvironment.updatedAt.toISOString()
        }
      ]
    });

    await app.close();
  });

  it('returns 403 for admin users on mutating environment routes', async () => {
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
      url: '/environments',
      headers: authHeader(),
      payload: { name: 'Production' }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'Forbidden' });

    await app.close();
  });

  it('returns 403 when deleting a deletion-locked environment as a user', async () => {
    const db = createStubDatabase();
    db.findEnvironmentById.mockResolvedValue({ ...sampleEnvironment, deletionLocked: true });
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
      url: '/environments/env-1',
      headers: authHeader()
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'Deletion is locked for this environment.' });
    expect(db.deleteEnvironment).not.toHaveBeenCalled();

    await app.close();
  });

  it('deletes an unlocked environment for an authorized user', async () => {
    const db = createStubDatabase();
    db.findEnvironmentById.mockResolvedValue(sampleEnvironment);
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
      url: '/environments/env-1',
      headers: authHeader()
    });

    expect(response.statusCode).toBe(204);
    expect(db.deleteEnvironment).toHaveBeenCalledWith('env-1', 'user-1');

    await app.close();
  });
});
