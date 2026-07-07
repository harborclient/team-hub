import { describe, expect, it } from 'vitest';
import { createStubDatabase } from '#/db/stubDatabase.js';
import {
  authHeader,
  createProtectedTestApp,
  sampleApiTokenRecord,
  sampleUserRecord
} from '#/server/routes/test/createTestApp.js';

describe('GET /auth/session', () => {
  it('returns user, token, and capabilities for a user-role token', async () => {
    const db = createStubDatabase();
    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      user: {
        ...sampleUserRecord,
        llmAccess: true
      }
    });

    const response = await app.inject({
      method: 'GET',
      url: '/auth/session',
      headers: authHeader()
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      user: {
        id: sampleUserRecord.id,
        name: sampleUserRecord.name,
        role: 'user'
      },
      token: {
        id: sampleApiTokenRecord.id,
        prefix: sampleApiTokenRecord.tokenPrefix
      },
      capabilities: {
        dataApi: true,
        managementApi: false,
        llm: true
      }
    });

    await app.close();
  });

  it('returns admin capabilities for an admin-role token', async () => {
    const db = createStubDatabase();
    const app = await createProtectedTestApp({
      db,
      withValidAuth: true,
      user: {
        ...sampleUserRecord,
        role: 'admin',
        collectionAccess: [],
        environmentAccess: [],
        snippetAccess: [],

        llmAccess: false
      }
    });

    const response = await app.inject({
      method: 'GET',
      url: '/auth/session',
      headers: authHeader()
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      user: {
        id: sampleUserRecord.id,
        name: sampleUserRecord.name,
        role: 'admin'
      },
      token: {
        id: sampleApiTokenRecord.id,
        prefix: sampleApiTokenRecord.tokenPrefix
      },
      capabilities: {
        dataApi: false,
        managementApi: true,
        llm: false
      }
    });

    await app.close();
  });

  it('returns 401 without a bearer token', async () => {
    const db = createStubDatabase();
    const app = await createProtectedTestApp({ db });

    const response = await app.inject({
      method: 'GET',
      url: '/auth/session'
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'Unauthorized' });

    await app.close();
  });
});
