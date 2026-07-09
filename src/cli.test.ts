import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CommanderError } from 'commander';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_LOGGING_CONFIG } from '#/config/loggingConfig.js';

const { createServerMock, createDatabaseMock, createThrottleStoreMock } = vi.hoisted(() => ({
  createServerMock: vi.fn(),
  createDatabaseMock: vi.fn(),
  createThrottleStoreMock: vi.fn()
}));

vi.mock('#/index.js', () => ({
  createServer: createServerMock
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

import { createProgram } from '#/cli/program.js';
import { collectionListCommand } from '#/cli/collectionCommand.js';
import { llmListCommand } from '#/cli/llmCommand.js';
import { migrateCommand } from '#/cli/migrateCommand.js';
import {
  userCreateCommand,
  userListCommand,
  userShowCommand,
  userTokenCreateCommand,
  userTokenListCommand,
  userTokenRevokeCommand
} from '#/cli/userCommand.js';
import { ConfigError, loadServerConfig, resolveConfigPath } from '#/config/serverConfig.js';
import type { IDatabase } from '#/db/index.js';
import { currentUsagePeriod } from '#/server/llm/models.js';
import { createStubDatabase } from '#/db/stubDatabase.js';
import { defaultAuth } from '#/db/types.js';
import type { IThrottleStore } from '#/server/auth/throttle/IThrottleStore.js';
import { createStubThrottleStore } from '#/server/auth/throttle/stubThrottleStore.js';
import { createRuntimeContext } from '#/server/runtimeContext.js';
import { startCommand, runServer } from '#/server.js';

/**
 * Builds a minimal database mock for runServer tests.
 *
 * @returns Mock database with spied connect and disconnect methods.
 */
function createMockDatabase(): IDatabase {
  const db = createStubDatabase();
  db.connect.mockResolvedValue(undefined);
  db.disconnect.mockResolvedValue(undefined);
  db.migrate.mockResolvedValue(undefined);
  db.getSystemUserId.mockReturnValue('system-user-id');
  db.createUser.mockResolvedValue({
    id: 'user-1',
    name: 'Alice',
    role: 'user',
    collectionAccess: ['*'],
    environmentAccess: ['*'],
    snippetAccess: ['*'],
    llmAccess: false,
    llmModels: [],
    llmMonthlyTokenLimit: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    createdByUserId: 'system-user-id',
    updatedByUserId: 'system-user-id'
  });
  db.findUserById.mockResolvedValue({
    id: 'user-1',
    name: 'Alice',
    role: 'user',
    collectionAccess: ['*'],
    environmentAccess: ['*'],
    snippetAccess: ['*'],
    llmAccess: false,
    llmModels: [],
    llmMonthlyTokenLimit: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    createdByUserId: 'system-user-id',
    updatedByUserId: 'system-user-id'
  });
  db.listUsers.mockResolvedValue([]);
  db.listCollections.mockResolvedValue([]);
  db.listEnvironments.mockResolvedValue([]);
  db.listSnippets.mockResolvedValue([]);
  db.updateUser.mockResolvedValue({
    id: 'user-1',
    name: 'Alice',
    role: 'user',
    collectionAccess: ['*'],
    environmentAccess: ['*'],
    snippetAccess: ['*'],
    llmAccess: false,
    llmModels: [],
    llmMonthlyTokenLimit: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    createdByUserId: 'system-user-id',
    updatedByUserId: 'system-user-id'
  });
  db.deleteUser.mockResolvedValue(undefined);
  db.migrateOrphanTokensToBootstrapUser.mockResolvedValue(undefined);
  db.createApiToken.mockResolvedValue(undefined);
  db.findActiveApiTokenByHash.mockResolvedValue(null);
  db.listApiTokensByUserId.mockResolvedValue([]);
  db.listApiTokens.mockResolvedValue([]);
  db.revokeApiToken.mockResolvedValue(false);
  db.touchApiTokenLastUsed.mockResolvedValue(undefined);
  return db;
}

/**
 * Builds a minimal throttle store mock for runServer tests.
 *
 * @returns Mock throttle store with spied connect and disconnect methods.
 */
function createMockThrottleStore(): IThrottleStore {
  const throttleStore = createStubThrottleStore();
  throttleStore.connect.mockResolvedValue(undefined);
  throttleStore.disconnect.mockResolvedValue(undefined);
  return throttleStore;
}

/**
 * Builds a minimal Fastify-like mock for runServer tests.
 *
 * @param listenAddress - Value returned by `server.address()` after listen.
 * @returns Mock app with spied listen, close, and log methods.
 */
function createMockApp(
  listenAddress: { address: string; port: number } = {
    address: '127.0.0.1',
    port: 8787
  }
) {
  return {
    listen: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    log: { info: vi.fn() },
    server: {
      address: () => listenAddress
    }
  };
}

/**
 * Creates a Commander program configured for tests (exitOverride on root and subcommands).
 *
 * @param options - Injectable dependencies passed to {@link createProgram}.
 * @returns Program ready to parse argv without exiting the process.
 */
function createTestProgram(options: Parameters<typeof createProgram>[1] = {}) {
  const program = createProgram('0.1.0', options);
  program.exitOverride();
  for (const command of program.commands) {
    command.exitOverride();
  }
  return program;
}

/**
 * Writes a temporary server.yaml file for CLI integration tests.
 *
 * @param contents - Raw YAML written to the temp config file.
 * @returns Absolute path to the written config file.
 */
function writeConfig(contents: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'team-hub-cli-'));
  const configPath = path.join(dir, 'server.yaml');
  writeFileSync(configPath, contents, 'utf8');
  return configPath;
}

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

const sampleRedisConfig = {
  host: '127.0.0.1',
  port: 6380
};

beforeEach(() => {
  createServerMock.mockReset();
  createDatabaseMock.mockReturnValue(createMockDatabase());
  createThrottleStoreMock.mockReturnValue(createMockThrottleStore());
});

describe('createProgram', () => {
  it('shows help output', async () => {
    const program = createTestProgram();
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await expect(program.parseAsync(['--help'], { from: 'user' })).rejects.toBeInstanceOf(
      CommanderError
    );

    const output = write.mock.calls.map((call) => String(call[0])).join('');
    expect(output).toContain('team-hub');
    expect(output).toContain('start');
    expect(output).toContain('migrate');
    expect(output).toContain('collection');
    expect(output).toContain('llm');
    expect(output).toContain('user');
    expect(output).toContain('--verbose');
    expect(output).toContain('--config');

    write.mockRestore();
  });

  it('shows version output', async () => {
    const program = createTestProgram();
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await expect(program.parseAsync(['--version'], { from: 'user' })).rejects.toBeInstanceOf(
      CommanderError
    );

    const output = write.mock.calls.map((call) => String(call[0])).join('');
    expect(output).toMatch(/\d+\.\d+\.\d+/);

    write.mockRestore();
  });

  it('rejects unknown subcommands', async () => {
    const program = createTestProgram();

    await expect(program.parseAsync(['unknown'], { from: 'user' })).rejects.toMatchObject({
      exitCode: 1
    });
  });

  it('passes parsed start options to the handler', async () => {
    const configPath = writeConfig(`server:
  port: 8787
  host: 0.0.0.0
${sampleDbSection}${sampleRedisSection}`);
    const startHandler = vi.fn().mockResolvedValue(undefined);
    const program = createTestProgram({ startCommand: startHandler });

    await program.parseAsync(['--verbose', '--config', configPath, 'start'], {
      from: 'user'
    });

    expect(startHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        config: configPath,
        verbose: true
      })
    );
  });

  it('loads server config when starting', async () => {
    const configPath = writeConfig(`server:
  port: 8787
  host: 0.0.0.0
${sampleDbSection}${sampleRedisSection}`);
    createServerMock.mockResolvedValue(createMockApp({ address: '0.0.0.0', port: 8787 }));
    const db = createMockDatabase();
    const throttleStore = createMockThrottleStore();
    createDatabaseMock.mockReturnValue(db);
    createThrottleStoreMock.mockReturnValue(throttleStore);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await startCommand({ config: configPath, verbose: true });

    expect(loadServerConfig(configPath)).toEqual({
      port: 8787,
      host: '0.0.0.0',
      db: {
        driver: 'postgres',
        host: '127.0.0.1',
        port: 5432,
        user: 'harbor',
        password: 'harbor',
        database: 'harbor'
      },
      redis: sampleRedisConfig,
      llm: null,
      plugins: null,
      docs: null,
      logging: DEFAULT_LOGGING_CONFIG
    });
    expect(createServerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        configPath: resolveConfigPath(configPath),
        host: '0.0.0.0',
        port: 8787
      }),
      expect.objectContaining({
        verbose: true,
        reloadConfig: expect.any(Function)
      })
    );
    expect(log).toHaveBeenCalledWith(
      'Starting server with config path:',
      resolveConfigPath(configPath)
    );

    log.mockRestore();
  });

  it('fails start when config file is missing', async () => {
    await expect(startCommand({ config: '/nonexistent/server.yaml' })).rejects.toThrow(ConfigError);
  });
});

describe('runServer', () => {
  it('connects to the database and logs the listening address', async () => {
    const app = createMockApp();
    const db = createMockDatabase();
    const throttleStore = createMockThrottleStore();
    createDatabaseMock.mockReturnValue(db);
    createThrottleStoreMock.mockReturnValue(throttleStore);
    createServerMock.mockResolvedValue(app);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const configPath = writeConfig(`server:
  port: 8787
  host: 127.0.0.1
${sampleDbSection}${sampleRedisSection}`);
    const config = loadServerConfig(configPath);
    const ctx = createRuntimeContext(config, resolveConfigPath(configPath));

    await runServer(ctx);

    expect(createServerMock).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        reloadConfig: expect.any(Function)
      })
    );
    expect(db.connect).toHaveBeenCalledOnce();
    expect(throttleStore.connect).toHaveBeenCalledOnce();
    expect(app.listen).toHaveBeenCalledWith({ host: '127.0.0.1', port: 8787 });
    expect(log).toHaveBeenCalledWith('Team Hub listening on http://127.0.0.1:8787');

    log.mockRestore();
  });

  it('reloads config when SIGHUP is received', async () => {
    const app = createMockApp();
    const db = createMockDatabase();
    const throttleStore = createMockThrottleStore();
    createDatabaseMock.mockReturnValue(db);
    createThrottleStoreMock.mockReturnValue(throttleStore);
    createServerMock.mockResolvedValue(app);
    const onSpy = vi.spyOn(process, 'on');
    const configPath = writeConfig(`server:
  port: 8787
  host: 127.0.0.1
${sampleDbSection}${sampleRedisSection}`);
    const config = loadServerConfig(configPath);
    const ctx = createRuntimeContext(config, resolveConfigPath(configPath));

    await runServer(ctx);

    const sighupHandler = onSpy.mock.calls.find((call) => call[0] === 'SIGHUP')?.[1];
    expect(sighupHandler).toBeTypeOf('function');

    onSpy.mockRestore();
  });
});

describe('migrateCommand', () => {
  it('connects, migrates, and disconnects from the database', async () => {
    const configPath = writeConfig(`server:
  port: 8787
  host: 127.0.0.1
${sampleDbSection}${sampleRedisSection}`);
    const db = createMockDatabase();
    createDatabaseMock.mockReturnValue(db);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await migrateCommand({ config: configPath });

    expect(db.connect).toHaveBeenCalledOnce();
    expect(db.migrate).toHaveBeenCalledOnce();
    expect(db.disconnect).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith('Database migration completed successfully.');

    log.mockRestore();
  });
});

describe('collection commands', () => {
  it('lists stored collections', async () => {
    const configPath = writeConfig(`server:
  port: 8787
  host: 127.0.0.1
${sampleDbSection}${sampleRedisSection}`);
    const db = createMockDatabase();
    db.listCollections = vi.fn().mockResolvedValue([
      {
        id: 'collection-1',
        name: 'Shared API',
        variables: [],
        headers: [],
        auth: defaultAuth(),
        preRequestScript: '',
        postRequestScript: '',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        createdByUserId: 'user-1',
        updatedByUserId: 'user-1'
      }
    ]);
    db.listUsers = vi.fn().mockResolvedValue([
      {
        id: 'user-1',
        name: 'Alice',
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
      }
    ]);
    db.listRequests = vi
      .fn()
      .mockResolvedValue([{ id: 'request-1' }, { id: 'request-2' }, { id: 'request-3' }]);
    createDatabaseMock.mockReturnValue(db);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await collectionListCommand({ config: configPath });

    expect(db.connect).toHaveBeenCalledOnce();
    expect(db.listCollections).toHaveBeenCalledOnce();
    expect(db.listUsers).toHaveBeenCalledOnce();
    expect(db.listRequests).toHaveBeenCalledWith('collection-1');
    expect(db.disconnect).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith('- id: collection-1');
    expect(log).toHaveBeenCalledWith('  requests: 3');
    expect(log).toHaveBeenCalledWith('  created by: Alice (user-1)');
    expect(log).toHaveBeenCalledWith('  updated by: Alice (user-1)');

    log.mockRestore();
  });
});

describe('llm commands', () => {
  it('lists stored LLM usage log entries', async () => {
    const configPath = writeConfig(`server:
  port: 8787
  host: 127.0.0.1
${sampleDbSection}${sampleRedisSection}`);
    const db = createMockDatabase();
    db.listLlmUsageLogs = vi.fn().mockResolvedValue([
      {
        id: 'log-1',
        userId: 'user-1',
        apiTokenId: 'token-1',
        period: '2026-06',
        model: 'gpt-4o',
        provider: 'openai',
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
        isNewTurn: true,
        hadToolCalls: false,
        messageCount: 1,
        createdAt: new Date('2026-06-01T12:00:00.000Z')
      }
    ]);
    db.listUsers = vi.fn().mockResolvedValue([
      {
        id: 'user-1',
        name: 'Alice',
        role: 'user',
        collectionAccess: ['*'],
        environmentAccess: ['*'],
        snippetAccess: [],

        llmAccess: true,
        llmModels: ['*'],
        llmMonthlyTokenLimit: 100000,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        createdByUserId: null,
        updatedByUserId: null
      }
    ]);
    db.listApiTokens = vi.fn().mockResolvedValue([
      {
        id: 'token-1',
        userId: 'user-1',
        name: 'Alice laptop',
        tokenHash: 'hash',
        tokenPrefix: 'hbk_AbCd1234',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        lastUsedAt: null,
        revokedAt: null,
        createdByUserId: 'system-user-id',
        updatedByUserId: 'system-user-id'
      }
    ]);
    createDatabaseMock.mockReturnValue(db);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await llmListCommand({ config: configPath });

    expect(db.connect).toHaveBeenCalledOnce();
    expect(db.listLlmUsageLogs).toHaveBeenCalledOnce();
    expect(db.listUsers).toHaveBeenCalledOnce();
    expect(db.listApiTokens).toHaveBeenCalledOnce();
    expect(db.disconnect).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith('- id: log-1');
    expect(log).toHaveBeenCalledWith('  user: Alice (user-1)');
    expect(log).toHaveBeenCalledWith('  api token: Alice laptop (token-1)');
    expect(log).toHaveBeenCalledWith('  total tokens: 30');

    log.mockRestore();
  });
});

describe('user commands', () => {
  it('creates a user account', async () => {
    const configPath = writeConfig(`server:
  port: 8787
  host: 127.0.0.1
${sampleDbSection}${sampleRedisSection}`);
    const db = createMockDatabase();
    createDatabaseMock.mockReturnValue(db);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await userCreateCommand({
      config: configPath,
      name: 'Alice',
      role: 'user',
      collectionAccess: ['*'],
      environmentAccess: ['*'],
      snippetAccess: ['*']
    });

    expect(db.connect).toHaveBeenCalledOnce();
    expect(db.createUser).toHaveBeenCalledOnce();
    expect(db.createApiToken).toHaveBeenCalledOnce();
    expect(db.createApiToken).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        name: 'Alice'
      }),
      'system-user-id'
    );
    expect(db.migrate).toHaveBeenCalledOnce();
    expect(db.disconnect).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Created user "Alice"'));
    expect(log).toHaveBeenCalledWith('- id: user-1');
    expect(log.mock.calls.some((call) => String(call[0]).startsWith('hbk_'))).toBe(true);

    log.mockRestore();
  });

  it('creates a token for a user and prints the one-time secret', async () => {
    const configPath = writeConfig(`server:
  port: 8787
  host: 127.0.0.1
${sampleDbSection}${sampleRedisSection}`);
    const db = createMockDatabase();
    createDatabaseMock.mockReturnValue(db);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await userTokenCreateCommand({ config: configPath, user: 'user-1', name: 'Alice laptop' });

    expect(db.connect).toHaveBeenCalledOnce();
    expect(db.findUserById).toHaveBeenCalledWith('user-1');
    expect(db.createApiToken).toHaveBeenCalledOnce();
    expect(db.disconnect).toHaveBeenCalledOnce();
    expect(log.mock.calls.some((call) => String(call[0]).startsWith('hbk_'))).toBe(true);

    log.mockRestore();
  });

  it('lists stored users', async () => {
    const configPath = writeConfig(`server:
  port: 8787
  host: 127.0.0.1
${sampleDbSection}${sampleRedisSection}`);
    const db = createMockDatabase();
    const period = currentUsagePeriod();
    db.listUsers = vi.fn().mockResolvedValue([
      {
        id: 'user-1',
        name: 'Alice',
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
      }
    ]);
    db.getLlmUsage = vi.fn().mockResolvedValue({
      id: 'usage-1',
      userId: 'user-1',
      period,
      promptTokens: 800,
      completionTokens: 434,
      totalTokens: 1234,
      updatedAt: new Date('2026-01-01T00:00:00.000Z')
    });
    createDatabaseMock.mockReturnValue(db);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await userListCommand({ config: configPath });

    expect(db.listUsers).toHaveBeenCalledOnce();
    expect(db.getLlmUsage).toHaveBeenCalledWith('user-1', period);
    expect(log).toHaveBeenCalledWith('- id: user-1');
    expect(log).toHaveBeenCalledWith(`  llm tokens used (${period}): 1234`);

    log.mockRestore();
  });

  it('shows a single user with monthly usage', async () => {
    const configPath = writeConfig(`server:
  port: 8787
  host: 127.0.0.1
${sampleDbSection}${sampleRedisSection}`);
    const db = createMockDatabase();
    const period = currentUsagePeriod();
    db.findUserById = vi.fn().mockResolvedValue({
      id: 'user-1',
      name: 'Alice',
      role: 'user',
      collectionAccess: ['*'],
      environmentAccess: ['*'],
      snippetAccess: [],

      llmAccess: true,
      llmModels: ['*'],
      llmMonthlyTokenLimit: 100000,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      createdByUserId: null,
      updatedByUserId: null
    });
    db.getLlmUsage = vi.fn().mockResolvedValue({
      id: 'usage-1',
      userId: 'user-1',
      period,
      promptTokens: 800,
      completionTokens: 434,
      totalTokens: 1234,
      updatedAt: new Date('2026-01-01T00:00:00.000Z')
    });
    createDatabaseMock.mockReturnValue(db);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await userShowCommand({ config: configPath, id: 'user-1' });

    expect(db.findUserById).toHaveBeenCalledWith('user-1');
    expect(db.getLlmUsage).toHaveBeenCalledWith('user-1', period);
    expect(log).toHaveBeenCalledWith('- id: user-1');
    expect(log).toHaveBeenCalledWith(`  llm tokens used (${period}): 1234`);

    log.mockRestore();
  });

  it('lists stored tokens', async () => {
    const configPath = writeConfig(`server:
  port: 8787
  host: 127.0.0.1
${sampleDbSection}${sampleRedisSection}`);
    const db = createMockDatabase();
    db.listApiTokens = vi.fn().mockResolvedValue([
      {
        id: 'token-1',
        userId: 'user-1',
        name: 'Alice laptop',
        tokenHash: 'hash',
        tokenPrefix: 'hbk_AbCd1234',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        lastUsedAt: null,
        revokedAt: null,
        createdByUserId: 'system-user-id',
        updatedByUserId: 'system-user-id'
      }
    ]);
    createDatabaseMock.mockReturnValue(db);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await userTokenListCommand({ config: configPath });

    expect(db.listApiTokens).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith('- id: token-1');

    log.mockRestore();
  });

  it('reports when a token is revoked', async () => {
    const configPath = writeConfig(`server:
  port: 8787
  host: 127.0.0.1
${sampleDbSection}${sampleRedisSection}`);
    const db = createMockDatabase();
    db.revokeApiToken = vi.fn().mockResolvedValue(true);
    createDatabaseMock.mockReturnValue(db);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await userTokenRevokeCommand({ config: configPath, id: 'token-1' });

    expect(db.revokeApiToken).toHaveBeenCalledWith('token-1', 'system-user-id');
    expect(log).toHaveBeenCalledWith('Revoked API token token-1.');

    log.mockRestore();
  });
});
