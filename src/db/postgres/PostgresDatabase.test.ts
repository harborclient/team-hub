import { beforeEach, describe, expect, it, vi } from 'vitest';

const { PoolMock } = vi.hoisted(() => {
  /**
   * Mock Postgres Pool constructor used by {@link PostgresDatabase}.
   */
  class MockPool {
    /**
     * Borrowed client used to verify connectivity during connect.
     */
    client = {
      query: vi.fn().mockResolvedValue(undefined),
      release: vi.fn()
    };

    connect = vi.fn().mockImplementation(async () => this.client);
    query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    end = vi.fn().mockResolvedValue(undefined);

    /**
     * Captures pool construction config for assertions.
     *
     * @param config - Connection settings passed to the pool constructor.
     */
    constructor(public readonly config: unknown) {}
  }

  return {
    PoolMock: vi.fn(MockPool)
  };
});

vi.mock('pg', () => ({
  default: {
    Pool: PoolMock
  }
}));

import { PostgresDatabase } from '#/db/postgres/PostgresDatabase.js';

const validConfig = {
  driver: 'postgres',
  host: '127.0.0.1',
  port: 5432,
  user: 'harbor',
  password: 'harbor',
  database: 'harbor'
};

beforeEach(() => {
  PoolMock.mockClear();
});

describe('PostgresDatabase.fromConfig', () => {
  it('accepts valid config', () => {
    const db = PostgresDatabase.fromConfig(validConfig);

    expect(db).toBeInstanceOf(PostgresDatabase);
  });

  it('accepts port as a string', () => {
    const db = PostgresDatabase.fromConfig({
      ...validConfig,
      port: '5432'
    });

    expect(db).toBeInstanceOf(PostgresDatabase);
  });

  it('throws when database is missing', () => {
    expect(() =>
      PostgresDatabase.fromConfig({
        driver: 'postgres',
        host: '127.0.0.1',
        port: 5432,
        user: 'harbor',
        password: 'harbor'
      })
    ).toThrow();
  });

  it('throws when driver does not match', () => {
    expect(() =>
      PostgresDatabase.fromConfig({
        ...validConfig,
        driver: 'mysql'
      })
    ).toThrow();
  });
});

describe('PostgresDatabase lifecycle', () => {
  it('creates a pool, verifies connectivity, and closes on disconnect', async () => {
    const db = PostgresDatabase.fromConfig(validConfig);

    await db.connect();

    expect(PoolMock).toHaveBeenCalledWith({
      host: '127.0.0.1',
      port: 5432,
      user: 'harbor',
      password: 'harbor',
      database: 'harbor'
    });

    const pool = PoolMock.mock.instances[0];
    expect(pool).toBeDefined();
    expect(pool.connect).toHaveBeenCalledOnce();
    expect(pool.client.query).toHaveBeenCalledWith('SELECT 1');
    expect(pool.client.release).toHaveBeenCalledOnce();

    await db.disconnect();

    expect(pool.end).toHaveBeenCalledOnce();
  });

  it('is idempotent when connect is called more than once', async () => {
    const db = PostgresDatabase.fromConfig(validConfig);

    await db.connect();
    await db.connect();

    expect(PoolMock).toHaveBeenCalledOnce();

    const pool = PoolMock.mock.instances[0];
    expect(pool.connect).toHaveBeenCalledOnce();
  });

  it('is safe to call disconnect when not connected', async () => {
    const db = PostgresDatabase.fromConfig(validConfig);

    await expect(db.disconnect()).resolves.toBeUndefined();
  });
});

describe('PostgresDatabase api tokens', () => {
  it('runs all migrate SQL statements against the pool', async () => {
    const db = PostgresDatabase.fromConfig(validConfig);

    await db.connect();
    await db.migrate();

    const pool = PoolMock.mock.instances[0];
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('CREATE TABLE IF NOT EXISTS api_tokens'),
      []
    );
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('CREATE TABLE IF NOT EXISTS collections'),
      []
    );
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('CREATE TABLE IF NOT EXISTS environments'),
      []
    );
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('CREATE TABLE IF NOT EXISTS folders'),
      []
    );
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('CREATE TABLE IF NOT EXISTS requests'),
      []
    );
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('CREATE TABLE IF NOT EXISTS users'),
      []
    );
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('ADD COLUMN IF NOT EXISTS user_id'),
      []
    );
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('SET snippet_access = \'["*"]\''),
      []
    );

    await db.disconnect();
  });

  it('throws when api token methods are called before connect', async () => {
    const db = PostgresDatabase.fromConfig(validConfig);

    await expect(
      db.createApiToken(
        {
          userId: 'user-1',
          id: 'id',
          name: 'name',
          tokenHash: 'hash',
          tokenPrefix: 'prefix',
          createdAt: new Date(),
          lastUsedAt: null,
          revokedAt: null,
          createdByUserId: null,
          updatedByUserId: null
        },
        'user-1'
      )
    ).rejects.toThrow('Postgres database is not connected.');
  });
});

describe('PostgresDatabase collections', () => {
  it('inserts a new collection with generated id', async () => {
    const db = PostgresDatabase.fromConfig(validConfig);
    await db.connect();

    const pool = PoolMock.mock.instances[0];
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'collection-1',
          name: 'Shared API',
          variables: '[]',
          headers: '[]',
          auth: '{"type":"none","basic":{"username":"","password":""},"bearer":{"token":""}}',
          pre_request_script: '',
          post_request_script: '',
          created_at: createdAt,
          updated_at: createdAt,
          created_by_user_id: 'user-1',
          updated_by_user_id: 'user-1',
          deletion_locked: false,
          marker: null
        }
      ],
      rowCount: 1
    });
    pool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const collection = await db.createCollection('Shared API', 'user-1');

    expect(collection.name).toBe('Shared API');
    expect(collection.id).toBe('collection-1');
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO collections'),
      expect.arrayContaining(['Shared API'])
    );

    await db.disconnect();
  });
});
