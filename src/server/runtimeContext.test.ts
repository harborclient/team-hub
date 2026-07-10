import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi, type Mocked } from 'vitest';
import { loadServerConfig } from '#/config/serverConfig.js';
import type { IDatabase } from '#/db/IDatabase.js';
import { createStubDatabase } from '#/db/stubDatabase.js';
import type { IThrottleStore } from '#/server/auth/throttle/IThrottleStore.js';
import { createStubThrottleStore } from '#/server/auth/throttle/stubThrottleStore.js';
import {
  createRuntimeContext,
  connectRuntimeContext,
  disconnectAll,
  logConfigReloadResult,
  reloadRuntimeConfig
} from '#/server/runtimeContext.js';

const { createDatabaseMock, createThrottleStoreMock } = vi.hoisted(() => ({
  createDatabaseMock: vi.fn(),
  createThrottleStoreMock: vi.fn()
}));

vi.mock('#/db/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#/db/index.js')>();
  return {
    ...actual,
    createDatabase: createDatabaseMock
  };
});

vi.mock('#/server/auth/throttle/createThrottleStore.js', () => ({
  createThrottleStore: createThrottleStoreMock
}));

const sampleDbSection = `db:
  driver: postgres
  host: 127.0.0.1
  port: 5432
  user: harbor
  password: harbor
  database: harbor
`;

const sampleRedisSection = `redis:
  host: 127.0.0.1
  port: 6380
`;

/**
 * Writes a temporary server.yaml file for runtime context tests.
 *
 * @param contents - Raw YAML written to the temp config file.
 * @returns Absolute path to the written config file.
 */
function writeConfig(contents: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'team-hub-runtime-'));
  const configPath = path.join(dir, 'server.yaml');
  writeFileSync(configPath, contents, 'utf8');
  return configPath;
}

/**
 * Builds a database stub whose connect/disconnect calls can be tracked per instance.
 *
 * @param label - Marker stored on the stub for swap assertions.
 * @returns Configured database stub.
 */
function createTrackedDatabase(label: string): Mocked<IDatabase> {
  const db = createStubDatabase();
  db.connect.mockImplementation(async () => undefined);
  db.disconnect.mockImplementation(async () => undefined);
  db.ensureSystemUser.mockImplementation(async () => undefined);
  Object.defineProperty(db, '__label', { value: label });
  return db;
}

/**
 * Builds a throttle store stub whose connect/disconnect calls can be tracked per instance.
 *
 * @param label - Marker stored on the stub for swap assertions.
 * @returns Configured throttle store stub.
 */
function createTrackedThrottleStore(label: string): Mocked<IThrottleStore> {
  const store = createStubThrottleStore();
  store.connect.mockImplementation(async () => undefined);
  store.disconnect.mockImplementation(async () => undefined);
  Object.defineProperty(store, '__label', { value: label });
  return store;
}

/**
 * Returns the test label attached to a tracked database or throttle stub.
 *
 * @param instance - Stub instance created by the tracked factory helpers.
 * @returns Label string used when the stub was created.
 */
function readLabel(instance: object): string {
  return Reflect.get(instance, '__label') as string;
}

beforeEach(() => {
  createDatabaseMock.mockReset();
  createThrottleStoreMock.mockReset();
});

describe('reloadRuntimeConfig', () => {
  it('reloads llm and plugins without reconnecting unchanged db and redis', async () => {
    const configPath = writeConfig(`server:
  port: 8787
  host: 127.0.0.1
${sampleDbSection}${sampleRedisSection}`);
    const initialDb = createTrackedDatabase('db-initial');
    const initialStore = createTrackedThrottleStore('redis-initial');
    createDatabaseMock.mockReturnValueOnce(initialDb);
    createThrottleStoreMock.mockReturnValueOnce(initialStore);

    const initialConfig = loadServerConfig(configPath);
    const ctx = createRuntimeContext(initialConfig, configPath);

    writeFileSync(
      configPath,
      `server:
  port: 8787
  host: 127.0.0.1
${sampleDbSection}${sampleRedisSection}llm:
  providers:
    openai:
      apiKey: sk-test
  models:
    - gpt-4o
plugins:
  catalogs:
    - https://example.com/catalog.json
  trusted: []
`,
      'utf8'
    );

    const result = await reloadRuntimeConfig(ctx);

    expect(result.fatalError).toBeUndefined();
    expect(result.sections).toEqual(
      expect.arrayContaining([
        { section: 'db', status: 'unchanged' },
        { section: 'redis', status: 'unchanged' },
        { section: 'llm', status: 'reloaded' },
        { section: 'plugins', status: 'reloaded' },
        { section: 'server', status: 'unchanged' }
      ])
    );
    expect(ctx.getLlm()).toEqual({
      providers: { openai: { apiKey: 'sk-test' } },
      models: ['gpt-4o']
    });
    expect(ctx.getPlugins()).toEqual({
      catalogs: ['https://example.com/catalog.json'],
      trusted: []
    });
    expect(readLabel(initialDb)).toBe('db-initial');
    expect(createDatabaseMock).toHaveBeenCalledOnce();
  });

  it('swaps db and redis connections when their sections change', async () => {
    const configPath = writeConfig(`server:
  port: 8787
  host: 127.0.0.1
${sampleDbSection}${sampleRedisSection}`);
    const initialDb = createTrackedDatabase('db-initial');
    const initialStore = createTrackedThrottleStore('redis-initial');
    const nextDb = createTrackedDatabase('db-next');
    const nextStore = createTrackedThrottleStore('redis-next');
    createDatabaseMock.mockReturnValueOnce(initialDb).mockReturnValueOnce(nextDb);
    createThrottleStoreMock.mockReturnValueOnce(initialStore).mockReturnValueOnce(nextStore);

    const ctx = createRuntimeContext(loadServerConfig(configPath), configPath);
    await initialDb.connect();
    await initialStore.connect();

    writeFileSync(
      configPath,
      `server:
  port: 8787
  host: 127.0.0.1
db:
  driver: postgres
  host: 127.0.0.1
  port: 5432
  user: harbor
  password: harbor
  database: harbor-next
redis:
  host: 127.0.0.1
  port: 6381
`,
      'utf8'
    );

    const result = await reloadRuntimeConfig(ctx);

    expect(result.sections).toEqual(
      expect.arrayContaining([
        { section: 'db', status: 'reloaded' },
        { section: 'redis', status: 'reloaded' }
      ])
    );
    expect(nextDb.connect).toHaveBeenCalledOnce();
    expect(nextDb.ensureSystemUser).toHaveBeenCalledOnce();
    expect(initialDb.disconnect).toHaveBeenCalledOnce();
    expect(nextStore.connect).toHaveBeenCalledOnce();
    expect(initialStore.disconnect).toHaveBeenCalledOnce();
    await ctx.db.listUsers();
    expect(createDatabaseMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ database: 'harbor-next' })
    );
  });

  it('keeps the previous db connection when the new db connection fails', async () => {
    const configPath = writeConfig(`server:
  port: 8787
  host: 127.0.0.1
${sampleDbSection}${sampleRedisSection}`);
    const initialDb = createTrackedDatabase('db-initial');
    const failingDb = createTrackedDatabase('db-failing');
    failingDb.connect.mockRejectedValueOnce(new Error('db connect failed'));
    createDatabaseMock.mockReturnValueOnce(initialDb).mockReturnValueOnce(failingDb);
    createThrottleStoreMock.mockReturnValue(createTrackedThrottleStore('redis-initial'));

    const ctx = createRuntimeContext(loadServerConfig(configPath), configPath);

    writeFileSync(
      configPath,
      `server:
  port: 8787
  host: 127.0.0.1
db:
  driver: postgres
  host: 127.0.0.1
  port: 5432
  user: harbor
  password: harbor
  database: harbor-next
${sampleRedisSection}`,
      'utf8'
    );

    const result = await reloadRuntimeConfig(ctx);

    expect(result.sections).toEqual(
      expect.arrayContaining([{ section: 'db', status: 'failed', error: 'db connect failed' }])
    );
    expect(initialDb.disconnect).not.toHaveBeenCalled();
    expect(failingDb.connect).toHaveBeenCalledOnce();
  });

  it('returns a fatal error and preserves config when the file is invalid', async () => {
    const configPath = writeConfig(`server:
  port: 8787
  host: 127.0.0.1
${sampleDbSection}${sampleRedisSection}llm:
  providers:
    openai:
      apiKey: sk-test
`);
    createDatabaseMock.mockReturnValue(createTrackedDatabase('db-initial'));
    createThrottleStoreMock.mockReturnValue(createTrackedThrottleStore('redis-initial'));

    const ctx = createRuntimeContext(loadServerConfig(configPath), configPath);
    const previousLlm = ctx.getLlm();

    writeFileSync(configPath, 'not: [valid', 'utf8');

    const result = await reloadRuntimeConfig(ctx);

    expect(result.fatalError).toMatch(/Failed to parse config file|Config must be a YAML mapping/);
    expect(result.sections).toEqual([]);
    expect(ctx.getLlm()).toEqual(previousLlm);
  });

  it('reports restart-required when server host or port changes', async () => {
    const configPath = writeConfig(`server:
  port: 8787
  host: 127.0.0.1
${sampleDbSection}${sampleRedisSection}`);
    createDatabaseMock.mockReturnValue(createTrackedDatabase('db-initial'));
    createThrottleStoreMock.mockReturnValue(createTrackedThrottleStore('redis-initial'));

    const ctx = createRuntimeContext(loadServerConfig(configPath), configPath);

    writeFileSync(
      configPath,
      `server:
  port: 8788
  host: 127.0.0.1
${sampleDbSection}${sampleRedisSection}`,
      'utf8'
    );

    const result = await reloadRuntimeConfig(ctx);

    expect(result.sections).toEqual(
      expect.arrayContaining([
        {
          section: 'server',
          status: 'restart-required',
          error: 'Changes to server.host or server.port require a full process restart.'
        }
      ])
    );
    expect(ctx.port).toBe(8787);
  });
});

describe('logConfigReloadResult', () => {
  it('logs a success summary to the console', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    logConfigReloadResult({
      sections: [
        { section: 'db', status: 'unchanged' },
        { section: 'llm', status: 'reloaded' }
      ]
    });

    expect(log).toHaveBeenCalledWith('Team Hub config reloaded (db: unchanged, llm: reloaded).');

    log.mockRestore();
  });

  it('logs fatal reload errors to stderr', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    logConfigReloadResult({
      sections: [],
      fatalError: 'Config file not found: /missing/server.yaml'
    });

    expect(error).toHaveBeenCalledWith(
      'Team Hub config reload failed: Config file not found: /missing/server.yaml'
    );

    error.mockRestore();
  });
});

describe('connectRuntimeContext', () => {
  it('connects the database and provisions the system user without running migrate', async () => {
    const db = createTrackedDatabase('db-initial');
    const store = createTrackedThrottleStore('redis-initial');
    createDatabaseMock.mockReturnValue(db);
    createThrottleStoreMock.mockReturnValue(store);

    const configPath = writeConfig(`server:
  port: 8787
  host: 127.0.0.1
${sampleDbSection}${sampleRedisSection}`);
    const ctx = createRuntimeContext(loadServerConfig(configPath), configPath);

    await connectRuntimeContext(ctx);

    expect(db.connect).toHaveBeenCalledOnce();
    expect(db.ensureSystemUser).toHaveBeenCalledOnce();
    expect(db.migrate).not.toHaveBeenCalled();
    expect(store.connect).toHaveBeenCalledOnce();
  });
});

describe('disconnectAll', () => {
  it('disconnects the active db and throttle store instances', async () => {
    const db = createTrackedDatabase('db-initial');
    const store = createTrackedThrottleStore('redis-initial');
    createDatabaseMock.mockReturnValue(db);
    createThrottleStoreMock.mockReturnValue(store);

    const configPath = writeConfig(`server:
  port: 8787
  host: 127.0.0.1
${sampleDbSection}${sampleRedisSection}`);
    const ctx = createRuntimeContext(loadServerConfig(configPath), configPath);

    await disconnectAll(ctx);

    expect(db.disconnect).toHaveBeenCalledOnce();
    expect(store.disconnect).toHaveBeenCalledOnce();
  });
});
