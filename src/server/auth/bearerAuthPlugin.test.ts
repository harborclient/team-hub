import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import type { IDatabase } from '#/db/IDatabase.js';
import { createStubDatabase } from '#/db/stubDatabase.js';
import type { ApiTokenRecord, UserRecord } from '#/db/types.js';
import { hashToken } from '#/server/auth/apiTokens.js';
import {
  buildAuthThrottleKey,
  createBearerAuthHook,
  registerBearerAuthDecorator
} from '#/server/auth/bearerAuthPlugin.js';
import { DEFAULT_THROTTLE_POLICY } from '#/server/auth/throttle/IThrottleStore.js';
import { createStubThrottleStore } from '#/server/auth/throttle/stubThrottleStore.js';

const sampleUser: UserRecord = {
  id: 'user-1',
  name: 'Test user',
  role: 'user',
  collectionAccess: ['*'],
  environmentAccess: ['*'],
  snippetAccess: [],

  llmAccess: false,
  llmModels: [],
  llmMonthlyTokenLimit: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  createdByUserId: null,
  updatedByUserId: null
};

const sampleRecord: ApiTokenRecord = {
  id: 'token-1',
  userId: sampleUser.id,
  name: 'Test token',
  tokenHash: hashToken('hbk_valid-token'),
  tokenPrefix: 'hbk_valid-',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  lastUsedAt: null,
  revokedAt: null,
  createdByUserId: null,
  updatedByUserId: null
};

/**
 * Builds a stub database for bearer auth integration tests.
 *
 * @param record - Active token returned by hash lookup, or null when invalid.
 * @param user - User returned for token ownership lookup, or null when missing.
 * @returns Mock database implementing token lookup and touch methods.
 */
function createAuthDb(
  record: ApiTokenRecord | null,
  user: UserRecord | null = sampleUser
): IDatabase {
  const db = createStubDatabase();
  db.findActiveApiTokenByHash.mockResolvedValue(record);
  db.findUserById.mockResolvedValue(user);
  db.touchApiTokenLastUsed.mockResolvedValue(undefined);
  return db;
}

/**
 * Creates a permissive throttle store stub for bearer auth tests.
 */
function createAuthThrottleStore() {
  const throttleStore = createStubThrottleStore();
  throttleStore.isBlocked.mockResolvedValue(false);
  throttleStore.recordFailure.mockResolvedValue(false);
  throttleStore.reset.mockResolvedValue(undefined);
  return throttleStore;
}

/**
 * Creates a Fastify app with one protected route behind bearer auth.
 *
 * @param db - Database stub used by the auth hook.
 * @param throttleStore - Throttle store stub used by the auth hook.
 * @returns Listening-ready Fastify instance with GET /protected.
 */
async function createProtectedApp(db: IDatabase, throttleStore = createAuthThrottleStore()) {
  const app = Fastify();

  await app.register(async (protectedApp) => {
    registerBearerAuthDecorator(protectedApp);
    protectedApp.addHook('onRequest', createBearerAuthHook(db, throttleStore));
    protectedApp.get('/protected', async () => ({ ok: true }));
  });

  return app;
}

describe('buildAuthThrottleKey', () => {
  it('uses the token hash when a bearer token is present', () => {
    const request = { ip: '127.0.0.1' } as Parameters<typeof buildAuthThrottleKey>[0];

    expect(buildAuthThrottleKey(request, 'hbk_secret')).toBe(
      `127.0.0.1:${hashToken('hbk_secret')}`
    );
  });

  it('uses none when the bearer token is missing', () => {
    const request = { ip: '127.0.0.1' } as Parameters<typeof buildAuthThrottleKey>[0];

    expect(buildAuthThrottleKey(request, null)).toBe('127.0.0.1:none');
  });
});

describe('createBearerAuthHook', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const db = createAuthDb(sampleRecord);
    const throttleStore = createAuthThrottleStore();
    const app = await createProtectedApp(db, throttleStore);

    const response = await app.inject({
      method: 'GET',
      url: '/protected'
    });

    expect(response.statusCode).toBe(401);
    expect(response.headers['www-authenticate']).toBe('Bearer');
    expect(response.json()).toEqual({ error: 'Unauthorized' });
    expect(throttleStore.recordFailure).toHaveBeenCalledWith('127.0.0.1:none');

    await app.close();
  });

  it('returns 401 when the bearer token is invalid', async () => {
    const db = createAuthDb(null);
    const throttleStore = createAuthThrottleStore();
    const app = await createProtectedApp(db, throttleStore);

    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: {
        authorization: 'Bearer hbk_invalid'
      }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'Unauthorized' });
    expect(throttleStore.recordFailure).toHaveBeenCalledWith(
      `127.0.0.1:${hashToken('hbk_invalid')}`
    );

    await app.close();
  });

  it('returns 401 when the token owner user is missing', async () => {
    const db = createAuthDb(sampleRecord, null);
    const throttleStore = createAuthThrottleStore();
    const app = await createProtectedApp(db, throttleStore);

    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: {
        authorization: 'Bearer hbk_valid-token'
      }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'Unauthorized' });
    expect(throttleStore.recordFailure).toHaveBeenCalledWith(
      `127.0.0.1:${hashToken('hbk_valid-token')}`
    );

    await app.close();
  });

  it('returns 429 when the throttle key is blocked', async () => {
    const db = createAuthDb(sampleRecord);
    const throttleStore = createAuthThrottleStore();
    throttleStore.isBlocked.mockResolvedValue(true);
    const app = await createProtectedApp(db, throttleStore);

    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: {
        authorization: 'Bearer hbk_valid-token'
      }
    });

    expect(response.statusCode).toBe(429);
    expect(response.headers['retry-after']).toBe(String(DEFAULT_THROTTLE_POLICY.blockSeconds));
    expect(response.json()).toEqual({ error: 'Too Many Requests' });
    expect(throttleStore.recordFailure).not.toHaveBeenCalled();

    await app.close();
  });

  it('returns 503 when the throttle store fails during the block check', async () => {
    const db = createAuthDb(sampleRecord);
    const throttleStore = createAuthThrottleStore();
    throttleStore.isBlocked.mockRejectedValue(new Error('redis down'));
    const app = await createProtectedApp(db, throttleStore);

    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: {
        authorization: 'Bearer hbk_valid-token'
      }
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: 'Service Unavailable' });

    await app.close();
  });

  it('allows requests with a valid bearer token', async () => {
    const db = createAuthDb(sampleRecord);
    const throttleStore = createAuthThrottleStore();
    const app = await createProtectedApp(db, throttleStore);

    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: {
        authorization: 'Bearer hbk_valid-token'
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    expect(db.findActiveApiTokenByHash).toHaveBeenCalledWith(sampleRecord.tokenHash);
    expect(db.findUserById).toHaveBeenCalledWith(sampleUser.id);
    expect(db.touchApiTokenLastUsed).toHaveBeenCalledWith(sampleRecord.id, expect.any(Date));
    expect(throttleStore.reset).toHaveBeenCalledWith(`127.0.0.1:${sampleRecord.tokenHash}`);

    await app.close();
  });
});
