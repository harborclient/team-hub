import { InvalidArgumentError } from 'commander';
import { describe, expect, it, vi } from 'vitest';
import { userCreateCommand } from '#/cli/userCommand.js';
import type { IDatabase } from '#/db/IDatabase.js';

vi.mock('#/config/serverConfig.js', () => ({
  loadServerConfig: vi.fn(() => ({ db: { driver: 'postgres' } }))
}));

vi.mock('#/db/index.js', () => ({
  createDatabase: vi.fn()
}));

/**
 * Builds a minimal database mock for user create command tests.
 */
function createDatabaseMock(): IDatabase {
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    migrate: vi.fn(),
    getSystemUserId: vi.fn(() => 'system-user-id'),
    listCollections: vi.fn(async () => [{ id: 'collection-1', name: 'Shared API' }]),
    listEnvironments: vi.fn(async () => [{ id: 'env-1', name: 'Production' }]),
    listSnippets: vi.fn(async () => [{ id: 'snippet-1', name: 'Auth helper' }]),
    createUser: vi.fn(async (input) => ({
      id: 'user-id',
      name: input.name,
      role: input.role,
      collectionAccess: input.collectionAccess ?? [],
      environmentAccess: input.environmentAccess ?? [],
      snippetAccess: input.snippetAccess ?? [],
      llmAccess: input.llmAccess ?? false,
      llmModels: input.llmModels ?? [],
      llmMonthlyTokenLimit: input.llmMonthlyTokenLimit ?? null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      createdByUserId: 'system-user-id',
      updatedByUserId: 'system-user-id'
    })),
    createApiToken: vi.fn()
  } as unknown as IDatabase;
}

describe('userCreateCommand llm model flags', () => {
  it('stores wildcard llm model access from Commander llmModel option', async () => {
    const db = createDatabaseMock();
    const { createDatabase } = await import('#/db/index.js');
    vi.mocked(createDatabase).mockReturnValue(db);

    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await userCreateCommand({
      config: 'server.yaml',
      name: 'tester',
      role: 'user',
      collectionAccess: ['*'],
      environmentAccess: ['*'],
      snippetAccess: ['*'],
      llmAccess: true,
      llmModel: ['*']
    } as Parameters<typeof userCreateCommand>[0]);

    expect(db.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        llmAccess: true,
        llmModels: ['*']
      }),
      'system-user-id'
    );

    log.mockRestore();
  });

  it('rejects unknown collection access ids on create', async () => {
    const db = createDatabaseMock();
    const { createDatabase } = await import('#/db/index.js');
    vi.mocked(createDatabase).mockReturnValue(db);

    await expect(
      userCreateCommand({
        config: 'server.yaml',
        name: 'tester',
        role: 'user',
        collectionAccess: ['missing-col'],
        environmentAccess: ['*'],
        snippetAccess: ['*']
      })
    ).rejects.toThrow('Unknown collection id: missing-col.');

    expect(db.createUser).not.toHaveBeenCalled();
  });

  it('rejects collection access flags on admin accounts', async () => {
    const db = createDatabaseMock();
    const { createDatabase } = await import('#/db/index.js');
    vi.mocked(createDatabase).mockReturnValue(db);

    await expect(
      userCreateCommand({
        config: 'server.yaml',
        name: 'admin-user',
        role: 'admin',
        collectionAccess: ['*'],
        environmentAccess: [],
        snippetAccess: []
      })
    ).rejects.toThrow(InvalidArgumentError);

    await expect(
      userCreateCommand({
        config: 'server.yaml',
        name: 'admin-user',
        role: 'admin',
        collectionAccess: ['*'],
        environmentAccess: [],
        snippetAccess: []
      })
    ).rejects.toThrow('Admin users cannot have collection, environment, or snippet access.');

    expect(db.createUser).not.toHaveBeenCalled();
  });
});
