import { describe, expect, it } from 'vitest';
import { DEFAULT_LOGGING_CONFIG } from '#/config/loggingConfig.js';
import { createStubDatabase } from '#/db/stubDatabase.js';
import { createServer } from '#/server/createServer.js';
import { createStubThrottleStore } from '#/server/auth/throttle/stubThrottleStore.js';

/**
 * Builds a minimal database stub for route tests.
 *
 * @returns Mock database with no-op lifecycle methods.
 */
function createHealthStubDatabase() {
  const db = createStubDatabase();
  db.connect.mockResolvedValue(undefined);
  db.disconnect.mockResolvedValue(undefined);
  db.migrate.mockResolvedValue(undefined);
  db.createApiToken.mockResolvedValue(undefined);
  db.findActiveApiTokenByHash.mockResolvedValue(null);
  db.listApiTokens.mockResolvedValue([]);
  db.revokeApiToken.mockResolvedValue(false);
  db.touchApiTokenLastUsed.mockResolvedValue(undefined);
  return db;
}

describe('GET /health', () => {
  it('returns ok status and version without authentication', async () => {
    const app = await createServer(
      {
        host: '127.0.0.1',
        port: 8787,
        db: { driver: 'postgres' },
        redis: { host: '127.0.0.1', port: 6380 },
        llm: null,
        plugins: null,
        docs: null,
        logging: DEFAULT_LOGGING_CONFIG
      },
      { version: '0.1.0', db: createHealthStubDatabase(), throttleStore: createStubThrottleStore() }
    );

    const response = await app.inject({
      method: 'GET',
      url: '/health'
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'ok',
      version: '0.1.0'
    });

    await app.close();
  });
});
